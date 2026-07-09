// ── Canonical order types (shared by every module that places orders) ────────

export type TxnType = 'BUY' | 'SELL'

/** Price types accepted by the Place Order API. */
export type PriceType = 'MKT' | 'LMT' | 'SL-LMT'

/**
 * Minimum information a caller must provide. The global order service derives
 * everything else (price/triggerPrice, per-broker qty, broker fan-out, payload).
 *
 * `price` carries a single user input, interpreted by priceType:
 *   • MKT     → ignored
 *   • LMT     → the limit price
 *   • SL-LMT  → the TRIGGER price (limit price is derived internally)
 */
export interface OrderIntent {
  symbolName: string            // API symbol, e.g. "SENSEX_09JUL26_CE_78500"
  indexName: string             // underlying/index, e.g. "SENSEX" (also drives qty class)
  side: TxnType
  display?: string              // human label for the UI, e.g. "SENSEX 78500 CE"
  ltp?: number
  priceType?: PriceType         // default 'MKT'
  price?: number                // limit price (LMT) or trigger price (SL-LMT)
  lot?: number                  // preset number of LOTS (quantity = lots × lot size)
  slTickBuffer?: number         // override the default SL-LMT tick buffer
  product?: 'Normal' | 'MIS'    // UI-only for now (not part of the API payload)
}

/** Exact request body for POST /trade/place-order. */
export interface PlaceOrderRequest {
  txnType: TxnType
  quantity: number
  priceType: PriceType
  price: number
  triggerPrice: number          // 0 unless SL-LMT
  symbolName: string
  lot: number
  brokerName: string
  indexName: string
}

/** Standardized per-broker outcome returned by the service. */
export interface BrokerOrderResult {
  brokerId: number
  brokerName: string
  displayName: string
  qty: number
  ok: boolean
  message?: string
  data?: unknown
}

/** Standardized aggregate outcome. */
export interface PlaceOrderOutcome {
  ok: boolean                   // true only if every leg succeeded
  results: BrokerOrderResult[]
}
