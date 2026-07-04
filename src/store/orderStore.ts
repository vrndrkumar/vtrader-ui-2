// ── Order Window state (shared modal) ────────────────────────────────────────

import { create } from 'zustand'

export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M'
export type ExecStatus = 'queued' | 'sent' | 'filled' | 'failed'

export interface OrderIntent {
  instrument: string        // display, e.g. "NIFTY 24500 CE"
  underlying: string        // "NIFTY" — drives default-qty class
  side: 'BUY' | 'SELL'
  ltp?: number
  orderType?: OrderType
  price?: number
  product?: 'Normal' | 'MIS'
}

export interface BrokerExecResult {
  brokerId: number
  displayName: string
  qty: number
  status: ExecStatus
  message?: string
}

interface OrderState {
  open: boolean
  intent: OrderIntent | null
  results: BrokerExecResult[]
  openWindow: (intent: OrderIntent) => void
  close: () => void
  setResults: (r: BrokerExecResult[]) => void
}

export const useOrderStore = create<OrderState>((set) => ({
  open: false,
  intent: null,
  results: [],
  openWindow: (intent) => set({ open: true, intent, results: [] }),
  close: () => set({ open: false, intent: null, results: [] }),
  setResults: (results) => set({ results }),
}))
