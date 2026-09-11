// ── Scheduled-basket manager ─────────────────────────────────────────────────
// Floating launcher + panel listing the user's live scheduled baskets with their
// entry/exit triggers, status, and edit / delete (lifecycle-aware).

import { useState } from 'react'
import { clsx } from 'clsx'
import { useScheduledBasketStore } from '@/trade/store/scheduledBasketStore'
import { useMarketStore } from '@/trade/store/marketStore'
import type { ScheduledBasket } from '@/api/scheduledBaskets'

const fmtTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')
const px = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ScheduledBasketManager() {
  const { baskets, managerOpen, setManagerOpen, openEdit, cancel } = useScheduledBasketStore()
  if (!managerOpen) return null // launcher lives in the LauncherDock; this renders the panel only

  return (
    <>
      {managerOpen && (
        <div className="fixed left-4 bottom-4 z-[60] w-[360px] max-h-[72vh] rounded-2xl bg-white dark:bg-card-dark shadow-2xl ring-1 ring-black/5 dark:ring-white/10 flex flex-col animate-slide-up overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 grid place-items-center rounded-md bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              </span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Scheduled baskets</span>
              <span className="grid place-items-center h-5 min-w-5 px-1.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-300 text-[11px]">{baskets.length}</span>
            </div>
            <button onClick={() => setManagerOpen(false)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2.5">
            {baskets.length === 0 && <p className="text-center text-xs text-slate-400 py-8">No scheduled baskets.</p>}
            {baskets.map((b) => <Card key={b.id} b={b} onEdit={() => openEdit(b)} onCancel={() => cancel(b.id)} />)}
          </div>
        </div>
      )}
    </>
  )
}

function Chip({ tone, children }: { tone: 'up' | 'down' | 'time' | 'muted'; children: React.ReactNode }) {
  const cls = tone === 'up' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    : tone === 'down' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
      : tone === 'time' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
        : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
  return <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', cls)}>{children}</span>
}

function Card({ b, onEdit, onCancel }: { b: ScheduledBasket; onEdit: () => void; onCancel: () => void }) {
  const [armed, setArmed] = useState(false)
  const idxLtp = useMarketStore((s) => s.quotes[b.indexName]?.ltp)
  const entered = b.status === 'ENTERED'
  const hasExit = b.exitIndexLevel != null || b.exitTime != null

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-white/[0.02]">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{b.name || `${b.indexName} basket`}</p>
          <p className="text-[10px] text-slate-400">{b.indexName}{idxLtp != null ? ` ${px(idxLtp)}` : ''} · {b.legs.length} legs · {b.brokers.length} broker{b.brokers.length > 1 ? 's' : ''}</p>
        </div>
        <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0',
          entered ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
          {entered ? 'In position' : 'Waiting entry'}
        </span>
      </div>

      {/* Entry */}
      <div className="mt-2">
        <p className="text-[9px] uppercase tracking-wide text-slate-400 mb-0.5">Entry {entered && b.entryFiredBy ? `· fired on ${b.entryFiredBy}` : ''}</p>
        <div className="flex flex-wrap gap-1">
          {b.entryIndexLevel != null && <Chip tone={b.entryIndexDir === 'ABOVE' ? 'up' : 'down'}>{b.indexName} {b.entryIndexDir === 'ABOVE' ? '↑' : '↓'} {px(b.entryIndexLevel)}</Chip>}
          {b.entryTime && <Chip tone="time">⏱ {fmtTime(b.entryTime)}</Chip>}
        </div>
      </div>

      {/* Exit */}
      {hasExit && (
        <div className="mt-1.5">
          <p className="text-[9px] uppercase tracking-wide text-slate-400 mb-0.5">Exit · reverse (MKT)</p>
          <div className="flex flex-wrap gap-1">
            {b.exitIndexLevel != null && <Chip tone={b.exitIndexDir === 'ABOVE' ? 'up' : 'down'}>{b.indexName} {b.exitIndexDir === 'ABOVE' ? '↑' : '↓'} {px(b.exitIndexLevel)}</Chip>}
            {b.exitTime && <Chip tone="time">⏱ {fmtTime(b.exitTime)}</Chip>}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-2.5">
        <button onClick={onEdit} className="flex-1 h-8 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/40 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition active:scale-95">
          {entered ? 'Edit exit' : 'Edit'}
        </button>
        <button onMouseLeave={() => setArmed(false)} onClick={() => (armed ? onCancel() : setArmed(true))}
          className={clsx('flex-1 h-8 rounded-lg text-xs font-semibold transition active:scale-95',
            armed ? 'bg-red-600 text-white ring-2 ring-red-300 dark:ring-red-800' : 'text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/20')}>
          {armed ? 'Confirm' : entered ? 'Remove exit' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
