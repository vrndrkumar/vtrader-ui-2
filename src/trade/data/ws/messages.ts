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

/**
 * Order-status frame — the redesigned OCO channel now pushes the RAW broker
 * order-status object (identical shape to GET /v3/trade/order/status). The
 * backend places the leg, polls status (0.5s×5) until COMPLETE, then publishes
 * this once. It carries no monitorId/leg/event — the UI treats it as a "poke"
 * and reconciles the true state from the Position + Order APIs. Only a few
 * fields matter (orderId, status, tradingSymbol, quantity for partials); price /
 * triggerPrice / priceType are ignored.
 */
export interface OrderStatusPayload {
  orderId?: string               // absent on synthesized reject/cancel frames
  status: string                 // COMPLETE | OPEN | PENDING | REJECTED | CANCELLED | …
  tradingSymbol: string
  quantity?: number
  transationType?: 'B' | 'S'     // broker spelling (note the single 's')
  exchange?: string
  index?: string | null
  rejectionRegion?: string       // reason text when REJECTED
  priceType?: string
  price?: number
  triggerPrice?: number
}

/** New status frame vs the legacy OcoEventPayload (which carries `event`). */
export function isOrderStatusPayload(p: unknown): p is OrderStatusPayload {
  if (!p || typeof p !== 'object') return false
  const o = p as Record<string, unknown>
  return typeof o.tradingSymbol === 'string'
    && typeof o.status === 'string'
    && !('event' in o)
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
