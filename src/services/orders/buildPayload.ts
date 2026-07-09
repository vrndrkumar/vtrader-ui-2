// ── Pure order-building logic (no side effects, unit-testable) ───────────────
// Encapsulates price/triggerPrice derivation so callers never compute them.

import { lotSizeFor } from './lotSize'
import type { OrderIntent, PlaceOrderRequest, PriceType, TxnType } from './types'

/**
 * Fixed tick buffer applied to SL-LMT orders. The user supplies only the
 * trigger price; the limit price is nudged by this amount so the order fills
 * once triggered (BUY → above trigger, SELL → below trigger).
 * Override per-order via OrderIntent.slTickBuffer.
 */
export const SL_LMT_TICK_BUFFER = 0.05

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Derive the broker-facing { price, triggerPrice } from a single user input.
 *  • MKT     → { 0, 0 }
 *  • LMT     → { limit, 0 }
 *  • SL-LMT  → trigger is the user input; limit = trigger ± tick buffer
 *              (BUY adds the buffer, SELL subtracts it).
 */
export function derivePrices(
  side: TxnType,
  priceType: PriceType,
  input: number,
  tickBuffer: number = SL_LMT_TICK_BUFFER,
): { price: number; triggerPrice: number } {
  if (priceType === 'MKT') return { price: 0, triggerPrice: 0 }
  if (priceType === 'LMT') return { price: round2(input), triggerPrice: 0 }
  // SL-LMT
  const trigger = round2(input)
  const price = side === 'BUY' ? round2(trigger + tickBuffer) : round2(Math.max(0, trigger - tickBuffer))
  return { price, triggerPrice: trigger }
}

/** Validate the intent before it can be submitted. Returns an error string or null. */
export function validateIntent(intent: OrderIntent): string | null {
  if (!intent.symbolName) return 'Missing symbol'
  if (!intent.indexName) return 'Missing index'
  const pt = intent.priceType ?? 'MKT'
  if ((pt === 'LMT' || pt === 'SL-LMT') && !(Number(intent.price) > 0)) {
    return pt === 'SL-LMT' ? 'Enter a trigger price' : 'Enter a limit price'
  }
  return null
}

/**
 * Build the exact API payload for one broker.
 * `lots` is the number of lots; quantity is derived as lots × index lot size
 * (SENSEX lot size 20 → 1 lot = quantity 20). Call ensureLotSizes() first so the
 * index master is loaded; otherwise the static fallback lot size is used.
 */
export function buildPlaceOrderRequest(
  intent: OrderIntent,
  brokerName: string,
  lots: number,
): PlaceOrderRequest {
  const priceType = intent.priceType ?? 'MKT'
  const { price, triggerPrice } = derivePrices(intent.side, priceType, Number(intent.price) || 0, intent.slTickBuffer)
  const safeLots = Math.max(1, Math.round(lots))
  return {
    txnType: intent.side,
    quantity: lotSizeFor(intent.indexName) * safeLots,
    priceType,
    price,
    triggerPrice,
    symbolName: intent.symbolName,
    lot: safeLots,
    brokerName,
    indexName: intent.indexName,
  }
}
