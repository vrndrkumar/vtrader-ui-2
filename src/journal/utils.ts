import type { ReviewStatus } from './journalStore'

export function fmtPnl(n: number, sign = true): string {
  const a = Math.abs(n)
  const s = a.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : sign && n > 0 ? '+' : ''}₹${s}`
}

export function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function fmtTime(s?: string): string {
  if (!s) return '—'
  const d = new Date(s); if (isNaN(d.getTime())) return s
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDuration(from?: string | null, to?: string | null): string {
  if (!from) return '—'
  const a = new Date(from).getTime(); const b = new Date(to ?? Date.now()).getTime()
  if (isNaN(a) || isNaN(b)) return '—'
  const m = Math.max(0, Math.round((b - a) / 60000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), mm = m % 60
  if (h < 24) return mm ? `${h}h ${mm}m` : `${h}h`
  const d = Math.floor(h / 24), hh = h % 24
  return hh ? `${d}d ${hh}h` : `${d}d`
}

export const REVIEW_META: Record<ReviewStatus, { label: string; cls: string; dot: string }> = {
  NEW: { label: 'New', cls: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400', dot: 'bg-slate-400' },
  REVIEWED: { label: 'Reviewed', cls: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400', dot: 'bg-green-500' },
  FLAGGED: { label: 'Flagged', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400', dot: 'bg-amber-500' },
}

const TAG_COLORS = ['#3b82f6', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6']
export function tagColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

// ── Instrument parsing (NIFTY_30SEP25_PE_25400, …) ───────────────────────────
export type InstrumentKind = 'CE' | 'PE' | 'FUT' | 'EQ'
export const INSTRUMENT_META: Record<InstrumentKind, { label: string; cls: string }> = {
  CE: { label: 'CE', cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' },
  PE: { label: 'PE', cls: 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400' },
  FUT: { label: 'FUT', cls: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' },
  EQ: { label: 'EQ', cls: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400' },
}
export function parseInstrument(symbol: string): { kind: InstrumentKind; underlying: string; strike?: string; expiry?: string } {
  const s = (symbol || '').toUpperCase()
  const parts = s.split('_')
  const underlying = parts[0] || s
  let kind: InstrumentKind = 'EQ'
  if (parts.includes('CE')) kind = 'CE'
  else if (parts.includes('PE')) kind = 'PE'
  else if (parts.includes('FUT') || s.includes('FUT')) kind = 'FUT'
  const expiry = parts[1]
  const strike = kind === 'CE' || kind === 'PE' ? parts[parts.length - 1] : undefined
  return { kind, underlying, strike, expiry }
}

const MANUAL = new Set(['', 'MANUAL', 'MANUAL_TRADE'])
export function isManual(groupName?: string): boolean {
  return MANUAL.has((groupName ?? '').toUpperCase())
}

// ── Strategy badge colours (deterministic hash → distinct palette) ────────────
// Each unique group_name gets a stable colour across sessions.
// Manual stays grey; everything else gets a unique colour from the palette.
const STRATEGY_PALETTE = [
  'bg-violet-50   text-violet-600  dark:bg-violet-900/20  dark:text-violet-400',
  'bg-sky-50      text-sky-600     dark:bg-sky-900/20     dark:text-sky-400',
  'bg-emerald-50  text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  'bg-rose-50     text-rose-600    dark:bg-rose-900/20    dark:text-rose-400',
  'bg-amber-50    text-amber-600   dark:bg-amber-900/20   dark:text-amber-400',
  'bg-cyan-50     text-cyan-600    dark:bg-cyan-900/20    dark:text-cyan-400',
  'bg-orange-50   text-orange-600  dark:bg-orange-900/20  dark:text-orange-400',
  'bg-pink-50     text-pink-600    dark:bg-pink-900/20    dark:text-pink-400',
  'bg-teal-50     text-teal-600    dark:bg-teal-900/20    dark:text-teal-400',
  'bg-indigo-50   text-indigo-600  dark:bg-indigo-900/20  dark:text-indigo-400',
] as const

export function strategyBadgeCls(groupName?: string): string {
  if (isManual(groupName)) {
    return 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'
  }
  const key = (groupName ?? '').toUpperCase()
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return STRATEGY_PALETTE[h % STRATEGY_PALETTE.length]
}
