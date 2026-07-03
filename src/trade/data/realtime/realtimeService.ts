// ── Realtime bootstrap service ───────────────────────────────────────────────
// Wires the shared WebSocket to the domain caches, bridges index ticks into
// marketStore (so charts / top bar / watchlist go live), restores + persists the
// IndexedDB snapshot, and exposes a ref-counted subscribe API. Idempotent start.

import { wsManager, type ConnState } from '../ws/WebSocketManager'
import {
  indexTickChannel, optionChainChannel, isIndexTickChannel, isOptionChainChannel,
  type IndexTickPayload, type OptionChainPayload,
} from '../ws/messages'
import { applyOptionUpdate, exportSnapshot, importSnapshot } from './optionChainCache'
import { loadSnapshot, saveSnapshot, todayStamp, type RtSnapshot } from './persistence'
import { useMarketStore } from '../../store/marketStore'

const SAVE_INTERVAL_MS = 5_000

const lastTickTs = new Map<string, number>()          // index -> last exchange_timestamp
const openLtp = new Map<string, number>()             // index -> session-open ltp (for change%)
const lastTicks: Record<string, { ltp: number; ts: number }> = {}

let started = false
let dirty = false
let saveTimer: ReturnType<typeof setInterval> | undefined

function handleIndexTick(p: IndexTickPayload) {
  const ts = Number(p.exchange_timestamp) || 0
  if (!Number.isFinite(p.ltp)) return
  const prev = lastTickTs.get(p.index) ?? 0
  if (ts && ts <= prev) return // dedup / out-of-order
  lastTickTs.set(p.index, ts)

  if (!openLtp.has(p.index)) openLtp.set(p.index, p.ltp)
  const open = openLtp.get(p.index)!
  const chg = p.ltp - open
  lastTicks[p.index] = { ltp: p.ltp, ts }
  dirty = true

  useMarketStore.getState().setQuote({
    key: p.index, index: p.index, ltp: p.ltp,
    chg: +chg.toFixed(2), chgPct: +((chg / (open || 1)) * 100).toFixed(2),
    bid: p.bidPrice, ask: p.askPrice, ts: ts || Date.now(), sim: false,
  })
}

function handleMessage(channel: string, payload: unknown) {
  if (isIndexTickChannel(channel)) handleIndexTick(payload as IndexTickPayload)
  else if (isOptionChainChannel(channel)) { applyOptionUpdate(payload as OptionChainPayload); dirty = true }
}

function buildSnapshot(): RtSnapshot {
  return { day: todayStamp(), savedAt: Date.now(), contracts: exportSnapshot(), ticks: { ...lastTicks } }
}

async function restore() {
  const snap = await loadSnapshot()
  if (!snap) return
  // Always hydrate for instant display; newer live messages overwrite by ts.
  if (snap.contracts?.length) importSnapshot(snap.contracts)
  for (const [index, t] of Object.entries(snap.ticks ?? {})) {
    lastTicks[index] = t
    lastTickTs.set(index, t.ts)
    openLtp.set(index, t.ltp)
    useMarketStore.getState().setQuote({ key: index, index, ltp: t.ltp, chg: 0, chgPct: 0, ts: t.ts, sim: false })
  }
}

function setupPersistence() {
  saveTimer = setInterval(() => { if (dirty) { dirty = false; void saveSnapshot(buildSnapshot()) } }, SAVE_INTERVAL_MS)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void saveSnapshot(buildSnapshot()) })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => { void saveSnapshot(buildSnapshot()) })
  }
}

export const realtime = {
  start(): void {
    if (started) return
    started = true
    void restore()
    wsManager.onMessage((env) => handleMessage(env.channel, env.payload))
    setupPersistence()
  },

  /** Ref-counted server subscription for an index's tick stream. */
  subscribeIndexTick(index: string): () => void {
    return wsManager.subscribeChannel(indexTickChannel(index))
  },

  /** Ref-counted server subscription for an index's option-chain stream. */
  subscribeOptionChain(index: string): () => void {
    return wsManager.subscribeChannel(optionChainChannel(index))
  },

  onState(l: (s: ConnState) => void): () => void { return wsManager.onState(l) },
  getState(): ConnState { return wsManager.getState() },

  /** For tests / teardown. */
  _stopAutosave(): void { if (saveTimer) clearInterval(saveTimer) },
}
