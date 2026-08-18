// ── Index spot at strike-position entry ──────────────────────────────────────
// Records the INDEX spot price at the moment a strike order is placed, keyed by
// the option symbol. The index chart uses it to anchor the mirrored position at
// the index level where it was opened (not floating at the top). Persisted so it
// survives reloads; kept as first-seen (the entry), never overwritten.

import { create } from 'zustand'

const KEY = 'vtrader_pos_entry_spot'
type Spots = Record<string, number>

function load(): Spots {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) } catch { /* */ }
  return {}
}
function save(s: Spots) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* */ } }

interface State {
  spots: Spots
  record: (symbol: string, spot: number) => void  // first write wins (the entry)
  forget: (symbol: string) => void
}

export const useEntrySpotStore = create<State>((set, get) => ({
  spots: load(),
  record: (symbol, spot) => {
    if (!symbol || !(spot > 0) || get().spots[symbol] != null) return
    const next = { ...get().spots, [symbol]: +spot.toFixed(2) }
    set({ spots: next }); save(next)
  },
  forget: (symbol) => {
    if (get().spots[symbol] == null) return
    const next = { ...get().spots }; delete next[symbol]
    set({ spots: next }); save(next)
  },
}))

/** Imperative helper for placement call-sites. */
export function recordEntrySpot(symbol: string, spot: number) {
  useEntrySpotStore.getState().record(symbol, spot)
}
