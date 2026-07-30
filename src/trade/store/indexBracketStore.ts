// ── OCO monitor store (unified: INDEX brackets + SYMBOL monitors) ────────────
// One source of truth: loads ALL of the user's active OCO monitors in a single
// call and exposes both slices consistently —
//   • byIndex[index]        → INDEX brackets for the index chart
//   • symbolMonitor(symbol) → the SYMBOL OCO for a strike chart
// Kept fresh by the OCO WS events (entry filled / exit executed / reject / cancel).

import { create } from 'zustand'
import { getOcoMonitors } from '@/api/trade'

export interface IndexBracket {
  id: number | string
  indexName: string
  symbolName: string
  direction: 'LONG' | 'SHORT'
  entrySide: 'BUY' | 'SELL'
  entryQuantity: number
  entryTriggerPrice: number
  entryDir: 'ABOVE' | 'BELOW'
  entryStatus: string
  slTriggerPrice: number | null
  slQuantity: number | null
  slStatus: string | null
  tgtTriggerPrice: number | null
  tgtQuantity: number | null
  tgtStatus: string | null
}

const n = (v: unknown): number => Number(v)
const nOrNull = (v: unknown): number | null => (v == null ? null : Number(v))

function norm(r: Record<string, unknown>): IndexBracket {
  return {
    id: (r.id as number | string),
    indexName: String(r.indexName ?? ''),
    symbolName: String(r.symbolName ?? ''),
    direction: (r.direction as 'LONG' | 'SHORT') ?? 'LONG',
    entrySide: (r.entrySide as 'BUY' | 'SELL') ?? 'BUY',
    entryQuantity: n(r.entryQuantity ?? r.quantity ?? 0),
    entryTriggerPrice: n(r.entryTriggerPrice ?? 0),
    entryDir: (r.entryDir as 'ABOVE' | 'BELOW') ?? 'ABOVE',
    entryStatus: String(r.entryStatus ?? ''),
    slTriggerPrice: nOrNull(r.slTriggerPrice),
    slQuantity: nOrNull(r.slQuantity),
    slStatus: r.slStatus == null ? null : String(r.slStatus),
    tgtTriggerPrice: nOrNull(r.tgtTriggerPrice),
    tgtQuantity: nOrNull(r.tgtQuantity),
    tgtStatus: r.tgtStatus == null ? null : String(r.tgtStatus),
  }
}

const kindOf = (r: Record<string, unknown>) => (r.monitorType === 'INDEX' ? 'INDEX' : 'SYMBOL')

interface State {
  all: Record<string, unknown>[]
  byIndex: Record<string, IndexBracket[]>   // INDEX brackets, keyed by index
  bySymbol: Record<string, IndexBracket[]>  // SYMBOL brackets with a PENDING entry, keyed by strike
  /** Reload ALL active monitors (index arg kept for call-site compatibility). */
  reload: (index?: string) => Promise<void>
  /** The active SYMBOL OCO monitor for a strike, if any (SL/Target on a position). */
  symbolMonitor: (symbol: string) => Record<string, unknown> | undefined
}

export const useIndexBracketStore = create<State>((set, get) => ({
  all: [],
  byIndex: {},
  bySymbol: {},
  reload: async () => {
    try {
      const rows = await getOcoMonitors({}) // ALL active monitors for the user
      const byIndex: Record<string, IndexBracket[]> = {}
      const bySymbol: Record<string, IndexBracket[]> = {}
      for (const r of rows) {
        if (kindOf(r) === 'INDEX') {
          ;(byIndex[String(r.indexName ?? '')] ??= []).push(norm(r))
        } else if (r.entryStatus != null && r.entryStatus !== 'FILLED') {
          // SYMBOL bracket whose triggered entry hasn't filled yet — show it on
          // the strike chart. Once FILLED, the position + SL/Target render via the
          // order layer, so it drops out of here (no double render).
          ;(bySymbol[String(r.symbolName ?? '')] ??= []).push(norm(r))
        }
      }
      set({ all: rows, byIndex, bySymbol })
    } catch { /* keep prior state on error */ }
  },
  symbolMonitor: (symbol) => get().all.find((r) => kindOf(r) === 'SYMBOL' && r.symbolName === symbol),
}))
