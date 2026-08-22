// ── Simulation store ──────────────────────────────────────────────────────────
// Zustand bridge over the (framework-agnostic) replay engine. Holds the clock,
// the current market snapshot, positions, events and the P&L timeline, and drives
// the replay loop. The UI subscribes here; it never touches the data provider.
//
// LOOK-AHEAD FIREWALL: every read is a function of `steps[cursor].ts`. The chain
// snapshot and position marks are always requested AT the current time, never
// beyond it.

import { create } from 'zustand'
import { getOptionDataProvider } from './data'
import type { AvailableSession } from './data/provider'
import type {
  Candle, ClockStatus, Expiry, Frequency, IndexCode, OptionChainSnapshot, PnLPoint, PositionLeg,
  RiskConfig, SessionConfig, Side, TradeEvent,
} from './types'

const provider = getOptionDataProvider()
let seq = 0
const uid = (p: string) => `${p}_${Date.now()}_${seq++}`

const SPEEDS = [0.5, 1, 2, 5, 10, 25, 50] as const
const BASE_STEP_MS = 900 // wall-clock ms per replay step at 1x

/** Forward/Backward navigation step: minutes, or 'D' = one whole trading day. */
export type NavStep = 1 | 5 | 15 | 30 | 60 | 'D'
export const NAV_STEPS: NavStep[] = [1, 5, 15, 30, 60, 'D']
/** Where to land after switching to another day. */
type DayLand = 'start' | 'end' | { hhmm: string }
const hhmmOf = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' })

interface SimState {
  synthetic: boolean
  ready: boolean
  config: SessionConfig | null
  sessions: AvailableSession[]   // selectable trading dates for the current index
  expiries: Expiry[]             // selectable expiries for the current index+date

  steps: number[]          // candle timestamps for the session at `freq`
  cursor: number           // index into steps
  status: ClockStatus
  speed: number

  underlying: Candle[]      // candles up to current time (look-ahead safe)
  chain: OptionChainSnapshot | null
  positions: PositionLeg[]
  events: TradeEvent[]
  pnl: PnLPoint[]
  risk: RiskConfig

  // derived
  spot: number
  realized: number
  unrealized: number

  // actions
  autostart: () => Promise<void>
  setup: (config: SessionConfig) => Promise<void>
  changeIndex: (index: IndexCode) => Promise<void>
  changeDate: (date: string) => Promise<void>
  changeFrequency: (frequency: Frequency) => Promise<void>
  changeExpiry: (expiryId: string) => Promise<void>
  seekToTime: (hhmm: string) => void
  navStep: NavStep                                    // duration used by Forward/Backward
  setNavStep: (s: NavStep) => void
  stepNav: (dir: 1 | -1) => Promise<void>             // move by navStep; crosses day boundaries
  loadDay: (date: string, land: DayLand) => Promise<boolean>   // switch day, KEEP positions
  crossDay: (dir: 1 | -1, land: DayLand) => Promise<boolean>
  play: () => void
  pause: () => void
  stepFwd: () => void
  stepBack: () => void
  seek: (idx: number) => void
  cycleSpeed: () => void
  reset: () => void
  exit: () => void

  addLeg: (contractId: string, strike: number, optType: 'CE' | 'PE', side: Side, lots: number) => Promise<void>
  closeLeg: (legId: string) => Promise<void>
  partialExit: (legId: string, lots: number) => Promise<void>
  reverseLeg: (legId: string) => Promise<void>
  duplicateLeg: (legId: string) => Promise<void>
  changeQty: (legId: string, lots: number) => Promise<void>
  rollStrike: (legId: string, dir: 1 | -1) => Promise<void>
  removeLeg: (legId: string) => void
  closeAll: () => Promise<void>
  setLegRisk: (legId: string, patch: { sl?: number | undefined; target?: number | undefined }) => void
  setRisk: (patch: Partial<RiskConfig>) => void
}

let timer: ReturnType<typeof setTimeout> | undefined
function clearTimer() { if (timer) { clearTimeout(timer); timer = undefined } }

