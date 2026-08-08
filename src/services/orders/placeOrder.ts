// ── Global order service — single entry point for ALL order placement ────────
// Every module (Option Chain, Chart, Strategy execution, future modules) calls
// placeOrder(intent). Nothing else builds payloads or talks to the broker API.
//
//   • Reads trading config from brokerStore: Quick Trade vs Normal, and the
//     selected broker(s) (single or multi — the fan-out is identical).
//   • Quick Trade ON  → submits immediately across selected brokers.
//   • Quick Trade OFF → opens the shared Order Window for review, which then
//     calls submitOrder() with the reviewed legs.
//   • Order-building logic lives entirely in buildPayload.ts.

import { AxiosError } from 'axios'
import toast from 'react-hot-toast'
import { resolveQty, useBrokerStore, type BrokerAccount } from '@/store/brokerStore'
import { useOrderStore, type BrokerExecResult } from '@/store/orderStore'
import { placeOrderApi } from '@/api/trade'
import { buildPlaceOrderRequest, derivePrices, validateIntent } from './buildPayload'
import { ensureLotSizes, lotSizeFor } from './lotSize'
import { interpretOrderResponse } from './parseResponse'
import type { BrokerOrderResult, OrderIntent, PlaceOrderOutcome, PriceType, TxnType } from './types'

/** A broker leg expressed in LOTS (quantity = lots × index lot size). */
export interface BrokerLeg { broker: BrokerAccount; lots: number }

/** Default number of lots for a broker, from its configured quantity ÷ lot size. */
export function defaultLotsFor(broker: BrokerAccount, index: string): number {
  const size = lotSizeFor(index)
  return Math.max(1, Math.round(resolveQty(broker, index) / size))
}

function errMessage(e: unknown): string {
  if (e instanceof AxiosError) {
    const d = e.response?.data as { message?: string; error?: string } | undefined
    return d?.message || d?.error || e.message || 'Order failed'
  }
  return e instanceof Error ? e.message : 'Order failed'
}

/** Currently selected broker accounts (single- or multi-broker — same path). */
function selectedBrokers(): BrokerAccount[] {
  const { accounts, selectedIds } = useBrokerStore.getState()
  return accounts.filter((a) => selectedIds.includes(a.id))
}

export interface StrategyLegOrder {
  side: TxnType
  symbolName: string
  indexName: string
  priceType: PriceType
  price: number
  qty: number
}

/**
 * One-click order at a specific price (from the chart "+" menu).
 * `stop` → SL-LMT with the trigger at that price; otherwise a plain LMT.
 */
export async function quickPlace(o: { symbolName: string; indexName: string; side: TxnType; stop: boolean; price: number; qty: number }): Promise<PlaceOrderOutcome> {
  const brokers = selectedBrokers()
  if (!brokers.length) { toast.error('Select a broker first'); return { ok: false, results: [] } }
  await ensureLotSizes()
  const lot = Math.max(1, Math.round(o.qty / lotSizeFor(o.indexName)))
  const priceType: PriceType = o.stop ? 'SL-LMT' : 'LMT'
  const d = o.stop ? derivePrices(o.side, 'SL-LMT', o.price) : { price: o.price, triggerPrice: 0 }
  const results = await Promise.all(brokers.map<Promise<BrokerOrderResult>>(async (b) => {
    const base = { brokerId: b.id, brokerName: b.brokerName, displayName: b.displayName, qty: o.qty }
    try {
      const raw = await placeOrderApi({ txnType: o.side, quantity: o.qty, priceType, price: d.price, triggerPrice: d.triggerPrice, symbolName: o.symbolName, lot, brokerName: b.brokerName, indexName: o.indexName })
      const v = interpretOrderResponse(raw)
      return { ...base, ok: v.ok, message: v.message, data: raw }
    } catch (e) { return { ...base, ok: false, message: errMessage(e) } }
  }))
  const ok = results.filter((r) => r.ok).length
  if (ok === results.length) toast.success(`${o.side} ${o.qty} @ ${o.price} ${o.stop ? 'stop' : 'limit'} placed`)
  else if (ok === 0) toast.error(`Order failed · ${results.find((r) => !r.ok)?.message ?? ''}`)
  else toast(`Placed ${ok}/${results.length}`, { icon: '⚠️' })
  return { ok: ok === results.length, results }
}

/** Place a multi-leg strategy — each leg × each selected broker → place-order.
 *  MANDATORY SEQUENCE: all BUY orders are placed (and awaited) first, then all
 *  SELL orders. This frees margin from the long legs before the shorts go in. */
