import { useCallback, useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import type { UserBroker } from '@/types/broker'
import { getAdminBrokers } from '@/api/broker'
import { brokerStatusMeta, isApproved, brokerDisplay } from './brokerStatus'
import { BrokerReviewDrawer } from './BrokerReviewDrawer'

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
const norm = (s: string | null | undefined) => (String(s ?? '').toUpperCase() || 'PENDING')

export default function BrokersMaster() {
  const [rows, setRows] = useState<UserBroker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [review, setReview] = useState<UserBroker | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows(await getAdminBrokers()) }
    catch { setError('Could not load user brokers. Check your connection and try again.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const counts = useMemo(() => {
    const c = { total: rows.length, approved: 0, pending: 0, active: 0 }
    for (const r of rows) {
      if (isApproved(r)) c.approved++
      if (norm(r.status) === 'PENDING') c.pending++
      if (r.isActive) c.active++
    }
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && norm(r.status) !== statusFilter) return false
      if (!q) return true
      return brokerDisplay(r).toLowerCase().includes(q) || r.brokerName.toLowerCase().includes(q)
        || String(r.userId).includes(q) || (r.brokerInfo?.userId ?? '').toLowerCase().includes(q)
    })
  }, [rows, search, statusFilter])

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h2 className="text-[17px] font-black text-slate-900 dark:text-white">User Brokers</h2>
            <p className="text-[12px] text-slate-400 dark:text-slate-500">{counts.total} brokers · {counts.pending} awaiting approval</p>
          </div>
          <button onClick={load} disabled={loading} title="Refresh" className="ml-auto h-9 w-9 grid place-items-center rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50">
            <svg viewBox="0 0 24 24" className={clsx('h-4 w-4', loading && 'animate-spin')} fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <StatCard label="Total" value={counts.total} tone="slate" />
          <StatCard label="Approved" value={counts.approved} tone="emerald" />
          <StatCard label="Pending" value={counts.pending} tone="amber" />
          <StatCard label="Active" value={counts.active} tone="slate" />
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by broker, display name or user…"
              className="w-full h-9 pl-9 pr-8 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-[13px] text-slate-800 dark:text-white placeholder-slate-400 outline-none focus:border-brand-400" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 p-0.5 bg-white dark:bg-white/[0.03]">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as StatusFilter[]).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={clsx('h-7 px-2.5 rounded-md text-[11.5px] font-semibold whitespace-nowrap transition-colors',
                statusFilter === s ? 'bg-brand-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5')}>
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
        {loading ? <SkeletonTable />
          : error ? <ErrorState onRetry={load} message={error} />
          : rows.length === 0 ? <EmptyState />
          : filtered.length === 0 ? <NoResults onClear={() => { setSearch(''); setStatusFilter('ALL') }} />
          : <BrokerTable rows={filtered} onReview={setReview} />}
      </div>

      {review && <BrokerReviewDrawer broker={review} onClose={() => setReview(null)} onDone={() => { setReview(null); void load() }} />}
    </div>
  )
}

const COLS = 'md:grid-cols-[minmax(0,1fr)_128px_minmax(0,220px)_96px_108px]'
const AVATAR: Record<string, string> = {
  FINVASIA: 'from-blue-500 to-indigo-600', ANGELONE: 'from-orange-500 to-amber-600',
  ZERODHA: 'from-teal-500 to-emerald-600', UPSTOX: 'from-purple-500 to-fuchsia-600',
  DHAN: 'from-sky-500 to-blue-600', FYERS: 'from-violet-500 to-purple-600',
  DELTA: 'from-amber-500 to-orange-600', DEFAULT: 'from-slate-500 to-slate-600',
}
function avatarFor(name: string) {
  const key = Object.keys(AVATAR).find((k) => k !== 'DEFAULT' && name.toUpperCase().includes(k)) ?? 'DEFAULT'
  const initials = name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'BR'
  return { grad: AVATAR[key], initials }
}

