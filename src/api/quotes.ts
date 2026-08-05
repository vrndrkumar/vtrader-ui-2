import { axiosCandle } from './axios'

export interface QuoteData {
  ltp: number    // last traded price
  chp: number    // day change %
  ch: number     // day change absolute
}

/** Batch-fetch live quotes from data.vtrader.in/data/quotes.
 *
 *  @param symbols  NSE symbols in hyphenated format, e.g. ["TCS-EQ", "NIFTYBEES-EQ"]
 *  @returns  Map of symbol → QuoteData. Symbols that errored or had no price are omitted.
 *
 *  Response shape: { d: [{ n: "TCS-EQ", v: { lp, chp, ch, ... }, s: "ok" | "error" }] }
 *  Only entries with s === "ok" and a positive lp are included in the result.
 */
export async function getHoldingQuotes(symbols: string[]): Promise<Record<string, QuoteData>> {
  if (!symbols.length) return {}
  const joined = symbols.join(',')
  try {
    const res = await axiosCandle.get<{
      d: Array<{ n: string; v: { lp: number; chp: number; ch: number }; s: string }>
    }>(`/data/quotes?symbols=${encodeURIComponent(joined)}`)

    const result: Record<string, QuoteData> = {}
    for (const item of res.data?.d ?? []) {
      if (item.s === 'ok' && item.v?.lp > 0) {
        result[item.n] = { ltp: item.v.lp, chp: item.v.chp ?? 0, ch: item.v.ch ?? 0 }
      }
    }
    return result
  } catch {
    // Network or parse failure — return empty so callers fall back to unrealized_pnl estimate
    return {}
  }
}
