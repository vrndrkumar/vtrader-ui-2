// ── WaveTrend settings (Inputs / Style, TradingView-style) ────────────────────
// The Style tab mirrors TradingView: every plot is a row with its own show/hide
// checkbox, color, and thickness. Defaults match the original script exactly, so
// nothing changes unless the user edits it — drawing only, never the logic.

import { useState } from 'react'
import { clsx } from 'clsx'
import { useWtStore } from '@/trade/store/wtStore'
import { useDragPanel } from '../useDragPanel'
import type { WtInputs } from './types'

function toHex(c: string): string {
  if (c.startsWith('#')) return c.slice(0, 7)
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) { const [r, g, b] = m[1].split(',').map((s) => parseInt(s.trim(), 10)); return '#' + [r, g, b].map((x) => (x || 0).toString(16).padStart(2, '0')).join('') }
  return '#000000'
}
function withHex(orig: string, hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  const m = orig.match(/rgba?\(([^)]+)\)/)
  if (m) { const a = m[1].split(',').map((s) => s.trim())[3] ?? '1'; return `rgba(${r}, ${g}, ${b}, ${a})` }
  return hex
}

type Tab = 'inputs' | 'style'
const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

export function WtSettings({ onClose }: { onClose: () => void }) {
  const inputs = useWtStore((s) => s.inputs)
  const setP = useWtStore((s) => s.set)
  const reset = useWtStore((s) => s.reset)
  const set = <K extends keyof WtInputs>(k: K, v: WtInputs[K]) => setP({ [k]: v } as Partial<WtInputs>)
  const [tab, setTab] = useState<Tab>('inputs')
  const { onDragStart, dragStyle } = useDragPanel(onClose)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 pointer-events-none" role="dialog" aria-modal="true">
      <div style={dragStyle} className="pointer-events-auto relative w-full max-w-md rounded-3xl bg-white dark:bg-card-dark shadow-2xl ring-1 ring-black/5 dark:ring-white/10 animate-slide-up overflow-hidden flex flex-col max-h-[86vh]">
        <div onMouseDown={onDragStart} className="px-5 pt-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0 cursor-move select-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 grid place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" /></svg>
              </span>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">WaveTrend</h2>
            </div>
            <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
          <div className="flex gap-4 mt-2.5">
            {(['inputs', 'style'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={clsx('pb-2 text-[13px] font-semibold capitalize border-b-2 -mb-px transition-colors', tab === t ? 'border-indigo-500 text-slate-800 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200')}>{t}</button>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-2.5 overflow-auto">
          {tab === 'inputs' && (
            <Section title="Inputs">
              <NumOnly label="Channel Length" value={inputs.n1} min={1} onChange={(v) => set('n1', v)} />
              <NumOnly label="Average Length" value={inputs.n2} min={1} onChange={(v) => set('n2', v)} />
              <NumOnly label="Over Bought Level 1" value={inputs.obLevel1} onChange={(v) => set('obLevel1', v)} />
              <NumOnly label="Over Bought Level 2" value={inputs.obLevel2} onChange={(v) => set('obLevel2', v)} />
              <NumOnly label="Over Sold Level 1" value={inputs.osLevel1} onChange={(v) => set('osLevel1', v)} />
              <NumOnly label="Over Sold Level 2" value={inputs.osLevel2} onChange={(v) => set('osLevel2', v)} />
              <NumOnly label="Divergence Pivot Lookback" value={inputs.divPivotLookback} min={1} onChange={(v) => set('divPivotLookback', v)} />
            </Section>
          )}

          {tab === 'style' && (
            <Section title="Plots">
              <PlotRow name="WT1" show={inputs.showWt1} onShow={(v) => set('showWt1', v)} color={inputs.wt1Color} onColor={(c) => set('wt1Color', c)} width={inputs.wt1Width} onWidth={(v) => set('wt1Width', v)} />
              <PlotRow name="WT2" show={inputs.showWt2} onShow={(v) => set('showWt2', v)} color={inputs.wt2Color} onColor={(c) => set('wt2Color', c)} width={inputs.wt2Width} onWidth={(v) => set('wt2Width', v)} />
              <PlotRow name="WT1 − WT2" show={inputs.showArea} onShow={(v) => set('showArea', v)} color={inputs.areaColor} onColor={(c) => set('areaColor', c)} />
              <PlotRow name="Zero" show={inputs.showZero} onShow={(v) => set('showZero', v)} color={inputs.zeroColor} onColor={(c) => set('zeroColor', c)} width={inputs.levelWidth} onWidth={(v) => set('levelWidth', v)} />
              <PlotRow name="Over Bought 1" show={inputs.showOb1} onShow={(v) => set('showOb1', v)} color={inputs.ob1Color} onColor={(c) => set('ob1Color', c)} />
              <PlotRow name="Over Sold 1" show={inputs.showOs1} onShow={(v) => set('showOs1', v)} color={inputs.os1Color} onColor={(c) => set('os1Color', c)} />
              <PlotRow name="Over Bought 2" show={inputs.showOb2} onShow={(v) => set('showOb2', v)} color={inputs.ob2Color} onColor={(c) => set('ob2Color', c)} />
              <PlotRow name="Over Sold 2" show={inputs.showOs2} onShow={(v) => set('showOs2', v)} color={inputs.os2Color} onColor={(c) => set('os2Color', c)} />
              <PlotRow name="Divergence" show={inputs.showDivergence} onShow={(v) => set('showDivergence', v)}
                color={inputs.divColor || (isDark() ? '#e5e7eb' : '#334155')} onColor={(c) => set('divColor', c)} width={inputs.divWidth} onWidth={(v) => set('divWidth', v)} />
            </Section>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center shrink-0">
          <button onClick={reset} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Reset to defaults</button>
          <div className="flex-1" />
          <button onClick={onClose} className="h-8 px-4 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition active:scale-95">Done</button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 dark:bg-white/[0.03]"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</span></div>
      <div className="px-3 py-2 space-y-1">{children}</div>
    </div>
  )
}
const rowCls = 'flex items-center justify-between gap-2 min-h-[30px]'
const labelCls = 'text-[12px] text-slate-600 dark:text-slate-300'

/** TradingView-style plot row: [✓ show] name … [color] [thickness]. */
function PlotRow({ name, show, onShow, color, onColor, width, onWidth }: {
  name: string; show: boolean; onShow: (v: boolean) => void; color: string; onColor: (c: string) => void; width?: number; onWidth?: (v: number) => void
}) {
  return (
    <div className={clsx(rowCls, !show && 'opacity-60')}>
      <button onClick={() => onShow(!show)} className="flex items-center gap-2 flex-1 min-w-0">
        <span className={clsx('h-4 w-4 shrink-0 grid place-items-center rounded-[5px] border transition', show ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 dark:border-slate-600')}>
          {show && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
        </span>
        <span className={clsx(labelCls, 'truncate')}>{name}</span>
      </button>
      <div className="flex items-center gap-1.5 shrink-0">
        {width !== undefined && onWidth && (
          <input type="number" value={width} min={1} step={1} onChange={(e) => onWidth(Math.max(1, Math.round(Number(e.target.value))))}
            className="h-7 w-12 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-1.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200" />
        )}
        <input type="color" value={toHex(color)} onChange={(e) => onColor(withHex(color, e.target.value))} className="h-6 w-9 rounded cursor-pointer bg-transparent border border-slate-200 dark:border-slate-700" />
      </div>
    </div>
  )
}
function NumOnly({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (v: number) => void }) {
  return (
    <div className={rowCls}>
      <span className={labelCls}>{label}</span>
      <input type="number" value={value} min={min} step={1} onChange={(e) => onChange(Math.round(Number(e.target.value)))}
        className="h-7 w-20 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200" />
    </div>
  )
}