export const useSim = create<SimState>((set, get) => ({
  synthetic: provider.synthetic,
  ready: false,
  config: null,
  sessions: [],
  expiries: [],
  steps: [],
  cursor: 0,
  status: 'idle',
  speed: 1,
  underlying: [],
  chain: null,
  positions: [],
  events: [],
  pnl: [],
  risk: { slippage: 0, costPerLot: 0, intrabarPolicy: 'conservative' },
  spot: 0,
  realized: 0,
  unrealized: 0,
  navStep: 5,

  // Auto-start the workstation with sensible defaults (no setup screen).
  async autostart() {
    if (get().ready) return
    const index: IndexCode = 'NIFTY'
    const sessions = await provider.availableSessions(index)
    const date = sessions[0]?.date
    if (!date) return
    const expiries = await provider.expiries(index, date)
    await get().setup({ index, date, startTime: '09:15', endTime: '15:30', frequency: '5m', expiryId: expiries[0]?.id ?? '' })
  },

  async setup(config) {
    clearTimer()
    const [full, sessions, expiries] = await Promise.all([
      provider.underlyingSession(config.index, config.date, config.frequency),
      provider.availableSessions(config.index),
      provider.expiries(config.index, config.date),
    ])
    const startTs = toTs(config.date, config.startTime)
    const endTs = toTs(config.date, config.endTime)
    const steps = full.filter(c => c.ts >= startTs && c.ts <= endTs).map(c => c.ts)
    set({
      config, ready: true, sessions, expiries, steps, cursor: 0, status: 'idle', speed: 1,
      positions: [], events: [], pnl: [], realized: 0, unrealized: 0,
    })
    await refreshAt(0, set, get)
  },

  // Switch index → rebuild session with that index's first available date/expiry.
  async changeIndex(index) {
    const sessions = await provider.availableSessions(index)
    const date = sessions[0]?.date; if (!date) return
    const expiries = await provider.expiries(index, date)
    const cfg = get().config
    await get().setup({ index, date, startTime: cfg?.startTime ?? '09:15', endTime: cfg?.endTime ?? '15:30', frequency: cfg?.frequency ?? '5m', expiryId: expiries[0]?.id ?? '' })
  },

  // Switch trading date → rebuild session (positions reset).
  async changeDate(date) {
    const cfg = get().config; if (!cfg) return
    const expiries = await provider.expiries(cfg.index, date)
    await get().setup({ ...cfg, date, expiryId: expiries.some(e => e.id === cfg.expiryId) ? cfg.expiryId : (expiries[0]?.id ?? cfg.expiryId) })
  },

  // Switch timeframe → rebuild step grid (positions reset).
  async changeFrequency(frequency) {
    const cfg = get().config; if (!cfg) return
    await get().setup({ ...cfg, frequency })
  },

  // Switch expiry → only refresh the chain at the current time (steps/positions kept).
  async changeExpiry(expiryId) {
    const { config, cursor } = get()
    if (!config || config.expiryId === expiryId) return
    set({ config: { ...config, expiryId } })
    await refreshAt(cursor, set, get)
  },

  // Jump the clock to the step nearest a wall-clock HH:mm.
  seekToTime(hhmm) {
    const { config, steps } = get()
    if (!config || !steps.length) return
    const target = toTs(config.date, hhmm)
    let b = 0
    steps.forEach((t, i) => { if (Math.abs(t - target) < Math.abs(steps[b] - target)) b = i })
    get().seek(b)
  },

  setNavStep(s) { set({ navStep: s }) },

  // Move Forward (dir +1) / Backward (dir -1) by the selected navStep. Within the
  // day it seeks to the nearest step; at a boundary it rolls into the adjacent
  // trading day (fixes "stuck at EOD"). 'D' jumps a whole day at the same time.
  async stepNav(dir) {
    const { steps, cursor, navStep } = get()
    if (!steps.length) return
    if (navStep === 'D') { await get().crossDay(dir, { hhmm: hhmmOf(steps[cursor]) }); return }
    const last = steps.length - 1
    const target = steps[cursor] + dir * navStep * 60_000
    let b = 0
    steps.forEach((t, i) => { if (Math.abs(t - target) < Math.abs(steps[b] - target)) b = i })
    if (b === cursor) b = cursor + dir            // rounding didn't move us → nudge one step
    if (b > last) { await get().crossDay(1, 'start'); return }
    if (b < 0) { await get().crossDay(-1, 'end'); return }
    get().seek(b)
  },

  // Switch to `date` and rebuild the step grid, KEEPING positions/events/pnl so
  // navigation across days is continuous (unlike changeDate, which is a fresh session).
  async loadDay(date, land) {
    const cfg = get().config
    if (!cfg) return false
    clearTimer()
    const [full, expiries] = await Promise.all([
      provider.underlyingSession(cfg.index, date, cfg.frequency),
      provider.expiries(cfg.index, date),
    ])
    const startTs = toTs(date, cfg.startTime), endTs = toTs(date, cfg.endTime)
    const steps = full.filter(c => c.ts >= startTs && c.ts <= endTs).map(c => c.ts)
    if (!steps.length) return false
    const expiryId = expiries.some(e => e.id === cfg.expiryId) ? cfg.expiryId : (expiries[0]?.id ?? cfg.expiryId)
    let cursor = land === 'end' ? steps.length - 1 : 0
    if (typeof land === 'object') {
      const target = toTs(date, land.hhmm)
      let b = 0; steps.forEach((t, i) => { if (Math.abs(t - target) < Math.abs(steps[b] - target)) b = i }); cursor = b
    }
    set({ config: { ...cfg, date, expiryId }, expiries, steps, cursor, status: 'paused' })
    await refreshAt(cursor, set, get)
    return true
  },

  // Step to the adjacent trading day (sessions is newest-first: forward = earlier index).
  async crossDay(dir, land) {
    const { sessions, config } = get()
    if (!config) return false
    const idx = sessions.findIndex(s => s.date === config.date)
    if (idx < 0) return false
    const next = sessions[dir > 0 ? idx - 1 : idx + 1]
    if (!next) return false           // no adjacent trading day (edge of available range)
    return get().loadDay(next.date, land)
  },

  play() {
    const { status, steps, cursor } = get()
    if (status === 'playing' || !steps.length) return
    if (cursor >= steps.length - 1) return
    set({ status: 'playing' })
    loop(set, get)
  },
  pause() { clearTimer(); set({ status: 'paused' }) },

  stepFwd() {
    const { cursor, steps } = get()
    if (cursor >= steps.length - 1) return
    clearTimer(); set({ status: 'paused' })
    void refreshAt(cursor + 1, set, get)
  },
  stepBack() {
    const { cursor } = get()
    if (cursor <= 0) return
    clearTimer(); set({ status: 'paused' })
    void refreshAt(cursor - 1, set, get)
  },
  seek(idx) {
    const { steps } = get()
    const c = Math.max(0, Math.min(steps.length - 1, idx))
    clearTimer(); set({ status: 'paused' })
    void refreshAt(c, set, get)
  },
  cycleSpeed() {
    const cur = get().speed
    const i = SPEEDS.indexOf(cur as typeof SPEEDS[number])
    set({ speed: SPEEDS[(i + 1) % SPEEDS.length] })
  },
  reset() {
    clearTimer()
    set({ cursor: 0, status: 'idle', positions: [], events: [], pnl: [], realized: 0, unrealized: 0 })
    void refreshAt(0, set, get)
  },
  exit() {
    clearTimer()
    set({ ready: false, config: null, steps: [], cursor: 0, status: 'idle', underlying: [], chain: null, positions: [], events: [], pnl: [] })
  },

  async addLeg(contractId, strike, optType, side, lots) {
    const { steps, cursor, risk } = get()
    const ts = steps[cursor]
    if (ts == null) return
    const meta = await provider.contractMeta(contractId)
    const lotSize = meta?.lotSize ?? 1
    const qty = lots * lotSize
    const raw = await provider.quoteAt(contractId, ts)
    // Slippage works against the trader on entry.
    const fill = side === 'BUY' ? raw + risk.slippage : Math.max(0.05, raw - risk.slippage)
    const leg: PositionLeg = {
      id: uid('leg'), contractId, index: (meta?.index ?? get().config!.index), expiryId: meta?.expiryId ?? get().config!.expiryId,
      strike, optType, side, qty, lotSize, avgEntry: fill, entryTs: ts, ltp: raw, realized: 0, unrealized: 0, status: 'OPEN',
    }
    const ev: TradeEvent = { id: uid('ev'), ts, kind: 'ENTRY', contractId, label: `${side} ${leg.index} ${strike} ${optType}`, qty, price: fill }
    set(s => ({ positions: [...s.positions, leg], events: [...s.events, ev] }))
    mark(set, get)
  },

  async closeLeg(legId) { await get().partialExit(legId, Number.MAX_SAFE_INTEGER) },

  async partialExit(legId, lots) {
    const { steps, cursor, risk, positions } = get()
    const ts = steps[cursor]; const leg = positions.find(l => l.id === legId)
    if (ts == null || !leg || leg.status === 'OPEN' === false) return
    const exitQty = Math.min(leg.qty, Math.max(1, Math.round(lots)) * leg.lotSize)
    if (exitQty <= 0) return
    const raw = await provider.quoteAt(leg.contractId, ts)
    const fill = leg.side === 'BUY' ? Math.max(0.05, raw - risk.slippage) : raw + risk.slippage
    const pnl = (leg.side === 'BUY' ? (fill - leg.avgEntry) : (leg.avgEntry - fill)) * exitQty - risk.costPerLot * (exitQty / leg.lotSize)
    const remaining = leg.qty - exitQty
    const full = remaining <= 0
    const ev: TradeEvent = { id: uid('ev'), ts, kind: full ? 'EXIT' : 'REDUCE', contractId: leg.contractId, label: `${full ? 'EXIT' : 'Reduce'} ${leg.index} ${leg.strike} ${leg.optType}${full ? '' : ` ×${exitQty}`}`, qty: exitQty, price: fill, realized: Math.round(pnl) }
    set(s => ({
      positions: s.positions.map(l => l.id === legId
        ? (full ? { ...l, status: 'CLOSED' as const, ltp: raw, realized: l.realized + pnl, unrealized: 0 } : { ...l, qty: remaining, ltp: raw, realized: l.realized + pnl })
        : l),
      events: [...s.events, ev],
    }))
    mark(set, get)
  },

  async reverseLeg(legId) {
    const leg = get().positions.find(l => l.id === legId)
    if (!leg || leg.status === 'CLOSED') return
    const lots = leg.qty / leg.lotSize
    const opp: Side = leg.side === 'BUY' ? 'SELL' : 'BUY'
    await get().closeLeg(legId)
    await get().addLeg(leg.contractId, leg.strike, leg.optType, opp, lots)
    set(s => ({ events: [...s.events, { id: uid('ev'), ts: s.steps[s.cursor], kind: 'ROLL', contractId: leg.contractId, label: `Reversed ${leg.strike} ${leg.optType} → ${opp}` } as TradeEvent] }))
  },

  async duplicateLeg(legId) {
    const leg = get().positions.find(l => l.id === legId)
    if (!leg) return
    await get().addLeg(leg.contractId, leg.strike, leg.optType, leg.side, leg.qty / leg.lotSize)
  },

  // Change quantity IN PLACE on the same leg (no new leg, no closed leg).
  // Decrease → partial exit of the same leg; increase → add qty & blend avg entry.
  async changeQty(legId, lots) {
    const { steps, cursor, risk } = get()
    const leg = get().positions.find(l => l.id === legId)
    if (!leg || leg.status === 'CLOSED') return
    const target = Math.max(1, Math.round(lots)) * leg.lotSize
    if (target === leg.qty) return
    if (target < leg.qty) { await get().partialExit(legId, (leg.qty - target) / leg.lotSize); return }
    const ts = steps[cursor]; if (ts == null) return
    const addQty = target - leg.qty
    const raw = await provider.quoteAt(leg.contractId, ts)
    const fill = leg.side === 'BUY' ? raw + risk.slippage : Math.max(0.05, raw - risk.slippage)
    const newAvg = (leg.avgEntry * leg.qty + fill * addQty) / target
    set(s => ({
      positions: s.positions.map(l => l.id === legId ? { ...l, qty: target, avgEntry: newAvg } : l),
      events: [...s.events, { id: uid('ev'), ts, kind: 'ADD', contractId: leg.contractId, label: `Add ${addQty} · ${leg.strike} ${leg.optType}`, qty: addQty, price: fill } as TradeEvent],
    }))
    mark(set, get)
  },

  // Roll the SAME leg to the adjacent strike (dir +1 = up, -1 = down). Modifies the
  // leg in place: banks the old strike's MTM into realized, re-bases entry on the new
  // contract's current premium — keeps one leg, total P&L stays continuous.
  async rollStrike(legId, dir) {
    const { positions, chain, steps, cursor, risk } = get()
    const leg = positions.find(l => l.id === legId)
    if (!leg || leg.status === 'CLOSED' || !chain) return
    const strikes = chain.rows.map(r => r.strike).sort((a, b) => a - b)
    const idx = strikes.indexOf(leg.strike)
    if (idx < 0) return
    const nk = strikes[idx + dir]
    if (nk == null) return
    const row = chain.rows.find(r => r.strike === nk)
    const cid = leg.optType === 'CE' ? row?.ce?.contractId : row?.pe?.contractId
    if (!cid) return
    const ts = steps[cursor]; if (ts == null) return
    const raw = await provider.quoteAt(cid, ts)
    const fill = leg.side === 'BUY' ? raw + risk.slippage : Math.max(0.05, raw - risk.slippage)
    const banked = leg.realized + leg.unrealized
    set(s => ({
      positions: s.positions.map(l => l.id === legId ? { ...l, strike: nk, contractId: cid, avgEntry: fill, entryTs: ts, ltp: raw, realized: banked, unrealized: 0 } : l),
      events: [...s.events, { id: uid('ev'), ts, kind: 'ROLL', contractId: cid, label: `Roll ${leg.strike} → ${nk} ${leg.optType}` } as TradeEvent],
    }))
    mark(set, get)
  },

  // Delete a leg outright (removes from the book; no fill/realized recorded).
  removeLeg(legId) {
    set(s => ({ positions: s.positions.filter(l => l.id !== legId) }))
    mark(set, get)
  },

  async closeAll() {
    const open = get().positions.filter(l => l.status === 'OPEN')
    for (const l of open) await get().closeLeg(l.id)
  },
  setLegRisk(legId, patch) {
    const ts = get().steps[get().cursor]
    set(s => ({
      positions: s.positions.map(l => l.id === legId ? { ...l, ...('sl' in patch ? { sl: patch.sl } : {}), ...('target' in patch ? { target: patch.target } : {}) } : l),
      events: [...s.events, { id: uid('ev'), ts, kind: patch.target !== undefined ? 'TARGET_SET' : 'SL_SET', label: `${patch.target !== undefined ? 'Target' : 'SL'} set`, contractId: s.positions.find(l => l.id === legId)?.contractId } as TradeEvent],
    }))
  },
  setRisk(patch) { set(s => ({ risk: { ...s.risk, ...patch } })) },
}))

