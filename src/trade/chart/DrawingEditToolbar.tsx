// ── Floating edit toolbar for a selected drawing (TradingView-style) ─────────
// Appears above the selected drawing and follows it on pan / zoom / resize
// (RAF-polls the engine for the drawing's current screen anchor). Every control
// calls the engine, which restyles the overlay AND persists the change.

import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import type { ChartEngine, DrawingSelection } from './ChartEngine'

const PALETTE = [
  '#2563eb', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e',
  '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#8b5cf6',
  '#64748b', '#334155', '#111827', '#ffffff',
]
const WIDTHS = [1, 2, 3, 4]
const LINE_STYLES = [
  { k: 'solid', label: 'Solid', dash: '' },
  { k: 'dashed', label: 'Dashed', dash: '6 4' },
  { k: 'dotted', label: 'Dotted', dash: '2 3' },
] as const

const SHAPE_TYPES = new Set(['shapeRect', 'shapeCircle'])
const TEXT_TYPES = new Set(['shapeText'])

const hexToRgba = (hex: string, alpha: number) => {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Best-effort read of the current style for showing active state.
type Sel = DrawingSelection
const styleOf = (s: Sel) => (s.styles ?? {}) as {
  line?: { color?: string; size?: number; style?: string }
  polygon?: { color?: string }; circle?: { color?: string }; text?: { color?: string }
}

export function DrawingEditToolbar({ engineRef, containerRef, selection }: {
  engineRef: React.MutableRefObject<ChartEngine | null>
  containerRef: React.RefObject<HTMLDivElement>
  selection: DrawingSelection
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const [pop, setPop] = useState<'color' | 'fill' | 'width' | 'style' | null>(null)
  const [fillAlpha, setFillAlpha] = useState(0.15)

  const cur = useMemo(() => styleOf(selection), [selection])
  const isShape = SHAPE_TYPES.has(selection.type)
  const isText = TEXT_TYPES.has(selection.type)

  // Glue the toolbar above the drawing IMPERATIVELY (write to style, no React
  // re-render per frame). Re-rendering 60×/s made the buttons jitter and dropped
  // clicks (that's why Delete "didn't work"). Now the DOM node is stable.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const eng = engineRef.current
      const cont = containerRef.current
      const bar = barRef.current
      if (eng && cont && bar) {
        const a = eng.overlayScreenAnchor(selection.id)
        if (a) {
          const bw = bar.offsetWidth || 220
          const bh = bar.offsetHeight || 36
          let left = Math.max(6, Math.min(a.x - bw / 2, cont.clientWidth - bw - 6))
          let top = a.y - bh - 12
          if (top < 6) top = a.y + 16 // no room above → place below the anchor
          bar.style.left = `${left}px`
          bar.style.top = `${top}px`
          bar.style.opacity = '1'
          bar.style.pointerEvents = ''
        } else {
          bar.style.opacity = '0'       // off-screen → hide but keep mounted
          bar.style.pointerEvents = 'none'
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engineRef, containerRef, selection.id])

  const eng = () => engineRef.current
  const setLineColor = (c: string) => eng()?.styleDrawing(selection.id, { line: { color: c }, text: { color: c } })
  const setFill = (c: string, a: number) => eng()?.styleDrawing(selection.id, { polygon: { color: hexToRgba(c, a) }, circle: { color: hexToRgba(c, a) }, rect: { color: hexToRgba(c, a) } })
  const setWidth = (w: number) => { eng()?.styleDrawing(selection.id, { line: { size: w } }); setPop(null) }
  const setLineStyle = (k: string) => { eng()?.styleDrawing(selection.id, { line: { style: k === 'solid' ? 'solid' : 'dashed', dashedValue: k === 'dotted' ? [2, 3] : [6, 4] } }); setPop(null) }
  const toggleLock = () => eng()?.lockDrawing(selection.id, !selection.locked)
  const toggleVisible = () => eng()?.showDrawing(selection.id, !selection.visible)
  const remove = () => eng()?.removeDrawing(selection.id)

  const curColor = cur.line?.color ?? '#2563eb'
  const curFill = (cur.polygon?.color ?? cur.circle?.color) as string | undefined
  const curWidth = cur.line?.size ?? 1.5

  const Icon = ({ d, fill = 'none' }: { d: string; fill?: string }) => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  )
  const btn = 'h-8 w-8 grid place-items-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors'
  const sep = <span className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-700" />

  return (
    <div
      ref={barRef}
      className="absolute z-30 flex items-center gap-0.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-xl px-1 py-1 pointer-events-auto select-none"
      style={{ left: 0, top: 0, opacity: 0 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Line color */}
      <div className="relative">
        <button title="Line color" className={btn} onClick={() => setPop(pop === 'color' ? null : 'color')}>
          <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: curColor }} />
        </button>
        {pop === 'color' && <Palette onPick={(c) => { setLineColor(c); setPop(null) }} />}
      </div>

      {/* Fill (shapes only) */}
      {isShape && (
        <div className="relative">
          <button title="Fill" className={btn} onClick={() => setPop(pop === 'fill' ? null : 'fill')}>
            <span className="h-4 w-4 rounded border border-black/10" style={{ background: curFill || 'transparent', backgroundImage: curFill ? undefined : 'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0,3px 3px' }} />
          </button>
          {pop === 'fill' && (
            <div className="absolute left-0 top-full mt-1.5 z-40 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-2xl p-2">
              <Swatches onPick={(c) => setFill(c, fillAlpha)} />
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Opacity</span>
                <input type="range" min={0} max={100} value={Math.round(fillAlpha * 100)} onChange={(e) => { const a = Number(e.target.value) / 100; setFillAlpha(a); if (curFill) { const m = /rgba?\(([^)]+)\)/.exec(curFill); if (m) { const [r, g, b] = m[1].split(',').map((x) => x.trim()); eng()?.styleDrawing(selection.id, { polygon: { color: `rgba(${r}, ${g}, ${b}, ${a})` }, circle: { color: `rgba(${r}, ${g}, ${b}, ${a})` }, rect: { color: `rgba(${r}, ${g}, ${b}, ${a})` } }) } } }} className="flex-1" />
                <span className="text-[11px] tabular-nums text-slate-500 w-8 text-right">{Math.round(fillAlpha * 100)}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {!isText && sep}

      {/* Line width */}
      {!isText && (
        <div className="relative">
          <button title="Line width" className={clsx(btn, 'w-9')} onClick={() => setPop(pop === 'width' ? null : 'width')}>
            <span className="text-[11px] font-semibold tabular-nums">{curWidth}px</span>
          </button>
          {pop === 'width' && (
            <div className="absolute left-0 top-full mt-1.5 z-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-2xl p-1.5 flex flex-col gap-1">
              {WIDTHS.map((w) => (
                <button key={w} onClick={() => setWidth(w)} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/10">
                  <span className="w-10 rounded-full bg-slate-700 dark:bg-slate-200" style={{ height: w }} />
                  <span className="text-[11px] text-slate-500 tabular-nums">{w}px</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Line style */}
      {!isText && (
        <div className="relative">
          <button title="Line style" className={clsx(btn, 'w-9')} onClick={() => setPop(pop === 'style' ? null : 'style')}>
            <svg viewBox="0 0 24 12" className="h-3 w-6"><line x1="1" y1="6" x2="23" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray={cur.line?.style === 'dashed' ? '5 3' : ''} /></svg>
          </button>
          {pop === 'style' && (
            <div className="absolute left-0 top-full mt-1.5 z-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-2xl p-1.5 flex flex-col gap-1">
              {LINE_STYLES.map((s) => (
                <button key={s.k} onClick={() => setLineStyle(s.k)} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/10">
                  <svg viewBox="0 0 40 8" className="h-2 w-10"><line x1="1" y1="4" x2="39" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={s.dash} /></svg>
                  <span className="text-[11px] text-slate-500">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {sep}

      <button title={selection.locked ? 'Unlock' : 'Lock'} className={clsx(btn, selection.locked && 'text-amber-500')} onClick={toggleLock}>
        <Icon d={selection.locked ? 'M7 11V7a5 5 0 019.9-1M5 11h14v10H5z' : 'M7 11V7a5 5 0 0110 0M5 11h14v10H5z'} />
      </button>
      <button title={selection.visible ? 'Hide' : 'Show'} className={btn} onClick={toggleVisible}>
        <Icon d={selection.visible ? 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z' : 'M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9 9 0 0122 12a17 17 0 01-2.2 3M6.6 6.6A17 17 0 002 12s4 7 10 7a9 9 0 003.4-.7'} />
      </button>
      <button title="Delete" className={clsx(btn, 'hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20')} onClick={remove}>
        <Icon d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
      </button>
    </div>
  )
}

function Palette({ onPick }: { onPick: (c: string) => void }) {
  return (
    <div className="absolute left-0 top-full mt-1.5 z-40 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-2xl p-2">
      <Swatches onPick={onPick} />
    </div>
  )
}

function Swatches({ onPick }: { onPick: (c: string) => void }) {
  return (
    <div className="grid grid-cols-9 gap-1">
      {PALETTE.map((c) => (
        <button key={c} onClick={() => onPick(c)} title={c} className="h-5 w-5 rounded-md border border-black/10 hover:scale-110 transition-transform" style={{ background: c }} />
      ))}
    </div>
  )
}
