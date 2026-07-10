// ── Tradebook store (Positions & Orders) ─────────────────────────────────────
// Holds positions/orders + panel filter state, and exposes action methods wired
// to the real trading APIs:
//   • Position actions (exit, square-off, partial, add, reverse, SL, target) are
//     all order placements → POST /trade/place-order.
//   • Order modify → PUT /trade/update-order.  Clone → place-order.
// After a successful action the book is re-fetched from the server so the UI
// reflects true broker state.

import { create } from 'zustand'
import toast from 'react-hot-toast'
import { AxiosError } from 'axios'
import type { BrokerAccount } from '@/store/brokerStore'
import { placeOrderApi, updateOrderApi } from '@/api/trade'
import { lotSizeFor } from '@/services/orders/lotSize'
import { derivePrices } from '@/services/orders/buildPayload'
import { interpretOrderResponse } from '@/services/orders/parseResponse'
import type { PlaceOrderRequest } from '@/services/orders/types'
import { fetchOrders, fetchPositions } from './tradebookData'
import { netQty, type Order, type OrderStatus, type Position, type TxnSide } from './types'

export type Tab = 'positions' | 'orders'
export type OrderStatusFilter = 'ALL' | OrderStatus

interface TradebookState {
  positions: Position[]
  orders: Order[]
  loading: boolean
  loadedAt: number | null
  brokers: BrokerAccount[]

  tab: Tab
  brokerFilter: string
  search: string
  orderStatus: OrderStatusFilter

  setTab: (t: Tab) => void
  setBrokerFilter: (b: string) => void
  setSearch: (s: string) => void
  setOrderStatus: (s: OrderStatusFilter) => void

  load: (brokers: BrokerAccount[]) => Promise<void>
  reload: () => Promise<void>

  // Position actions → place-order
  exitPosition: (id: string) => void
  squareOff: (id: string) => void
  reversePosition: (id: string) => void
  addQty: (id: string, qty: number) => void
  partialExit: (id: string, qty: number) => void
  setStop: (id: string, price: number) => void
  setTarget: (id: string, price: number) => void

  // Order actions
  cancelOrder: (id: string) => void
  modifyOrder: (id: string, patch: Partial<Pick<Order, 'price' | 'qty' | 'triggerPrice'>>) => void
  cloneOrder: (id: string) => void
}

function errMsg(e: unknown): string {
  if (e instanceof AxiosError) {
    const d = e.response?.data as { message?: string; error?: string } | undefined
    return d?.message || d?.error || e.message || 'Request failed'
  }
  return e instanceof Error ? e.message : 'Request failed'
}

const lotsFor = (index: string, qty: number) => Math.max(1, Math.round(qty / lotSizeFor(index)))
/** Side that closes/reduces a position (opposite of its net direction). */
const closingSide = (p: Position): TxnSide => (netQty(p) >= 0 ? 'SELL' : 'BUY')
const openingSide = (p: Position): TxnSide => (netQty(p) >= 0 ? 'BUY' : 'SELL')

