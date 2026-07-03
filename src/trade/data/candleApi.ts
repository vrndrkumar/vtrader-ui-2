// ── Real historical candles via GET /data/candle ────────────────────────────
// Confirmed response shape:
//   { "candles": [ { time: <epoch seconds>, open, high, low, close, volume }, ... ] }
//
// Rate-limit strategy (the broker sits behind this endpoint):
//   1. Session cache — past candles are immutable, so a (symbol,timeframe) pair
//      is fetched at most once per session.
//   2. In-flight de-duplication — N charts requesting the same series share one
//      network call.
//   3. Throttled scheduler — limited concurrency + a minimum gap between request
//      starts, so bursts (e.g. an 8-chart layout) are spaced out, not fired at
//      once. The live/forming candle comes from the WS tick stream, so we never
//      re-poll history for updates.

import { axiosPrivate } from '@/api/axios'
import type { Candle, Timeframe, TradeSymbol } from '../types/market'

const CANDLE_USER_ID = 32       // hardcoded per direction (Phase 0)
const CANDLE_BROKER = 'FYERS'

const FREQUENCY: Record<Timeframe, string> = {
  '1': '1', '3': '3', '5': '5', '15': '15', '30': '30', '60': '60', D: 'D',
}

// Known-good demo window (from the sample) — used only if the recent range is empty.
const DEMO_FROM = '2026-05-01'
const DEMO_TO = '2026-05-31'

const fmt = (d: Date) => d.toISOString().slice(0, 10)

function defaultRange(tf: Timeframe): { from: string; to: string } {
  const to = new Date()
  const days = tf === 'D' ? 365 : tf === '60' || tf === '30' ? 60 : 20
  return { from: fmt(new Date(to.getTime() - days * 864e5)), to: fmt(to) }
}

// ── Throttled request scheduler ──────────────────────────────────────────────

const MAX_CONCURRENT = 2
const MIN_GAP_MS = 300
let active = 0
let lastStart = 0
const queue: Array<() => void> = []

function pump() {
  if (active >= MAX_CONCURRENT || queue.length === 0) return
  const gap = Date.now() - lastStart
  if (gap < MIN_GAP_MS) { setTimeout(pump, MIN_GAP_MS - gap); return }
  const run = queue.shift()!
  active++
  lastStart = Date.now()
  run()
  pump() // gap check staggers the next start
}

function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => {
      job().then(resolve, reject).finally(() => { active--; pump() })
    })
    pump()
  })
}

// ── Defensive parsing (handles the confirmed shape + fallbacks) ──────────────

function extractArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    for (const key of ['candles', 'data', 'result', 'records', 'items']) {
      const v = obj[key]
      if (Array.isArray(v)) return v
      if (v && typeof v === 'object') {
        const nested = extractArray(v)
        if (nested.length) return nested
      }
    }
  }
  return []
}

const toMs = (t: number) => (t < 1e12 ? t * 1000 : t) // epoch seconds -> ms

function normalize(row: unknown): Candle | null {
  if (Array.isArray(row) && row.length >= 5) {
    const [t, o, h, l, c, v] = row as number[]
    return { timestamp: toMs(Number(t)), open: +o, high: +h, low: +l, close: +c, volume: v != null ? +v : undefined }
  }
  if (row && typeof row === 'object') {
    const r = row as Record<string, unknown>
    const t = r.time ?? r.timestamp ?? r.t ?? r.date
    const o = r.open ?? r.o, h = r.high ?? r.h, l = r.low ?? r.l, c = r.close ?? r.c
    if (t != null && o != null && c != null) {
      const ts = typeof t === 'string' ? Date.parse(t) : toMs(Number(t))
      return {
        timestamp: ts, open: Number(o), high: Number(h), low: Number(l), close: Number(c),
        volume: r.volume != null ? Number(r.volume) : r.v != null ? Number(r.v) : undefined,
      }
    }
  }
  return null
}

function parse(raw: unknown): Candle[] {
  return extractArray(raw)
    .map(normalize)
    .filter((c): c is Candle => !!c && Number.isFinite(c.timestamp) && Number.isFinite(c.close))
    .sort((a, b) => a.timestamp - b.timestamp)
}

// ── Cache + in-flight de-dup ─────────────────────────────────────────────────

const cache = new Map<string, Candle[]>()
const inFlight = new Map<string, Promise<Candle[]>>()

function fetchRange(symbol: TradeSymbol, tf: Timeframe, from: string, to: string): Promise<Candle[]> {
  return schedule(() =>
    axiosPrivate
      .get('/data/candle', {
        params: { userId: CANDLE_USER_ID, brokerName: CANDLE_BROKER, symbol: symbol.candleSymbol, from, to, frequency: FREQUENCY[tf] },
      })
      .then((res) => parse(res.data)),
  )
}

async function load(symbol: TradeSymbol, tf: Timeframe, key: string): Promise<Candle[]> {
  const { from, to } = defaultRange(tf)
  let candles = await fetchRange(symbol, tf, from, to).catch(() => [] as Candle[])
  if (!candles.length) candles = await fetchRange(symbol, tf, DEMO_FROM, DEMO_TO).catch(() => [] as Candle[])
  if (candles.length) cache.set(key, candles)
  return candles
}

export async function getCandles(symbol: TradeSymbol, tf: Timeframe): Promise<Candle[]> {
  const key = `${symbol.code}:${tf}`
  const cached = cache.get(key)
  if (cached?.length) return cached
  const existing = inFlight.get(key)
  if (existing) return existing

  const p = load(symbol, tf, key).finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

export function clearCandleCache() {
  cache.clear()
  inFlight.clear()
}
