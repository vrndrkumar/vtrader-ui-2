// ── Combined-protect manager ─────────────────────────────────────────────────
// Floating launcher + panel that shows the user's currently running group
// protects with LIVE combined P&L, the armed triggers, and edit / cancel.

import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { useGroupMonitorStore, combinedRunningPnl } from '@/trade/store/groupMonitorStore'
import { useMarketStore } from '@/trade/store/marketStore'
import { useTradebookStore } from '../tradebook/tradebookStore'
import { totalPnl } from '../tradebook/types'
import { realtime } from '@/trade/data/realtime/realtimeService'
import type { GroupMonitor } from '@/api/groupMonitors'
import { inr, pnlCls, px } from '../tradebook/format'

export function GroupManager() {
  const { groups, managerOpen, setManagerOpen, openEdit, cancel } = useGroupMonitorStore()
  const quotes = useMarketStore((s) => s.quotes)

  // Subscribe every leg symbol across all active groups so live P&L stays correct
  // even when the group's positions aren't in the current broker filter.
  const allSymsKey = useMemo(
    () => [...new Set(groups.flatMap((g) => g.legs.map((l) => l.symbolName)))].filter(Boolean).join(','),
    [groups],
  )
  useEffect(() => {
    if (!allSymsKey) return
    realtime.start()
    const unsubs = allSymsKey.split(',').map((s) => realtime.subscribeSymbolTick(s, { prime: false }))
    return () => unsubs.forEach((u) => u())
  }, [allSymsKey])

  // Running P&L per live position (realized + live unrealized) + seed fallback.
  const positions = useTradebookStore((s) => s.positions)
  const { netMap, seedMap } = useMemo(() => {
    const netMap: Record<string, number> = {}
    const seedMap: Record<string, number> = {}
    for (const p of positions) {
      if (!p.symbol) continue
      const liveLtp = quotes[p.symbol]?.ltp ?? p.ltp
      if (p.ltp) seedMap[p.symbol] = p.ltp
      netMap[`${p.symbol}|${p.brokerLabel}`] = totalPnl({ ...p, ltp: liveLtp })
    }
    return { netMap, seedMap }
  }, [positions, quotes])

  const livePnl = (g: GroupMonitor) => combinedRunningPnl(g.legs, netMap, (sym) => quotes[sym]?.ltp ?? seedMap[sym])

  if (!managerOpen) return null // launcher lives in the LauncherDock; this renders the panel only

  return (
    <>
      {/* Panel */}
      {managerOpen && (
        <div className="fixed left-4 bottom-4 z-[60] w-[340px] max-h-[70vh] rounded-2xl bg-white dark:bg-card-dark shadow-2xl ring-1 ring-black/5 dark:ring-white/10 flex flex-col animate-slide-up overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 grid place-items-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" /></svg>
              </span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Combined protects</span>
              <span className="grid place-items-center h-5 min-w-5 px-1.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-300 text-[11px]">{groups.length}</span>
            </div>
            <button onClick={() => setManagerOpen(false)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-2.5">
            {groups.length === 0 && <p className="text-center text-xs text-slate-400 py-8">No active protects.</p>}
            {groups.map((g) => (
              <GroupCard key={g.id} g={g} pnl={livePnl(g)} onEdit={() => openEdit(g)} onCancel={() => cancel(g.id)} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function Chip({ tone, children }: { tone: 'amber' | 'green' | 'slate'; children: React.ReactNode }) {
  const cls = tone === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    : tone === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
  return <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', cls)}>{children}</span>
}

function GroupCard({ g, pnl, onEdit, onCancel }: { g: GroupMonitor; pnl: number; onEdit: () => void; onCancel: () => void }) {
  const [armed, setArmed] = useState(false)
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-white/[0.02]">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{g.name || `${g.indexName} protect`}</p>
          <p className="text-[10px] text-slate-400">{g.indexName} · {g.legs.length} position{g.legs.length > 1 ? 's' : ''}</p>
        </div>
        <div className="text-right shrink-0 pl-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-400">Running P&L</p>
          <p className={clsx('text-base font-extrabold tabular-nums leading-tight', pnlCls(pnl))}>{inr(pnl, true)}</p>
        </div>
      </div>

      {/* Armed triggers (absolute levels on running P&L) */}
      <div className="flex flex-wrap gap-1 mt-2">
        {g.pnlSl != null && <Chip tone="amber">P&L ≤ {inr(g.pnlSl)}</Chip>}
        {g.pnlTarget != null && <Chip tone="green">P&L ≥ {inr(g.pnlTarget)}</Chip>}
        {g.indexSl != null && <Chip tone="amber">{g.indexName} ≤ {px(g.indexSl)}</Chip>}
        {g.indexTarget != null && <Chip tone="green">{g.indexName} ≥ {px(g.indexTarget)}</Chip>}
        {g.timeStop && <Chip tone="slate">⏱ {new Date(g.timeStop).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Chip>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-2.5">
        <button onClick={onEdit} className="flex-1 h-8 rounded-lg text-xs font-semibold text-violet-600 dark:text-violet-300 border border-violet-200 dark:border-violet-900/40 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition active:scale-95">Edit</button>
        <button onMouseLeave={() => setArmed(false)} onClick={() => (armed ? onCancel() : setArmed(true))}
          className={clsx('flex-1 h-8 rounded-lg text-xs font-semibold transition active:scale-95',
            armed ? 'bg-red-600 text-white ring-2 ring-red-300 dark:ring-red-800' : 'text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/20')}>
          {armed ? 'Confirm' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
