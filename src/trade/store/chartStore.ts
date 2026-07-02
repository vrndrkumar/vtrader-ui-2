// ── Chart view state (active symbol + timeframe) ─────────────────────────────

import { create } from 'zustand'
import type { Timeframe } from '../types/market'

interface ChartState {
  symbolCode: string
  timeframe: Timeframe
  setSymbol: (code: string) => void
  setTimeframe: (tf: Timeframe) => void
}

export const useChartStore = create<ChartState>((set) => ({
  symbolCode: 'NIFTY',
  timeframe: '15',
  setSymbol: (symbolCode) => set({ symbolCode }),
  setTimeframe: (timeframe) => set({ timeframe }),
}))
