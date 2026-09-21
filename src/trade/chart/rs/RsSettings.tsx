// ── RS settings panel (Inputs / Style / Visibility, like TradingView) ─────────
// Every Pine input is preserved; the Style tab makes each plot's colors/width
// editable (defaults = exact Pine colors) and Visibility toggles each plot. This
// only affects drawing — never the RS logic.

import { useState } from 'react'
import { clsx } from 'clsx'
import { useRsStore } from '@/trade/store/rsStore'
import type { RsInputs } from './types'

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

type Tab = 'inputs' | 'style' | 'visibility'

export function RsSettings({ onClose }: { onClose: () => void }) {
  const inputs = useRsStore((s) => s.inputs)
  const setP = useRsStore((s) => s.set)
  const reset = useRsStore((s) => s.reset)
  const set = <K extends keyof RsInputs>(k: K, v: RsInputs[K]) => setP({ [k]: v } as Partial<RsInputs>)
  const [tab, setTab] = useState<Tab>('inputs')

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-card-dark shadow-2xl ring-1 ring-black/5 dark:ring-white/10 animate-slide-up overflow-hidden flex flex-col max-h-[86vh]">
        {/* Header + tabs */}
        <div className="px-5 pt-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 grid place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-5 4 3 8-9" /></svg>
              </span>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Relative Strength</h2>
            </div>
            <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
          <div className="flex gap-4 mt-2.5">
            {(['inputs', 'style', 'visibility'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={clsx('pb-2 text-[13px] font-semibold capitalize border-b-2 -mb-px transition-colors', tab === t ? 'border-indigo-500 text-slate-800 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200')}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-2.5 overflow-auto">
          {tab === 'inputs' && (<>
            <Section title="Setup">
              <div className={rowCls}>
                <span className={labelCls}>Source</span>
                <span className="text-[12px] text-slate-400">Close</span>
              </div>
              <div className={rowCls}>
                <span className={labelCls}>Comparative Symbol</span>
                <input value={inputs.comparativeSymbol} onChange={(e) => set('comparativeSymbol', e.target.value)}
                  className="h-7 w-32 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200" />
              </div>
              <div className="flex items-center gap-1.5 justify-end">
                {['NSE:NIFTY', 'BSE:SENSEX'].map((s) => (
                  <button key={s} onClick={() => set('comparativeSymbol', s)}
                    className={clsx('h-6 px-2 rounded-md text-[10px] font-semibold border transition', inputs.comparativeSymbol === s ? 'border-indigo-400 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/25 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300')}>{s}</button>
                ))}
              </div>
              <NumOnly label="Period" value={inputs.length} min={1} onChange={(v) => set('length', v)} />
              <Tog label="Show Zero Line" value={inputs.showZeroLine} onChange={(v) => set('showZeroLine', v)} />
              <Tog label="Show Reference Label" value={inputs.showRefDateLbl} onChange={(v) => set('showRefDateLbl', v)} />
              <Tog label="Toggle RS color on crossovers" value={inputs.toggleRSColor} onChange={(v) => set('toggleRSColor', v)} />
            </Section>
            <Section title="RS Trend">
              <NumRow label="RS Trend" toggle={inputs.showRSTrend} onToggle={(v) => set('showRSTrend', v)} num={inputs.base} min={1} onNum={(v) => set('base', v)} numLabel="Range" />
            </Section>
            <Section title="RS Mean">
              <NumRow label="Show MA" toggle={inputs.showMA} onToggle={(v) => set('showMA', v)} num={inputs.lengthRSMA} min={1} onNum={(v) => set('lengthRSMA', v)} numLabel="Period" />
              <Tog label="Trend Color" value={inputs.showMAColor} onChange={(v) => set('showMAColor', v)} />
            </Section>
            <Section title="Price Confirmation">
              <NumRow label="Show Bubbles" toggle={inputs.showBubbles} onToggle={(v) => set('showBubbles', v)} num={inputs.lengthPriceSMA} min={1} onNum={(v) => set('lengthPriceSMA', v)} numLabel="Period" />
              <Col label="+ve" value={inputs.bullishColor} onChange={(c) => set('bullishColor', c)} />
              <Col label="-ve" value={inputs.bearishColor} onChange={(c) => set('bearishColor', c)} />
            </Section>
          </>)}

          {tab === 'style' && (<>
            <Section title="Zero Line / RS Trend">
              <Col label="Color 0" value={inputs.zeroColorUp} onChange={(c) => set('zeroColorUp', c)} />
              <Col label="Color 1" value={inputs.zeroColorDown} onChange={(c) => set('zeroColorDown', c)} />
              <NumOnly label="Thickness" value={inputs.zeroWidth} min={1} onChange={(v) => set('zeroWidth', v)} />
            </Section>
            <Section title="RS">
              <Col label="Color 0" value={inputs.rsColorPos} onChange={(c) => set('rsColorPos', c)} />
              <Col label="Color 1" value={inputs.rsColorNeg} onChange={(c) => set('rsColorNeg', c)} />
              <Col label="Color 2" value={inputs.rsColorFlat} onChange={(c) => set('rsColorFlat', c)} />
              <NumOnly label="Thickness" value={inputs.rsWidth} min={1} onChange={(v) => set('rsWidth', v)} />
            </Section>
            <Section title="MA">
              <Col label="Color 0" value={inputs.maColorUp} onChange={(c) => set('maColorUp', c)} />
              <Col label="Color 1" value={inputs.maColorDown} onChange={(c) => set('maColorDown', c)} />
              <Col label="Color 2" value={inputs.maColorFlat} onChange={(c) => set('maColorFlat', c)} />
              <NumOnly label="Thickness" value={inputs.maWidth} min={1} onChange={(v) => set('maWidth', v)} />
            </Section>
            <Section title="Confirmation Bubbles">
              <Col label="Color 0" value={inputs.bullishColor} onChange={(c) => set('bullishColor', c)} />
              <Col label="Color 1" value={inputs.bearishColor} onChange={(c) => set('bearishColor', c)} />
            </Section>
          </>)}

          {tab === 'visibility' && (
            <Section title="Plots">
              <Tog label="RS" value={inputs.showRS} onChange={(v) => set('showRS', v)} />
              <Tog label="Zero Line / RS Trend" value={inputs.showZeroLine} onChange={(v) => set('showZeroLine', v)} />
              <Tog label="MA" value={inputs.showMA} onChange={(v) => set('showMA', v)} />
              <Tog label="Confirmation Bubbles" value={inputs.showBubbles} onChange={(v) => set('showBubbles', v)} />
              <Tog label="Reference Label" value={inputs.showRefDateLbl} onChange={(v) => set('showRefDateLbl', v)} />
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
      <div className="px-3 py-2 space-y-1.5">{children}</div>
    </div>
  )
}
const rowCls = 'flex items-center justify-between gap-2 min-h-[28px]'
const labelCls = 'text-[12px] text-slate-600 dark:text-slate-300'

function Tog({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={rowCls}>
      <span className={labelCls}>{label}</span>
      <button onClick={() => onChange(!value)} className={clsx('relative h-5 w-9 rounded-full transition shrink-0', value ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600')}>
        <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', value ? 'left-4' : 'left-0.5')} />
      </button>
    </div>
  )
}
function Col({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className={rowCls}>
      <span className={labelCls}>{label}</span>
      <input type="color" value={toHex(value)} onChange={(e) => onChange(withHex(value, e.target.value))} className="h-6 w-9 rounded cursor-pointer bg-transparent border border-slate-200 dark:border-slate-700" />
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
function NumRow({ label, toggle, onToggle, num, min, onNum, numLabel }: { label: string; toggle: boolean; onToggle: (v: boolean) => void; num: number; min?: number; onNum: (v: number) => void; numLabel: string }) {
  return (
    <div className={rowCls}>
      <button onClick={() => onToggle(!toggle)} className="flex items-center gap-2">
        <span className={clsx('relative h-5 w-9 rounded-full transition shrink-0', toggle ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600')}><span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', toggle ? 'left-4' : 'left-0.5')} /></span>
        <span className={labelCls}>{label}</span>
      </button>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-slate-400">{numLabel}</span>
        <input type="number" value={num} min={min} step={1} onChange={(e) => onNum(Math.round(Number(e.target.value)))} className="h-7 w-16 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200" />
      </div>
    </div>
  )
}
