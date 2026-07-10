// ── Trade store (orders + positions) ─────────────────────────────────────────
// Source of truth for from-chart trading. Mock-fed today via tradeAdapter;
// real order/position feeds swap in behind the adapter with no UI change.

import { create } from 'zustand'

export type Side = 'BUY' | 'SELL'

export interface Position {
  id: string          // `${symbolKey}#${brokerId}`
  brokerId: number
  symbolKey: string   // matches ChartSymbol.key
  display: string
  netQty: number      // + long / - short (running position — fixed)
  avgPrice: number
  stopLoss?: number
  stopQty?: number    // qty attached to the SL order (defaults to |netQty|)
  target?: number
  targetQty?: number  // qty attached to the target order (defaults to |netQty|)
}

interface TradeState {
  positions: Record<string, Position>
  upsertPosition: (p: Position) => void
  updatePosition: (id: string, patch: Partial<Position>) => void
  removePosition: (id: string) => void
}

export const useTradeStore = create<TradeState>((set) => ({
  positions: {},
  upsertPosition: (p) => set((s) => ({ positions: { ...s.positions, [p.id]: p } })),
  updatePosition: (id, patch) => set((s) => (s.positions[id] ? { positions: { ...s.positions, [id]: { ...s.positions[id], ...patch } } } : s)),
  removePosition: (id) => set((s) => { const n = { ...s.positions }; delete n[id]; return { positions: n } }),
}))
