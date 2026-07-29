// ── Index-chart "+" (opens the bracket modal) ────────────────────────────────
// Mirrors ChartPlusOrder's price-axis pill, but an index isn't directly tradable:
// clicking opens the IndexBracketModal pre-filled with the clicked index level as
// the entry trigger.

import { useEffect, useState } from 'react'
import type { ChartEngine } from './ChartEngine'
import { IndexBracketModal } from './IndexBracketModal'
import { useTradebookStore } from '../features/tradebook/tradebookStore'
import { useIndexBracketStore } from '../store/indexBracketStore'

const AXIS_W = 54 // keep the pill clear of the price axis so it stays scale-draggable

export function IndexPlusOrder({ engineRef, containerRef, index, ltp }: {
  engineRef: React.MutableRefObject<ChartEngine | null>
  containerRef: React.RefObject<HTMLDivElement>
  index: string
  ltp: number
}) {
  const [cursorY, setCursorY] = useState<number | null>(null)
  const [modalLevel, setModalLevel] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const move = (e: MouseEvent) => {
      if (modalLevel != null) return
      const r = el.getBoundingClientRect()
      if (e.clientX - r.left > r.width - AXIS_W) { setCursorY(null); return }
      setCursorY(e.clientY - r.top)
    }
    const leave = () => { if (modalLevel == null) setCursorY(null) }
    el.addEventListener('mousemove', move)
    el.addEventListener('mouseleave', leave)
    return () => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', leave) }
  }, [containerRef, modalLevel])

  const priceFromY = (y: number): number | null => {
    const eng = engineRef.current
    if (!eng) return null
    const base = ltp > 0 ? ltp : 100
    const y0 = eng.priceToY(base); const y1 = eng.priceToY(base * 1.01)
    if (y0 != null && y1 != null && y1 !== y0) return +(base + (y - y0) / ((y1 - y0) / (base * 0.01))).toFixed(2)
    return eng.yToPrice(y)
  }

  const open = () => {
    if (cursorY == null) return
    const price = priceFromY(cursorY)
    if (price != null && price > 0) { setModalLevel(price); setCursorY(null) }
  }

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {cursorY != null && modalLevel == null && (() => {
        const price = priceFromY(cursorY)
        return (
          <>
            <div className="absolute left-0 right-0 border-t border-dashed border-brand-400/40 pointer-events-none" style={{ top: cursorY }} />
            <button onClick={open} style={{ top: cursorY, right: AXIS_W }}
              className="absolute -translate-y-1/2 flex items-center gap-1 h-6 pl-1 pr-2 rounded-md bg-slate-900 text-white shadow-lg pointer-events-auto ring-1 ring-white/10 transition-transform hover:scale-[1.03] active:scale-95">
              <span className="grid place-items-center h-4 w-4 rounded-full bg-brand-600">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </span>
              <span className="text-[11px] font-bold tabular-nums">{price != null ? price.toFixed(2) : '—'}</span>
            </button>
          </>
        )
      })()}

      {modalLevel != null && (
        <div className="pointer-events-auto">
          <IndexBracketModal index={index} entryLevel={modalLevel}
            onPlaced={() => { void useIndexBracketStore.getState().reload(index); void useTradebookStore.getState().reload() }}
            onClose={() => setModalLevel(null)} />
        </div>
      )}
    </div>
  )
}
