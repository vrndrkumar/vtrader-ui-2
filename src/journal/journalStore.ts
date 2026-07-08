// ── Journal metadata store (diary annotations) ───────────────────────────────
// Keyed by the stable trade id from /trades. LocalStorage-backed for now (a
// single swap point); real journal endpoints (notes/tags/review/…) replace the
// persistence here with NO change to the UI. Extensible `meta` bag so future
// fields (emotions, checklist, screenshots) are additive.

import { create } from 'zustand'

export type ReviewStatus = 'NEW' | 'REVIEWED' | 'FLAGGED'

export interface JournalTag { name: string; color: string }

export interface JournalEntry {
  tradeId: string
  reviewStatus: ReviewStatus
  rating: number                 // 0–5
  tags: JournalTag[]
  notes: string
  meta: {                        // extensible qualitative bag
    lessons?: string
    mistakes?: string
    [k: string]: unknown
  }
  updatedAt: number
}

export function emptyEntry(tradeId: string): JournalEntry {
  return { tradeId, reviewStatus: 'NEW', rating: 0, tags: [], notes: '', meta: {}, updatedAt: 0 }
}

const LS_KEY = 'vtrader_journal'

function load(): Record<string, JournalEntry> {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw) } catch { /* ignore */ }
  return {}
}

interface JournalState {
  entries: Record<string, JournalEntry>
  update: (tradeId: string, patch: Partial<JournalEntry>) => void
  setMeta: (tradeId: string, key: string, value: unknown) => void
}

export const useJournalStore = create<JournalState>((set, get) => {
  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(get().entries)) } catch { /* ignore */ } }
  const write = (tradeId: string, next: JournalEntry) => { set((s) => ({ entries: { ...s.entries, [tradeId]: next } })); persist() }
  return {
    entries: load(),
    update: (tradeId, patch) => {
      const cur = get().entries[tradeId] ?? emptyEntry(tradeId)
      write(tradeId, { ...cur, ...patch, tradeId, updatedAt: Date.now() })
    },
    setMeta: (tradeId, key, value) => {
      const cur = get().entries[tradeId] ?? emptyEntry(tradeId)
      write(tradeId, { ...cur, meta: { ...cur.meta, [key]: value }, updatedAt: Date.now() })
    },
  }
})

/** Reactive entry for a trade (falls back to an empty entry). */
export function useJournalEntry(tradeId: string): JournalEntry {
  return useJournalStore((s) => s.entries[tradeId]) ?? emptyEntry(tradeId)
}
