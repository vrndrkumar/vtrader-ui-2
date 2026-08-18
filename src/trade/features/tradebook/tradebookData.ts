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
  // Today's traded quantities / averages (for Day P&L).
  const dayBuyQty = num(r, ['dayBuyQuantity', 'day_buy_quantity', 'dayBuyQty'])
  const daySellQty = num(r, ['daySellQuantity', 'day_sell_quantity', 'daySellQty'])
  const dayBuyAvg = num(r, ['dayBuyAvgPrice', 'day_buy_avg_price', 'dayBuyAvg'])
  const daySellAvg = num(r, ['daySellAvgPrice', 'day_sell_avg_price', 'daySellAvg'])
  const carryQty = netQ - dayBuyQty + daySellQty // qty carried from a previous day
  // netAvgPrice carries the previous-close / carry price (e.g. 43.70) — it is BOTH
  // the Net P&L baseline AND the Day P&L baseline for carried qty. Fall back to
  // today's traded avg only when it's 0 (closed intraday round-trip) so the row
  // still shows a price instead of 0.
  const netAvg = num(r, ['netAvgPrice', 'net_average_price', 'netavgprc'])
  // Entry average (Net P&L baseline is prevClose; the DAY-P&L baseline is the true
  // entry). The response doesn't expose the true entry directly, but for an OPEN
  // position it's carried in the traded-side day avg: dayBuyAvgPrice for a long,
  // daySellAvgPrice for a short. Use that; fall back to netAvg for closed rows.
  const sideEntry = netQ > 0 ? dayBuyAvg : netQ < 0 ? daySellAvg : 0
  const avgPrice = (netQ !== 0 && sideEntry > 0)
    ? sideEntry
    : (netAvg || num(r, ['avgPrice', 'averagePrice', 'average_price'], (netQ >= 0 ? buyAvg : sellAvg) || dayBuyAvg || daySellAvg))
  // Net P&L baseline = previous close (broker upldprc; falls back to netAvgPrice).
  const dayBase = num(r, ['prevClose', 'uploadPrice', 'upldprc', 'uploadPrc', 'previousClose'], netAvg)
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
    dayBuyQty, daySellQty, dayBuyAvg, daySellAvg, carryQty,
    dayBase, // = netAvgPrice (carry / previous-close baseline)
    ltp,
    prevClose: num(r, ['prevClose', 'close', 'closePrice', 'close_price'], avgPrice),
    // API sends realized under `realiasedPNL` (broker spelling). Unrealized is NOT
    // taken from the snapshot (`unrealiasedMTM`) — the UI computes it from the tick.
    realized: num(r, [
      'realiasedPNL', 'realisedPNL', 'realizedPNL', 'realiasedPnl',
      'realized', 'realised', 'realizedPnl', 'realisedPnl', 'realized_pnl', 'realised_pnl',
      'realizedProfit', 'realized_profit', 'realisedProfit', 'realised_profit',
      'realizedPL', 'realisedPL', 'realizedProfitLoss', 'rpnl', 'bookedPnl', 'bookedProfit',
    ]),
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
  if (/trigger.?pending|pending|transit/.test(s)) return 'PENDING' // IN_TRANSIT → awaiting
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
      // Drop junk/placeholder rows (empty symbol or a blank "##" order id).
      return rows.map((r, i) => mapOrder(r, b, i)).filter((o) => o.symbol && !/^#*$/.test(o.orderId))
    } catch { return [] as Order[] }
  }))
  return perBroker.flat()
}
