// ── Indicator legend (TradingView-style) ─────────────────────────────────────
// The stack of applied indicators shown top-left on the chart. Each row shows the
// indicator name (+ its params) and, on hover, the same controls TradingView
// gives: hide/show (eye), settings (gear), and remove (trash). Hiding keeps the
// indicator applied but off the chart; removing drops it entirely.

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useChartLayoutStore } from '../store/chartLayoutStore'
import { useIndicatorParams } from '../store/indicatorParamsStore'
import { INDICATORS } from './indicatorMeta'
import { IndicatorSettings } from './IndicatorSettings'
import { SmcSettings } from './smc/SmcSettings'
import { RsSettings } from './rs/RsSettings'

const iconBtn = 'h-5 w-5 grid place-items-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-white/10 transition'

function Icon({ d, className }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5', className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
}

export function IndicatorLegend({ panelId, onHeight }: { panelId: string; onHeight?: (h: number) => void }) {
  const config = useChartLayoutStore((s) => s.panels[panelId])
  const rootRef = useRef<HTMLDivElement>(null)
  const setIndicators = useChartLayoutStore((s) => s.setPanelIndicators)
  const setHidden = useChartLayoutStore((s) => s.setPanelHidden)
  const params = useIndicatorParams((s) => s.params)
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<boolean>(() => { try { return localStorage.getItem('vtrader_legend_collapsed') === '1' } catch { return false } })
  const toggleCollapsed = () => setCollapsed((c) => { const nv = !c; try { localStorage.setItem('vtrader_legend_collapsed', nv ? '1' : '0') } catch { /* */ } return nv })

  const list = config?.indicators ?? []
  const hidden = new Set(config?.hiddenIndicators ?? [])

  // Report the legend's rendered height so the positions mirror can dock below it.
  useEffect(() => {
    const el = rootRef.current
    if (!el || !onHeight) { onHeight?.(0); return }
    const report = () => onHeight(el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => { ro.disconnect(); onHeight(0) }
  }, [onHeight, list.length, collapsed])

  if (!list.length) return null

  const label = (name: string): string => {
    const base = INDICATORS[name]?.label ?? name
    const p = params[name] ?? INDICATORS[name]?.defaults ?? []
    return p.length ? `${base} ${p.join(' ')}` : base
  }
  const toggleHide = (name: string) => {
    const next = hidden.has(name) ? [...hidden].filter((x) => x !== name) : [...hidden, name]
    setHidden(panelId, next)
  }
  const remove = (name: string) => {
    setIndicators(panelId, list.filter((x) => x !== name))
    if (hidden.has(name)) setHidden(panelId, [...hidden].filter((x) => x !== name))
    if (settingsFor === name) setSettingsFor(null)
  }

  const chevRight = 'M9 6l6 6-6 6'
  const chevDown = 'M6 9l6 6 6-6'

  return (
    <>
      <div ref={rootRef} className="absolute top-[52px] left-1.5 z-10 flex flex-col gap-0.5 pointer-events-auto max-w-[calc(100%-72px)]">
        {collapsed ? (
          <button onClick={toggleCollapsed} title="Show indicators"
            className="inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-md bg-white/70 dark:bg-surface-dark/70 backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10 shadow-sm w-fit text-[11px] font-semibold text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white">
            <Icon d={chevRight} className="h-3 w-3" />
            {list.length} indicator{list.length > 1 ? 's' : ''}
          </button>
        ) : (
          <>
        {list.map((name) => {
          const isHidden = hidden.has(name)
          return (
            <div key={name}
              className="group/ind inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md bg-white/70 dark:bg-surface-dark/70 backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10 shadow-sm w-fit">
              <button onDoubleClick={() => setSettingsFor(name)} title="Double-click for settings"
                className={clsx('text-[11px] font-semibold whitespace-nowrap truncate max-w-[220px]', isHidden ? 'text-slate-400 line-through decoration-slate-400/60' : 'text-slate-700 dark:text-slate-200')}>
                {label(name)}
              </button>
              {/* controls — visible on hover (eye always shown when hidden) */}
              <span className={clsx('flex items-center gap-0.5 transition-opacity', isHidden ? 'opacity-100' : 'opacity-0 group-hover/ind:opacity-100')}>
                <button className={iconBtn} title={isHidden ? 'Show' : 'Hide'} onClick={() => toggleHide(name)}>
                  {isHidden
                    ? <Icon d="M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12a18.5 18.5 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22M9.9 9.9a3 3 0 004.2 4.2" />
                    : <><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></>}
                </button>
                <button className={iconBtn} title="Settings" onClick={() => setSettingsFor(name)}>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
                </button>
                <button className={clsx(iconBtn, 'hover:text-rose-500')} title="Remove" onClick={() => remove(name)}>
                  <Icon d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6" />
                </button>
              </span>
            </div>
          )
        })}
            {/* collapse handle */}
            <button onClick={toggleCollapsed} title="Collapse indicators"
              className="self-start mt-0.5 inline-flex items-center gap-0.5 h-4 pl-1 pr-1.5 rounded text-[9px] font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-white/10 transition">
              <Icon d={chevDown} className="h-2.5 w-2.5" /> collapse
            </button>
          </>
        )}
      </div>
      {settingsFor === 'SMC' ? <SmcSettings onClose={() => setSettingsFor(null)} />
        : settingsFor === 'RS' ? <RsSettings onClose={() => setSettingsFor(null)} />
          : settingsFor && <IndicatorSettings name={settingsFor} onClose={() => setSettingsFor(null)} />}
    </>
  )
}
