import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { StrategyMaster } from '@/types/strategyConfig'
import { statusMeta, isStrategyActive, configSymbols, STRATEGY_STATUSES } from '@/types/strategyConfig'
import { listStrategies, deleteStrategy, setStrategyStatus } from '@/api/strategyConfig'
import { StatusBadge } from '../ui/StatusBadge'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { StrategyDetailDrawer } from './StrategyDetailDrawer'
import { StrategyFormDrawer } from './StrategyFormDrawer'

type SortKey = 'name' | 'updated' | 'status' | 'id'
type SortDir = 'asc' | 'desc'
type Confirm =
  | { kind: 'delete'; s: StrategyMaster }
  | { kind: 'activate'; s: StrategyMaster }
  | { kind: 'deactivate'; s: StrategyMaster }
  | null

export default function StrategiesMaster() {
  const [rows, setRows] = useState<StrategyMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'updated', dir: 'desc' })

  const [detail, setDetail] = useState<StrategyMaster | null>(null)
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; s?: StrategyMaster } | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows(await listStrategies()) }
    catch { setError('Could not load strategies. Check your connection and try again.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // ── Derived ────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { total: rows.length, active: 0, inactive: 0, draft: 0 }
    for (const r of rows) {
      if (isStrategyActive(r)) c.active++
      const s = String(r.status).toUpperCase()
      if (s === 'INACTIVE' || s === 'ARCHIVED') c.inactive++
      if (s === 'DRAFT') c.draft++
    }
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = rows.filter((r) => {
      if (statusFilter !== 'ALL' && String(r.status).toUpperCase() !== statusFilter) return false
      if (!q) return true
      return r.strategyName.toLowerCase().includes(q) || r.strategyCode.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => {
      switch (sort.key) {
        case 'name': return a.strategyName.localeCompare(b.strategyName) * dir
        case 'status': return String(a.status).localeCompare(String(b.status)) * dir
        case 'id': return (a.id - b.id) * dir
        default: return (new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime()) * dir
      }
    })
    return list
  }, [rows, search, statusFilter, sort])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const applyToggle = async () => {
    if (!confirm || confirm.kind === 'delete') return
    const target = confirm.kind === 'activate' ? 'PUBLISHED' : 'INACTIVE'
    setBusy(true)
    try {
      const updated = await setStrategyStatus(confirm.s, target)
      setRows((rs) => rs.map((r) => r.id === confirm.s.id ? { ...r, status: updated?.status ?? target } : r))
      setDetail((d) => d && d.id === confirm.s.id ? { ...d, status: target } : d)
      toast.success(confirm.kind === 'activate' ? 'Strategy activated' : 'Strategy deactivated')
      setConfirm(null)
    } catch { toast.error('Could not update status') }
    finally { setBusy(false) }
  }
  const applyDelete = async () => {
    if (confirm?.kind !== 'delete') return
    setBusy(true)
    try {
      await deleteStrategy(confirm.s.id)
      setRows((rs) => rs.filter((r) => r.id !== confirm.s.id))
      if (detail?.id === confirm.s.id) setDetail(null)
      toast.success('Strategy deleted')
      setConfirm(null)
    } catch {
      toast.error('Delete not permitted for this strategy')
      setConfirm(null)
    }
    finally { setBusy(false) }
  }
  const onSaved = (s: StrategyMaster) => {
    setRows((rs) => rs.some((r) => r.id === s.id) ? rs.map((r) => r.id === s.id ? { ...r, ...s } : r) : [s, ...rs])
    setForm(null)
    void load()
  }

  const hasFilters = search.trim() !== '' || statusFilter !== 'ALL'

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h2 className="text-[17px] font-black text-slate-900 dark:text-white">Strategies</h2>
            <p className="text-[12px] text-slate-400 dark:text-slate-500">{counts.total} strategies · {counts.active} active</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={load} disabled={loading} title="Refresh" className="h-9 w-9 grid place-items-center rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50">
              <svg viewBox="0 0 24 24" className={clsx('h-4 w-4', loading && 'animate-spin')} fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg>
            </button>
            <button onClick={() => setForm({ mode: 'create' })} className="h-9 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-bold shadow-sm shadow-brand-600/25 flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>New strategy
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <StatCard label="Total" value={counts.total} tone="slate" />
          <StatCard label="Active" value={counts.active} tone="emerald" />
          <StatCard label="Inactive" value={counts.inactive} tone="slate" />
          <StatCard label="Drafts" value={counts.draft} tone="amber" />
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, code or description…"
              className="w-full h-9 pl-9 pr-8 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-[13px] text-slate-800 dark:text-white placeholder-slate-400 outline-none focus:border-brand-400 dark:focus:border-brand-500" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
          </div>
          {/* Status filter */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 p-0.5 bg-white dark:bg-white/[0.03] overflow-x-auto no-scrollbar">
            {(['ALL', ...STRATEGY_STATUSES] as string[]).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={clsx('h-7 px-2.5 rounded-md text-[11.5px] font-semibold whitespace-nowrap transition-colors',
                statusFilter === s ? 'bg-brand-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5')}>
                {s === 'ALL' ? 'All' : statusMeta(s).label}
              </button>
            ))}
          </div>
          {/* Sort */}
          <SortMenu sort={sort} onChange={setSort} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
        {loading ? <SkeletonTable />
          : error ? <ErrorState onRetry={load} message={error} />
          : rows.length === 0 ? <EmptyState onCreate={() => setForm({ mode: 'create' })} />
          : filtered.length === 0 ? <NoResults onClear={() => { setSearch(''); setStatusFilter('ALL') }} filtered={hasFilters} />
          : <StrategyTable rows={filtered} onView={setDetail} onEdit={(s) => setForm({ mode: 'edit', s })}
              onToggle={(s) => setConfirm({ kind: isStrategyActive(s) ? 'deactivate' : 'activate', s })}
              onDelete={(s) => setConfirm({ kind: 'delete', s })} />}
      </div>

      {/* Drawers + dialogs */}
      {detail && <StrategyDetailDrawer strategy={detail} onClose={() => setDetail(null)}
        onEdit={(s) => { setDetail(null); setForm({ mode: 'edit', s }) }}
        onToggleActive={(s) => setConfirm({ kind: isStrategyActive(s) ? 'deactivate' : 'activate', s })}
        onDelete={(s) => setConfirm({ kind: 'delete', s })} />}
      {form && <StrategyFormDrawer mode={form.mode} strategy={form.s} onClose={() => setForm(null)} onSaved={onSaved} />}

      <ConfirmDialog
        open={confirm?.kind === 'delete'} tone="danger" busy={busy}
        title="Delete strategy?"
        message={<>This permanently removes <b className="text-slate-700 dark:text-slate-200">{confirm?.s.strategyName}</b> (<span className="font-mono">{confirm?.s.strategyCode}</span>). This cannot be undone and may be blocked if the strategy is in use.</>}
        confirmLabel="Delete" onConfirm={applyDelete} onCancel={() => setConfirm(null)} />
      <ConfirmDialog
        open={confirm?.kind === 'activate'} tone="primary" busy={busy}
        title="Activate strategy?"
        message={<>This publishes <b className="text-slate-700 dark:text-slate-200">{confirm?.s.strategyName}</b> and makes it available to users.</>}
        confirmLabel="Activate" onConfirm={applyToggle} onCancel={() => setConfirm(null)} />
      <ConfirmDialog
        open={confirm?.kind === 'deactivate'} tone="warning" busy={busy}
        title="Deactivate strategy?"
        message={<>This sets <b className="text-slate-700 dark:text-slate-200">{confirm?.s.strategyName}</b> to inactive and hides it from users. Existing subscriptions may be affected.</>}
        confirmLabel="Deactivate" onConfirm={applyToggle} onCancel={() => setConfirm(null)} />
    </div>
  )
}