export const useTradebookStore = create<TradebookState>((set, get) => {
  /** Post an order, judge the real broker verdict, then refresh the book. */
  const submit = async (req: PlaceOrderRequest, okMsg: string) => {
    try {
      const verdict = interpretOrderResponse(await placeOrderApi(req))
      if (verdict.ok) { toast.success(okMsg); await get().reload() }
      else toast.error(verdict.message ?? 'Order rejected')
    } catch (e) { toast.error(errMsg(e)) }
  }

  const posReq = (p: Position, side: TxnSide, priceType: PlaceOrderRequest['priceType'], quantity: number, price = 0, triggerPrice = 0): PlaceOrderRequest => ({
    txnType: side, quantity, priceType, price, triggerPrice,
    symbolName: p.symbol, lot: lotsFor(p.indexName, quantity), brokerName: p.brokerName, indexName: p.indexName,
  })
  const pos = (id: string) => get().positions.find((p) => p.id === id)

  return {
    positions: [],
    orders: [],
    loading: false,
    loadedAt: null,
    brokers: [],

    tab: 'positions',
    brokerFilter: 'ALL',
    search: '',
    orderStatus: 'ALL',

    setTab: (tab) => set({ tab }),
    setBrokerFilter: (brokerFilter) => set({ brokerFilter }),
    setSearch: (search) => set({ search }),
    setOrderStatus: (orderStatus) => set({ orderStatus }),

    load: async (brokers) => {
      set({ loading: true, brokers })
      try {
        const [positions, orders] = await Promise.all([fetchPositions(brokers), fetchOrders(brokers)])
        set({ positions, orders, loadedAt: Date.now() })
      } catch {
        toast.error('Failed to load positions/orders')
      } finally {
        set({ loading: false })
      }
    },
    reload: () => get().load(get().brokers),

    exitPosition: (id) => { const p = pos(id); if (!p) return; const q = Math.abs(netQty(p)); if (q) void submit(posReq(p, closingSide(p), 'MKT', q), 'Exit order placed') },
    squareOff: (id) => { const p = pos(id); if (!p) return; const q = Math.abs(netQty(p)); if (q) void submit(posReq(p, closingSide(p), 'MKT', q), 'Square-off order placed') },
    reversePosition: (id) => { const p = pos(id); if (!p) return; const q = Math.abs(netQty(p)); if (q) void submit(posReq(p, closingSide(p), 'MKT', q * 2), 'Reverse order placed') },
    addQty: (id, qty) => { const p = pos(id); if (!p || qty <= 0) return; void submit(posReq(p, openingSide(p), 'MKT', qty), `Add ${qty} qty order placed`) },
    partialExit: (id, qty) => { const p = pos(id); if (!p || qty <= 0) return; void submit(posReq(p, closingSide(p), 'MKT', qty), `Exit ${qty} qty order placed`) },
    setStop: (id, price) => {
      const p = pos(id); if (!p || price <= 0) return
      const side = closingSide(p)
      const d = derivePrices(side, 'SL-LMT', price)
      void submit(posReq(p, side, 'SL-LMT', Math.abs(netQty(p)), d.price, d.triggerPrice), `Stop-loss order placed @ ${price}`)
    },
    setTarget: (id, price) => {
      const p = pos(id); if (!p || price <= 0) return
      void submit(posReq(p, closingSide(p), 'LMT', Math.abs(netQty(p)), price, 0), `Target order placed @ ${price}`)
    },

    modifyOrder: (id, patch) => {
      const o = get().orders.find((x) => x.id === id); if (!o) return
      const quantity = patch.qty ?? o.qty
      const price = patch.price ?? o.price
      const triggerPrice = patch.triggerPrice ?? o.triggerPrice
      updateOrderApi({
        txnType: o.side, quantity, priceType: o.priceType, price, triggerPrice,
        symbolName: o.symbol, lot: lotsFor(o.indexName, quantity), brokerName: o.brokerName, orderId: o.orderId, indexName: o.indexName,
      }).then(() => { toast.success('Order modified'); void get().reload() })
        .catch((e) => toast.error(errMsg(e)))
    },
    cloneOrder: (id) => {
      const o = get().orders.find((x) => x.id === id); if (!o) return
      void submit({
        txnType: o.side, quantity: o.qty, priceType: o.priceType, price: o.price, triggerPrice: o.triggerPrice,
        symbolName: o.symbol, lot: lotsFor(o.indexName, o.qty), brokerName: o.brokerName, indexName: o.indexName,
      }, 'Order cloned')
    },
    // No dedicated cancel endpoint provided yet — optimistic local update.
    cancelOrder: (id) => {
      set((s) => ({ orders: s.orders.map((o) => o.id === id ? { ...o, status: 'CANCELLED' } : o) }))
      toast('Cancel requested', { icon: '⏳' })
    },
  }
})
