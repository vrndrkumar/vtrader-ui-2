import { axiosPrivate } from './axios'
import type { PlaceOrderRequest } from '@/services/orders/types'

// ── Place Order ──────────────────────────────────────────────────────────────
// POST /trade/place-order
// Auth header is attached by the shared axiosPrivate interceptor.

export async function placeOrderApi(payload: PlaceOrderRequest): Promise<unknown> {
  const { data } = await axiosPrivate.post('/trade/place-order', payload)
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
  const { data } = await axiosPrivate.put('/trade/update-order', payload)
  return data
}

// ── Cancel order ─────────────────────────────────────────────────────────────
// PUT /trade/cancel-order

export async function cancelOrderApi(payload: { brokerName: string; orderId: string }): Promise<unknown> {
  const { data } = await axiosPrivate.put('/trade/cancel-order', payload)
  return data
}
