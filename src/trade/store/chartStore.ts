// ── Index context (drives the option chain + watchlist) ──────────────────────
// The multi-chart panels have their own symbols in chartLayoutStore; this store
// only tracks the active INDEX for the option-chain / watchlist context.

import { create } from 'zustand'

interface ChartState {
  symbolCode: string
  setSymbol: (code: string) => void
}

export const useChartStore = create<ChartState>((set) => ({
  symbolCode: 'NIFTY',
  setSymbol: (symbolCode) => set({ symbolCode }),
}))
