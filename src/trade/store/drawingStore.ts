// ── Drawing persistence ──────────────────────────────────────────────────────
// User chart drawings, stored per symbol as time+price definitions (DrawingDef)
// so they persist across reloads and re-anchor correctly on any timeframe. Keyed
// by symbol (not timeframe) — like TradingView, a symbol's drawings show on every
// timeframe. localStorage now; swap to a backend later without touching callers.

import { create } from 'zustand'
import type { DrawingDef } from '../chart/ChartEngine'

// v2: earlier saves stored points without a resolved timestamp (bad anchor);
// bumping the key discards that stale data so drawings anchor correctly.
const LS_KEY = 'vtrader_drawings_v2'

function load(): Record<string, DrawingDef[]> {
  try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r) } catch { /* ignore */ }
  return {}
}

interface State {
  bySymbol: Record<string, DrawingDef[]>
  get: (symbol: string) => DrawingDef[]
  save: (symbol: string, list: DrawingDef[]) => void
}

export const useDrawingStore = create<State>((set, getState) => ({
  bySymbol: load(),
  get: (symbol) => getState().bySymbol[symbol] ?? [],
  save: (symbol, list) => {
    const next = { ...getState().bySymbol, [symbol]: list }
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    set({ bySymbol: next })
  },
}))
