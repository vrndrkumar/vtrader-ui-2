// ── Watchlist store (user-added symbols / option strikes) ────────────────────

import { create } from 'zustand'

export interface WatchItem {
  id: string
  symbol: string    // e.g. SENSEX_02JUL26_CE_77000 (matches Redis naming)
  display: string   // e.g. SENSEX 77000 CE
  ltp: number
}

interface WatchState {
  items: WatchItem[]
  add: (item: WatchItem) => void
  remove: (id: string) => void
  has: (id: string) => boolean
}

export const useWatchlistStore = create<WatchState>((set, get) => ({
  items: [],
  add: (item) => set((s) => (s.items.some((i) => i.id === item.id) ? s : { items: [...s.items, item] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  has: (id) => get().items.some((i) => i.id === id),
}))
