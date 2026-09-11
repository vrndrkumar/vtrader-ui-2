import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useQuote } from '../../store/marketStore'
import { realtime } from '../../data/realtime/realtimeService'
import { OPTION_CHAIN_INDICES, type Exchange, type StripIndex } from '../../config/indices'
import { useStocksStore } from '../../store/stocksStore'
import type { Stock } from '@/api/stocks'

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

function StockPickRow({ s, onPick }: { s: Stock; onPick: () => void }) {
  return (
    <button onClick={onPick} className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{s.symbolCode}</p>
        <p className="text-[11px] text-slate-400 truncate">{s.symbolName}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {s.exchange && <span className="px-1.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400">{s.exchange}</span>}
        <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{s.ltp != null ? s.ltp.toFixed(2) : '—'}</span>
      </div>
    </button>
  )
}

/** Reusable index picker (searchable, tabbed, live quotes). Used by the option
 *  chain AND the chart toolbar so both dropdowns are identical.
 *  - `compact`: renders a small inline trigger (toolbar) instead of the full-width
 *    header trigger (option-chain panel).
 *  - `triggerLabel` / `triggerText`: override the muted label / main text on the
 *    compact trigger (e.g. show the active chart symbol's display). */
export function IndexSelect({ value, onChange, onPickSymbol, compact = false, triggerLabel = 'Option Chain', triggerText }: {
  value: string
  onChange: (code: string) => void
  /** When provided, the picker also searches STOCKS and loads them as charts
   *  (used by the chart toolbar; the option chain omits it → indices only). */
  onPickSymbol?: (symbol: string, name: string) => void
  compact?: boolean
  triggerLabel?: string
  triggerText?: string
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('indices')
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const stocks = useStocksStore((s) => s.list)
  const loadStocks = useStocksStore((s) => s.load)
  const stocksLoading = useStocksStore((s) => s.loading)

  // Load the stock universe when the menu opens (only where stock picking is on).
  useEffect(() => { if (open && onPickSymbol) void loadStocks() }, [open, onPickSymbol, loadStocks])

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

  // Matching stocks for the current query / the "All F&O Stocks" tab.
  const stockList = useMemo<Stock[]>(() => {
    if (!onPickSymbol) return []
    const q = query.trim().toUpperCase()
    if (q) return stocks.filter((s) => s.symbolCode.toUpperCase().includes(q) || s.symbolName.toUpperCase().includes(q)).slice(0, 80)
    if (tab === 'stocks') return stocks.slice(0, 300)
    return []
  }, [onPickSymbol, query, tab, stocks])

  const pick = (code: string) => { setRecent(pushRecent(code)); onChange(code); setOpen(false); setQuery('') }
  const pickStock = (s: Stock) => { onPickSymbol?.(s.symbolCode, s.symbolName); setOpen(false); setQuery('') }
  const up = (currentQ?.chgPct ?? 0) >= 0

  return (
    <div ref={ref} className="relative">
      {/* Trigger — compact (toolbar) or full-width (option-chain header) */}
      {compact ? (
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 max-w-[150px] truncate">{triggerText ?? current?.name ?? value}</span>
          <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5 text-slate-400 transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      ) : (
        <button onClick={() => setOpen((o) => !o)} className="flex items-center justify-between w-full px-3 py-2 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{current?.name ?? value}</span>
            <span className="text-[11px] text-slate-400">{triggerLabel}</span>
            <svg viewBox="0 0 24 24" className={clsx('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </span>
          {currentQ && (
            <span className="flex items-baseline gap-1.5 shrink-0">
              <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{currentQ.ltp.toFixed(current?.decimals ?? 2)}</span>
              <span className={clsx('text-[11px] font-medium tabular-nums', up ? 'text-green-600' : 'text-red-600')}>{up ? '+' : ''}{currentQ.chgPct?.toFixed(2)}%</span>
            </span>
          )}
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className={clsx('absolute z-40 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shadow-2xl overflow-hidden animate-fade-in', compact ? 'left-0 w-72' : 'left-0 right-0 mx-1')}>
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

          {/* List — indices and/or stocks */}
          <div className="max-h-72 overflow-y-auto">
            {list.length === 0 && stockList.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-8 px-6 text-center text-slate-400">
                <svg viewBox="0 0 24 24" className="h-7 w-7 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
                <p className="text-xs font-medium">
                  {tab === 'stocks' ? (stocksLoading ? 'Loading stocks…' : onPickSymbol ? 'No stocks available' : 'Stock F&O coming soon')
                    : tab === 'recent' ? 'No recently viewed' : 'No matches'}
                </p>
              </div>
            ) : (
              <>
                {list.map((idx) => <IndexRow key={idx.code} idx={idx} active={idx.code === value} onPick={() => pick(idx.code)} />)}
                {stockList.map((s) => <StockPickRow key={s.symbolCode} s={s} onPick={() => pickStock(s)} />)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
