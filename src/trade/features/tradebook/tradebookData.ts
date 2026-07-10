// ── Tradebook data source (live APIs only) ───────────────────────────────────
// Positions come from GET /trade/positions, orders from GET /trade/order-book.
// LTP / unrealized P&L are NOT taken from these snapshots — they are computed
// live in the UI from the realtime tick feed (TICK_* per-symbol channel).

import { getOrderBook, getPositions } from '@/api/trade'
import type { BrokerAccount } from '@/store/brokerStore'
import type { Order, Position, Product, PriceType, OrderStatus } from './types'

const num = (r: Record<string, unknown>, keys: string[], d = 0): number => {
  for (const k of keys) { const v = r[k]; if (v != null && v !== '') { const n = Number(v); if (!Number.isNaN(n)) return n } }
  return d
}
const str = (r: Record<string, unknown>, keys: string[], d = ''): string => {
  for (const k of keys) { const v = r[k]; if (v != null && v !== '') return String(v) }
  return d
}

/** "NIFTY_24JUL26_CE_24500" → "NIFTY 24500 CE"; falls back to the raw symbol. */
function prettySymbol(sym: string): { display: string; index: string } {
  const m = /^([A-Z]+)[_-].*?[_-](CE|PE|FUT)[_-]?(\d+)?$/i.exec(sym)
  if (m) {
    const [, idx, kind, strike] = m
    const k = kind.toUpperCase()
    return { index: idx.toUpperCase(), display: k === 'FUT' ? `${idx} FUT` : `${idx} ${strike ?? ''} ${k}`.trim() }
  }
  return { display: sym || '—', index: (sym.split(/[_-]/)[0] || '').toUpperCase() }
}

// ── Positions ────────────────────────────────────────────────────────────────

function mapPosition(r: Record<string, unknown>, b: BrokerAccount, i: number): Position {
  const symbol = str(r, ['symbolName', 'symbol', 'tradingSymbol', 'tradingsymbol', 'symbol_name', 'instrument'])
  const parsed = prettySymbol(symbol)
  const buyQty = num(r, ['buyQty', 'buyQuantity', 'buy_quantity', 'totalBuyQty'])
  const sellQty = num(r, ['sellQty', 'sellQuantity', 'sell_quantity', 'totalSellQty'])
  const netQ = num(r, ['netQty', 'netQuantity', 'net_quantity', 'quantity', 'netqty'], buyQty - sellQty)
  const buyAvg = num(r, ['buyAvg', 'buyAvgPrice', 'buy_price', 'avgBuyPrice'])
  const sellAvg = num(r, ['sellAvg', 'sellAvgPrice', 'sell_price', 'avgSellPrice'])
  const avgPrice = num(r, ['avgPrice', 'averagePrice', 'average_price', 'netAvgPrice', 'net_average_price'],
    netQ >= 0 ? buyAvg : sellAvg)
  const ltp = num(r, ['ltp', 'lastPrice', 'last_price', 'lastTradedPrice', 'ltpPrice'], avgPrice) // seed only; live LTP overrides
  return {
    id: str(r, ['id', 'positionId'], `${b.id}-${symbol}-${i}`),
    brokerId: b.id, brokerName: b.brokerName, brokerLabel: b.displayName,
    symbol, display: str(r, ['displayName', 'display'], parsed.display),
    indexName: str(r, ['indexName', 'index', 'name'], parsed.index),
    product: (str(r, ['product', 'productType'], 'MIS').toUpperCase() as Product) || 'MIS',
    buyQty: buyQty || (netQ > 0 ? netQ : 0),
    sellQty: sellQty || (netQ < 0 ? -netQ : 0),
    buyAvg: buyAvg || (netQ > 0 ? avgPrice : 0),
    sellAvg: sellAvg || (netQ < 0 ? avgPrice : 0),
    avgPrice,
    ltp,
    prevClose: num(r, ['prevClose', 'close', 'closePrice', 'close_price'], avgPrice),
    realized: num(r, ['realized', 'realised', 'realizedPnl', 'realisedPnl', 'realized_pnl', 'bookedPnl']),
    status: netQ === 0 ? 'CLOSED' : 'OPEN',
  }
}