// ── Table ──────────────────────────────────────────────────────────────────────
function StrategyTable({ rows, onView, onEdit, onToggle, onDelete }: {
  rows: StrategyMaster[]
  onView: (s: StrategyMaster) => void
  onEdit: (s: StrategyMaster) => void
  onToggle: (s: StrategyMaster) => void
  onDelete: (s: StrategyMaster) => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden bg-white dark:bg-white/[0.02]">
      {/* header (desktop) */}
      <div className="hidden md:grid grid-cols-[1fr_130px_180px_150px_92px] gap-3 px-4 h-10 items-center bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/[0.06] text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <span>Strategy</span><span>Status</span><span>Instruments</span><span>Updated</span><span className="text-right">Actions</span>
      </div>
      {rows.map((s) => {
        const syms = configSymbols(s.configData)
        const active = isStrategyActive(s)
        return (
          <div key={s.id} onClick={() => onView(s)}
            className="group grid grid-cols-1 md:grid-cols-[1fr_130px_180px_150px_92px] gap-2 md:gap-3 px-4 py-3 items-center border-b border-slate-100 dark:border-white/[0.04] last:border-0 hover:bg-slate-50/70 dark:hover:bg-white/[0.03] cursor-pointer transition-colors">
            {/* name + code */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-bold text-slate-800 dark:text-white truncate">{s.strategyName}</span>
                <span className="md:hidden"><StatusBadge status={s.status} /></span>
              </div>
              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">{s.strategyCode}</span>
            </div>
            <div className="hidden md:block"><StatusBadge status={s.status} /></div>
            <div className="hidden md:flex flex-wrap gap-1 min-w-0">
              {syms.slice(0, 3).map((x) => <span key={x} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-300">{x}</span>)}
              {syms.length > 3 && <span className="text-[10px] text-slate-400">+{syms.length - 3}</span>}
              {syms.length === 0 && <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>}
            </div>
            <div className="hidden md:block text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">{relTime(s.updatedAt)}</div>
            {/* actions */}
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <IconAction title="View" onClick={() => onView(s)}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></IconAction>
              <IconAction title="Edit" onClick={() => onEdit(s)}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></IconAction>
              <RowMenu active={active} onToggle={() => onToggle(s)} onDelete={() => onDelete(s)} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function IconAction({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-600 dark:hover:text-slate-200">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">{children}</svg>
    </button>
  )
}

function RowMenu({ active, onToggle, onDelete }: { active: boolean; onToggle: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-600 dark:hover:text-slate-200">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0e1526] shadow-xl py-1">
          <button onClick={() => { setOpen(false); onToggle() }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">{active ? <path d="M18.36 6.64A9 9 0 1120.77 15M12 2v10" /> : <path d="M5 12l5 5L20 7" />}</svg>
            {active ? 'Deactivate' : 'Activate'}
          </button>
          <div className="my-1 h-px bg-slate-100 dark:bg-white/[0.06]" />
          <button onClick={() => { setOpen(false); onDelete() }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

function SortMenu({ sort, onChange }: { sort: { key: SortKey; dir: SortDir }; onChange: (s: { key: SortKey; dir: SortDir }) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const opts: [SortKey, string][] = [['updated', 'Last updated'], ['name', 'Name'], ['status', 'Status'], ['id', 'ID']]
  const label = opts.find(([k]) => k === sort.key)?.[1] ?? 'Sort'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="h-9 px-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-[12.5px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M7 12h10M11 18h2" /></svg>
        {label}
        <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5 transition-transform', sort.dir === 'asc' && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0e1526] shadow-xl py-1">
          {opts.map(([k, l]) => (
            <button key={k} onClick={() => { onChange({ key: k, dir: sort.key === k && sort.dir === 'desc' ? 'asc' : 'desc' }); setOpen(false) }}
              className={clsx('w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-white/5', sort.key === k ? 'text-brand-600 dark:text-brand-400' : 'text-slate-600 dark:text-slate-300')}>
              {l}{sort.key === k && <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5', sort.dir === 'asc' && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── States ─────────────────────────────────────────────────────────────────────
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
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0">
          <div className="flex-1 space-y-2"><div className="h-3.5 w-48 rounded bg-slate-200 dark:bg-white/[0.06] animate-pulse" /><div className="h-2.5 w-28 rounded bg-slate-100 dark:bg-white/[0.04] animate-pulse" /></div>
          <div className="h-5 w-20 rounded-full bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
          <div className="h-3 w-24 rounded bg-slate-100 dark:bg-white/[0.04] animate-pulse hidden md:block" />
          <div className="h-8 w-20 rounded bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-14 w-14 rounded-2xl grid place-items-center bg-brand-50 dark:bg-brand-500/10 text-brand-500 mb-4">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.75"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
      </div>
      <h3 className="text-[15px] font-bold text-slate-800 dark:text-white">No strategies yet</h3>
      <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1 max-w-xs">Create your first master strategy to start managing algo configurations.</p>
      <button onClick={onCreate} className="mt-5 h-9 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-bold flex items-center gap-2"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>New strategy</button>
    </div>
  )
}

function NoResults({ onClear }: { onClear: () => void; filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-12 w-12 rounded-2xl grid place-items-center bg-slate-100 dark:bg-white/[0.05] text-slate-400 mb-3">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      </div>
      <h3 className="text-[14px] font-bold text-slate-700 dark:text-slate-200">No matching strategies</h3>
      <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1">Try a different search term or clear the filters.</p>
      <button onClick={onClear} className="mt-4 text-[13px] font-semibold text-brand-600 dark:text-brand-400 hover:underline">Clear filters</button>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-12 w-12 rounded-2xl grid place-items-center bg-red-50 dark:bg-red-500/10 text-red-500 mb-3">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
      </div>
      <h3 className="text-[14px] font-bold text-slate-700 dark:text-slate-200">Something went wrong</h3>
      <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1 max-w-xs">{message}</p>
      <button onClick={onRetry} className="mt-4 h-9 px-4 rounded-lg border border-slate-200 dark:border-white/10 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5">Retry</button>
    </div>
  )
}

// relative time helper
function relTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  if (isNaN(d.getTime())) return iso
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24); if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
