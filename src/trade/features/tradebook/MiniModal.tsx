import { useEffect, useState } from 'react'
import { clsx } from 'clsx'

export interface FieldDef { key: string; label: string; value: number; step?: number }

/** Compact numeric-input modal used by position/order quick actions. */
export function MiniModal({ title, subtitle, fields, confirmLabel, tone = 'brand', onConfirm, onClose }: {
  title: string
  subtitle?: string
  fields: FieldDef[]
  confirmLabel: string
  tone?: 'brand' | 'red'
  onConfirm: (values: Record<string, number>) => void
  onClose: () => void
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value ? String(f.value) : ''])))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = () => onConfirm(Object.fromEntries(fields.map((f) => [f.key, Number(vals[f.key]) || 0])))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-card-dark shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p>
          {subtitle && <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>}
        </div>
        <div className="p-4 space-y-3">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[11px] font-medium text-slate-500">{f.label}</span>
              <input
                autoFocus={f === fields[0]}
                value={vals[f.key]} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                inputMode="decimal" step={f.step}
                className="mt-1 w-full h-9 px-3 rounded-lg bg-slate-100 dark:bg-white/5 text-sm outline-none tabular-nums focus:ring-1 focus:ring-brand-400"
                placeholder="0"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5">Cancel</button>
          <button onClick={submit} className={clsx('px-5 py-2 rounded-lg text-white text-sm font-semibold', tone === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700')}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
