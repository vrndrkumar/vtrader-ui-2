// ── Fibonacci settings panel (TradingView-style) ─────────────────────────────
// Opened from the floating toolbar's gear for a selected fibRetracement drawing.
// Every change writes the full config through the engine, which restyles the
// overlay AND persists it (styles.fib → backend props).

import { useState } from 'react'
import { clsx } from 'clsx'
import type { ChartEngine } from './ChartEngine'
import { readFib, type FibConfig, type FibLevel } from './fibConfig'
import { setToolDefault } from './drawingDefaults'

export function FibSettings({ engineRef, id, styles }: {
  engineRef: React.MutableRefObject<ChartEngine | null>
  id: string
  styles: unknown
}) {
  const [cfg, setCfg] = useState<FibConfig>(() => readFib(styles))

  const apply = (next: FibConfig) => {
    setCfg(next)
    engineRef.current?.styleDrawing(id, { fib: next })
    setToolDefault('fibRetracement', { fib: next }) // remember for the next fib
  }
  const patch = (p: Partial<FibConfig>) => apply({ ...cfg, ...p })
  const setLevel = (i: number, p: Partial<FibLevel>) => apply({ ...cfg, levels: cfg.levels.map((l, j) => (j === i ? { ...l, ...p } : l)) })

  const Check = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <button onClick={onClick} className="flex items-center gap-1.5 text-[12px] text-slate-600 dark:text-slate-300">
      <span className={clsx('h-3.5 w-3.5 rounded border grid place-items-center', on ? 'bg-brand-600 border-brand-600' : 'border-slate-300 dark:border-slate-600')}>
        {on && <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="4"><path d="M5 12l5 5L20 6" /></svg>}
      </span>
      {label}
    </button>
  )

  return (
    <div className="w-64 max-h-[62vh] overflow-y-auto p-3 text-slate-700 dark:text-slate-200">
      <div className="flex items-center justify-between">
        <Check on={cfg.trend.on} onClick={() => patch({ trend: { ...cfg.trend, on: !cfg.trend.on } })} label="Trend line" />
        <input type="color" value={cfg.trend.color} onChange={(e) => patch({ trend: { ...cfg.trend, color: e.target.value } })} className="h-6 w-8 rounded cursor-pointer bg-transparent" />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[12px] text-slate-500">Extend</span>
        <select value={cfg.extend} onChange={(e) => patch({ extend: e.target.value as FibConfig['extend'] })}
          className="text-[12px] rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1">
          <option value="none">Don't extend</option>
          <option value="right">Extend right</option>
          <option value="left">Extend left</option>
          <option value="both">Extend both</option>
        </select>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <Check on={cfg.reverse} onClick={() => patch({ reverse: !cfg.reverse })} label="Reverse" />
        <Check on={cfg.showRatio} onClick={() => patch({ showRatio: !cfg.showRatio })} label="Levels" />
        <Check on={cfg.showPrice} onClick={() => patch({ showPrice: !cfg.showPrice })} label="Prices" />
      </div>

      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Levels</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {cfg.levels.map((lv, i) => (
            <div key={lv.r} className="flex items-center gap-1.5">
              <Check on={lv.on} onClick={() => setLevel(i, { on: !lv.on })} label={String(lv.r)} />
              <input type="color" value={lv.color} onChange={(e) => setLevel(i, { color: e.target.value })} className="ml-auto h-5 w-6 rounded cursor-pointer bg-transparent" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
