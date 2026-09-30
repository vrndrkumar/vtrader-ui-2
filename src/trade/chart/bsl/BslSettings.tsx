// ── Buyside & Sellside Liquidity settings panel ──────────────────────────────
// Exposes every input from the LuxAlgo Pine script (names / options / ranges /
// defaults kept 1:1, including the inline groupings). Theme-aware, modern
// controls; editing pushes into the persisted store, reflected live on the chart.

import { clsx } from 'clsx'
import { useBslStore } from '@/trade/store/bslStore'
import { useDragPanel } from '../useDragPanel'
import type { BslInputs } from './types'

function toHex(c: string): string {
  if (c.startsWith('#')) return c.slice(0, 7)
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) { const [r, g, b] = m[1].split(',').map((s) => parseInt(s.trim(), 10)); return '#' + [r, g, b].map((x) => (x || 0).toString(16).padStart(2, '0')).join('') }
  return '#000000'
}

export function BslSettings({ onClose }: { onClose: () => void }) {
  const inputs = useBslStore((s) => s.inputs)
  const setP = useBslStore((s) => s.set)
  const reset = useBslStore((s) => s.reset)
  const set = <K extends keyof BslInputs>(k: K, v: BslInputs[K]) => setP({ [k]: v } as Partial<BslInputs>)
  const { onDragStart, dragStyle } = useDragPanel(onClose)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 pointer-events-none" role="dialog" aria-modal="true">
      <div style={dragStyle} className="pointer-events-auto relative w-full max-w-lg rounded-3xl bg-white dark:bg-card-dark shadow-2xl ring-1 ring-black/5 dark:ring-white/10 animate-slide-up overflow-hidden flex flex-col max-h-[86vh]">
        {/* Header (drag handle) */}
        <div onMouseDown={onDragStart} className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 cursor-move select-none">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 grid place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h13M3 12h18M3 18h10" /></svg>
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">Buyside &amp; Sellside Liquidity</h2>
              <p className="text-[10px] text-slate-400 leading-tight">LuxAlgo — faithful port</p>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-2.5 overflow-auto">
          <Section title="Liquidity Detection">
            <NumRow label="Detection Length" value={inputs.liqLen} min={3} max={13} onChange={(v) => set('liqLen', v)} />
            <NumRow label="Margin" value={inputs.margin} min={4} max={9} step={0.1} float onChange={(v) => set('margin', v)} />

            <ZoneRow
              label="Buyside Liquidity Zones, Margin"
              on={inputs.liqBuy} onOn={(v) => set('liqBuy', v)}
              margin={inputs.marBuy} min={1.5} max={10} onMargin={(v) => set('marBuy', v)}
              color={inputs.cLIQ_B} onColor={(c) => set('cLIQ_B', c)}
            />
            <ZoneRow
              label="Sellside Liquidity Zones, Margin"
              on={inputs.liqSel} onOn={(v) => set('liqSel', v)}
              margin={inputs.marSel} min={1.5} max={10} onMargin={(v) => set('marSel', v)}
              color={inputs.cLIQ_S} onColor={(c) => set('cLIQ_S', c)}
            />

            <VoidRow
              on={inputs.lqVoid} onOn={(v) => set('lqVoid', v)}
              bull={inputs.cLQV_B} onBull={(c) => set('cLQV_B', c)}
              bear={inputs.cLQV_S} onBear={(c) => set('cLQV_S', c)}
              label={inputs.lqText} onLabel={(v) => set('lqText', v)}
            />

            <Sel label="Mode" value={inputs.mode} opts={['Present', 'Historical']} onChange={(v) => set('mode', v as BslInputs['mode'])} />
            <NumRow label="# Visible Levels" value={inputs.visLiq} min={1} max={50} onChange={(v) => set('visLiq', v)} />
          </Section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center shrink-0">
          <button onClick={reset} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Reset to defaults</button>
          <div className="flex-1" />
          <button onClick={onClose} className="h-8 px-4 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition active:scale-95">Done</button>
        </div>
      </div>
    </div>
  )
}

// ── controls ──
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 dark:bg-white/[0.03]">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</span>
      </div>
      <div className="px-3 py-2 space-y-1.5">{children}</div>
    </div>
  )
}
const rowCls = 'flex items-center justify-between gap-2 min-h-[30px]'
const labelCls = 'text-[12px] text-slate-600 dark:text-slate-300'
const numCls = 'h-7 w-16 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200'
const colCls = 'h-6 w-8 rounded cursor-pointer bg-transparent border border-slate-200 dark:border-slate-700'

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={clsx('relative h-5 w-9 rounded-full transition shrink-0', on ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600')}>
      <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', on ? 'left-4' : 'left-0.5')} />
    </button>
  )
}

function NumRow({ label, value, min, max, step, float, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; float?: boolean; onChange: (v: number) => void }) {
  return (
    <div className={rowCls}>
      <span className={labelCls}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step ?? (float ? 0.1 : 1)}
        onChange={(e) => onChange(float ? Number(e.target.value) : Math.round(Number(e.target.value)))} className={numCls} />
    </div>
  )
}

function Sel({ label, value, opts, onChange }: { label: string; value: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <div className={rowCls}>
      <span className={labelCls}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200">
        {opts.map((o) => <option key={o} value={o} className="dark:bg-slate-800">{o}</option>)}
      </select>
    </div>
  )
}

/** Pine inline 'Buyside'/'Sellside' row: [toggle] label … [margin number] [color]. */
function ZoneRow({ label, on, onOn, margin, min, max, onMargin, color, onColor }: {
  label: string; on: boolean; onOn: (v: boolean) => void
  margin: number; min: number; max: number; onMargin: (v: number) => void
  color: string; onColor: (c: string) => void
}) {
  return (
    <div className={rowCls}>
      <button onClick={() => onOn(!on)} className="flex items-center gap-2 min-w-0">
        <Switch on={on} onToggle={() => onOn(!on)} />
        <span className={clsx(labelCls, 'truncate')}>{label}</span>
      </button>
      <div className="flex items-center gap-1.5 shrink-0">
        <input type="number" value={margin} min={min} max={max} step={0.1} onChange={(e) => onMargin(Number(e.target.value))} className={numCls} />
        <input type="color" value={toHex(color)} onChange={(e) => onColor(e.target.value)} className={colCls} />
      </div>
    </div>
  )
}

/** Pine inline 'void' row: [toggle] 'Liquidity Voids, Bullish' [bull color] [bear color] 'Bearish' [Label toggle]. */
function VoidRow({ on, onOn, bull, onBull, bear, onBear, label, onLabel }: {
  on: boolean; onOn: (v: boolean) => void
  bull: string; onBull: (c: string) => void
  bear: string; onBear: (c: string) => void
  label: boolean; onLabel: (v: boolean) => void
}) {
  return (
    <div className={rowCls}>
      <button onClick={() => onOn(!on)} className="flex items-center gap-2 min-w-0">
        <Switch on={on} onToggle={() => onOn(!on)} />
        <span className={clsx(labelCls, 'truncate')}>Liquidity Voids</span>
      </button>
      <div className="flex items-center gap-1.5 shrink-0">
        <input type="color" title="Bullish" value={toHex(bull)} onChange={(e) => onBull(e.target.value)} className={colCls} />
        <input type="color" title="Bearish" value={toHex(bear)} onChange={(e) => onBear(e.target.value)} className={colCls} />
        <span className="text-[11px] text-slate-500 dark:text-slate-400 pl-1">Label</span>
        <Switch on={label} onToggle={() => onLabel(!label)} />
      </div>
    </div>
  )
}
