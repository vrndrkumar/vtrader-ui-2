import { axiosPrivate } from './axios'
import type { PlaceOrderRequest } from '@/services/orders/types'

// ── Place Order ──────────────────────────────────────────────────────────────
// POST /trade/place-order
// Auth header is attached by the shared axiosPrivate interceptor.

export async function placeOrderApi(payload: PlaceOrderRequest): Promise<unknown> {
  const { data } = await axiosPrivate.post('/trade/place-order', payload)
  return data
}