export async function submitStrategy(legs: StrategyLegOrder[]): Promise<PlaceOrderOutcome> {
  const brokers = selectedBrokers()
  if (!brokers.length) { toast.error('Select a broker first'); return { ok: false, results: [] } }
  if (!legs.length) { toast.error('Add at least one leg'); return { ok: false, results: [] } }
  await ensureLotSizes()

  const placeJob = async (b: BrokerAccount, l: StrategyLegOrder): Promise<BrokerOrderResult> => {
    const base = { brokerId: b.id, brokerName: b.brokerName, displayName: b.displayName, qty: l.qty }
    try {
      const raw = await placeOrderApi({
        txnType: l.side, quantity: l.qty, priceType: l.priceType,
        price: l.priceType === 'MKT' ? 0 : l.price, triggerPrice: 0,
        symbolName: l.symbolName, lot: Math.max(1, Math.round(l.qty / lotSizeFor(l.indexName))),
        brokerName: b.brokerName, indexName: l.indexName,
      })
      const v = interpretOrderResponse(raw)
      return { ...base, ok: v.ok, message: v.message, data: raw }
    } catch (e) {
      return { ...base, ok: false, message: errMessage(e) }
    }
  }

  const phase = (side: TxnType) => brokers.flatMap((b) => legs.filter((l) => l.side === side).map((l) => ({ b, l })))
  const buys = phase('BUY')
  const sells = phase('SELL')
  // Phase 1: buys first (awaited fully), then Phase 2: sells.
  const buyResults = buys.length ? await Promise.all(buys.map(({ b, l }) => placeJob(b, l))) : []
  const sellResults = sells.length ? await Promise.all(sells.map(({ b, l }) => placeJob(b, l))) : []
  const results = [...buyResults, ...sellResults]

  const ok = results.filter((r) => r.ok).length
  if (ok === results.length) toast.success(`Strategy placed · ${legs.length} legs × ${brokers.length} broker${brokers.length > 1 ? 's' : ''}`)
  else if (ok === 0) toast.error(`Strategy failed · ${results.find((r) => !r.ok)?.message ?? ''}`)
  else toast(`Placed ${ok}/${results.length} legs`, { icon: '⚠️' })
  return { ok: ok === results.length, results }
}

/**
 * Public entry point. Funnels through trading config and either submits
 * immediately (Quick Trade) or opens the Order Window for review.
 */
export function placeOrder(intent: OrderIntent): void {
  const brokers = selectedBrokers()
  if (!brokers.length) { toast.error('Select a broker first'); return }

  const { quickTrade } = useBrokerStore.getState()
  const err = validateIntent(intent)

  // Quick Trade can only auto-submit when the intent is already complete
  // (e.g. a market order). Anything needing a price falls back to the window.
  if (quickTrade && !err) {
    // Warm lot sizes first so default lots reflect the real index lot size.
    void ensureLotSizes().then(() =>
      submitOrder(intent, brokers.map((b) => ({ broker: b, lots: intent.lot ?? defaultLotsFor(b, intent.indexName) }))),
    )
  } else {
    useOrderStore.getState().openWindow(intent)
  }
}

/**
 * Fan out across brokers, calling the real Place Order API per leg.
 * Updates the order store for live UI status and returns a standardized outcome.
 */
export async function submitOrder(intent: OrderIntent, legs: BrokerLeg[]): Promise<PlaceOrderOutcome> {
  const err = validateIntent(intent)
  if (err) { toast.error(err); return { ok: false, results: [] } }
  const active = legs.filter((l) => l.lots > 0)
  if (!active.length) { toast.error('Set a quantity'); return { ok: false, results: [] } }

  await ensureLotSizes()
  const size = lotSizeFor(intent.indexName)

  const store = useOrderStore.getState()
  // Optimistic "sent" state for the Order Window (qty = lots × lot size).
  store.setResults(active.map<BrokerExecResult>((l) => ({
    brokerId: l.broker.id, displayName: l.broker.displayName, qty: l.lots * size, status: 'sent',
  })))

  const results = await Promise.all(active.map<Promise<BrokerOrderResult>>(async (l) => {
    const qty = l.lots * size
    const base = { brokerId: l.broker.id, brokerName: l.broker.brokerName, displayName: l.broker.displayName, qty }
    try {
      const raw = await placeOrderApi(buildPlaceOrderRequest(intent, l.broker.brokerName, l.lots))
      // HTTP 200 can still carry a broker rejection — judge by order status.
      const verdict = interpretOrderResponse(raw)
      return { ...base, ok: verdict.ok, message: verdict.message, data: raw }
    } catch (e) {
      return { ...base, ok: false, message: errMessage(e) }
    }
  }))

  store.setResults(results.map<BrokerExecResult>((r) => ({
    brokerId: r.brokerId, displayName: r.displayName, qty: r.qty,
    status: r.ok ? 'filled' : 'failed', message: r.message,
  })))

  const okCount = results.filter((r) => r.ok).length
  if (okCount === results.length) toast.success(`${intent.side} ${intent.display ?? intent.symbolName} placed · ${okCount} broker${okCount > 1 ? 's' : ''}`)
  else if (okCount === 0) toast.error(`Order failed · ${results[0]?.message ?? ''}`)
  else toast(`Placed on ${okCount}/${results.length} brokers`, { icon: '⚠️' })

  return { ok: okCount === results.length, results }
}