/** Live positions across the selected brokers. */
export async function fetchPositions(brokers: BrokerAccount[]): Promise<Position[]> {
  const perBroker = await Promise.all(brokers.map(async (b) => {
    try {
      const rows = await getPositions(b.brokerName)
      return rows.map((r, i) => mapPosition(r, b, i))
    } catch { return [] as Position[] } // one broker failing shouldn't blank the rest
  }))
  return perBroker.flat()
}

// ── Orders ────────────────────────────────────────────────────────────────────

function mapOrderStatus(raw: string): OrderStatus {
  const s = raw.toLowerCase()
  if (/reject/.test(s)) return 'REJECTED'
  if (/cancel/.test(s)) return 'CANCELLED'
  if (/complete|filled|traded|executed|success/.test(s)) return 'COMPLETE'
  if (/trigger.?pending|pending/.test(s)) return 'PENDING'
  return 'OPEN' // open / working / modified / etc.
}

function mapPriceType(raw: string): PriceType {
  const s = raw.toUpperCase()
  if (s.includes('SL') && s.includes('M') && !s.includes('LMT')) return 'MKT' // SL-M → market leg
  if (s.includes('SL')) return 'SL-LMT'
  if (s === 'MKT' || s === 'MARKET') return 'MKT'
  return 'LMT'
}

function mapOrder(r: Record<string, unknown>, b: BrokerAccount, i: number): Order {
  const symbol = str(r, ['symbolName', 'symbol', 'tradingSymbol', 'tradingsymbol', 'symbol_name', 'instrument'])
  const parsed = prettySymbol(symbol)
  const side = str(r, ['txnType', 'transactionType', 'side', 'buyOrSell', 'trantype'], 'BUY').toUpperCase()
  const orderId = str(r, ['orderId', 'order_id', 'orderNumber', 'norenordno', 'nOrdNo', 'id'], `${b.id}-${i}`)
  return {
    id: `${b.id}-${orderId}`,
    orderId,
    brokerId: b.id, brokerName: b.brokerName, brokerLabel: b.displayName,
    symbol, display: str(r, ['displayName', 'display'], parsed.display),
    indexName: str(r, ['indexName', 'index', 'name'], parsed.index),
    side: side.startsWith('S') ? 'SELL' : 'BUY',
    product: (str(r, ['product', 'productType'], 'MIS').toUpperCase() as Product) || 'MIS',
    priceType: mapPriceType(str(r, ['priceType', 'orderType', 'order_type', 'prctyp'], 'LMT')),
    qty: num(r, ['quantity', 'qty', 'orderQty', 'totalQty']),
    filledQty: num(r, ['filledQty', 'filledQuantity', 'filled_quantity', 'tradedQty', 'fillshares']),
    price: num(r, ['price', 'orderPrice', 'limitPrice', 'prc']),
    triggerPrice: num(r, ['triggerPrice', 'trigger_price', 'trgprc', 'stopPrice']),
    status: mapOrderStatus(str(r, ['orderStatus', 'status', 'orderstatus'], 'OPEN')),
    time: str(r, ['time', 'orderTime', 'orderTimestamp', 'order_timestamp', 'exchTime', 'updatedAt', 'createdAt'], new Date().toISOString()),
    message: str(r, ['message', 'rejectionReason', 'rejReason', 'rejreason', 'remarks']) || undefined,
  }
}

/** Live order book across the selected brokers. */
export async function fetchOrders(brokers: BrokerAccount[]): Promise<Order[]> {
  const perBroker = await Promise.all(brokers.map(async (b) => {
    try {
      const rows = await getOrderBook(b.brokerName)
      return rows.map((r, i) => mapOrder(r, b, i))
    } catch { return [] as Order[] }
  }))
  return perBroker.flat()
}
