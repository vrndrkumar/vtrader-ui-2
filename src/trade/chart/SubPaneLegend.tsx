// ── Sub-pane indicator legend (TradingView-style, lower panels) ──────────────
// Indicators that live in their own lower pane (WaveTrend, Relative Strength,
// Volume, MACD, RSI, KDJ) each get a legend row docked at the TOP-LEFT of their
// pane — exactly like TradingView, and visually identical to the main-pane legend
// (same pill, same eye / gear / trash SVG controls). Hiding keeps the pane (the
// plots just switch off) so it can be un-hidden; removing drops it entirely.
//
// Pane tops are polled from the engine each frame (cheap) so the rows track
// resize, pane add/remove and layout changes.

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import type { ChartEngine } from './ChartEngine'
import { useChartLayoutStore } from '../store/chartLayoutStore'
import { useIndicatorParams } from '../store/indicatorParamsStore'
import { INDICATORS } from './indicatorMeta'
import { IndicatorSettings } from './IndicatorSettings'
import { RsSettings } from './rs/RsSettings'
import { WtSettings } from './wt/WtSettings'

const iconBtn = 'h-5 w-5 grid place-items-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-white/10 transition'

function Icon({ d, className }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5', className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
}

export function SubPaneLegend({ panelId, engineRef }: { panelId: string; engineRef: React.MutableRefObject<ChartEngine | null> }) {
  const config = useChartLayoutStore((s) => s.panels[panelId])
  const setIndicators = useChartLayoutStore((s) => s.setPanelIndicators)
  const setHidden = useChartLayoutStore((s) => s.setPanelHidden)
  const params = useIndicatorParams((s) => s.params)
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const [tops, setTops] = useState<Record<string, number>>({})

  const subs = (config?.indicators ?? []).filter((n) => INDICATORS[n]?.pane === 'sub')
  const hidden = new Set(config?.hiddenIndicators ?? [])
  const subsKey = subs.join(',')

  // Poll each sub-pane's top (px, root-relative) so the rows dock correctly and
  // follow layout changes. ~5/s is plenty and imperceptibly cheap.
  const topsRef = useRef<Record<string, number>>({})
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (t: number) => {
      if (t - last > 180) {
        last = t
        const eng = engineRef.current
        if (eng) {
          const next: Record<string, number> = {}
          for (const n of subsKey ? subsKey.split(',') : []) { const top = eng.subPaneTop(n); if (top != null) next[n] = top }
          const prev = topsRef.current
          const keys = Object.keys(next)
          const changed = keys.length !== Object.keys(prev).length || keys.some((k) => Math.abs((prev[k] ?? -1) - next[k]) > 0.5)
          if (changed) { topsRef.current = next; setTops(next) }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engineRef, subsKey])

  if (!subs.length) return null

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
    setIndicators(panelId, (config?.indicators ?? []).filter((x) => x !== name))
    if (hidden.has(name)) setHidden(panelId, [...hidden].filter((x) => x !== name))
    if (settingsFor === name) setSettingsFor(null)
  }

  return (
    <>
      {subs.map((name) => {
        const top = tops[name]
        if (top == null) return null
        const isHidden = hidden.has(name)
        return (
          <div key={name} style={{ top: top + 4 }} className="absolute left-1.5 z-10 pointer-events-auto">
            <div className="group/ind inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md bg-white/70 dark:bg-surface-dark/70 backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10 shadow-sm w-fit">
              <button onDoubleClick={() => setSettingsFor(name)} title="Double-click for settings"
                className={clsx('text-[11px] font-semibold whitespace-nowrap truncate max-w-[220px]', isHidden ? 'text-slate-400 line-through decoration-slate-400/60' : 'text-slate-700 dark:text-slate-200')}>
                {label(name)}
              </button>
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
          </div>
        )
      })}
      {settingsFor === 'RS' ? <RsSettings onClose={() => setSettingsFor(null)} />
        : settingsFor === 'WT' ? <WtSettings onClose={() => setSettingsFor(null)} />
          : settingsFor && <IndicatorSettings name={settingsFor} onClose={() => setSettingsFor(null)} />}
    </>
  )
}
