// ── Indicator settings dialog ────────────────────────────────────────────────
// Edit an indicator's calc parameters (periods). Applies live to every chart
// panel via the engine registry and persists the choice.

import { useState } from 'react'
import { clsx } from 'clsx'
import { INDICATORS } from './indicatorMeta'
import { useIndicatorParams } from '../store/indicatorParamsStore'
import { engineRegistry } from './engineRegistry'

export function IndicatorSettings({ name, onClose }: { name: string; onClose: () => void }) {
  const def = INDICATORS[name]
  const getParams = useIndicatorParams((s) => s.get)
  const setParams = useIndicatorParams((s) => s.set)
  const resetParams = useIndicatorParams((s) => s.reset)
  const [vals, setVals] = useState<string[]>(() => getParams(name).map((v) => String(v)))

  if (!def) return null

  const apply = (nums: number[]) => { engineRegistry.all().forEach((e) => e.configureIndicator(name, nums)) }

  const onApply = () => {
    const nums = def.params.map((p, i) => {
      const raw = Number(vals[i])
      const v = Number.isFinite(raw) ? raw : def.defaults[i]
      return p.float ? v : Math.max(1, Math.round(v))
    })
    setParams(name, nums)
    apply(nums)
    onClose()
  }
  const onReset = () => {
    resetParams(name)
    setVals(def.defaults.map((v) => String(v)))
    apply(def.defaults)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Indicator settings</p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{def.label}</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-2.5">
          {def.params.map((p, i) => (
            <label key={p.label} className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-slate-600 dark:text-slate-300">{p.label}</span>
              <input
                value={vals[i] ?? ''}
                onChange={(e) => setVals((prev) => { const next = [...prev]; next[i] = e.target.value; return next })}
                inputMode={p.float ? 'decimal' : 'numeric'}
                className="w-24 h-9 px-2.5 rounded-lg bg-slate-100 dark:bg-white/5 text-sm tabular-nums text-right outline-none border border-transparent focus:border-brand-400"
              />
            </label>
          ))}

          <div className="flex items-center gap-2 pt-1.5">
            <button onClick={onReset} className="h-9 px-3 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5">Reset</button>
            <button onClick={onApply} className={clsx('ml-auto h-9 px-4 rounded-lg text-sm font-bold text-white bg-brand-600 hover:bg-brand-700')}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  )
}
