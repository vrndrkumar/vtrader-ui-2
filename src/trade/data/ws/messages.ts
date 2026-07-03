// ── WebSocket message contracts ──────────────────────────────────────────────
// Server frame: { type, channel, pattern, payload }

export interface WsEnvelope {
  type: string
  channel: string
  pattern?: string
  payload: unknown
}

export interface IndexTickPayload {
  index: string
  displayName?: string
  symbol?: string
  ltp: number
  bidPrice?: number
  askPrice?: number
  exchange_timestamp: number
}

export interface OptionChainPayload {
  index: string
  expiry: string
  optionType: 'CE' | 'PE'
  strikePrice: string
  displayName?: string
  symbol: string
  ltp: number
  volume?: number
  buyQty?: number
  sellQty?: number
  bidPrice?: number
  askPrice?: number
  exchange_timestamp: number
}

// Channel name helpers.
export const indexTickChannel = (index: string) => `INDEX_TICK_${index}`
export const optionChainChannel = (index: string) => `OPTION_CHAIN_${index}`

export const isIndexTickChannel = (ch: string) => ch.startsWith('INDEX_TICK_')
export const isOptionChainChannel = (ch: string) => ch.startsWith('OPTION_CHAIN_')

export function parseEnvelope(raw: unknown): WsEnvelope | null {
  if (typeof raw !== 'string') return null
  try {
    const m = JSON.parse(raw)
    if (m && typeof m === 'object' && typeof m.channel === 'string' && 'payload' in m) {
      return m as WsEnvelope
    }
  } catch {
    /* malformed frame — ignore */
  }
  return null
}
