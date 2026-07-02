// ── Live quote store (high-frequency) ────────────────────────────────────────
// Kept OUT of React Context deliberately: components subscribe with per-key
// selectors so a tick on one symbol never re-renders another's row.

import { create } from 'zustand'
import type { Quote } from '../types/market'

interface MarketState {
  quotes: Record<string, Quote>
  setQuote: (q: Quote) => void
}

export const useMarketStore = create<MarketState>((set) => ({
  quotes: {},
  setQuote: (q) =>
    set((s) => ({ quotes: { ...s.quotes, [q.key]: q } })),
}))

/** Selector hook — re-renders only when THIS key's quote changes. */
export const useQuote = (key: string): Quote | undefined =>
  useMarketStore((s) => s.quotes[key])
