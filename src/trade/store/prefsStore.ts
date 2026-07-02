// ── Trade preferences (brokers + default quantities + quick-trade) ───────────
// Seeded from the sample /users/api/login `preferences.BROKER` payload.
// TODO: hydrate this from the real login response (AuthContext) instead of the
// seed once login persists preferences. Shape matches the API exactly so the
// swap is a straight assignment.

import { create } from 'zustand'

export interface BrokerPref {
  id: number
  default: boolean
  brokerName: string
  displayName: string
  quantity: Record<string, number>   // { nifty, sensex, banknifty, stocks }
}

// Seed from the provided login sample.
const SEED_BROKERS: BrokerPref[] = [
  { id: 4,  default: true,  brokerName: 'FINVASIA', displayName: 'FINVASIA[FA30962]', quantity: { nifty: 225, sensex: 60, stocks: 10, banknifty: 70 } },
  { id: 11, default: false, brokerName: 'ANGELONE', displayName: 'ANGELONE[S2110038]', quantity: { nifty: 225, sensex: 60, stocks: 10, banknifty: 70 } },
]

interface PrefsState {
  brokers: BrokerPref[]
  selectedBrokerIds: number[]   // multi-account selection for order fan-out
  oneClick: boolean
  confirmOrders: boolean
  setBrokers: (b: BrokerPref[]) => void
  toggleBroker: (id: number) => void
  setOneClick: (v: boolean) => void
  setConfirmOrders: (v: boolean) => void
  /** Default qty for a symbol code, from the default broker's quantity map. */
  defaultQty: (symbolCode: string) => number
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  brokers: SEED_BROKERS,
  selectedBrokerIds: SEED_BROKERS.filter((b) => b.default).map((b) => b.id),
  oneClick: false,
  confirmOrders: true,
  setBrokers: (brokers) =>
    set({ brokers, selectedBrokerIds: brokers.filter((b) => b.default).map((b) => b.id) }),
  toggleBroker: (id) =>
    set((s) => ({
      selectedBrokerIds: s.selectedBrokerIds.includes(id)
        ? s.selectedBrokerIds.filter((x) => x !== id)
        : [...s.selectedBrokerIds, id],
    })),
  setOneClick: (oneClick) => set({ oneClick }),
  setConfirmOrders: (confirmOrders) => set({ confirmOrders }),
  defaultQty: (symbolCode) => {
    const def = get().brokers.find((b) => b.default) ?? get().brokers[0]
    if (!def) return 1
    return def.quantity[symbolCode.toLowerCase()] ?? def.quantity.stocks ?? 1
  },
}))
