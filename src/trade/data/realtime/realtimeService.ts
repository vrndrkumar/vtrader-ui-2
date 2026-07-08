// ── Realtime bootstrap service ───────────────────────────────────────────────
// Wires the shared WebSocket to the domain caches, bridges index ticks into
// marketStore (so charts / top bar / watchlist go live), restores + persists the
// IndexedDB snapshot, and exposes a ref-counted subscribe API. Idempotent start.

import { wsManager, type ConnState } from '../ws/WebSocketManager'
import {
  indexTickChannel, optionChainChannel, symbolTickChannel,
  isIndexTickChannel, isOptionChainChannel, isSymbolTickChannel,
  type IndexTickPayload, type OptionChainPayload, type SymbolTickPayload,
} from '../ws/messages'
import { applyOptionUpdate, exportSnapshot, importSnapshot } from './optionChainCache'
import { loadSnapshot, saveSnapshot, todayStamp, type RtSnapshot } from './persistence'
import { getDailyMarks } from './dailyMarks'
import { useMarketStore } from '../../store/marketStore'

const SAVE_INTERVAL_MS = 5_000

const lastTickTs = new Map<string, number>()          // index -> last exchange_timestamp
const prevClose = new Map<string, number>()           // index -> previous session close (change% baseline)
const lastTicks: Record<string, { ltp: number; ts: number }> = {}

let started = false
let dirty = false
let saveTimer: ReturnType<typeof setInterval> | undefined

/** Push an index quote with change measured against the previous session close. */
function emitQuote(index: string, ltp: number, ts: number, bid?: number, ask?: number) {
  // Change is undefined (→ shown as "--") until the previous close is known.
  const base = prevClose.get(index)
  const chg = base != null ? +(ltp - base).toFixed(2) : undefined
  const chgPct = base ? +(((ltp - base) / base) * 100).toFixed(2) : undefined
  useMarketStore.getState().setQuote({ key: index, index, ltp, chg, chgPct, bid, ask, ts, sim: false })
}

function handleIndexTick(p: IndexTickPayload) {
  const ts = Number(p.exchange_timestamp) || 0
  if (!Number.isFinite(p.ltp)) return
  const prev = lastTickTs.get(p.index) ?? 0
  if (ts && ts <= prev) return // dedup / out-of-order
  lastTickTs.set(p.index, ts)
  lastTicks[p.index] = { ltp: p.ltp, ts }
  dirty = true
  emitQuote(p.index, p.ltp, ts || Date.now(), p.bidPrice, p.askPrice)
}

/**
 * Fetch previous/last session closes from real candles so:
 *  - change% is measured vs the previous close, and
 *  - when the market is closed with no live tick, the last real close is shown
 *    (never a fabricated value).
 */
// Seed the last price from the freshest source: use a persisted/last tick ONLY
// if it's newer than the most recent candle, otherwise the candle close wins
// (prevents a stale persisted tick from masking the latest close).
function seedFromMarks(key: string, marks: { lastClose: number; prevClose: number; lastTs: number }) {
  prevClose.set(key, marks.prevClose)
  const t = lastTicks[key]
  if (!t || t.ts < marks.lastTs) {
    lastTicks[key] = { ltp: marks.lastClose, ts: marks.lastTs }
    lastTickTs.set(key, marks.lastTs)
    emitQuote(key, marks.lastClose, marks.lastTs)
  } else {
    emitQuote(key, t.ltp, t.ts)
  }
}

async function primeIndex(index: string) {
  if (prevClose.has(index)) return
  const marks = await getDailyMarks(index, 'INDEX')
  if (marks) seedFromMarks(index, marks)
}

/** Same as primeIndex but for an option strike symbol (2-month candle range). */
async function primeSymbol(symbol: string) {
  if (prevClose.has(symbol)) return
  const marks = await getDailyMarks(symbol, 'OPTION')
  if (marks) seedFromMarks(symbol, marks)
}

function handleSymbolTick(p: SymbolTickPayload) {
  const ts = Number(p.exchange_timestamp) || 0
  if (!p.symbol || !Number.isFinite(p.ltp)) return
  const prev = lastTickTs.get(p.symbol) ?? 0
  if (ts && ts <= prev) return // dedup / out-of-order
  lastTickTs.set(p.symbol, ts)
  lastTicks[p.symbol] = { ltp: p.ltp, ts }
  dirty = true
  emitQuote(p.symbol, p.ltp, ts || Date.now(), p.bidPrice, p.askPrice)
}

function handleMessage(channel: string, payload: unknown) {
  if (isIndexTickChannel(channel)) handleIndexTick(payload as IndexTickPayload)
  else if (isOptionChainChannel(channel)) { applyOptionUpdate(payload as OptionChainPayload); dirty = true }
  else if (isSymbolTickChannel(channel)) handleSymbolTick(payload as SymbolTickPayload)
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
    emitQuote(index, t.ltp, t.ts) // change% corrected once primeIndex() loads prevClose
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
    void primeIndex(index) // load previous-close baseline + last real price
    return wsManager.subscribeChannel(indexTickChannel(index))
  },

  /** Ref-counted server subscription for an index's option-chain stream. */
  subscribeOptionChain(index: string): () => void {
    return wsManager.subscribeChannel(optionChainChannel(index))
  },

  /** Ref-counted server subscription for a single symbol's tick stream
   * (equities, option strikes, …). Reusable by any module. */
  subscribeSymbolTick(symbol: string): () => void {
    void primeSymbol(symbol)
    return wsManager.subscribeChannel(symbolTickChannel(symbol))
  },

  onState(l: (s: ConnState) => void): () => void { return wsManager.onState(l) },
  getState(): ConnState { return wsManager.getState() },

  /** For tests / teardown. */
  _stopAutosave(): void { if (saveTimer) clearInterval(saveTimer) },
}
