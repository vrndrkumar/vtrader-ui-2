// ── Stocks master (watchlist reference data) ─────────────────────────────────
// GET /stocks/list → all active stocks from stock_mstr, for the sector-grouped
// watchlist. Auth via the shared axiosPrivate interceptor.

import { axiosPrivate } from './axios'

export interface Stock {
  exchange: string | null
  symbolCode: string
  symbolName: string
  sector: string
  industry: string | null
  category: string   // EQUITY | ETF | MF | BOND
  tokenId: number | null
  ltp: number | null // best-effort last price from latest_update
}

export async function getStocks(): Promise<Stock[]> {
  // Timeout so a slow/unavailable endpoint fails fast instead of hanging the
  // "loading…" state forever.
  const { data } = await axiosPrivate.get('/stocks/list', { timeout: 20000 })
  const d = (data as { data?: unknown })?.data ?? data
  return Array.isArray(d) ? (d as Stock[]) : []
}
