// ── WaveTrend inputs store (persisted) ───────────────────────────────────────
import { create } from 'zustand'
import { DEFAULT_WT_INPUTS } from '@/trade/chart/wt/defaults'
import type { WtInputs } from '@/trade/chart/wt/types'

const KEY = 'vtrader_wt_inputs'
function load(): WtInputs {
  try { const r = localStorage.getItem(KEY); if (r) return { ...DEFAULT_WT_INPUTS, ...JSON.parse(r) } } catch { /* */ }
  return DEFAULT_WT_INPUTS
}

interface WtState {
  inputs: WtInputs
  set: (patch: Partial<WtInputs>) => void
  reset: () => void
}

export const useWtStore = create<WtState>((set) => ({
  inputs: load(),
  set: (patch) => set((s) => {
    const inputs = { ...s.inputs, ...patch }
    try { localStorage.setItem(KEY, JSON.stringify(inputs)) } catch { /* */ }
    return { inputs }
  }),
  reset: () => { try { localStorage.removeItem(KEY) } catch { /* */ } ; set({ inputs: DEFAULT_WT_INPUTS }) },
}))
