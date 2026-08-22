// ── Index context (drives the option chain + watchlist) ──────────────────────
// The multi-chart panels have their own symbols in chartLayoutStore; this store
// only tracks the active INDEX for the option-chain / watchlist context.
//
// PERSISTED: the selected index is saved to localStorage and restored on load.
// Without this it reset to 'NIFTY' every refresh — so after a reload the index
// panel could show SENSEX while `symbolCode` still said NIFTY, and the
// "Sync options with index" feature never pulled the SENSEX ATM strikes because
// it watches this value. Persisting keeps symbolCode in step with the restored
// index panel, so the option panels sync correctly on page load.

import { create } from 'zustand'

interface ChartState {
  symbolCode: string
  setSymbol: (code: string) => void
}

const LS_KEY = 'vtrader_index_symbol'

function loadSymbol(): string {
  try { return localStorage.getItem(LS_KEY) || 'NIFTY' } catch { return 'NIFTY' }
}

export const useChartStore = create<ChartState>((set) => ({
  symbolCode: loadSymbol(),
  setSymbol: (symbolCode) => {
    try { localStorage.setItem(LS_KEY, symbolCode) } catch { /* ignore */ }
    set({ symbolCode })
  },
}))
