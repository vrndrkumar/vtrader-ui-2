// ── SMC inputs store (persisted) ─────────────────────────────────────────────
// Holds the user-editable Smart Money Concepts inputs (all preserved from Pine),
// persisted per device so the config survives reloads.

import { create } from 'zustand'
import { DEFAULT_SMC_INPUTS } from '@/trade/chart/smc/defaults'
import type { SmcInputs } from '@/trade/chart/smc/types'

const KEY = 'vtrader_smc_inputs'

function load(): SmcInputs {
  try { const r = localStorage.getItem(KEY); if (r) return { ...DEFAULT_SMC_INPUTS, ...JSON.parse(r) } } catch { /* */ }
  return DEFAULT_SMC_INPUTS
}

interface SmcState {
  inputs: SmcInputs
  set: (patch: Partial<SmcInputs>) => void
  reset: () => void
}

export const useSmcStore = create<SmcState>((set) => ({
  inputs: load(),
  set: (patch) => set((s) => {
    const inputs = { ...s.inputs, ...patch }
    try { localStorage.setItem(KEY, JSON.stringify(inputs)) } catch { /* */ }
    return { inputs }
  }),
  reset: () => { try { localStorage.removeItem(KEY) } catch { /* */ } ; set({ inputs: DEFAULT_SMC_INPUTS }) },
}))
