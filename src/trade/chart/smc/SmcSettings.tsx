// ── SMC settings panel ───────────────────────────────────────────────────────
// Exposes every input from the LuxAlgo Pine script (names/options/defaults kept
// 1:1). Theme-aware, modern controls. Editing pushes into the persisted store,
// which the chart reflects live.

import { useState } from 'react'
import { clsx } from 'clsx'
import { useSmcStore } from '@/trade/store/smcStore'
import type { SmcInputs, LabelSize, StructMode, LineStyle } from './types'

// rgba/hex helpers so OB/FVG colors keep their transparency when the hue changes.
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

export function SmcSettings({ onClose }: { onClose: () => void }) {
  const inputs = useSmcStore((s) => s.inputs)
  const setP = useSmcStore((s) => s.set)
  const reset = useSmcStore((s) => s.reset)
  const set = <K extends keyof SmcInputs>(k: K, v: SmcInputs[K]) => setP({ [k]: v } as Partial<SmcInputs>)

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-card-dark shadow-2xl ring-1 ring-black/5 dark:ring-white/10 animate-slide-up overflow-hidden flex flex-col max-h-[86vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 grid place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-5 4 3 8-9" /></svg>
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">Smart Money Concepts</h2>
              <p className="text-[10px] text-slate-400 leading-tight">LuxAlgo — faithful port</p>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-2.5 overflow-auto">
          <Section title="Smart Money Concepts">
            <Sel label="Mode" value={inputs.mode} opts={['Historical', 'Present']} onChange={(v) => set('mode', v as SmcInputs['mode'])} />
            <Sel label="Style" value={inputs.style} opts={['Colored', 'Monochrome']} onChange={(v) => set('style', v as SmcInputs['style'])} />
            <Tog label="Color Candles" value={inputs.showTrend} onChange={(v) => set('showTrend', v)} />
          </Section>

          <Section title="Real Time Internal Structure">
            <Tog label="Show Internal Structure" value={inputs.showInternals} onChange={(v) => set('showInternals', v)} />
            <StructRow label="Bullish Structure" mode={inputs.showInternalBull} color={inputs.internalBullColor} onMode={(v) => set('showInternalBull', v)} onColor={(c) => set('internalBullColor', c)} />
            <StructRow label="Bearish Structure" mode={inputs.showInternalBear} color={inputs.internalBearColor} onMode={(v) => set('showInternalBear', v)} onColor={(c) => set('internalBearColor', c)} />
            <Tog label="Confluence Filter" value={inputs.internalFilterConfluence} onChange={(v) => set('internalFilterConfluence', v)} />
            <SizeRow label="Internal Label Size" value={inputs.internalStructureSize} onChange={(v) => set('internalStructureSize', v)} />
          </Section>

          <Section title="Real Time Swing Structure">
            <Tog label="Show Swing Structure" value={inputs.showStructure} onChange={(v) => set('showStructure', v)} />
            <StructRow label="Bullish Structure" mode={inputs.showSwingBull} color={inputs.swingBullColor} onMode={(v) => set('showSwingBull', v)} onColor={(c) => set('swingBullColor', c)} />
            <StructRow label="Bearish Structure" mode={inputs.showSwingBear} color={inputs.swingBearColor} onMode={(v) => set('showSwingBear', v)} onColor={(c) => set('swingBearColor', c)} />
            <SizeRow label="Swing Label Size" value={inputs.swingStructureSize} onChange={(v) => set('swingStructureSize', v)} />
            <NumRow label="Show Swings Points" toggle={inputs.showSwings} onToggle={(v) => set('showSwings', v)} num={inputs.swingsLength} min={10} onNum={(v) => set('swingsLength', v)} />
            <Tog label="Show Strong/Weak High/Low" value={inputs.showHighLowSwings} onChange={(v) => set('showHighLowSwings', v)} />
          </Section>

          <Section title="Order Blocks">
            <NumRow label="Internal Order Blocks" toggle={inputs.showInternalOrderBlocks} onToggle={(v) => set('showInternalOrderBlocks', v)} num={inputs.internalOrderBlocksSize} min={1} max={20} onNum={(v) => set('internalOrderBlocksSize', v)} />
            <NumRow label="Swing Order Blocks" toggle={inputs.showSwingOrderBlocks} onToggle={(v) => set('showSwingOrderBlocks', v)} num={inputs.swingOrderBlocksSize} min={1} max={20} onNum={(v) => set('swingOrderBlocksSize', v)} />
            <Sel label="Order Block Filter" value={inputs.orderBlockFilter} opts={['Atr', 'Cumulative Mean Range']} onChange={(v) => set('orderBlockFilter', v as SmcInputs['orderBlockFilter'])} />
            <Sel label="Order Block Mitigation" value={inputs.orderBlockMitigation} opts={['Close', 'High/Low']} onChange={(v) => set('orderBlockMitigation', v as SmcInputs['orderBlockMitigation'])} />
            <Col label="Internal Bullish OB" value={inputs.internalBullishOrderBlockColor} onChange={(c) => set('internalBullishOrderBlockColor', c)} />
            <Col label="Internal Bearish OB" value={inputs.internalBearishOrderBlockColor} onChange={(c) => set('internalBearishOrderBlockColor', c)} />
            <Col label="Bullish OB" value={inputs.swingBullishOrderBlockColor} onChange={(c) => set('swingBullishOrderBlockColor', c)} />
            <Col label="Bearish OB" value={inputs.swingBearishOrderBlockColor} onChange={(c) => set('swingBearishOrderBlockColor', c)} />
          </Section>

          <Section title="EQH / EQL">
            <Tog label="Equal High/Low" value={inputs.showEqualHighsLows} onChange={(v) => set('showEqualHighsLows', v)} />
            <NumOnly label="Bars Confirmation" value={inputs.equalHighsLowsLength} min={1} onChange={(v) => set('equalHighsLowsLength', v)} />
            <NumOnly label="Threshold" value={inputs.equalHighsLowsThreshold} min={0} max={0.5} step={0.1} float onChange={(v) => set('equalHighsLowsThreshold', v)} />
            <SizeRow label="Label Size" value={inputs.equalHighsLowsSize} onChange={(v) => set('equalHighsLowsSize', v)} />
          </Section>

          <Section title="Fair Value Gaps">
            <Tog label="Fair Value Gaps" value={inputs.showFairValueGaps} onChange={(v) => set('showFairValueGaps', v)} />
            <Tog label="Auto Threshold" value={inputs.fairValueGapsThreshold} onChange={(v) => set('fairValueGapsThreshold', v)} />
            <TextRow label="Timeframe" value={inputs.fairValueGapsTimeframe} placeholder="chart" onChange={(v) => set('fairValueGapsTimeframe', v)} />
            <Col label="Bullish FVG" value={inputs.fairValueGapsBullColor} onChange={(c) => set('fairValueGapsBullColor', c)} />
            <Col label="Bearish FVG" value={inputs.fairValueGapsBearColor} onChange={(c) => set('fairValueGapsBearColor', c)} />
            <NumOnly label="Extend FVG" value={inputs.fairValueGapsExtend} min={0} onChange={(v) => set('fairValueGapsExtend', v)} />
          </Section>

          <Section title="Highs & Lows MTF">
            <LevelRow label="Daily" show={inputs.showDailyLevels} style={inputs.dailyLevelsStyle} color={inputs.dailyLevelsColor} onShow={(v) => set('showDailyLevels', v)} onStyle={(v) => set('dailyLevelsStyle', v)} onColor={(c) => set('dailyLevelsColor', c)} />
            <LevelRow label="Weekly" show={inputs.showWeeklyLevels} style={inputs.weeklyLevelsStyle} color={inputs.weeklyLevelsColor} onShow={(v) => set('showWeeklyLevels', v)} onStyle={(v) => set('weeklyLevelsStyle', v)} onColor={(c) => set('weeklyLevelsColor', c)} />
            <LevelRow label="Monthly" show={inputs.showMonthlyLevels} style={inputs.monthlyLevelsStyle} color={inputs.monthlyLevelsColor} onShow={(v) => set('showMonthlyLevels', v)} onStyle={(v) => set('monthlyLevelsStyle', v)} onColor={(c) => set('monthlyLevelsColor', c)} />
          </Section>

          <Section title="Premium & Discount Zones">
            <Tog label="Premium/Discount Zones" value={inputs.showPremiumDiscountZones} onChange={(v) => set('showPremiumDiscountZones', v)} />
            <Col label="Premium Zone" value={inputs.premiumZoneColor} onChange={(c) => set('premiumZoneColor', c)} />
            <Col label="Equilibrium Zone" value={inputs.equilibriumZoneColor} onChange={(c) => set('equilibriumZoneColor', c)} />
            <Col label="Discount Zone" value={inputs.discountZoneColor} onChange={(c) => set('discountZoneColor', c)} />
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
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-white/[0.03]">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</span>
        <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5 text-slate-400 transition-transform', !open && '-rotate-90')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && <div className="px-3 py-2 space-y-1.5">{children}</div>}
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
function Col({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className={rowCls}>
      <span className={labelCls}>{label}</span>
      <input type="color" value={toHex(value)} onChange={(e) => onChange(withHex(value, e.target.value))} className="h-6 w-9 rounded cursor-pointer bg-transparent border border-slate-200 dark:border-slate-700" />
    </div>
  )
}
function NumOnly({ label, value, min, max, step, float, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; float?: boolean; onChange: (v: number) => void }) {
  return (
    <div className={rowCls}>
      <span className={labelCls}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step ?? (float ? 0.1 : 1)}
        onChange={(e) => onChange(float ? Number(e.target.value) : Math.round(Number(e.target.value)))}
        className="h-7 w-20 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200" />
    </div>
  )
}
function TextRow({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <div className={rowCls}>
      <span className={labelCls}>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-7 w-24 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200 placeholder:text-slate-400" />
    </div>
  )
}
function StructRow({ label, mode, color, onMode, onColor }: { label: string; mode: StructMode; color: string; onMode: (v: StructMode) => void; onColor: (c: string) => void }) {
  return (
    <div className={rowCls}>
      <span className={labelCls}>{label}</span>
      <div className="flex items-center gap-1.5">
        <select value={mode} onChange={(e) => onMode(e.target.value as StructMode)} className="h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200">
          {(['All', 'BOS', 'CHoCH'] as StructMode[]).map((o) => <option key={o} value={o} className="dark:bg-slate-800">{o}</option>)}
        </select>
        <input type="color" value={toHex(color)} onChange={(e) => onColor(withHex(color, e.target.value))} className="h-6 w-8 rounded cursor-pointer bg-transparent border border-slate-200 dark:border-slate-700" />
      </div>
    </div>
  )
}
function SizeRow({ label, value, onChange }: { label: string; value: LabelSize; onChange: (v: LabelSize) => void }) {
  return <Sel label={label} value={value} opts={['tiny', 'small', 'normal']} onChange={(v) => onChange(v as LabelSize)} />
}
function NumRow({ label, toggle, onToggle, num, min, max, onNum }: { label: string; toggle: boolean; onToggle: (v: boolean) => void; num: number; min?: number; max?: number; onNum: (v: number) => void }) {
  return (
    <div className={rowCls}>
      <button onClick={() => onToggle(!toggle)} className="flex items-center gap-2">
        <span className={clsx('relative h-5 w-9 rounded-full transition shrink-0', toggle ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600')}><span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', toggle ? 'left-4' : 'left-0.5')} /></span>
        <span className={labelCls}>{label}</span>
      </button>
      <input type="number" value={num} min={min} max={max} step={1} onChange={(e) => onNum(Math.round(Number(e.target.value)))} className="h-7 w-16 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200" />
    </div>
  )
}
function LevelRow({ label, show, style, color, onShow, onStyle, onColor }: { label: string; show: boolean; style: LineStyle; color: string; onShow: (v: boolean) => void; onStyle: (v: LineStyle) => void; onColor: (c: string) => void }) {
  return (
    <div className={rowCls}>
      <button onClick={() => onShow(!show)} className="flex items-center gap-2">
        <span className={clsx('relative h-5 w-9 rounded-full transition shrink-0', show ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600')}><span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', show ? 'left-4' : 'left-0.5')} /></span>
        <span className={labelCls}>{label}</span>
      </button>
      <div className="flex items-center gap-1.5">
        <select value={style} onChange={(e) => onStyle(e.target.value as LineStyle)} className="h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] px-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-200">
          <option value="solid" className="dark:bg-slate-800">⎯⎯</option>
          <option value="dashed" className="dark:bg-slate-800">----</option>
          <option value="dotted" className="dark:bg-slate-800">····</option>
        </select>
        <input type="color" value={toHex(color)} onChange={(e) => onColor(withHex(color, e.target.value))} className="h-6 w-8 rounded cursor-pointer bg-transparent border border-slate-200 dark:border-slate-700" />
      </div>
    </div>
  )
}
