// ── Basket order store ───────────────────────────────────────────────────────
// When basket mode is ON, tapping Buy/Sell on an option-chain strike adds the
// order to a basket instead of placing it (regardless of Quick Trade). The user
// then reviews/edits the basket and executes all SELECTED orders in one go
// (BUY legs first, then SELL — handled by the executor via submitStrategy).

import { create } from 'zustand'

export interface BasketOrder {
  id: string
  symbolName: string         // canonical key, e.g. NIFTY_15SEP26_CE_23450
  indexName: string          // NIFTY
  display: string            // "NIFTY 23450 CE"
  strike: number
  optType: 'CE' | 'PE'
  expiry: string             // raw expiry token, e.g. 15SEP26
  side: 'BUY' | 'SELL'
  lots: number
  priceType: 'MKT' | 'LMT'
  price: number              // limit price (used when priceType = LMT)
  ltp: number                // reference last price at add time (for premium calc)
  selected: boolean
}

let seq = 0
const newId = () => `bk_${Date.now().toString(36)}_${(seq++).toString(36)}`

interface BasketState {
  mode: boolean              // basket mode on/off
  open: boolean              // panel expanded
  orders: BasketOrder[]
  setMode: (v: boolean) => void
  toggleMode: () => void
  setOpen: (v: boolean) => void
  add: (o: Omit<BasketOrder, 'id' | 'selected'>) => void
  remove: (id: string) => void
  update: (id: string, patch: Partial<BasketOrder>) => void
  toggleSelect: (id: string) => void
  selectAll: (v: boolean) => void
  clear: () => void
}

export const useBasketStore = create<BasketState>((set) => ({
  mode: false,
  open: false,
  orders: [],
  setMode: (mode) => set({ mode }),
  toggleMode: () => set((s) => ({ mode: !s.mode })),
  setOpen: (open) => set({ open }),
  add: (o) => set((s) => ({ orders: [...s.orders, { ...o, id: newId(), selected: true }], open: true })),
  remove: (id) => set((s) => ({ orders: s.orders.filter((x) => x.id !== id) })),
  update: (id, patch) => set((s) => ({ orders: s.orders.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  toggleSelect: (id) => set((s) => ({ orders: s.orders.map((x) => (x.id === id ? { ...x, selected: !x.selected } : x)) })),
  selectAll: (v) => set((s) => ({ orders: s.orders.map((x) => ({ ...x, selected: v })) })),
  clear: () => set({ orders: [] }),
}))
