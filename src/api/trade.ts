import { axiosPrivate } from './axios'
import type { PlaceOrderRequest } from '@/services/orders/types'
import { roundTick } from '@/services/orders/tick'

// ── Place Order ──────────────────────────────────────────────────────────────
// POST /trade/place-order
// Auth header is attached by the shared axiosPrivate interceptor.

export async function placeOrderApi(payload: PlaceOrderRequest): Promise<unknown> {
  // Enforce tick size on any order/limit/trigger price (broker rejects otherwise).
  const body = { ...payload, price: roundTick(payload.price), triggerPrice: roundTick(payload.triggerPrice) }
  const { data } = await axiosPrivate.post('/trade/place-order', body)
  return data
}

// ── Positions ────────────────────────────────────────────────────────────────
// GET /trade/positions?brokerName=FYERS

/** Unwrap common envelope shapes to the underlying array of rows. */
function toRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[]
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    for (const k of ['data', 'result', 'records', 'items', 'positions', 'netPositions', 'net']) {
      if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[]
      if (o[k] && typeof o[k] === 'object') {
        const nested = toRows(o[k])
        if (nested.length) return nested
      }
    }
  }
  return []
}

export async function getPositions(brokerName: string): Promise<Record<string, unknown>[]> {
  const { data } = await axiosPrivate.get(`/trade/positions?brokerName=${encodeURIComponent(brokerName)}`)
  return toRows(data)
}

// ── Order book ───────────────────────────────────────────────────────────────
// GET /trade/order-book?brokerName=FYERS

export async function getOrderBook(brokerName: string): Promise<Record<string, unknown>[]> {
  const { data } = await axiosPrivate.get(`/trade/order-book?brokerName=${encodeURIComponent(brokerName)}`)
  return toRows(data)
}

// ── Update (modify) order ────────────────────────────────────────────────────
// PUT /trade/update-order

export interface UpdateOrderRequest {
  txnType: 'BUY' | 'SELL'
  quantity: number
  priceType: 'MKT' | 'LMT' | 'SL-LMT'
  price: number
  triggerPrice: number
  symbolName: string
  lot: number
  brokerName: string
  orderId: string
  indexName: string
}

export async function updateOrderApi(payload: UpdateOrderRequest): Promise<unknown> {
  const body = { ...payload, price: roundTick(payload.price), triggerPrice: roundTick(payload.triggerPrice) }
  const { data } = await axiosPrivate.put('/trade/update-order', body)
  return data
}

// ── Cancel order ─────────────────────────────────────────────────────────────
// PUT /trade/cancel-order

export async function cancelOrderApi(payload: { brokerName: string; orderId: string }): Promise<unknown> {
  const { data } = await axiosPrivate.put('/trade/cancel-order', payload)
  return data
}

// ── OCO monitor (server-side SL / Target bracket) ────────────────────────────
// POST /trade/oco-monitor — SL and/or Target (either optional). Backend holds
// the trigger and places the real order when price crosses (double-margin-safe).

export interface OcoMonitorRequest {
  brokerName: string
  indexName: string
  symbolName: string
  product?: string
  direction: 'LONG' | 'SHORT'   // underlying position direction
  side: 'BUY' | 'SELL'          // exit order side (opposite of the position)
  quantity: number              // position qty (fallback / reference)
  // Each leg carries its own quantity — SL and Target can differ (e.g. scale-out).
  stopLoss?: { limitPrice: number; quantity: number }  // omit if no SL
  target?: { limitPrice: number; quantity: number }    // omit if no Target
}

export async function saveOcoMonitor(payload: OcoMonitorRequest): Promise<unknown> {
  // SL/Target limit prices are strike premiums → round to the tick size.
  const body: OcoMonitorRequest = {
    ...payload,
    stopLoss: payload.stopLoss ? { ...payload.stopLoss, limitPrice: roundTick(payload.stopLoss.limitPrice) } : undefined,
    target: payload.target ? { ...payload.target, limitPrice: roundTick(payload.target.limitPrice) } : undefined,
  }
  const { data } = await axiosPrivate.post('/trade/oco-monitor', body)
  return data
}

// ── Index bracket (index-triggered entry + SL/Target on a strike) ────────────
// Same endpoint as OCO, discriminated by monitorType:'INDEX'. Entry + SL + Target
// all trigger on the INDEX price; the backend places MKT orders on `symbolName`
// (the strike). `direction` is the index bias (LONG = profit when index rises).

