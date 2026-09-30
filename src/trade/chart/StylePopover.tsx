// ── Plot style popover (TradingView-style) ───────────────────────────────────
// Color grid + custom color, opacity slider, and (for lines) thickness presets
// and line style (solid / dashed / dotted). Anchored under the swatch that opened
// it; a backdrop closes it. Emits partial patches { color?, opacity?, width?, lineStyle? }.

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import type { PlotLineStyle } from './indicatorPlots'

const GRID = [
  ['#FFFFFF', '#D1D4DC', '#B2B5BE', '#929AA5', '#6A6E79', '#4E5561', '#363A45', '#262B36', '#171B26', '#000000'],
  ['#FFCDD2', '#FFE0B2', '#FFF9C4', '#C8E6C9', '#B2DFDB', '#B3E5FC', '#BBDEFB', '#D1C4E9', '#E1BEE7', '#F8BBD0'],
  ['#EF9A9A', '#FFCC80', '#FFF59D', '#A5D6A7', '#80CBC4', '#81D4FA', '#90CAF9', '#B39DDB', '#CE93D8', '#F48FB1'],
  ['#F23645', '#FF9800', '#FFEB3B', '#4CAF50', '#26A69A', '#00BCD4', '#2962FF', '#673AB7', '#9C27B0', '#E91E63'],
  ['#C62828', '#EF6C00', '#F9A825', '#2E7D32', '#00695C', '#0097A7', '#1565C0', '#4527A0', '#6A1B9A', '#AD1457'],
  ['#7F0000', '#E65100', '#F57F17', '#1B5E20', '#004D40', '#006064', '#0D47A1', '#311B92', '#4A148C', '#880E4F'],
]

const toHex = (c: string) => (c.startsWith('#') ? c.slice(0, 7).toUpperCase() : (() => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return '#2962FF'; const [r, g, b] = m[1].split(',').map((s) => parseInt(s.trim(), 10)); return '#' + [r, g, b].map((x) => (x || 0).toString(16).padStart(2, '0')).join('').toUpperCase() })())

export interface StyleValue { color: string; opacity: number; width: number; lineStyle: PlotLineStyle }

export function StylePopover({ line, value, rect, onChange, onClose }: {
  line: boolean
  value: StyleValue
  rect: DOMRect
  onChange: (patch: Partial<StyleValue>) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hex] = useState(() => toHex(value.color))
  const W = 240
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - W - 8))
  const top = Math.min(rect.bottom + 6, window.innerHeight - 340)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const cur = toHex(value.color)
  const widths = [1, 2, 3, 4]
  const styles: PlotLineStyle[] = ['solid', 'dashed', 'dotted']
  const dash = (s: PlotLineStyle) => (s === 'dashed' ? '6,4' : s === 'dotted' ? '2,3' : undefined)

  return (
    <>
      <div className="fixed inset-0 z-[90] pointer-events-auto" onClick={onClose} />
      <div ref={ref} style={{ left, top, width: W }} className="fixed z-[91] pointer-events-auto rounded-xl bg-white dark:bg-card-dark shadow-2xl ring-1 ring-black/10 dark:ring-white/10 p-3 animate-fade-in">
        {/* swatch grid */}
        <div className="grid grid-cols-10 gap-1">
          {GRID.flat().map((c) => (
            <button key={c} onClick={() => onChange({ color: c })} title={c}
              className={clsx('h-4 w-4 rounded-sm ring-1 ring-black/10 dark:ring-white/10', cur === c.toUpperCase() && 'outline outline-2 outline-offset-1 outline-brand-500')}
              style={{ backgroundColor: c }} />
          ))}
        </div>

        {/* custom color */}
        <div className="mt-2 flex items-center gap-2">
          <label className="h-6 w-6 grid place-items-center rounded-md border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 cursor-pointer hover:text-slate-600" title="Custom color">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
            <input type="color" value={hex} onChange={(e) => onChange({ color: e.target.value })} className="sr-only" />
          </label>
          <span className="text-[11px] tabular-nums text-slate-400">{cur}</span>
        </div>

        {/* opacity */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Opacity</span></div>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={100} value={value.opacity} onChange={(e) => onChange({ opacity: Number(e.target.value) })}
              className="flex-1 h-1.5 accent-brand-500" />
            <span className="text-[11px] tabular-nums w-9 text-right text-slate-500 dark:text-slate-300">{value.opacity}%</span>
          </div>
        </div>

        {line && (
          <>
            {/* thickness */}
            <div className="mt-3">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Thickness</div>
              <div className="grid grid-cols-4 gap-1">
                {widths.map((w) => (
                  <button key={w} onClick={() => onChange({ width: w })}
                    className={clsx('h-8 grid place-items-center rounded-md border transition', value.width === w ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5')}>
                    <svg viewBox="0 0 40 12" className="w-8"><line x1="4" y1="6" x2="36" y2="6" stroke="currentColor" strokeWidth={w} className="text-slate-600 dark:text-slate-200" /></svg>
                  </button>
                ))}
              </div>
            </div>

            {/* line style */}
            <div className="mt-3">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Line style</div>
              <div className="grid grid-cols-3 gap-1">
                {styles.map((s) => (
                  <button key={s} onClick={() => onChange({ lineStyle: s })}
                    className={clsx('h-8 grid place-items-center rounded-md border transition', value.lineStyle === s ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5')}>
                    <svg viewBox="0 0 44 12" className="w-9"><line x1="4" y1="6" x2="40" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray={dash(s)} strokeLinecap="round" className="text-slate-600 dark:text-slate-200" /></svg>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
