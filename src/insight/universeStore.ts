import { create } from 'zustand'
import {
  fetchDashboard, fetchFacets, fetchFailures, fetchJobStatus, fetchUniverse,
  startAnalyzeAll, startAnalyzeSelected, startRetryFailed, stopJob,
} from './api'
import type { DashboardData, Facets, FailureReport, JobStatus, UniverseFilters, UniverseRow } from './types'

const DEFAULT_FILTERS: UniverseFilters = {
  q: '', sector: '', industry: '', badge: '', riskLevel: '', minDiscovery: '',
  analyzed: false, sort: 'discovery',
}

interface UniverseState {
  rows: UniverseRow[]
  total: number
  page: number
  pageSize: number
  filters: UniverseFilters
  facets: Facets | null
  dashboard: DashboardData | null
  dashboardError: string | null
  failures: FailureReport | null
  showFailures: boolean
  selection: string[]
  loading: boolean
  error: string | null
  job: JobStatus | null
  polling: boolean

  load: (page?: number) => Promise<void>
  setFilter: <K extends keyof UniverseFilters>(key: K, value: UniverseFilters[K]) => void
  resetFilters: () => void
  loadFacets: () => Promise<void>
  loadDashboard: () => Promise<void>
  loadFailures: () => Promise<void>
  toggleFailures: () => void
  toggleSelect: (symbol: string) => void
  clearSelection: () => void
  analyzeSelected: () => Promise<void>
  analyzeAll: () => Promise<void>
  retryFailed: () => Promise<void>
  stopBatch: () => Promise<void>
  pollJob: () => Promise<void>
}

const errMsg = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
  (e as Error)?.message ?? 'Request failed'

export const useUniverseStore = create<UniverseState>((set, get) => ({
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  filters: { ...DEFAULT_FILTERS },
  facets: null,
  dashboard: null,
  dashboardError: null,
  failures: null,
  showFailures: false,
  selection: [],
  loading: false,
  error: null,
  job: null,
  polling: false,

  load: async (page) => {
    const { filters, pageSize } = get()
    const p = page ?? get().page
    set({ loading: true, error: null })
    try {
      const res = await fetchUniverse(filters, p, pageSize)
      set({ rows: res.rows, total: res.total, page: res.page, pageSize: res.pageSize, loading: false })
    } catch (e) {
      set({ error: errMsg(e), loading: false })
    }
  },

  setFilter: (key, value) => {
    set((s) => ({ filters: { ...s.filters, [key]: value }, page: 1 }))
    void get().load(1)
  },

  resetFilters: () => {
    set({ filters: { ...DEFAULT_FILTERS }, page: 1 })
    void get().load(1)
  },

  loadFacets: async () => {
    try {
      set({ facets: await fetchFacets() })
    } catch { /* facets optional */ }
  },

  loadDashboard: async () => {
    try {
      set({ dashboard: await fetchDashboard(), dashboardError: null })
    } catch (e) {
      set({ dashboardError: errMsg(e) })
    }
  },

  loadFailures: async () => {
    try {
      set({ failures: await fetchFailures() })
    } catch { /* optional */ }
  },

  toggleFailures: () => {
    const next = !get().showFailures
    set({ showFailures: next })
    if (next && !get().failures) void get().loadFailures()
  },

  toggleSelect: (symbol) =>
    set((s) => ({
      selection: s.selection.includes(symbol)
        ? s.selection.filter((x) => x !== symbol)
        : [...s.selection, symbol],
    })),

  clearSelection: () => set({ selection: [] }),

  analyzeSelected: async () => {
    const { selection } = get()
    if (!selection.length) return
    try {
      const job = await startAnalyzeSelected(selection)
      set({ job, selection: [] })
      void get().pollJob()
    } catch (e) {
      set({ error: errMsg(e) })
    }
  },

  analyzeAll: async () => {
    try {
      const job = await startAnalyzeAll()
      set({ job })
      void get().pollJob()
    } catch (e) {
      set({ error: errMsg(e) })
    }
  },

  retryFailed: async () => {
    try {
      const job = await startRetryFailed()
      set({ job, failures: null, showFailures: false })
      void get().pollJob()
    } catch (e) {
      set({ error: errMsg(e) })
    }
  },

  stopBatch: async () => {
    try {
      set({ job: await stopJob() })
    } catch { /* ignore */ }
  },

  pollJob: async () => {
    if (get().polling) return
    set({ polling: true })
    try {
      // poll until the job finishes, then refresh table + rankings
      for (;;) {
        const job = await fetchJobStatus()
        set({ job })
        if (!job.running) break
        await new Promise((r) => setTimeout(r, 2000))
      }
      await Promise.all([get().load(), get().loadDashboard(), get().loadFailures()])
    } finally {
      set({ polling: false })
    }
  },
}))
