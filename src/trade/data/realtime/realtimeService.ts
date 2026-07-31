// ── Realtime bootstrap service ───────────────────────────────────────────────
// Wires the shared WebSocket to the domain caches, bridges index ticks into
// marketStore (so charts / top bar / watchlist go live), restores + persists the
// IndexedDB snapshot, and exposes a ref-counted subscribe API. Idempotent start.

import { wsManager, type ConnState } from '../ws/WebSocketManager'
import { jwtDecode } from 'jwt-decode'
import {
  indexTickChannel, optionChainChannel, symbolTickChannel, ocoChannel,
  isIndexTickChannel, isOptionChainChannel, isSymbolTickChannel, isOcoChannel,
  type IndexTickPayload, type OptionChainPayload, type SymbolTickPayload,
} from '../ws/messages'
import { handleOcoEvent } from './ocoEvents'

/** userId from the auth JWT, for the per-user OCO channel. Null if not logged in. */
function currentUserId(): string | number | null {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vtrader_token') : null
    if (!token) return null
    const p = jwtDecode<{ userId?: string | number }>(token)
    return p.userId ?? null
  } catch { return null }
}
import { applyOptionUpdate, exportSnapshot, importSnapshot } from './optionChainCache'
import { loadSnapshot, saveSnapshot, todayStamp, type RtSnapshot } from './persistence'
import { getDailyMarks } from './dailyMarks'
import { fetchIndexQuotes } from './indexQuotes'
import { useMarketStore } from '../../store/marketStore'

const SAVE_INTERVAL_MS = 5_000

const lastTickTs = new Map<string, number>()          // index -> last exchange_timestamp
const lastTickWall = new Map<string, number>()        // index -> wall-clock (ms) of last LIVE tick
const prevClose = new Map<string, number>()           // index -> previous session close (change% baseline)
const lastTicks: Record<string, { ltp: number; ts: number }> = {}
// Indices whose last price came from the authoritative quotes API. A later
// candle/persisted seed must NOT overwrite it (only live WS ticks may).
const apiSeeded = new Set<string>()
// If no live tick for this long, the market isn't actively ticking (pre-open /
// closed) → the quotes-API `lp` (prior close / official close) drives the price.
const LIVE_STALE_MS = 8_000

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
  lastTickWall.set(p.index, Date.now()) // for the live/stale decision in the API poll
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
  // The batched quotes API is authoritative for indices — never let a candle
  // seed overwrite its baseline or last price.
  if (apiSeeded.has(key)) return
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

/**
 * Sync the strip indices from the batched quotes API — the SAME source & logic a
 * professional broker uses: change = current − previous close, at every phase.
 * Called on mount AND on an interval so it stays correct all day:
 *   • Previous close  → always from the API (authoritative; rolls over each
 *     morning to the new prior-session close).
 *   • Current price   → live WS ticks while the market is actively ticking; when
 *     ticks go quiet (pre-open / after close), the API `lp` (prior close /
 *     official close) drives it — exactly what the broker shows.
 * Symbols the feed can't resolve (BTC, INDIA VIX, …) are absent from the result
 * and keep their candle fallback.
 */
async function primeIndicesFromApi(codes: string[]) {
  try {
    const marks = await fetchIndexQuotes(codes)
    const now = Date.now()
    for (const m of marks) {
      apiSeeded.add(m.code)
      prevClose.set(m.code, m.prevClose) // authoritative baseline (rolls over each morning)
      const live = now - (lastTickWall.get(m.code) ?? 0) < LIVE_STALE_MS
      if (live) {
        // Market is actively ticking → WS drives the price. Just re-emit the
        // current tick so change% reflects any refreshed previous close.
        const t = lastTicks[m.code]
        if (t) emitQuote(m.code, t.ltp, t.ts)
      } else {
        // Pre-open / closed → the API `lp` is the authoritative price the broker
        // shows (prior close before open, official close after). Its `tt` is only
        // a day-stamp, so don't gate on it.
        const ts = Math.max(lastTicks[m.code]?.ts ?? 0, m.ts)
        lastTicks[m.code] = { ltp: m.ltp, ts }
        emitQuote(m.code, m.ltp, ts)
      }
    }
  } catch { /* ignore — per-index candle fallback still applies */ }
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
  else if (isOcoChannel(channel)) handleOcoEvent(payload)
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
    lastTickTs.set(index, t.ts)
    if (apiSeeded.has(index)) continue // authoritative API price already shown — don't restore a stale tick over it
    lastTicks[index] = t
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
    // Always-on subscription for server-side SL/Target (OCO) fills, scoped to
    // this user's channel (OCO_<userId>).
    const uid = currentUserId()
    if (uid != null) wsManager.subscribeChannel(ocoChannel(uid))
    setupPersistence()
  },

  /** Seed authoritative previous-close + last price for many indices at once
   *  (batched quotes API). Call with the strip's codes on mount. */
  primeIndices(codes: string[]): void { void primeIndicesFromApi(codes) },

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
   * (equities, option strikes, …). Reusable by any module.
   * `prime` (default true) fetches candle history to seed prev-close/last price;
   * pass { prime: false } when you only need the live LTP (e.g. positions),
   * to avoid a candle-history request per symbol. */
  subscribeSymbolTick(symbol: string, opts?: { prime?: boolean }): () => void {
    if (opts?.prime !== false) void primeSymbol(symbol)
    return wsManager.subscribeChannel(symbolTickChannel(symbol))
  },

  onState(l: (s: ConnState) => void): () => void { return wsManager.onState(l) },
  getState(): ConnState { return wsManager.getState() },

  /** For tests / teardown. */
  _stopAutosave(): void { if (saveTimer) clearInterval(saveTimer) },
}