export interface IndexBracketRequest {
  monitorType: 'INDEX'
  brokerName: string
  indexName: string
  symbolName: string                 // the tradable strike, e.g. NIFTY_31JUL25_CE_24000
  product?: string
  direction: 'LONG' | 'SHORT'        // index bias (Buy CE / Sell PE = LONG)
  entrySide: 'BUY' | 'SELL'          // to OPEN the option position
  entryQuantity: number
  entryTriggerPrice: number          // index level
  entryDir?: 'ABOVE' | 'BELOW'       // optional; backend derives from level vs current index
  stopLoss?: { triggerPrice: number; quantity?: number }  // index level (MKT exit)
  target?: { triggerPrice: number; quantity?: number }    // index level (MKT exit)
}

export async function saveIndexBracket(payload: Omit<IndexBracketRequest, 'monitorType'>): Promise<{ id?: number | string } & Record<string, unknown>> {
  const { data } = await axiosPrivate.post('/trade/oco-monitor', { monitorType: 'INDEX', ...payload })
  // Unwrap { status, data } envelope to the created row.
  const row = (data && typeof data === 'object' && 'data' in data) ? (data as Record<string, unknown>).data : data
  return (row ?? {}) as { id?: number | string } & Record<string, unknown>
}

export async function listIndexBrackets(indexName: string): Promise<Record<string, unknown>[]> {
  const { data } = await axiosPrivate.get(`/trade/oco-monitor?monitorType=INDEX&indexName=${encodeURIComponent(indexName)}`)
  return toRows(data)
}

/** Active OCO monitors (filterable). Used to RESTORE on-chart SL/Target after a
 *  reload/navigation so they persist like the server state. */
export async function getOcoMonitors(params: { monitorType?: string; indexName?: string; symbolName?: string }): Promise<Record<string, unknown>[]> {
  const q = new URLSearchParams()
  if (params.monitorType) q.set('monitorType', params.monitorType)
  if (params.indexName) q.set('indexName', params.indexName)
  if (params.symbolName) q.set('symbolName', params.symbolName)
  const { data } = await axiosPrivate.get(`/trade/oco-monitor?${q.toString()}`)
  return toRows(data)
}

/** A SYMBOL triggered-entry bracket (strike `+`): entry + optional SL/Target all
 *  trigger on the OPTION PREMIUM. Same endpoint; no monitorType → backend routes
 *  to a SYMBOL bracket because an entry leg is present. Premium levels tick-rounded. */
export interface SymbolBracketRequest {
  brokerName: string
  indexName: string
  symbolName: string
  product?: string
  entrySide: 'BUY' | 'SELL'
  entryQuantity: number
  entryTriggerPrice: number                                  // premium level
  entryDir?: 'ABOVE' | 'BELOW'
  stopLoss?: { triggerPrice: number; quantity?: number }     // premium level
  target?: { triggerPrice: number; quantity?: number }       // premium level
}

export async function saveSymbolBracket(payload: SymbolBracketRequest): Promise<{ id?: number | string } & Record<string, unknown>> {
  const body: SymbolBracketRequest = {
    ...payload,
    entryTriggerPrice: roundTick(payload.entryTriggerPrice),
    stopLoss: payload.stopLoss ? { ...payload.stopLoss, triggerPrice: roundTick(payload.stopLoss.triggerPrice) } : undefined,
    target: payload.target ? { ...payload.target, triggerPrice: roundTick(payload.target.triggerPrice) } : undefined,
  }
  const { data } = await axiosPrivate.post('/trade/oco-monitor', body)
  const row = (data && typeof data === 'object' && 'data' in data) ? (data as Record<string, unknown>).data : data
  return (row ?? {}) as { id?: number | string } & Record<string, unknown>
}

export async function cancelIndexBracket(id: number | string): Promise<unknown> {
  const { data } = await axiosPrivate.delete(`/trade/oco-monitor/${encodeURIComponent(String(id))}`)
  return data
}

export interface IndexBracketPatch {
  entryTriggerPrice?: number
  entryQuantity?: number
  stopLoss?: { triggerPrice: number; quantity?: number } | null
  target?: { triggerPrice: number; quantity?: number } | null
}

export async function updateIndexBracket(id: number | string, patch: IndexBracketPatch): Promise<unknown> {
  const { data } = await axiosPrivate.put(`/trade/oco-monitor/${encodeURIComponent(String(id))}`, patch)
  return data
}
