// ── Options strategy builder state ───────────────────────────────────────────

import { create } from 'zustand'
import type { OptType, Side, StrategyLeg } from '../types/options'
import { LOT_SIZE } from '../types/options'

let seq = 0
const uid = () => `leg_${Date.now()}_${seq++}`

export interface AddLegInput {
  symbolCode: string
  expiry: string
  strike: number
  optType: OptType
  side: Side
  ltp: number
  iv: number
}

interface StrategyState {
  legs: StrategyLeg[]
  product: 'Normal' | 'MIS'
  sameQty: boolean
  addFromChain: (input: AddLegInput) => void
  setLegs: (legs: StrategyLeg[]) => void
  removeLeg: (id: string) => void
  updateLeg: (id: string, patch: Partial<StrategyLeg>) => void
  clear: () => void
  setProduct: (p: 'Normal' | 'MIS') => void
  setSameQty: (v: boolean) => void
}

export const useStrategyStore = create<StrategyState>((set) => ({
  legs: [],
  product: 'Normal',
  sameQty: false,
  addFromChain: (input) =>
    set((s) => {
      const lot = LOT_SIZE[input.symbolCode] ?? 1
      const leg: StrategyLeg = {
        id: uid(),
        side: input.side,
        expiry: input.expiry,
        strike: input.strike,
        optType: input.optType,
        qty: lot,
        lot,
        priceType: 'Market',
        price: input.ltp,
        ltp: input.ltp,
        iv: input.iv,
      }
      return { legs: [...s.legs, leg] }
    }),
  setLegs: (legs) => set({ legs }),
  removeLeg: (id) => set((s) => ({ legs: s.legs.filter((l) => l.id !== id) })),
  updateLeg: (id, patch) =>
    set((s) => ({ legs: s.legs.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
  clear: () => set({ legs: [] }),
  setProduct: (product) => set({ product }),
  setSameQty: (sameQty) => set({ sameQty }),
}))
