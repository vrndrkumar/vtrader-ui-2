import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { getTrades } from '@/api/reports'
import type { Trade } from '@/types/reports'
import { getAllTags } from '@/api/tags'
import type { UserTag } from '@/api/tags'
import { useJournalStore } from './journalStore'
import { useStrategyLabel, registerKnownGroups } from './useStrategies'
import { JournalFilters } from './JournalFilters'
import { TradeReviewDrawer } from './TradeReviewDrawer'
import { AddStandaloneOrderModal } from './OrderModals'
import { applyFilters, defaultFilters, type Filters } from './filters'
import { fmtPnl, fmtDate, fmtDuration, parseInstrument, INSTRUMENT_META, REVIEW_META, strategyBadgeCls } from './utils'
import { TagChip } from './TagCombobox'
import { BulkActionBar } from './BulkActionBar'

const pnlOf = (t: Trade) => (t.realized_pnl ?? 0) + (t.unrealized_pnl ?? 0)
const PAGE_SIZES = [25, 50, 100]

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: 'green' | 'red' }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={clsx('text-2xl font-bold tabular-nums mt-0.5', tone === 'green' ? 'text-green-600' : tone === 'red' ? 'text-red-600' : 'text-slate-900 dark:text-white')}>{value}</p>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  )
}

function Pager({ page, pages, size, total, onPage, onSize }: { page: number; pages: number; size: number; total: number; onPage: (p: number) => void; onSize: (s: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(page * size, total)
  const nums: number[] = []
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p)
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-sm">
      <div className="flex items-center gap-2 text-slate-500">
        <span>{from}–{to} of {total}</span>
        <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="h-8 px-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 text-xs outline-none">
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5">Prev</button>
        {nums[0] > 1 && <span className="px-1 text-slate-400">…</span>}
        {nums.map((n) => <button key={n} onClick={() => onPage(n)} className={clsx('h-8 w-8 rounded-lg text-xs font-medium', n === page ? 'bg-brand-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5')}>{n}</button>)}
        {nums[nums.length - 1] < pages && <span className="px-1 text-slate-400">…</span>}
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5">Next</button>
      </div>
    </div>
  )
}

