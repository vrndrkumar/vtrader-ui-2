// ── Real historical candles via GET /data/candle ────────────────────────────
// Phase 0 uses hardcoded userId + FYERS (per direction). Response shape is
// parsed defensively (FYERS tuple format, envelope objects, or plain arrays)
// so it keeps working once the backend contract is confirmed.

import { axiosPrivate } from '@/api/axios'
import type { Candle, Timeframe, TradeSymbol } from '../types/market'

const CANDLE_USER_ID = 32
const CANDLE_BROKER = 'FYERS'

// Frequency param sent to the API for each timeframe.
const FREQUENCY: Record<Timeframe, string> = {
  '1': '1', '3': '3', '5': '5', '15': '15', '30': '30', '60': '60', D: 'D',
}

// Demo fallback window (the known-good range from the sample curl) so the
// chart always renders during the design phase if the recent range is empty.
const DEMO_FROM = '2026-05-01'
const DEMO_TO = '2026-05-31'

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Default range: recent calendar days ending today (wider for higher TFs). */
function defaultRange(tf: Timeframe): { from: string; to: string } {
  const to = new Date()
  const days = tf === 'D' ? 365 : tf === '60' || tf === '30' ? 60 : 20
  const from = new Date(to.getTime() - days * 864e5)
  return { from: fmt(from), to: fmt(to) }
}

// ── Defensive response parsing ───────────────────────────────────────────────

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

function toMs(t: number): number {
  // Treat < 1e12 as epoch seconds.
  return t < 1e12 ? t * 1000 : t
}

function normalize(row: unknown): Candle | null {
  // FYERS tuple: [epoch, open, high, low, close, volume]
  if (Array.isArray(row) && row.length >= 5) {
    const [t, o, h, l, c, v] = row as number[]
    return { timestamp: toMs(Number(t)), open: +o, high: +h, low: +l, close: +c, volume: v != null ? +v : undefined }
  }
  // Object: { timestamp|time|t, open|o, high|h, low|l, close|c, volume|v }
  if (row && typeof row === 'object') {
    const r = row as Record<string, unknown>
    const t = r.timestamp ?? r.time ?? r.t ?? r.date
    const o = r.open ?? r.o, h = r.high ?? r.h, l = r.low ?? r.l, c = r.close ?? r.c
    if (t != null && o != null && c != null) {
      const ts = typeof t === 'string' ? Date.parse(t) : toMs(Number(t))
      return {
        timestamp: ts,
        open: Number(o), high: Number(h), low: Number(l), close: Number(c),
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

// ── In-memory cache (per symbol+timeframe+range), mirrors indexMasterCache ────

const cache = new Map<string, Candle[]>()

async function fetchRange(symbol: TradeSymbol, tf: Timeframe, from: string, to: string): Promise<Candle[]> {
  const res = await axiosPrivate.get('/data/candle', {
    params: {
      userId: CANDLE_USER_ID,
      brokerName: CANDLE_BROKER,
      symbol: symbol.candleSymbol,
      from,
      to,
      frequency: FREQUENCY[tf],
    },
  })
  return parse(res.data)
}

export async function getCandles(symbol: TradeSymbol, tf: Timeframe): Promise<Candle[]> {
  const key = `${symbol.code}:${tf}`
  const cached = cache.get(key)
  if (cached && cached.length) return cached

  const { from, to } = defaultRange(tf)
  let candles = await fetchRange(symbol, tf, from, to).catch(() => [] as Candle[])

  // Fallback to the known-good demo window if the recent range is empty.
  if (!candles.length) {
    candles = await fetchRange(symbol, tf, DEMO_FROM, DEMO_TO).catch(() => [] as Candle[])
  }

  if (candles.length) cache.set(key, candles)
  return candles
}

export function clearCandleCache() {
  cache.clear()
}
