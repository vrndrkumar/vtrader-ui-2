// ── Stocks master store (loaded once, cached for the session) ────────────────
// The full active-stock list from stock_mstr powers the sector-grouped watchlist
// and its instant keypress search. ~2.7k rows → tiny; loaded on first use.

import { create } from 'zustand'
import { getStocks, type Stock } from '@/api/stocks'

interface StocksState {
  list: Stock[]
  loaded: boolean
  loading: boolean
  load: () => Promise<void>
}

export const useStocksStore = create<StocksState>((set, get) => ({
  list: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loaded || get().loading) return
    set({ loading: true })
    try {
      const list = await getStocks()
      set({ list, loaded: true })
    } catch {
      /* leave empty; retried on next mount */
    } finally {
      set({ loading: false })
    }
  },
}))