export default function JournalPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Trade | null>(null)
  const [sortKey, setSortKey] = useState<'date' | 'pnl'>('date')
  const [dir, setDir] = useState(-1)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)
  const [syncedAt, setSyncedAt] = useState<Date | null>(null)
  const [addingOrder, setAddingOrder] = useState(false)
  const [allTags, setAllTags] = useState<UserTag[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const entries = useJournalStore((s) => s.entries)
  const strategyLabel = useStrategyLabel()
  const reviewOf = (id: string) => entries[id]?.reviewStatus ?? 'NEW'

  useEffect(() => { getAllTags().then(setAllTags).catch(() => {}) }, [])

  const fetchTrades = () => {
    setLoading(true)
    getTrades({ fromDate: filters.from, toDate: filters.to })
      .then((data) => { setTrades(data); registerKnownGroups(data.map((t) => t.group_name).filter(Boolean)) })
      .catch(() => setTrades([]))
      .finally(() => { setLoading(false); setSyncedAt(new Date()) })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTrades() }, [filters.from, filters.to])

  const filtered = useMemo(() => applyFilters(trades, filters, reviewOf, (id) => entries[id]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trades, filters, entries])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => sortKey === 'pnl'
      ? dir * (pnlOf(a) - pnlOf(b))
      : dir * (new Date(a.first_placed_time).getTime() - new Date(b.first_placed_time).getTime()))
    return arr
  }, [filtered, sortKey, dir])

  const stats = useMemo(() => {
    const net = filtered.reduce((a, t) => a + pnlOf(t), 0)
    const closed = filtered.filter((t) => t.status === 'CLOSED')
    const wins = closed.filter((t) => pnlOf(t) > 0)
    const losses = closed.filter((t) => pnlOf(t) < 0)
    const gp = wins.reduce((a, t) => a + pnlOf(t), 0)
    const gl = Math.abs(losses.reduce((a, t) => a + pnlOf(t), 0))
    const reviewed = filtered.filter((t) => reviewOf(t.trade_id) !== 'NEW').length
    return { net, count: filtered.length, wins: wins.length, losses: losses.length, winRate: closed.length ? (wins.length / closed.length) * 100 : 0, pf: gl ? gp / gl : gp > 0 ? Infinity : 0, reviewed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, entries])

  const brokers = useMemo(() => [...new Set(trades.map((t) => t.broker_name).filter(Boolean))], [trades])
  // tagOptions: all server-side user tags (from GET /tags), refreshed once on mount
  const tagOptions = allTags

  const pages = Math.max(1, Math.ceil(sorted.length / size))
  const cur = Math.min(page, pages)
  const slice = sorted.slice((cur - 1) * size, cur * size)
  const changeFilters = (f: Filters) => { setFilters(f); setPage(1); setSelectedIds(new Set()) }
  const sortBy = (k: 'date' | 'pnl') => { if (sortKey === k) setDir((d) => -d); else { setSortKey(k); setDir(-1) } }

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const pageIds = slice.map((t) => t.trade_id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const somePageSelected = pageIds.some((id) => selectedIds.has(id)) && !allPageSelected
  const toggleSelectPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  const selectedTrades = useMemo(() => sorted.filter((t) => selectedIds.has(t.trade_id)), [sorted, selectedIds])

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-surface-dark">
      <div className="max-w-7xl mx-auto px-6 pb-8">
        <div className="pt-6 mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trade Journal</h1>
            <p className="text-sm text-slate-500">Review, annotate and learn from every trade.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {syncedAt && <span className="text-[11px] text-slate-400 hidden sm:block">Synced {syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
            <button onClick={fetchTrades} disabled={loading} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:border-slate-300 disabled:opacity-60">
              <svg viewBox="0 0 24 24" className={clsx('h-4 w-4', loading && 'animate-spin')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" /></svg>
              {loading ? 'Syncing…' : 'Sync'}
            </button>
            <button onClick={() => setAddingOrder(true)} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              Add order
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <StatCard label="Net P&L" value={fmtPnl(stats.net)} tone={stats.net >= 0 ? 'green' : 'red'} sub={`${stats.count} trades`} />
          <StatCard label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} sub={<span><span className="text-green-600">{stats.wins}W</span> · <span className="text-red-600">{stats.losses}L</span></span>} />
          <StatCard label="Profit Factor" value={stats.pf === Infinity ? '∞' : stats.pf.toFixed(2)} />
          <StatCard label="Trades" value={String(stats.count)} />
          <StatCard label="Reviewed" value={`${stats.reviewed}/${stats.count}`} />
        </div>

        <JournalFilters filters={filters} onChange={changeFilters} brokers={brokers} tagOptions={tagOptions} />

        {/* Table */}
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-white/[0.03] text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="w-1" />
                  <th className="w-10 pl-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = somePageSelected }}
                      onChange={toggleSelectPage}
                      className="h-3.5 w-3.5 rounded cursor-pointer accent-brand-500"
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Symbol</th>
                  <th className="text-left font-medium px-3 py-2.5">Strategy</th>
                  <th className="text-left font-medium px-3 py-2.5">Broker</th>
                  <th className="text-right font-medium px-3 py-2.5">Qty</th>
                  <th className="text-right font-medium px-3 py-2.5 cursor-pointer select-none" onClick={() => sortBy('pnl')}>P&L {sortKey === 'pnl' ? (dir < 0 ? '↓' : '↑') : ''}</th>
                  <th className="text-left font-medium px-3 py-2.5">Duration</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-left font-medium px-3 py-2.5 cursor-pointer select-none" onClick={() => sortBy('date')}>Date {sortKey === 'date' ? (dir < 0 ? '↓' : '↑') : ''}</th>
                  <th className="text-left font-medium px-3 py-2.5">Journal</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="px-4 py-12 text-center text-slate-400">Loading trades…</td></tr>
                ) : slice.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center">
                      {trades.length === 0 ? (
                        /* True empty — no trades at all */
                        <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
                          <div className="h-14 w-14 rounded-2xl bg-brand-50 dark:bg-brand-900/20 grid place-items-center">
                            <svg viewBox="0 0 24 24" className="h-7 w-7 text-brand-500" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
                          </div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No trades yet</p>
                          <p className="text-xs text-slate-400 text-center">Your journal is empty. Add a manual order or sync your broker trades to get started.</p>
                          <button onClick={() => setAddingOrder(true)} className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white mt-1">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                            Add your first order
                          </button>
                        </div>
                      ) : (
                        /* Filters active — no matches */
                        <p className="text-sm text-slate-400">No trades match these filters.</p>
                      )}
                    </td>
                  </tr>
                ) : slice.map((t) => {
                  const pnl = pnlOf(t)
                  const win = pnl >= 0
                  const ins = parseInstrument(t.symbol_name)
                  const im = INSTRUMENT_META[ins.kind]
                  const rs = reviewOf(t.trade_id)
                  const e = entries[t.trade_id]
                  const isSelected = selectedIds.has(t.trade_id)
                  return (
                    <tr
                      key={t.trade_id}
                      onClick={() => setSelected(t)}
                      className={clsx(
                        'border-t border-slate-100 dark:border-slate-800 cursor-pointer group',
                        isSelected
                          ? 'bg-brand-50/60 dark:bg-brand-900/10 hover:bg-brand-50 dark:hover:bg-brand-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-white/5',
                      )}
                    >
                      <td className={clsx('w-1 p-0', win ? 'bg-green-500' : 'bg-red-500')} />
                      <td
                        className="w-10 pl-3 py-2.5"
                        onClick={(e) => { e.stopPropagation(); toggleSelect(t.trade_id) }}
                      >
                        <div className={clsx(
                          'h-3.5 w-3.5 rounded border-2 flex items-center justify-center transition-all',
                          isSelected
                            ? 'bg-brand-500 border-brand-500'
                            : 'border-slate-300 dark:border-slate-600 opacity-0 group-hover:opacity-100',
                        )}>
                          {isSelected && (
                            <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                              <path d="M1.5 5.5l2.5 2.5 5-5" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-bold', im.cls)}>{im.label}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-slate-100 leading-tight">{ins.underlying}{ins.strike ? ` ${ins.strike}` : ''}</p>
                            <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{t.symbol_name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><span className={clsx('inline-block px-2 py-0.5 rounded-md text-[11px] font-medium', strategyBadgeCls(t.group_name))}>{strategyLabel(t.group_name)}</span></td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500">{t.broker_name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{t.total_quantity}</td>
                      <td className={clsx('px-3 py-2.5 text-right tabular-nums font-bold', win ? 'text-green-600' : 'text-red-600')}>{fmtPnl(pnl)}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500">{fmtDuration(t.first_placed_time, t.last_updated_time)}</td>
                      <td className="px-3 py-2.5"><span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded', t.status !== 'CLOSED' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20' : 'bg-slate-100 text-slate-500 dark:bg-white/10')}>{t.status}</span></td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">{fmtDate(t.first_placed_time)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={clsx('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded', REVIEW_META[rs].cls)}><span className={clsx('h-1.5 w-1.5 rounded-full', REVIEW_META[rs].dot)} />{REVIEW_META[rs].label}</span>
                          {e?.notes?.trim() && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Has notes"><path d="M4 5h16M4 12h16M4 19h10" /></svg>}
                          {(e?.rating ?? 0) > 0 && <span className="text-[10px] text-amber-400">★{e!.rating}</span>}
                          {(t.tags ?? []).map((tag) => (
                            <TagChip key={tag.name} name={tag.name} color={tag.metadata.colorCode} size="sm" />
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={cur} pages={pages} size={size} total={sorted.length} onPage={setPage} onSize={(s) => { setSize(s); setPage(1) }} />
        </div>
      </div>

      {selected && <TradeReviewDrawer trade={selected} allTags={allTags} onClose={() => setSelected(null)} onChanged={fetchTrades} />}
      {addingOrder && <AddStandaloneOrderModal onClose={() => setAddingOrder(false)} onSaved={() => { setAddingOrder(false); fetchTrades() }} />}

      <BulkActionBar
        count={selectedIds.size}
        trades={selectedTrades}
        allTags={allTags}
        onClear={() => setSelectedIds(new Set())}
        onDone={fetchTrades}
      />
    </div>
  )
}
