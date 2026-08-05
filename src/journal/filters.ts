import type { Trade } from '@/types/reports'
import type { JournalEntry, ReviewStatus } from './journalStore'
import { isManual, parseInstrument } from './utils'

export type DatePreset = 'today' | 'yesterday' | 'week' | 'last7' | 'month' | 'lastMonth' | 'custom'
export type Outcome = 'ALL' | 'WIN' | 'LOSS'
export type StatusF = 'ALL' | 'OPEN' | 'CLOSED'
export type Tri = 'ALL' | 'YES' | 'NO'
export type SourceF = 'ALL' | 'MANUAL' | 'IMPORTED'
export type InstrumentF = 'ALL' | 'CE' | 'PE' | 'FUT' | 'EQ'
export type ReviewF = 'ALL' | 'NEW' | 'REVIEWED' | 'FLAGGED'

export interface Filters {
  datePreset: DatePreset
  from: string; to: string
  broker: string
  strategy: string
  symbol: string
  index: string           // '' = all; 'NIFTY' / 'BANKNIFTY' / …; 'EQ' = non-index
  instrument: InstrumentF
  outcome: Outcome
  status: StatusF
  pnlMin: string; pnlMax: string
  qtyMin: string; qtyMax: string
  tags: string[]
  hasNotes: Tri
  source: SourceF
  review: ReviewF
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'last7', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'custom', label: 'Custom Range' },
]

export function presetRange(p: DatePreset): { from: string; to: string } | null {
  const now = new Date(); const to = iso(now)
  switch (p) {
    case 'today': return { from: to, to }
    case 'yesterday': { const y = iso(new Date(Date.now() - 864e5)); return { from: y, to: y } }
    case 'week': { const dow = (now.getDay() + 6) % 7; return { from: iso(new Date(Date.now() - dow * 864e5)), to } }
    case 'last7': return { from: iso(new Date(Date.now() - 6 * 864e5)), to }
    case 'month': return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to }
    case 'lastMonth': return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) }
    default: return null
  }
}

export function defaultFilters(): Filters {
  const r = presetRange('month')!
  return {
    datePreset: 'month', from: r.from, to: r.to, broker: '', strategy: '', symbol: '', index: '',
    instrument: 'ALL', outcome: 'ALL', status: 'ALL', pnlMin: '', pnlMax: '', qtyMin: '', qtyMax: '',
    tags: [], hasNotes: 'ALL', source: 'ALL', review: 'ALL',
  }
}

/** Number of non-date filters currently active (for the "Filters" badge). */
export function activeCount(f: Filters): number {
  let n = 0
  if (f.broker) n++; if (f.strategy) n++; if (f.symbol) n++; if (f.index) n++
  if (f.instrument !== 'ALL') n++; if (f.outcome !== 'ALL') n++; if (f.status !== 'ALL') n++
  if (f.pnlMin || f.pnlMax) n++; if (f.qtyMin || f.qtyMax) n++
  if (f.tags.length) n++; if (f.hasNotes !== 'ALL') n++; if (f.source !== 'ALL') n++; if (f.review !== 'ALL') n++
  return n
}

const STANDARD_INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX', 'BANKEX', 'MIDCPNIFTY']

const pnlOf = (t: Trade) => (t.realized_pnl ?? 0) + (t.unrealized_pnl ?? 0)

export function applyFilters(
  trades: Trade[], f: Filters,
  reviewOf: (id: string) => ReviewStatus,
  entryOf: (id: string) => JournalEntry | undefined,
): Trade[] {
  const num = (s: string) => (s === '' ? undefined : Number(s))
  const pMin = num(f.pnlMin), pMax = num(f.pnlMax), qMin = num(f.qtyMin), qMax = num(f.qtyMax)
  return trades.filter((t) => {
    const pnl = pnlOf(t)
    if (f.broker && t.broker_name !== f.broker) return false
    if (f.strategy) {
      if (f.strategy === 'MANUAL') { if (!isManual(t.group_name)) return false }
      else if (t.group_name !== f.strategy) return false
    }
    if (f.symbol && !t.symbol_name?.toLowerCase().includes(f.symbol.toLowerCase())) return false
    if (f.index) {
      const base = t.symbol_name?.split('_')[0] ?? ''
      if (f.index === 'EQ') { if (STANDARD_INDICES.includes(base)) return false }
      else if (base !== f.index) return false
    }
    if (f.instrument !== 'ALL' && parseInstrument(t.symbol_name).kind !== f.instrument) return false
    if (f.outcome === 'WIN' && pnl <= 0) return false
    if (f.outcome === 'LOSS' && pnl >= 0) return false
    // A trade is OPEN unless it is explicitly CLOSED (SHORT/LONG/etc. count as open).
    if (f.status === 'CLOSED' && t.status !== 'CLOSED') return false
    if (f.status === 'OPEN' && t.status === 'CLOSED') return false
    if (pMin != null && pnl < pMin) return false
    if (pMax != null && pnl > pMax) return false
    if (qMin != null && (t.total_quantity ?? 0) < qMin) return false
    if (qMax != null && (t.total_quantity ?? 0) > qMax) return false
    if (f.source === 'MANUAL' && !isManual(t.group_name)) return false
    if (f.source === 'IMPORTED' && isManual(t.group_name)) return false
    const e = entryOf(t.trade_id)
    if (f.tags.length && !(t.tags ?? []).some((tag) => f.tags.includes(tag.name))) return false
    if (f.hasNotes === 'YES' && !(e?.notes?.trim())) return false
    if (f.hasNotes === 'NO' && e?.notes?.trim()) return false
    if (f.review !== 'ALL' && reviewOf(t.trade_id) !== f.review) return false
    return true
  })
}

/**
 * Re-resolve a saved preset's date range at apply time. A preset saved as
 * "Today" yesterday must mean today when clicked now — so recompute from/to for
 * every relative preset; only 'custom' keeps its stored dates.
 */
export function rehydratePreset(f: Filters): Filters {
  const r = presetRange(f.datePreset)
  return r ? { ...f, ...r } : f
}

// ── Saved filter presets ─────────────────────────────────────────────────────
export interface SavedPreset { name: string; filters: Filters }
const PRESET_KEY = 'vtrader_journal_presets'
export function loadPresets(): SavedPreset[] {
  try { const r = localStorage.getItem(PRESET_KEY); if (r) return JSON.parse(r) } catch { /* */ }
  return []
}
export function savePresets(p: SavedPreset[]) { try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)) } catch { /* */ } }
