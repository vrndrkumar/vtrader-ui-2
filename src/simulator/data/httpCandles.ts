// ── Real underlying candles (data.vtrader.in) ────────────────────────────────
// GET /data/candle?symbol=NIFTY&from=YYYY-MM-DD HH:mm&to=YYYY-MM-DD HH:mm&frequency=5
//   → { candles: [{ time(epoch s), open, high, low, close, volume, oi, final }] }
// Works for the index (symbol=NIFTY) and any option symbol. Credential-free host
// (axiosCandle). Full session is fetched once per symbol|date|freq and cached; the
// provider filters to the replay window / look-ahead cutoff.

import { axiosCandle } from '@/api/axios'
import type { Candle, Frequency, IndexCode } from '../types'

const FREQ_PARAM: Record<Frequency, string> = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60' }

interface RawCandle { time: number; open: number; high: number; low: number; close: number; volume?: number; oi?: number | null }
interface CandleResponse { candles: RawCandle[] }

const cache = new Map<string, Candle[]>()

/** Full-day underlying candles for the index at `freq` (cached, epoch-ms timestamps). */
export async function fetchIndexCandles(index: IndexCode, date: string, freq: Frequency): Promise<Candle[]> {
  const key = `${index}|${date}|${freq}`
  const hit = cache.get(key)
  if (hit) return hit
  const { data } = await axiosCandle.get<CandleResponse>('/data/candle', {
    params: { symbol: index, from: `${date} 00:00`, to: `${date} 23:59`, frequency: FREQ_PARAM[freq] },
  })
  const raw = Array.isArray(data?.candles) ? data.candles : []
  const out: Candle[] = raw
    .filter((c) => c && typeof c.time === 'number')
    .map((c) => ({ ts: c.time * 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))
  if (out.length) {
    if (cache.size > 200) cache.clear()
    cache.set(key, out)
  }
  return out
}
