// ── Daily marks (last close + previous close) from real historical candles ───
// Used to derive change% against the *previous session close*, and to seed the
// last known price when the market is closed and no live tick is available.
// Works for indices and option strikes (pass the candle symbol + kind).

import { getCandlesBySymbol, type CandleKind } from '../candleApi'
import { istDate } from '../../utils/marketStatus'
import type { Candle } from '../../types/market'

export interface DailyMarks {
  lastClose: number   // close of the most recent trading session
  prevClose: number   // close of the session before that (baseline for change%)
  lastTs: number      // timestamp (ms) of the most recent candle
}

const cache = new Map<string, DailyMarks>()

/** Derive marks (last/prev session close) from an already-loaded candle series. */
export function marksFromCandles(candles: Candle[]): DailyMarks | null {
  if (!candles.length) return null
  const byDate = new Map<string, number>()
  for (const c of candles) byDate.set(istDate(c.timestamp), c.close)
  const dates = [...byDate.keys()].sort()
  const lastClose = byDate.get(dates[dates.length - 1])!
  const prevClose = dates.length >= 2 ? byDate.get(dates[dates.length - 2])! : lastClose
  return { lastClose, prevClose, lastTs: candles[candles.length - 1].timestamp }
}

/** Pre-populate the marks cache (e.g. from the chart's own candles) so a later
 *  prime() reuses it instead of firing a second candle request. */
export function setDailyMarks(candleSymbol: string, marks: DailyMarks): void {
  cache.set(candleSymbol, marks)
}

export async function getDailyMarks(candleSymbol: string, kind: CandleKind = 'INDEX'): Promise<DailyMarks | null> {
  const hit = cache.get(candleSymbol)
  if (hit) return hit

  const candles = await getCandlesBySymbol(candleSymbol, '15', kind).catch(() => [])
  const marks = marksFromCandles(candles)
  if (marks) cache.set(candleSymbol, marks)
  return marks
}
