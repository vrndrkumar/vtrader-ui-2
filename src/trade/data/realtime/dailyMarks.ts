// ── Daily marks (last close + previous close) from real historical candles ───
// Used to derive change% against the *previous session close*, and to seed the
// last known price when the market is closed and no live tick is available.
// Works for indices and option strikes (pass the candle symbol + kind).

import { getCandlesBySymbol, type CandleKind } from '../candleApi'
import { istDate } from '../../utils/marketStatus'

export interface DailyMarks {
  lastClose: number   // close of the most recent trading session
  prevClose: number   // close of the session before that (baseline for change%)
}

const cache = new Map<string, DailyMarks>()

export async function getDailyMarks(candleSymbol: string, kind: CandleKind = 'INDEX'): Promise<DailyMarks | null> {
  const hit = cache.get(candleSymbol)
  if (hit) return hit

  const candles = await getCandlesBySymbol(candleSymbol, '15', kind).catch(() => [])
  if (!candles.length) return null

  const byDate = new Map<string, number>()
  for (const c of candles) byDate.set(istDate(c.timestamp), c.close)

  const dates = [...byDate.keys()].sort()
  const lastClose = byDate.get(dates[dates.length - 1])!
  const prevClose = dates.length >= 2 ? byDate.get(dates[dates.length - 2])! : lastClose

  const marks: DailyMarks = { lastClose, prevClose }
  cache.set(candleSymbol, marks)
  return marks
}
