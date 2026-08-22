import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'

// ── Hero multi-select dropdown ───────────────────────────────────────────────
// Reusable checkbox multi-select with search, select-all / clear, count badge and
// a summary trigger. Empty selection = "all". Closes on outside-click / Esc.

export interface MultiOption { value: string; label: string; hint?: string }

interface Props {
  options: MultiOption[]
  selected: string[]
  onChange: (values: string[]) => void
  allLabel?: string          // shown when nothing selected (means "all")
  searchable?: boolean
  className?: string         // trigger styling to match surrounding inputs
  disabled?: boolean
  align?: 'left' | 'right'
}

export function MultiSelect({ options, selected, onChange, allLabel = 'All', searchable, className, disabled, align = 'left' }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const canSearch = searchable ?? options.length > 8

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ('') } }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? options.filter((o) => o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s)) : options
  }, [options, q])

  const toggle = (v: string) => onChange(selectedSet.has(v) ? selected.filter((x) => x !== v) : [...selected, v])
  const count = selected.length

  const summary = count === 0
    ? allLabel
    : count === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
      : `${count} selected`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={clsx(className, 'flex items-center gap-2 text-left', disabled && 'opacity-50 cursor-not-allowed')}
      >
        <span className={clsx('flex-1 truncate', count === 0 && 'text-slate-400 dark:text-slate-500')}>{summary}</span>
        {count > 1 && <span className="shrink-0 h-4 min-w-[16px] px-1 rounded-full bg-brand-600 text-white text-[9px] font-bold grid place-items-center leading-none">{count}</span>}
        <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className={clsx('absolute z-40 mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0e1526] shadow-2xl overflow-hidden animate-fade-in', align === 'right' ? 'right-0' : 'left-0')}>
          {/* header */}
          <div className="flex items-center gap-2 px-3 h-10 border-b border-slate-100 dark:border-white/[0.06]">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{count ? `${count} selected` : allLabel}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => onChange(options.map((o) => o.value))} className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline">All</button>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <button onClick={() => onChange([])} className="text-[11px] font-semibold text-slate-400 hover:text-red-500">Clear</button>
            </div>
          </div>

          {/* search */}
          {canSearch && (
            <div className="p-2 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="relative">
                <svg viewBox="0 0 24 24" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                  className="w-full h-8 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-[13px] text-slate-700 dark:text-slate-200 outline-none focus:border-brand-400 placeholder:text-slate-400" />
              </div>
            </div>
          )}

          {/* options */}
          <div className="max-h-60 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-slate-400 text-center">No matches</p>
            ) : visible.map((o) => {
              const on = selectedSet.has(o.value)
              return (
                <button key={o.value} onClick={() => toggle(o.value)}
                  className={clsx('w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors', on ? 'bg-brand-50/60 dark:bg-brand-900/15' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]')}>
                  <span className={clsx('shrink-0 h-4 w-4 rounded-[5px] border grid place-items-center transition-colors', on ? 'bg-brand-600 border-brand-600' : 'border-slate-300 dark:border-white/20')}>
                    {on && <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M20 6L9 17l-5-5" /></svg>}
                  </span>
                  <span className={clsx('flex-1 text-[13px] truncate', on ? 'font-semibold text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>{o.label}</span>
                  {o.hint && <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">{o.hint}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
