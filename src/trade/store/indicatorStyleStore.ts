// ── Built-in indicator per-plot style overrides (persisted) ──────────────────
// name -> plotKey -> PlotStyle (color / width / line-style / show, or up/down
// colors for bars & circles). Persisted per device so the look survives reloads.

import { create } from 'zustand'
import type { PlotStyle } from '@/trade/chart/indicatorPlots'

const KEY = 'vtrader_indicator_styles'
type Map = Record<string, Record<string, PlotStyle>>

function load(): Map {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) } catch { /* */ }
  return {}
}
function persist(m: Map) { try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* */ } }

interface State {
  styles: Map
  get: (name: string) => Record<string, PlotStyle>
  setPlot: (name: string, plotKey: string, patch: PlotStyle) => void
  reset: (name: string) => void
}

export const useIndicatorStyle = create<State>((set, get) => ({
  styles: load(),
  get: (name) => get().styles[name] ?? {},
  setPlot: (name, plotKey, patch) => set((s) => {
    const forName = { ...(s.styles[name] ?? {}) }
    forName[plotKey] = { ...(forName[plotKey] ?? {}), ...patch }
    const styles = { ...s.styles, [name]: forName }
    persist(styles)
    return { styles }
  }),
  reset: (name) => set((s) => {
    const styles = { ...s.styles }
    delete styles[name]
    persist(styles)
    return { styles }
  }),
}))
