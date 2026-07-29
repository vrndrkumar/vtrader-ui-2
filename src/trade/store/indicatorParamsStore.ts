// ── Indicator params (persisted) ─────────────────────────────────────────────
// Per-indicator calc parameters the user sets in the settings dialog. Global by
// indicator name (all panels share), persisted across sessions.

import { create } from 'zustand'
import { defaultsFor } from '../chart/indicatorMeta'

const LS_KEY = 'vtrader_indicator_params'

function load(): Record<string, number[]> {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw) } catch { /* ignore */ }
  return {}
}

interface State {
  params: Record<string, number[]>
  get: (name: string) => number[]
  set: (name: string, params: number[]) => void
  reset: (name: string) => void
}

export const useIndicatorParams = create<State>((setState, getState) => ({
  params: load(),
  get: (name) => getState().params[name] ?? defaultsFor(name),
  set: (name, params) => {
    const next = { ...getState().params, [name]: params }
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    setState({ params: next })
  },
  reset: (name) => {
    const next = { ...getState().params }
    delete next[name]
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    setState({ params: next })
  },
}))