// ── replay loop ────────────────────────────────────────────────────────────────
function loop(set: (p: Partial<SimState>) => void, get: () => SimState) {
  clearTimer()
  const { cursor, steps, speed, status } = get()
  if (status !== 'playing') return
  if (cursor >= steps.length - 1) { set({ status: 'ended' }); return }
  timer = setTimeout(async () => {
    await refreshAt(get().cursor + 1, set, get)
    if (get().status === 'playing') loop(set, get)
  }, BASE_STEP_MS / speed)
}

// ── advance to a step: refresh chain + underlying, mark positions, eval SL/target
async function refreshAt(idx: number, set: (p: Partial<SimState>) => void, get: () => SimState) {
  const { config, steps } = get()
  if (!config) return
  const c = Math.max(0, Math.min(steps.length - 1, idx))
  const ts = steps[c]
  const [underlying, chain] = await Promise.all([
    provider.underlyingUpTo(config.index, config.date, config.frequency, ts),
    provider.chainAt(config.index, config.expiryId, config.frequency, ts),
  ])
  set({ cursor: c, underlying, chain, spot: chain.spot })
  await evalRisk(ts, set, get)
  mark(set, get)
  if (c >= steps.length - 1) set({ status: get().status === 'playing' ? 'ended' : get().status })
}

