import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { StrategySelect } from './StrategySelect'
import {
  DATE_PRESETS, activeCount, defaultFilters, presetRange, loadPresets, savePresets, rehydratePreset,
  type Filters, type SavedPreset,
} from './filters'

const inp = 'h-9 px-2.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-brand-400'
const lbl = 'text-[11px] font-medium text-slate-400 mb-1 block'

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-white/5">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={clsx('flex-1 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap', value === o.v ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500')}>{o.l}</button>
      ))}
    </div>
  )
}

const chevron = <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>

/** Single "Date" control — button + preset menu, closes on outside-click / Escape. */
function DatePopover({ filters, patch, setPreset }: { filters: Filters; patch: (p: Partial<Filters>) => void; setPreset: (id: Filters['datePreset']) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  const label = DATE_PRESETS.find((p) => p.id === filters.datePreset)?.label ?? 'Date'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border border-brand-300 text-brand-600 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-700">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
        <span>{label}</span>{chevron}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-56 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shadow-xl animate-fade-in">
          {DATE_PRESETS.map((p) => (
            <button key={p.id} onClick={() => { setPreset(p.id); if (p.id !== 'custom') setOpen(false) }} className={clsx('w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm text-left', filters.datePreset === p.id ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5')}>
              {p.label}
              {filters.datePreset === p.id && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>}
            </button>
          ))}
          {filters.datePreset === 'custom' && (
            <div className="mt-1 p-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
              <label className="block"><span className={lbl}>From</span><input type="date" value={filters.from} onChange={(e) => patch({ from: e.target.value })} className={clsx(inp, 'w-full')} /></label>
              <label className="block"><span className={lbl}>To</span><input type="date" value={filters.to} onChange={(e) => patch({ to: e.target.value })} className={clsx(inp, 'w-full')} /></label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function JournalFilters({ filters, onChange, brokers, tagOptions }: {
  filters: Filters; onChange: (f: Filters) => void; brokers: string[]; tagOptions: string[]
}) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<SavedPreset[]>(loadPresets)
  const patch = (p: Partial<Filters>) => onChange({ ...filters, ...p })
  const setPreset = (id: Filters['datePreset']) => { const r = presetRange(id); patch(r ? { datePreset: id, ...r } : { datePreset: id }) }
  const count = activeCount(filters)

  const savePreset = () => {
    const name = window.prompt('Save this filter as:')?.trim(); if (!name) return
    const next = [...presets.filter((p) => p.name !== name), { name, filters }]
    setPresets(next); savePresets(next)
  }
  const delPreset = (name: string) => { const next = presets.filter((p) => p.name !== name); setPresets(next); savePresets(next) }

  return (
    <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-50/90 dark:bg-surface-dark/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg viewBox="0 0 24 24" className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input value={filters.symbol} onChange={(e) => patch({ symbol: e.target.value })} placeholder="Search symbol…" className={clsx(inp, 'w-full pl-8')} />
        </div>

        <DatePopover filters={filters} patch={patch} setPreset={setPreset} />

        <StrategySelect value={filters.strategy} onChange={(strategy) => patch({ strategy })} includeAll className={clsx(inp, 'max-w-[170px]')} />

        <button onClick={() => setOpen((o) => !o)} className={clsx('flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border', open || count ? 'border-brand-300 text-brand-600 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-700' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-white/5')}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          Filters{count > 0 && <span className="text-[10px] px-1.5 rounded-full bg-brand-600 text-white">{count}</span>}{chevron}
        </button>

        {count > 0 && <button onClick={() => onChange({ ...defaultFilters(), datePreset: filters.datePreset, from: filters.from, to: filters.to })} className="h-9 px-2 text-xs text-slate-400 hover:text-red-500">Clear</button>}
      </div>

      {/* Saved presets */}
      {presets.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Presets</span>
          {presets.map((p) => (
            <span key={p.name} className="group inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded-full bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 text-xs">
              <button onClick={() => onChange(rehydratePreset(p.filters))} className="text-slate-600 dark:text-slate-300">{p.name}</button>
              <button onClick={() => delPreset(p.name)} className="text-slate-300 hover:text-red-500"><svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            </span>
          ))}
        </div>
      )}

      {/* Advanced panel — full-width inline */}
      {open && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-4 animate-fade-in">
          <div><span className={lbl}>Broker</span>
            <select value={filters.broker} onChange={(e) => patch({ broker: e.target.value })} className={clsx(inp, 'w-full')}>
              <option value="">All brokers</option>{brokers.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div><span className={lbl}>Instrument</span>
            <select value={filters.instrument} onChange={(e) => patch({ instrument: e.target.value as Filters['instrument'] })} className={clsx(inp, 'w-full')}>
              {['ALL', 'CE', 'PE', 'FUT', 'EQ'].map((i) => <option key={i} value={i}>{i === 'ALL' ? 'All instruments' : i}</option>)}
            </select>
          </div>
          <div><span className={lbl}>Outcome</span><Segmented value={filters.outcome} onChange={(outcome) => patch({ outcome })} options={[{ v: 'ALL', l: 'All' }, { v: 'WIN', l: 'Win' }, { v: 'LOSS', l: 'Loss' }]} /></div>
          <div><span className={lbl}>Status</span><Segmented value={filters.status} onChange={(status) => patch({ status })} options={[{ v: 'ALL', l: 'All' }, { v: 'OPEN', l: 'Open' }, { v: 'CLOSED', l: 'Closed' }]} /></div>
          <div><span className={lbl}>Source</span><Segmented value={filters.source} onChange={(source) => patch({ source })} options={[{ v: 'ALL', l: 'All' }, { v: 'MANUAL', l: 'Manual' }, { v: 'IMPORTED', l: 'Broker' }]} /></div>
          <div><span className={lbl}>Review</span>
            <select value={filters.review} onChange={(e) => patch({ review: e.target.value as Filters['review'] })} className={clsx(inp, 'w-full')}>
              {['ALL', 'NEW', 'REVIEWED', 'FLAGGED'].map((r) => <option key={r} value={r}>{r === 'ALL' ? 'All reviews' : r[0] + r.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <div><span className={lbl}>Has notes</span><Segmented value={filters.hasNotes} onChange={(hasNotes) => patch({ hasNotes })} options={[{ v: 'ALL', l: 'All' }, { v: 'YES', l: 'Yes' }, { v: 'NO', l: 'No' }]} /></div>
          <div><span className={lbl}>P&L range (₹)</span>
            <div className="flex gap-1"><input value={filters.pnlMin} onChange={(e) => patch({ pnlMin: e.target.value })} placeholder="min" inputMode="numeric" className={clsx(inp, 'w-full')} /><input value={filters.pnlMax} onChange={(e) => patch({ pnlMax: e.target.value })} placeholder="max" inputMode="numeric" className={clsx(inp, 'w-full')} /></div>
          </div>
          <div><span className={lbl}>Quantity range</span>
            <div className="flex gap-1"><input value={filters.qtyMin} onChange={(e) => patch({ qtyMin: e.target.value })} placeholder="min" inputMode="numeric" className={clsx(inp, 'w-full')} /><input value={filters.qtyMax} onChange={(e) => patch({ qtyMax: e.target.value })} placeholder="max" inputMode="numeric" className={clsx(inp, 'w-full')} /></div>
          </div>
          {tagOptions.length > 0 && (
            <div className="col-span-2 md:col-span-3"><span className={lbl}>Tags</span>
              <div className="flex flex-wrap gap-1">
                {tagOptions.map((t) => {
                  const on = filters.tags.includes(t)
                  return <button key={t} onClick={() => patch({ tags: on ? filters.tags.filter((x) => x !== t) : [...filters.tags, t] })} className={clsx('px-2 h-6 rounded-full text-xs font-medium border', on ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>{t}</button>
                })}
              </div>
            </div>
          )}
          <div className="col-span-2 md:col-span-4 flex justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <button onClick={() => onChange(defaultFilters())} className="h-8 px-3 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5">Reset all</button>
            <button onClick={savePreset} className="h-8 px-3 rounded-lg bg-slate-800 dark:bg-white/10 text-white text-xs font-semibold">Save preset</button>
          </div>
        </div>
      )}
    </div>
  )
}
