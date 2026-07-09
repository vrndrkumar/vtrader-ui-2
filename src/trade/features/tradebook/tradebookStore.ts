// ── Tradebook store (Positions & Orders) ─────────────────────────────────────
// Holds live positions/orders + panel filter state, and exposes action methods.
// Mutations are local/optimistic today (mock); each is the exact hook where a
// broker API call will slot in later. Live MTM is simulated via a light ticker.

import { create } from 'zustand'
import toast from 'react-hot-toast'
import type { BrokerAccount } from '@/store/brokerStore'
import { fetchOrders, fetchPositions } from './tradebookData'
import type { Order, OrderStatus, Position, TxnSide } from './types'

export type Tab = 'positions' | 'orders'
export type OrderStatusFilter = 'ALL' | OrderStatus

interface TradebookState {
  positions: Position[]
  orders: Order[]
  loading: boolean
  loadedAt: number | null

  // Panel filters
  tab: Tab
  brokerFilter: string          // 'ALL' or a brokerName
  search: string
  orderStatus: OrderStatusFilter

  setTab: (t: Tab) => void
  setBrokerFilter: (b: string) => void
  setSearch: (s: string) => void
  setOrderStatus: (s: OrderStatusFilter) => void

  load: (brokers: BrokerAccount[]) => Promise<void>
  tick: () => void              // simulated LTP drift → live MTM

  // Position actions (swap points for APIs)
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

const round2 = (n: number) => Math.round(n * 100) / 100

export const useTradebookStore = create<TradebookState>((set, get) => ({
  positions: [],
  orders: [],
  loading: false,
  loadedAt: null,

  tab: 'positions',
  brokerFilter: 'ALL',
  search: '',
  orderStatus: 'ALL',

  setTab: (tab) => set({ tab }),
  setBrokerFilter: (brokerFilter) => set({ brokerFilter }),
  setSearch: (search) => set({ search }),
  setOrderStatus: (orderStatus) => set({ orderStatus }),

  load: async (brokers) => {
    set({ loading: true })
    try {
      const [positions, orders] = await Promise.all([fetchPositions(brokers), fetchOrders(brokers)])
      set({ positions, orders, loadedAt: Date.now() })
    } catch {
      toast.error('Failed to load positions/orders')
    } finally {
      set({ loading: false })
    }
  },

  tick: () => set((s) => ({
    positions: s.positions.map((p) => {
      if (p.status !== 'OPEN') return p
      const drift = (Math.random() - 0.5) * Math.max(0.5, p.ltp * 0.004)
      return { ...p, ltp: round2(Math.max(0.05, p.ltp + drift)) }
    }),
  })),

  exitPosition: (id) => {
    set((s) => ({ positions: s.positions.map((p) => p.id === id ? closeOut(p) : p) }))
    toast.success('Position exited')
  },
  squareOff: (id) => {
    set((s) => ({ positions: s.positions.map((p) => p.id === id ? closeOut(p) : p) }))
    toast.success('Squared off at market')
  },
  reversePosition: (id) => {
    set((s) => ({
      positions: s.positions.map((p) => {
        if (p.id !== id) return p
        return { ...p, buyQty: p.sellQty, sellQty: p.buyQty, buyAvg: p.sellAvg, sellAvg: p.buyAvg }
      }),
    }))
    toast.success('Position reversed')
  },
  addQty: (id, qty) => {
    if (qty <= 0) return
    set((s) => ({
      positions: s.positions.map((p) => {
        if (p.id !== id) return p
        const long = p.buyQty >= p.sellQty
        return long
          ? { ...p, buyQty: p.buyQty + qty, buyAvg: p.ltp, avgPrice: p.ltp }
          : { ...p, sellQty: p.sellQty + qty, sellAvg: p.ltp, avgPrice: p.ltp }
      }),
    }))
    toast.success(`Added ${qty} qty`)
  },
  partialExit: (id, qty) => {
    if (qty <= 0) return
    set((s) => ({
      positions: s.positions.map((p) => {
        if (p.id !== id) return p
        const long = p.buyQty >= p.sellQty
        const realized = round2(p.realized + (p.ltp - p.avgPrice) * (long ? qty : -qty))
        return long
          ? { ...p, buyQty: Math.max(0, p.buyQty - qty), realized }
          : { ...p, sellQty: Math.max(0, p.sellQty - qty), realized }
      }),
    }))
    toast.success(`Exited ${qty} qty`)
  },
  setStop: (id, stop) => {
    set((s) => ({ positions: s.positions.map((p) => p.id === id ? { ...p, stop } : p) }))
    toast.success(`Stop loss set at ${stop}`)
  },
  setTarget: (id, target) => {
    set((s) => ({ positions: s.positions.map((p) => p.id === id ? { ...p, target } : p) }))
    toast.success(`Target set at ${target}`)
  },

  cancelOrder: (id) => {
    set((s) => ({ orders: s.orders.map((o) => o.id === id ? { ...o, status: 'CANCELLED' } : o) }))
    toast.success('Order cancelled')
  },
  modifyOrder: (id, patch) => {
    set((s) => ({ orders: s.orders.map((o) => o.id === id ? { ...o, ...patch } : o) }))
    toast.success('Order modified')
  },
  cloneOrder: (id) => {
    const o = get().orders.find((x) => x.id === id)
    if (!o) return
    const clone: Order = { ...o, id: `ord-clone-${Date.now()}`, status: 'OPEN', filledQty: 0, time: new Date().toISOString(), message: undefined }
    set((s) => ({ orders: [clone, ...s.orders] }))
    toast.success('Order cloned')
  },
}))

function closeOut(p: Position): Position {
  const long = p.buyQty >= p.sellQty
  const q = Math.abs(p.buyQty - p.sellQty)
  const realized = round2(p.realized + (p.ltp - p.avgPrice) * (long ? q : -q))
  return { ...p, buyQty: 0, sellQty: 0, realized, status: 'CLOSED' }
}

/** Reverse the side of a mock order's txn (used by "reverse"). */
export const flipSide = (s: TxnSide): TxnSide => (s === 'BUY' ? 'SELL' : 'BUY')
