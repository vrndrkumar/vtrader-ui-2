// ── Configured market indices for the top strip ─────────────────────────────
// A card is always reserved for each of these (placeholder until ticks arrive).
// `code` must match the INDEX_TICK_<code> channel + payload.index. This is the
// single place to add/remove indices; can be sourced from the Indices Service.

export type Exchange = 'NSE' | 'BSE' | 'CRYPTO'

export interface StripIndex {
  code: string        // marketStore key + INDEX_TICK_<code>
  name: string        // display
  exchange: Exchange
  selectable?: boolean // sets the option-chain / watchlist context on click
  decimals?: number
}

export const STRIP_INDICES: StripIndex[] = [
  { code: 'NIFTY', name: 'NIFTY', exchange: 'NSE', selectable: true },
  { code: 'BANKNIFTY', name: 'BANKNIFTY', exchange: 'NSE' },
  { code: 'FINNIFTY', name: 'FINNIFTY', exchange: 'NSE' },
  { code: 'MIDCPNIFTY', name: 'MIDCPNIFTY', exchange: 'NSE' },
  { code: 'INDIAVIX', name: 'INDIA VIX', exchange: 'NSE', decimals: 2 },
  { code: 'SENSEX', name: 'SENSEX', exchange: 'BSE', selectable: true },
  { code: 'BANKEX', name: 'BANKEX', exchange: 'BSE' },
  { code: 'BTC', name: 'BTC', exchange: 'CRYPTO', decimals: 1 },
  { code: 'ETH', name: 'ETH', exchange: 'CRYPTO', decimals: 1 },
]

export const EXCHANGE_ORDER: Exchange[] = ['NSE', 'BSE', 'CRYPTO']
