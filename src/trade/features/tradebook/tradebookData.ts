// ── Tradebook data source (SWAP POINT for real APIs) ─────────────────────────
// Today these return mock data derived from the selected brokers. When broker
// order/position endpoints land, replace the bodies of fetchPositions() and
// fetchOrders() with real calls (e.g. GET /trade/positions, /trade/orders) that
// map the responses into Position[] / Order[]. Nothing else in the UI changes.

import type { BrokerAccount } from '@/store/brokerStore'
import type { Order, Position, Product, TxnSide, PriceType, OrderStatus } from './types'

const OPTIONS: { display: string; symbol: string; index: string; base: number }[] = [
  { display: 'NIFTY 24500 CE',    symbol: 'NIFTY_24JUL26_CE_24500',    index: 'NIFTY',     base: 142 },
  { display: 'NIFTY 24300 PE',    symbol: 'NIFTY_24JUL26_PE_24300',    index: 'NIFTY',     base: 118 },
  { display: 'SENSEX 80500 CE',   symbol: 'SENSEX_22JUL26_CE_80500',   index: 'SENSEX',    base: 205 },
  { display: 'BANKNIFTY 52000 PE', symbol: 'BANKNIFTY_29JUL26_PE_52000', index: 'BANKNIFTY', base: 264 },
  { display: 'NIFTY 24700 CE',    symbol: 'NIFTY_31JUL26_CE_24700',    index: 'NIFTY',     base: 88 },
]

const rnd = (seed: number) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x) }
const round2 = (n: number) => Math.round(n * 100) / 100

/** Mock positions spread across the selected brokers. */
export async function fetchPositions(brokers: BrokerAccount[]): Promise<Position[]> {
  const out: Position[] = []
  brokers.forEach((b, bi) => {
    const count = 2 + (bi % 2) // 2–3 positions per broker
    for (let i = 0; i < count; i++) {
      const o = OPTIONS[(bi * 2 + i) % OPTIONS.length]
      const r = rnd(bi * 7 + i * 13 + 1)
      const long = r > 0.4
      const lot = o.index === 'SENSEX' ? 20 : o.index === 'BANKNIFTY' ? 35 : 75
      const lots = 1 + Math.floor(rnd(bi + i + 3) * 3)
      const q = lot * lots
      const avg = round2(o.base * (0.9 + rnd(bi + i + 5) * 0.2))
      const ltp = round2(avg * (0.85 + rnd(bi * 3 + i + 9) * 0.35))
      out.push({
        id: `pos-${b.id}-${i}`,
        brokerId: b.id, brokerName: b.brokerName, brokerLabel: b.displayName,
        symbol: o.symbol, display: o.display, indexName: o.index,
        product: (['MIS', 'NRML'] as Product[])[i % 2],
        buyQty: long ? q : 0, sellQty: long ? 0 : q,
        buyAvg: long ? avg : 0, sellAvg: long ? 0 : avg,
        avgPrice: avg, ltp, prevClose: round2(avg * 0.98), realized: 0, status: 'OPEN',
      })
    }
  })
  return out
}

/** Mock orders spread across the selected brokers, covering every status. */
export async function fetchOrders(brokers: BrokerAccount[]): Promise<Order[]> {
  const statuses: OrderStatus[] = ['OPEN', 'PENDING', 'COMPLETE', 'CANCELLED', 'REJECTED']
  const out: Order[] = []
  brokers.forEach((b, bi) => {
    statuses.forEach((status, si) => {
      const o = OPTIONS[(bi + si) % OPTIONS.length]
      const side: TxnSide = si % 2 === 0 ? 'BUY' : 'SELL'
      const lot = o.index === 'SENSEX' ? 20 : o.index === 'BANKNIFTY' ? 35 : 75
      const qty = lot * (1 + (si % 2))
      const priceType: PriceType = status === 'PENDING' ? 'SL-LMT' : si % 3 === 0 ? 'MKT' : 'LMT'
      const price = priceType === 'MKT' ? 0 : round2(o.base * (0.9 + rnd(bi + si) * 0.2))
      out.push({
        id: `ord-${b.id}-${si}`,
        brokerId: b.id, brokerName: b.brokerName, brokerLabel: b.displayName,
        symbol: o.symbol, display: o.display, indexName: o.index,
        side, product: 'MIS', priceType, qty,
        filledQty: status === 'COMPLETE' ? qty : status === 'OPEN' ? Math.floor(qty / 2) : 0,
        price, triggerPrice: priceType === 'SL-LMT' ? round2(price - 1) : 0,
        status,
        time: new Date(Date.now() - si * 6e5 - bi * 9e5).toISOString(),
        message: status === 'REJECTED' ? 'Margin shortfall' : undefined,
      })
    })
  })
  return out
}