// mark open legs to current chain LTP + recompute unrealized + push pnl point
function mark(set: (p: Partial<SimState>) => void, get: () => SimState) {
  const { positions, chain } = get()
  if (!chain) return
  const ltpOf = (cid: string) => {
    for (const r of chain.rows) {
      if (r.ce?.contractId === cid) return r.ce.ltp
      if (r.pe?.contractId === cid) return r.pe.ltp
    }
    return undefined
  }
  let unreal = 0
  const next = positions.map(l => {
    if (l.status === 'CLOSED') return l
    const ltp = ltpOf(l.contractId) ?? l.ltp
    const u = legPnl(l, ltp)
    unreal += u
    return { ...l, ltp, unrealized: u }
  })
  const realized = next.reduce((s, l) => s + l.realized, 0)
  const total = realized + unreal
  set({
    positions: next, unrealized: unreal, realized,
    pnl: [...get().pnl, { ts: chain.ts, realized: Math.round(realized), unrealized: Math.round(unreal), total: Math.round(total) }].slice(-600),
  })
}

// evaluate per-leg SL/Target + strategy SL/Target (LTP-based for MVP)
async function evalRisk(ts: number, set: (p: Partial<SimState>) => void, get: () => SimState) {
  const { positions, chain, risk } = get()
  if (!chain) return
  const ltpOf = (cid: string) => {
    for (const r of chain.rows) { if (r.ce?.contractId === cid) return r.ce.ltp; if (r.pe?.contractId === cid) return r.pe.ltp }
    return undefined
  }
  for (const l of positions) {
    if (l.status !== 'OPEN') continue
    const ltp = ltpOf(l.contractId); if (ltp == null) continue
    const hitSL = l.sl != null && (l.side === 'BUY' ? ltp <= l.sl : ltp >= l.sl)
    const hitTgt = l.target != null && (l.side === 'BUY' ? ltp >= l.target : ltp <= l.target)
    if (hitSL || hitTgt) {
      await get().closeLeg(l.id)
      set({ events: [...get().events, { id: uid('ev'), ts, kind: hitSL ? 'SL_HIT' : 'TARGET_HIT', contractId: l.contractId, label: `${hitSL ? 'SL' : 'Target'} hit · ${l.strike} ${l.optType}`, price: ltp } as TradeEvent] })
    }
  }
  // strategy-level
  const total = get().realized + get().unrealized
  if (risk.strategySL != null && total <= -Math.abs(risk.strategySL)) {
    set({ events: [...get().events, { id: uid('ev'), ts, kind: 'STRATEGY_SL', label: `Strategy SL hit at ₹${Math.round(total)}` } as TradeEvent] })
    await get().closeAll()
  } else if (risk.strategyTarget != null && total >= Math.abs(risk.strategyTarget)) {
    set({ events: [...get().events, { id: uid('ev'), ts, kind: 'STRATEGY_TARGET', label: `Strategy target hit at ₹${Math.round(total)}` } as TradeEvent] })
    await get().closeAll()
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────────
function legPnl(l: PositionLeg, ltp: number): number {
  return l.side === 'BUY' ? (ltp - l.avgEntry) * l.qty : (l.avgEntry - ltp) * l.qty
}
function toTs(date: string, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return Date.parse(`${date}T00:00:00+05:30`) + (h * 60 + m) * 60_000
}

export { SPEEDS }
