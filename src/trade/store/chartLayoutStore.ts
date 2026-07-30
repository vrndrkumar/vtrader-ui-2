// ── Multi-chart layout state (TradingView/GoCharting-style) ──────────────────
// Persisted: layout, active panel, per-panel symbol/timeframe/indicators, and
// sync toggles — so the workspace is restored across refresh & navigation.

import { create } from 'zustand'
import { indexChartSymbol, type ChartSymbol, type Timeframe } from '../types/market'
import { layoutPanelCount } from '../chart/layouts'

export const PANEL_IDS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] as const

export interface PanelConfig {
  symbol: ChartSymbol | null
  timeframe: Timeframe
  indicators: string[]
}

export interface SyncState {
  symbol: boolean
  interval: boolean
  crosshair: boolean
  time: boolean
  dateRange: boolean
}

interface LayoutStore {
  layoutId: string
  activePanelId: string
  panels: Record<string, PanelConfig>
  sync: SyncState
  showIndexOrders: boolean            // draw index-bracket lines on index charts
  barCountdown: boolean               // show countdown to current bar close
  syncOptions: boolean                // auto-track ATM CE/PE to the index panel
  setLayout: (id: string) => void
  setActive: (panelId: string) => void
  assignSymbol: (panelId: string, symbol: ChartSymbol) => void
  setPanelTimeframe: (panelId: string, tf: Timeframe) => void
  setPanelIndicators: (panelId: string, indicators: string[]) => void
  setSync: (patch: Partial<SyncState>) => void
  setShowIndexOrders: (v: boolean) => void
  setBarCountdown: (v: boolean) => void
  setSyncOptions: (v: boolean) => void
}

const LS_KEY = 'vtrader_chart_layout'
const DEFAULT_SYNC: SyncState = { symbol: false, interval: false, crosshair: false, time: false, dateRange: false }

function defaultPanels(): Record<string, PanelConfig> {
  const out: Record<string, PanelConfig> = {}
  PANEL_IDS.forEach((id) => { out[id] = { symbol: indexChartSymbol('NIFTY'), timeframe: '5', indicators: [] } })
  return out
}

interface Persisted { layoutId: string; activePanelId: string; panels: Record<string, PanelConfig>; sync: SyncState; showIndexOrders: boolean; barCountdown: boolean; syncOptions: boolean }
function load(): Persisted {
  const base: Persisted = { layoutId: '2h', activePanelId: 'p0', panels: defaultPanels(), sync: DEFAULT_SYNC, showIndexOrders: true, barCountdown: false, syncOptions: false }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>
      return {
        layoutId: p.layoutId ?? base.layoutId,
        activePanelId: p.activePanelId ?? base.activePanelId,
        panels: { ...base.panels, ...(p.panels ?? {}) },
        sync: { ...base.sync, ...(p.sync ?? {}) },
        showIndexOrders: p.showIndexOrders ?? base.showIndexOrders,
        barCountdown: p.barCountdown ?? base.barCountdown,
        syncOptions: p.syncOptions ?? base.syncOptions,
      }
    }
  } catch { /* ignore */ }
  return base
}

const initial = load()

export const useChartLayoutStore = create<LayoutStore>((set, get) => {
  const commit = (partial: Partial<LayoutStore>) => {
    set(partial)
    const s = get()
    try { localStorage.setItem(LS_KEY, JSON.stringify({ layoutId: s.layoutId, activePanelId: s.activePanelId, panels: s.panels, sync: s.sync, showIndexOrders: s.showIndexOrders, barCountdown: s.barCountdown, syncOptions: s.syncOptions })) } catch { /* ignore */ }
  }
  return {
    ...initial,
    setLayout: (layoutId) => {
      const count = layoutPanelCount(layoutId)
      const idx = PANEL_IDS.indexOf(get().activePanelId as (typeof PANEL_IDS)[number])
      const activePanelId = idx >= 0 && idx < count ? get().activePanelId : 'p0'
      commit({ layoutId, activePanelId })
    },
    setActive: (activePanelId) => commit({ activePanelId }),
    assignSymbol: (panelId, symbol) => commit({ panels: { ...get().panels, [panelId]: { ...get().panels[panelId], symbol } } }),
    setPanelTimeframe: (panelId, timeframe) => commit({ panels: { ...get().panels, [panelId]: { ...get().panels[panelId], timeframe } } }),
    setPanelIndicators: (panelId, indicators) => commit({ panels: { ...get().panels, [panelId]: { ...get().panels[panelId], indicators } } }),
    setSync: (patch) => commit({ sync: { ...get().sync, ...patch } }),
    setShowIndexOrders: (showIndexOrders) => commit({ showIndexOrders }),
    setBarCountdown: (barCountdown) => commit({ barCountdown }),
    setSyncOptions: (syncOptions) => commit({ syncOptions }),
  }
})

const visibleIds = () => PANEL_IDS.slice(0, layoutPanelCount(useChartLayoutStore.getState().layoutId))

/** Apply a symbol to the active panel, or ALL visible panels when synced.
 *  SAFETY: an OPTION (Call/Put) is NEVER fanned across panels, even with symbol
 *  sync on — doing so would overwrite a paired Put chart with a Call (or vice-
 *  versa), and a trade placed on that panel would hit the WRONG instrument.
 *  Options always assign to the active panel only; index/equity may still sync. */
export function applySymbol(symbol: ChartSymbol) {
  const s = useChartLayoutStore.getState()
  if (s.sync.symbol && symbol.kind !== 'OPTION') visibleIds().forEach((id) => s.assignSymbol(id, symbol))
  else s.assignSymbol(s.activePanelId, symbol)
}
export function applyTimeframe(tf: Timeframe) {
  const s = useChartLayoutStore.getState()
  if (s.sync.interval) visibleIds().forEach((id) => s.setPanelTimeframe(id, tf))
  else s.setPanelTimeframe(s.activePanelId, tf)
}
