// ── Indicator settings dialog (Inputs + Style) ───────────────────────────────
// TradingView-style: the Inputs tab edits calc parameters (periods); the Style
// tab gives each plot its own show/hide, color, line width and line style (and
// up/down colors for histogram/volume bars and SAR dots). Applies live to every
// chart panel via the engine registry and persists both params and styles.

import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { INDICATORS } from './indicatorMeta'
import { useIndicatorParams } from '../store/indicatorParamsStore'
import { useIndicatorStyle } from '../store/indicatorStyleStore'
import { engineRegistry } from './engineRegistry'
import { plotsFor, hasStylePlots, effectivePlot, buildIndicatorStyles, withOpacity, type PlotStyle } from './indicatorPlots'
import { StylePopover, type StyleValue } from './StylePopover'
import { useDragPanel } from './useDragPanel'

type Tab = 'inputs' | 'style'

export function IndicatorSettings({ name, onClose }: { name: string; onClose: () => void }) {
  const def = INDICATORS[name]
  const getParams = useIndicatorParams((s) => s.get)
  const setParams = useIndicatorParams((s) => s.set)
  const resetParams = useIndicatorParams((s) => s.reset)
  // Select the stable map and index it — returning `s.styles[name] ?? {}` directly
  // would create a new object each render and loop React forever.
  const allStyles = useIndicatorStyle((s) => s.styles)
  const styleMap = allStyles[name] ?? {}
  const setPlot = useIndicatorStyle((s) => s.setPlot)
  const resetStyle = useIndicatorStyle((s) => s.reset)

  const styled = hasStylePlots(name)
  const [tab, setTab] = useState<Tab>('inputs')
  const [vals, setVals] = useState<string[]>(() => getParams(name).map((v) => String(v)))
  const [pop, setPop] = useState<{ plotKey: string; which: 'color' | 'up' | 'down'; line: boolean; rect: DOMRect } | null>(null)
  const { onDragStart, dragStyle } = useDragPanel(onClose)

  // Plots reflect the CURRENTLY applied params (lengths). Editing lengths updates
  // them after Apply.
  const appliedParams = getParams(name)
  const plots = useMemo(() => plotsFor(name, appliedParams), [name, appliedParams])

  if (!def) return null

  const applyStyles = () => {
    const map = useIndicatorStyle.getState().get(name)
    const styles = buildIndicatorStyles(name, getParams(name), map)
    engineRegistry.all().forEach((e) => e.styleIndicator(name, styles))
  }
  const editPlot = (plotKey: string, patch: PlotStyle) => { setPlot(name, plotKey, patch); applyStyles() }

  const onApplyInputs = () => {
    const nums = def.params.map((p, i) => {
      const raw = Number(vals[i])
      const v = Number.isFinite(raw) ? raw : def.defaults[i]
      return p.float ? v : Math.max(1, Math.round(v))
    })
    setParams(name, nums)
    engineRegistry.all().forEach((e) => e.configureIndicator(name, nums))
    // recompute styles for the (possibly new) plot count
    const styles = buildIndicatorStyles(name, nums, useIndicatorStyle.getState().get(name))
    engineRegistry.all().forEach((e) => e.styleIndicator(name, styles))
  }
  const onReset = () => {
    resetParams(name); resetStyle(name)
    setVals(def.defaults.map((v) => String(v)))
    engineRegistry.all().forEach((e) => e.configureIndicator(name, def.defaults))
    const styles = buildIndicatorStyles(name, def.defaults, {})
    engineRegistry.all().forEach((e) => e.styleIndicator(name, styles))
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 pointer-events-none" role="dialog" aria-modal="true">
      <div style={dragStyle} className="pointer-events-auto relative w-full max-w-md rounded-3xl bg-white dark:bg-card-dark shadow-2xl ring-1 ring-black/5 dark:ring-white/10 animate-slide-up overflow-hidden flex flex-col max-h-[86vh]">
        <div onMouseDown={onDragStart} className="px-5 pt-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0 cursor-move select-none">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{def.label}</h2>
            <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
          {styled && (
            <div className="flex gap-4 mt-2.5">
              {(['inputs', 'style'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={clsx('pb-2 text-[13px] font-semibold capitalize border-b-2 -mb-px transition-colors', tab === t ? 'border-brand-500 text-slate-800 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200')}>{t}</button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 space-y-2.5 overflow-auto">
          {(!styled || tab === 'inputs') && (
            <Section title="Inputs">
              {def.params.map((p, i) => (
                <div key={p.label} className={rowCls}>
                  <span className={labelCls}>{p.label}</span>
                  <input value={vals[i] ?? ''} onChange={(e) => setVals((prev) => { const next = [...prev]; next[i] = e.target.value; return next })}
                    inputMode={p.float ? 'decimal' : 'numeric'}
                    className="h-8 w-24 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12.5px] px-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-400 dark:text-slate-200" />
                </div>
              ))}
              {def.params.length === 0 && <p className="text-[12px] text-slate-400 py-2">No inputs.</p>}
            </Section>
          )}

          {styled && tab === 'style' && (
            <Section title="Plots">
              {plots.map((p) => {
                const st = effectivePlot(p, styleMap[p.key])
                return (
                  <div key={p.key} className={clsx(rowCls, !st.show && 'opacity-60')}>
                    <button onClick={() => editPlot(p.key, { show: !st.show })} className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={clsx('h-4 w-4 shrink-0 grid place-items-center rounded-[5px] border transition', st.show ? 'bg-brand-500 border-brand-500 text-white' : 'border-slate-300 dark:border-slate-600')}>
                        {st.show && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      <span className={clsx(labelCls, 'truncate')}>{p.label}</span>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.kind === 'line' ? (
                        <button onClick={(e) => setPop({ plotKey: p.key, which: 'color', line: true, rect: e.currentTarget.getBoundingClientRect() })}
                          title="Color, opacity, thickness, line style"
                          className="h-7 px-2 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5 transition">
                          <svg viewBox="0 0 48 12" className="w-10">
                            <line x1="4" y1="6" x2="44" y2="6" stroke={withOpacity(st.color ?? '#2962ff', st.opacity)} strokeWidth={Math.min(4, st.width ?? 1)}
                              strokeDasharray={st.lineStyle === 'dashed' ? '6,4' : st.lineStyle === 'dotted' ? '2,3' : undefined} strokeLinecap="round" />
                          </svg>
                        </button>
                      ) : (
                        <>
                          <span className="text-[10px] text-slate-400">up</span>
                          <button onClick={(e) => setPop({ plotKey: p.key, which: 'up', line: false, rect: e.currentTarget.getBoundingClientRect() })} title="Up color"
                            className="h-6 w-8 rounded ring-1 ring-black/10 dark:ring-white/15" style={{ backgroundColor: withOpacity(st.upColor ?? '#26a69a', st.upOpacity) }} />
                          <span className="text-[10px] text-slate-400">dn</span>
                          <button onClick={(e) => setPop({ plotKey: p.key, which: 'down', line: false, rect: e.currentTarget.getBoundingClientRect() })} title="Down color"
                            className="h-6 w-8 rounded ring-1 ring-black/10 dark:ring-white/15" style={{ backgroundColor: withOpacity(st.downColor ?? '#ef5350', st.downOpacity) }} />
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </Section>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center shrink-0">
          <button onClick={onReset} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Reset to defaults</button>
          <div className="flex-1" />
          {(!styled || tab === 'inputs') && <button onClick={onApplyInputs} className="h-8 px-4 mr-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5 transition">Apply</button>}
          <button onClick={onClose} className="h-8 px-4 rounded-lg text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 transition active:scale-95">Done</button>
        </div>
      </div>

      {pop && (() => {
        const desc = plots.find((x) => x.key === pop.plotKey)
        if (!desc) return null
        const st = effectivePlot(desc, styleMap[pop.plotKey])
        const value: StyleValue = pop.which === 'up'
          ? { color: st.upColor ?? '#26a69a', opacity: st.upOpacity ?? 100, width: 1, lineStyle: 'solid' }
          : pop.which === 'down'
            ? { color: st.downColor ?? '#ef5350', opacity: st.downOpacity ?? 100, width: 1, lineStyle: 'solid' }
            : { color: st.color ?? '#2962ff', opacity: st.opacity ?? 100, width: st.width ?? 1, lineStyle: st.lineStyle ?? 'solid' }
        const onChange = (patch: Partial<StyleValue>) => {
          const sp: PlotStyle = {}
          if (pop.which === 'up') { if (patch.color !== undefined) sp.upColor = patch.color; if (patch.opacity !== undefined) sp.upOpacity = patch.opacity }
          else if (pop.which === 'down') { if (patch.color !== undefined) sp.downColor = patch.color; if (patch.opacity !== undefined) sp.downOpacity = patch.opacity }
          else { if (patch.color !== undefined) sp.color = patch.color; if (patch.opacity !== undefined) sp.opacity = patch.opacity; if (patch.width !== undefined) sp.width = patch.width; if (patch.lineStyle !== undefined) sp.lineStyle = patch.lineStyle }
          editPlot(pop.plotKey, sp)
        }
        return <StylePopover line={pop.line} value={value} rect={pop.rect} onChange={onChange} onClose={() => setPop(null)} />
      })()}
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
const rowCls = 'flex items-center justify-between gap-2 min-h-[32px]'
const labelCls = 'text-[12.5px] text-slate-600 dark:text-slate-300'
