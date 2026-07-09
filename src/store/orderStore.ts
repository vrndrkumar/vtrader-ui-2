// ── Order Window state (shared modal) ────────────────────────────────────────

import { create } from 'zustand'
import type { OrderIntent } from '@/services/orders/types'

export type { OrderIntent } from '@/services/orders/types'
export type ExecStatus = 'queued' | 'sent' | 'filled' | 'failed'

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
