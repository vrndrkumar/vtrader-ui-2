// ── Buyside & Sellside Liquidity inputs store (persisted) ────────────────────
// Holds the user-editable inputs (all preserved from Pine), persisted per device
// so the config survives reloads.

import { create } from 'zustand'
import { DEFAULT_BSL_INPUTS } from '@/trade/chart/bsl/defaults'
import type { BslInputs } from '@/trade/chart/bsl/types'

const KEY = 'vtrader_bsl_inputs'

function load(): BslInputs {
  try { const r = localStorage.getItem(KEY); if (r) return { ...DEFAULT_BSL_INPUTS, ...JSON.parse(r) } } catch { /* */ }
  return DEFAULT_BSL_INPUTS
}

interface BslState {
  inputs: BslInputs
  set: (patch: Partial<BslInputs>) => void
  reset: () => void
}

export const useBslStore = create<BslState>((set) => ({
  inputs: load(),
  set: (patch) => set((s) => {
    const inputs = { ...s.inputs, ...patch }
    try { localStorage.setItem(KEY, JSON.stringify(inputs)) } catch { /* */ }
    return { inputs }
  }),
  reset: () => { try { localStorage.removeItem(KEY) } catch { /* */ } ; set({ inputs: DEFAULT_BSL_INPUTS }) },
}))
