// ── RS inputs store (persisted) ──────────────────────────────────────────────
import { create } from 'zustand'
import { DEFAULT_RS_INPUTS } from '@/trade/chart/rs/defaults'
import type { RsInputs } from '@/trade/chart/rs/types'

const KEY = 'vtrader_rs_inputs'
function load(): RsInputs {
  try { const r = localStorage.getItem(KEY); if (r) return { ...DEFAULT_RS_INPUTS, ...JSON.parse(r) } } catch { /* */ }
  return DEFAULT_RS_INPUTS
}

interface RsState {
  inputs: RsInputs
  set: (patch: Partial<RsInputs>) => void
  reset: () => void
}

export const useRsStore = create<RsState>((set) => ({
  inputs: load(),
  set: (patch) => set((s) => {
    const inputs = { ...s.inputs, ...patch }
    try { localStorage.setItem(KEY, JSON.stringify(inputs)) } catch { /* */ }
    return { inputs }
  }),
  reset: () => { try { localStorage.removeItem(KEY) } catch { /* */ } ; set({ inputs: DEFAULT_RS_INPUTS }) },
}))
