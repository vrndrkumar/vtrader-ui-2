// ── Service health store ─────────────────────────────────────────────────────
// Single source of truth for the data-services health panel + admin alerts.
// Reads the market-data monitoring API (data.vtrader.in, credential-free GET,
// same host as candles). Polled by ServiceAlertsWatcher; read by the panel.

import { create } from 'zustand'
import { axiosCandle } from '@/api/axios'

export type Severity = 'ok' | 'warn' | 'down'

export interface ServiceRow {
  service: string
  category: string
  severity: Severity
  status: string
  message: string
  detail?: Record<string, unknown>
  evaluated_at: string
}
export interface AlertRow {
  id: number
  service: string
  severity: Severity
  status: string
  message: string
  created_at: string
  acked: boolean
}

interface HealthState {
  overall: Severity
  counts: Partial<Record<Severity, number>>
  services: ServiceRow[]
  alerts: AlertRow[]
  unacked: number
  lastError: string | null
  loaded: boolean
  refresh: () => Promise<void>
  ack: (id: number | 'all') => Promise<void>
}

export const useServiceHealth = create<HealthState>((set, get) => ({
  overall: 'ok',
  counts: {},
  services: [],
  alerts: [],
  unacked: 0,
  lastError: null,
  loaded: false,

  refresh: async () => {
    try {
      const [s, a] = await Promise.all([
        axiosCandle.get('/admin/services/status'),
        axiosCandle.get('/admin/services/alerts', { params: { limit: 30 } }),
      ])
      const alerts: AlertRow[] = a.data?.alerts ?? []
      set({
        overall: (s.data?.overall as Severity) ?? 'ok',
        counts: s.data?.counts ?? {},
        services: s.data?.services ?? [],
        alerts,
        unacked: alerts.filter((x) => !x.acked).length,
        lastError: null,
        loaded: true,
      })
    } catch (e) {
      set({ lastError: e instanceof Error ? e.message : 'failed to load status', loaded: true })
    }
  },

  ack: async (id) => {
    // GET (not POST) so it's a CORS "simple request" — no preflight — against the
    // credential-free candle host. Persists read-state server-side.
    try { await axiosCandle.get(`/admin/services/alerts/${id}/ack`) } catch { /* non-critical */ }
    await get().refresh()
  },
}))
