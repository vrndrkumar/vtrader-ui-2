import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import type { StrategyMaster } from '@/types/strategyConfig'
import { isStrategyActive, configSymbols } from '@/types/strategyConfig'
import { getStrategy } from '@/api/strategyConfig'
import { Drawer } from '../ui/Drawer'
import { StatusBadge } from '../ui/StatusBadge'
import { JsonTree } from '../ui/JsonTree'

interface Props {
  strategy: StrategyMaster
  onClose: () => void
  onEdit: (s: StrategyMaster) => void
  onToggleActive: (s: StrategyMaster) => void
  onDelete: (s: StrategyMaster) => void
}

function fmt(d?: string) {
  if (!d) return '—'
  const dt = new Date(d.replace(' ', 'T'))
  return isNaN(dt.getTime()) ? d : dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function StrategyDetailDrawer({ strategy, onClose, onEdit, onToggleActive, onDelete }: Props) {
  // Fetch the freshest full record (list may be summarised); fall back to row.
  const [full, setFull] = useState<StrategyMaster>(strategy)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'tree' | 'raw'>('tree')

  useEffect(() => {
    let alive = true
    setLoading(true)
    getStrategy(strategy.id).then((s) => { if (alive && s) setFull(s) }).catch(() => {}).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [strategy.id])

  const active = isStrategyActive(full)
  const symbols = configSymbols(full.configData)
  const raw = JSON.stringify(full.configData ?? {}, null, 2)

  return (
    <Drawer
      title={full.strategyName}
      subtitle={full.strategyCode}
      width="max-w-2xl"
      onClose={onClose}
      headerActions={<StatusBadge status={full.status} size="md" />}
      footer={
        <div className="flex items-center gap-2 w-full">
          <button onClick={() => onToggleActive(full)} className={clsx('h-9 px-3.5 rounded-lg text-[13px] font-semibold border flex items-center gap-2',
            active ? 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
              : 'border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10')}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">{active ? <path d="M18.36 6.64A9 9 0 1120.77 15M12 2v10" /> : <path d="M5 12l5 5L20 7" />}</svg>
            {active ? 'Deactivate' : 'Activate'}
          </button>
          <button onClick={() => onDelete(full)} className="h-9 w-9 grid place-items-center rounded-lg border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" title="Delete strategy">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
          </button>
          <button onClick={() => onEdit(full)} className="ml-auto h-9 px-5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-bold shadow-sm shadow-brand-600/25 flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg>Edit
          </button>
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto">
        {/* Meta grid */}
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100 dark:border-white/[0.06]">
          <Meta label="Strategy ID" value={`#${full.id}`} />
          <Meta label="Status" node={<StatusBadge status={full.status} />} />
          <Meta label="Created" value={fmt(full.createdAt)} />
          <Meta label="Updated" value={fmt(full.updatedAt)} />
        </div>

        {/* Description */}
        <div className="p-5 border-b border-slate-100 dark:border-white/[0.06]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Description</p>
          <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">{full.description || <span className="text-slate-400 dark:text-slate-500 italic">No description provided.</span>}</p>
        </div>

        {/* Symbols */}
        {symbols.length > 0 && (
          <div className="p-5 border-b border-slate-100 dark:border-white/[0.06]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Instruments in config</p>
            <div className="flex flex-wrap gap-1.5">
              {symbols.map((s) => <span key={s} className="text-[11px] font-bold px-2 py-0.5 rounded-md text-white" style={{ background: 'linear-gradient(90deg,#3b82f6,#6366f1)' }}>{s}</span>)}
            </div>
          </div>
        )}

        {/* Config */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Configuration data</p>
            {loading && <span className="text-[10px] text-slate-400">refreshing…</span>}
            <div className="ml-auto flex items-center rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
              {(['tree', 'raw'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={clsx('h-7 px-2.5 text-[11px] font-semibold capitalize', view === v ? 'bg-brand-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5')}>{v}</button>
              ))}
            </div>
          </div>
          {view === 'tree' ? (
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] p-3 max-h-[420px] overflow-auto">
              <JsonTree data={full.configData ?? {}} />
            </div>
          ) : (
            <pre className="rounded-xl border border-white/10 bg-[#0d1424] text-slate-200 p-4 text-[12px] font-mono leading-relaxed max-h-[420px] overflow-auto">{raw}</pre>
          )}
        </div>
      </div>
    </Drawer>
  )
}

function Meta({ label, value, node }: { label: string; value?: string; node?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      {node ?? <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{value}</p>}
    </div>
  )
}
