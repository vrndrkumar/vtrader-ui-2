// ── Tradebook domain model (Positions & Orders) ──────────────────────────────
// Shared types for the bottom Positions/Orders panel. Kept API-agnostic so the
// mock adapter can be swapped for real endpoints without touching the UI.

export type Product = 'MIS' | 'NRML' | 'CNC'
export type TxnSide = 'BUY' | 'SELL'
export type PriceType = 'MKT' | 'LMT' | 'SL-LMT'

export type PositionStatus = 'OPEN' | 'CLOSED'

export interface Position {
  id: string
  brokerId: number
  brokerName: string          // "FINVASIA"
  brokerLabel: string         // "FINVASIA[FA30962]"
  symbol: string              // API symbol, e.g. NIFTY_24JUL26_CE_24500
  display: string             // "NIFTY 24500 CE"
  indexName: string           // "NIFTY"
  product: Product
  buyQty: number
  sellQty: number
  buyAvg: number
  sellAvg: number
  avgPrice: number            // net entry price (netAvgPrice) — Net P&L baseline
  ltp: number
  prevClose: number
  realized: number
  // Day P&L inputs (from the positions API) + today's open for carried qty.
  dayBuyQty: number
  daySellQty: number
  dayBuyAvg: number
  daySellAvg: number
  carryQty: number            // net qty carried from a previous day = netQty − dayBuyQty + daySellQty
  dayBase: number             // previous session CLOSE (upldprc / previousClose) — Day P&L baseline for carried qty
  hasPrevClose: boolean       // true only when the feed actually supplied a previous close
  valueFactor: number         // priceFactor × multiplier (₹ per point); 1 for equity/NFO
  status: PositionStatus
  stop?: number               // set/modify stop loss
  target?: number             // set/modify target
}

/** Net quantity — positive = long, negative = short. */
export const netQty = (p: Position) => p.buyQty - p.sellQty
/** Unrealized (open) P&L at current LTP, from the NET average (netAvgPrice). */
export const unrealized = (p: Position) => (p.ltp - p.avgPrice) * netQty(p) * p.valueFactor

/**
 * Net / overall P&L (lifetime) = booked realized + open unrealized.
 * Matches the broker's realized (rpnl) + unrealized (urmtom) and the chart mirror.
 * Exact from fields the positions API always returns — never needs a previous close.
 */
export const totalPnl = (p: Position) => p.realized + unrealized(p)

/**
 * Day P&L = mark-to-market since the PREVIOUS SESSION CLOSE — the exact broker
 * "day MTM". Works for every position type (intraday, carry-forward, and
 * carry + today partial book) because it reconstructs the day from first
 * principles rather than from `realized`:
 *
 *   day = (daySellQty·daySellAvg − dayBuyQty·dayBuyAvg)   // today's cash flow
 *       + netQty·ltp                                       // current value of net qty
 *       − carryQty·prevClose                               // carried qty at prior close
 *   × valueFactor (₹ per point)
 *
 * For a purely intraday position (carryQty = 0) this reduces to realized +
 * unrealized. It requires a genuine previous close (`hasPrevClose`); if the feed
 * omits one we fall back to the overall P&L instead of a bogus baseline.
 */
export const dayPnl = (p: Position) => {
  if (p.hasPrevClose) {
    return (p.daySellQty * p.daySellAvg - p.dayBuyQty * p.dayBuyAvg + netQty(p) * p.ltp - p.carryQty * p.dayBase) * p.valueFactor
  }
  return p.realized + unrealized(p)
}

export type OrderStatus = 'PENDING' | 'OPEN' | 'COMPLETE' | 'CANCELLED' | 'REJECTED'

export interface Order {
  id: string
  orderId: string             // broker order id (used to modify/cancel)
  brokerId: number
  brokerName: string
  brokerLabel: string
  symbol: string
  display: string
  indexName: string
  side: TxnSide
  product: Product
  priceType: PriceType
  qty: number
  filledQty: number
  price: number
  triggerPrice: number
  status: OrderStatus
  time: string                // ISO-ish timestamp
  message?: string            // rejection reason, etc.
}

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; cls: string; dot: string }> = {
  PENDING:   { label: 'Pending',   cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20',   dot: 'bg-amber-500' },
  OPEN:      { label: 'Open',      cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20',       dot: 'bg-blue-500' },
  COMPLETE:  { label: 'Completed', cls: 'bg-green-50 text-green-600 dark:bg-green-900/20',    dot: 'bg-green-500' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 dark:bg-white/10',       dot: 'bg-slate-400' },
  REJECTED:  { label: 'Rejected',  cls: 'bg-red-50 text-red-600 dark:bg-red-900/20',          dot: 'bg-red-500' },
}

/** Order statuses that are still live (modifiable / cancellable). */
export const isLiveStatus = (s: OrderStatus) => s === 'PENDING' || s === 'OPEN'
