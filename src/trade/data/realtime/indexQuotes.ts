// ── Batch index quotes (authoritative previous close) ────────────────────────
// One call for every strip index: GET https://data.vtrader.in/data/quotes?symbols=NIFTY,SENSEX,…
// The response's `d[]` echoes each requested symbol in `n`, with the live values
// under `v` (lp, prev_close_price, …). Unsupported symbols (e.g. a bad code,
// BTC / INDIA VIX when the feed has no data) come back as `v.s === 'error'` /
// `v.code === -300` — those are skipped so the caller can fall back per symbol.
//
// We use `prev_close_price` as the change% baseline (the official prior-session
// close, matching the broker) and `lp` to seed the badge price before ticks.

import { axiosCandle } from '@/api/axios'

export interface IndexQuoteMark {
  code: string        // the requested symbol (response `n`)
  ltp: number
  prevClose: number   // change% baseline
  ts: number          // ms (from `tt` seconds)
}

interface QuoteVal {
  lp?: number
  prev_close_price?: number
  tt?: string | number
  s?: string
  code?: number
}

export async function fetchIndexQuotes(codes: string[]): Promise<IndexQuoteMark[]> {
  if (!codes.length) return []
  const { data } = await axiosCandle.get('/data/quotes', { params: { symbols: codes.join(',') } })
  const rows: Array<{ n?: string; v?: QuoteVal }> = Array.isArray(data?.d) ? data.d : []
  const out: IndexQuoteMark[] = []
  for (const r of rows) {
    const code = r?.n
    const v = r?.v
    // Skip unresolved / errored symbols — caller keeps its candle fallback.
    if (!code || !v || v.s === 'error' || v.code === -300) continue
    const prevClose = Number(v.prev_close_price)
    if (!Number.isFinite(prevClose) || prevClose <= 0) continue
    const ltp = Number(v.lp)
    const ts = (Number(v.tt) || 0) * 1000
    out.push({ code, ltp: Number.isFinite(ltp) && ltp > 0 ? ltp : prevClose, prevClose, ts })
  }
  return out
}
