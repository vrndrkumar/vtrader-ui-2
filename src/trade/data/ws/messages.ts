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

/** Per-symbol tick (equities, option strikes, etc.). e.g. TICK_NIFTY_07JUL26_CE_23700 */
export interface SymbolTickPayload {
  symbol: string
  ltp: number
  volume?: number
  bidPrice?: number
  askPrice?: number
  buyQty?: number
  sellQty?: number
  exchange_timestamp: number
}

/**
 * OCO monitor event — pushed by the server when a server-side SL/Target leg
 * fires (EXECUTED), is rejected (REJECTED), or the sibling is cancelled. The
 * socket is token-scoped, so the server delivers this only to the owning user.
 */
export interface OcoEventPayload {
  monitorId: number | string
  monitorType?: 'SYMBOL' | 'INDEX'
  event: 'EXECUTED' | 'REJECTED' | 'CANCELLED' | 'ENTRY_FILLED'
  leg: 'SL' | 'TGT' | 'ENTRY' | 'BRACKET'
  symbolName: string
  indexName?: string
  brokerName?: string
  brokerOrderId?: string
  quantity?: number
  side?: 'BUY' | 'SELL'
  cancelledLeg?: 'SL' | 'TGT' | null
  message?: string
  status?: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
}

// Channel name helpers.
export const indexTickChannel = (index: string) => `INDEX_TICK_${index}`
export const optionChainChannel = (index: string) => `OPTION_CHAIN_${index}`
export const symbolTickChannel = (symbol: string) => `TICK_${symbol}`
// OCO is per-user (channels are broadcast to every subscriber, so it must be
// scoped by userId — never a shared 'OCO' channel).
export const OCO_CHANNEL_PREFIX = 'OCO_'
export const ocoChannel = (userId: string | number) => `OCO_${userId}`

export const isIndexTickChannel = (ch: string) => ch.startsWith('INDEX_TICK_')
export const isOptionChainChannel = (ch: string) => ch.startsWith('OPTION_CHAIN_')
export const isSymbolTickChannel = (ch: string) => ch.startsWith('TICK_')
export const isOcoChannel = (ch: string) => ch.startsWith(OCO_CHANNEL_PREFIX)

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