function BrokerTable({ rows, onReview }: { rows: UserBroker[]; onReview: (b: UserBroker) => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.07] overflow-hidden bg-white dark:bg-white/[0.02] shadow-sm">
      <div className={clsx('hidden md:grid gap-4 px-4 h-11 items-center bg-slate-50/80 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500', COLS)}>
        <span>Broker</span><span>Status</span><span>IP whitelisting</span><span>Active</span><span className="text-right">Action</span>
      </div>
      {rows.map((b) => {
        const sm = brokerStatusMeta(b.status)
        const av = avatarFor(b.brokerName)
        const ipFull = b.brokerInfo?.IPAddress ? `${b.brokerInfo.ipType ? b.brokerInfo.ipType + ' · ' : ''}${b.brokerInfo.IPAddress}` : ''
        return (
          <div key={b.id} onClick={() => onReview(b)}
            className={clsx('group grid grid-cols-1 gap-2 md:gap-4 px-4 py-3 items-center border-b border-slate-100 dark:border-white/[0.04] last:border-0 hover:bg-slate-50/70 dark:hover:bg-white/[0.03] cursor-pointer transition-colors', COLS)}>
            {/* Broker + avatar */}
            <div className="flex items-center gap-3 min-w-0">
              <span className={clsx('h-9 w-9 shrink-0 rounded-xl grid place-items-center text-white text-[11px] font-black bg-gradient-to-br shadow-sm', av.grad)}>{av.initials}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold text-slate-800 dark:text-white truncate">{brokerDisplay(b)}</span>
                  <span className={clsx('md:hidden inline-flex items-center gap-1.5 rounded-full border text-[10px] font-semibold px-2 py-0.5', sm.badge)}><span className={clsx('h-1.5 w-1.5 rounded-full', sm.dot)} />{sm.label}</span>
                </div>
                <span className="block text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate">{b.brokerName} · user #{b.userId}{b.brokerInfo?.loginSource ? ` · ${b.brokerInfo.loginSource}` : ''}</span>
              </div>
            </div>
            {/* Status */}
            <div className="hidden md:block"><span className={clsx('inline-flex items-center gap-1.5 rounded-full border text-[10px] font-semibold px-2 py-0.5', sm.badge)}><span className={clsx('h-1.5 w-1.5 rounded-full', sm.dot)} />{sm.label}</span></div>
            {/* IP */}
            <div className="hidden md:flex min-w-0">
              {ipFull
                ? <span title={ipFull} className="inline-block max-w-full truncate text-[11px] font-mono px-2 py-1 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300">{ipFull}</span>
                : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Not set</span>}
            </div>
            {/* Active */}
            <div className="hidden md:block">
              <span className={clsx('inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border',
                b.isActive ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25'
                  : 'text-slate-500 bg-slate-100 dark:bg-white/[0.05] border-slate-200 dark:border-white/10')}>
                <span className={clsx('h-1.5 w-1.5 rounded-full', b.isActive ? 'bg-emerald-500' : 'bg-slate-400')} />{b.isActive ? 'Active' : 'Off'}
              </span>
            </div>
            {/* Action */}
            <div className="flex md:justify-end" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => onReview(b)} className={clsx('h-8 px-3.5 rounded-lg text-[12px] font-bold transition-all active:scale-[0.97]', isApproved(b)
                ? 'border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/25')}>
                {isApproved(b) ? 'Manage' : 'Review'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'amber' }) {
  const c = tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-white'
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className={clsx('text-[22px] font-black tabular-nums leading-tight mt-0.5', c)}>{value}</p>
    </div>
  )
}

function SkeletonTable() {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0">
          <div className="flex-1 space-y-2"><div className="h-3.5 w-48 rounded bg-slate-200 dark:bg-white/[0.06] animate-pulse" /><div className="h-2.5 w-32 rounded bg-slate-100 dark:bg-white/[0.04] animate-pulse" /></div>
          <div className="h-5 w-20 rounded-full bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
          <div className="h-8 w-20 rounded bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
        </div>
      ))}
    </div>
  )
}
function EmptyState() {
  return <div className="flex flex-col items-center justify-center py-24 text-center"><h3 className="text-[15px] font-bold text-slate-800 dark:text-white">No user brokers</h3><p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1">Nothing to review yet.</p></div>
}
function NoResults({ onClear }: { onClear: () => void }) {
  return <div className="flex flex-col items-center justify-center py-24 text-center"><h3 className="text-[14px] font-bold text-slate-700 dark:text-slate-200">No matching brokers</h3><button onClick={onClear} className="mt-3 text-[13px] font-semibold text-brand-600 dark:text-brand-400 hover:underline">Clear filters</button></div>
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex flex-col items-center justify-center py-24 text-center"><h3 className="text-[14px] font-bold text-slate-700 dark:text-slate-200">Something went wrong</h3><p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1 max-w-xs">{message}</p><button onClick={onRetry} className="mt-4 h-9 px-4 rounded-lg border border-slate-200 dark:border-white/10 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5">Retry</button></div>
}
