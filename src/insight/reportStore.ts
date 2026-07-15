import { create } from 'zustand'
import { fetchStockInsight } from './api'
import type { StockInsightResponse } from './types'

interface ReportState {
  symbol: string | null
  data: StockInsightResponse | null
  loading: boolean
  refreshing: boolean
  error: string | null
  load: (symbol: string) => Promise<void>
  refresh: () => Promise<void>
}

const errMsg = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
  (e as Error)?.message ?? 'Failed to load analysis'

export const useReportStore = create<ReportState>((set, get) => ({
  symbol: null,
  data: null,
  loading: false,
  refreshing: false,
  error: null,

  load: async (symbol) => {
    set({ symbol, loading: true, error: null, data: null })
    try {
      set({ data: await fetchStockInsight(symbol), loading: false })
    } catch (e) {
      set({ error: errMsg(e), loading: false })
    }
  },

  refresh: async () => {
    const symbol = get().symbol
    if (!symbol) return
    set({ refreshing: true, error: null })
    try {
      set({ data: await fetchStockInsight(symbol, true), refreshing: false })
    } catch (e) {
      set({ error: errMsg(e), refreshing: false })
    }
  },
}))
