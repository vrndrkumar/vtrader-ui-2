import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useQuote } from '../../store/marketStore'
import { realtime } from '../../data/realtime/realtimeService'
import { OPTION_CHAIN_INDICES, type Exchange, type StripIndex } from '../../config/indices'

// ── Recently viewed (persisted) ──────────────────────────────────────────────
const RECENT_KEY = 'vtrader_oc_recent'
const RECENT_MAX = 6
function loadRecent(): string[] {
  try { const r = localStorage.getItem(RECENT_KEY); if (r) return JSON.parse(r) } catch { /* */ }
  return []
}
function pushRecent(code: string): string[] {
  const next = [code, ...loadRecent().filter((c) => c !== code)].slice(0, RECENT_MAX)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* */ }
  return next
}

const EX_BADGE: Record<Exchange, string> = {
  NSE: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30',
  BSE: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30',
  CRYPTO: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30',
}

type Tab = 'indices' | 'stocks' | 'recent'

function IndexRow({ idx, active, onPick }: { idx: StripIndex; active: boolean; onPick: () => void }) {
  const q = useQuote(idx.code)
  const up = (q?.chgPct ?? 0) >= 0
  const dp = idx.decimals ?? 2
  return (
    <button onClick={onPick} className={clsx('flex items-center justify-between w-full px-3 py-2.5 text-left transition-colors', active ? 'bg-brand-50/70 dark:bg-brand-900/20' : 'hover:bg-slate-50 dark:hover:bg-white/5')}>
      <div className="min-w-0 flex items-center gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
            {idx.name}
            {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
          </p>
          <span className={clsx('inline-block mt-0.5 px-1.5 rounded text-[9px] font-bold tracking-wide', EX_BADGE[idx.exchange])}>{idx.exchange}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{q ? q.ltp.toFixed(dp) : '—'}</p>
        <p className={clsx('text-[11px] font-medium tabular-nums', up ? 'text-green-600' : 'text-red-600')}>
          {q?.chg != null ? `${up ? '+' : ''}${q.chg.toFixed(dp)} (${up ? '+' : ''}${q.chgPct?.toFixed(2)}%)` : q ? 'live' : '—'}
        </p>
      </div>
    </button>
  )
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'indices', label: 'Indices' },
  { id: 'stocks', label: 'All F&O Stocks' },
  { id: 'recent', label: 'Recently Viewed' },
]

/** Reusable index picker for the option chain. Searchable, tabbed, live quotes. */
export function IndexSelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('indices')
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const current = OPTION_CHAIN_INDICES.find((i) => i.code === value)
  const currentQ = useQuote(value)

  // Keep listed indices ticking while the menu is open (ref-counted).
  useEffect(() => {
    if (!open) return
    realtime.start()
    const unsubs = OPTION_CHAIN_INDICES.map((i) => realtime.subscribeIndexTick(i.code))
    return () => unsubs.forEach((u) => u())
  }, [open])

  // Outside-click / Escape to close; focus search on open.
  useEffect(() => {
    if (!open) return
    setTimeout(() => searchRef.current?.focus(), 0)
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const list = useMemo(() => {
    const q = query.trim().toUpperCase()
    let base = OPTION_CHAIN_INDICES
    if (tab === 'recent') base = recent.map((c) => OPTION_CHAIN_INDICES.find((i) => i.code === c)).filter(Boolean) as StripIndex[]
    if (tab === 'stocks') base = []
    if (q) base = base.filter((i) => i.name.toUpperCase().includes(q) || i.code.toUpperCase().includes(q))
    return base
  }, [tab, query, recent])

  const pick = (code: string) => { setRecent(pushRecent(code)); onChange(code); setOpen(false); setQuery('') }
  const up = (currentQ?.chgPct ?? 0) >= 0

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button onClick={() => setOpen((o) => !o)} className="flex items-center justify-between w-full px-3 py-2 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{current?.name ?? value}</span>
          <span className="text-[11px] text-slate-400">Option Chain</span>
          <svg viewBox="0 0 24 24" className={clsx('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
        </span>
        {currentQ && (
          <span className="flex items-baseline gap-1.5 shrink-0">
            <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{currentQ.ltp.toFixed(current?.decimals ?? 2)}</span>
            <span className={clsx('text-[11px] font-medium tabular-nums', up ? 'text-green-600' : 'text-red-600')}>{up ? '+' : ''}{currentQ.chgPct?.toFixed(2)}%</span>
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-40 left-0 right-0 mt-1 mx-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shadow-2xl overflow-hidden animate-fade-in">
          {/* Search */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <svg viewBox="0 0 24 24" className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search index…" className="w-full h-9 pl-8 pr-8 rounded-lg bg-slate-100 dark:bg-white/5 text-sm outline-none focus:ring-1 focus:ring-brand-400" />
              {query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={clsx('px-2.5 py-1 rounded-md text-xs font-medium transition-colors', tab === t.id ? 'bg-slate-800 dark:bg-white/10 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5')}>{t.label}</button>
            ))}
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto">
            {list.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-8 px-6 text-center text-slate-400">
                <svg viewBox="0 0 24 24" className="h-7 w-7 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
                <p className="text-xs font-medium">{tab === 'stocks' ? 'Stock F&O coming soon' : tab === 'recent' ? 'No recently viewed indices' : 'No matches'}</p>
              </div>
            ) : (
              list.map((idx) => <IndexRow key={idx.code} idx={idx} active={idx.code === value} onPick={() => pick(idx.code)} />)
            )}
          </div>
        </div>
      )}
    </div>
  )
}
