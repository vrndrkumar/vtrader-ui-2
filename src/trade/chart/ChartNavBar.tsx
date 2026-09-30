// ── Floating chart navigation / reset bar ────────────────────────────────────
// TradingView / broker-style pill at the bottom-centre of the chart: zoom out /
// in, reset zoom, scroll older / newer, and reset back to the latest bars. Sits
// low and subtle; brightens on hover so it never fights the chart.

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import type { ChartEngine } from './ChartEngine'

function Btn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseDown={(e) => e.stopPropagation()}
      title={title}
      className="h-6 w-6 grid place-items-center rounded-md text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition active:scale-90"
    >
      {children}
    </button>
  )
}

function Ico({ d, className }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5', className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
}

export function ChartNavBar({ engineRef, containerRef }: {
  engineRef: React.MutableRefObject<ChartEngine | null>
  containerRef: React.MutableRefObject<HTMLDivElement | null>
}) {
  const eng = () => engineRef.current
  // Reveal only when the cursor is in the chart's bottom band (TradingView-style),
  // so the bar never sits on top of the lower-pane indicators the rest of the time.
  const [show, setShow] = useState(false)
  const shownRef = useRef(false)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const BAND = 72 // px up from the bottom edge
    const set = (v: boolean) => { if (shownRef.current !== v) { shownRef.current = v; setShow(v) } }
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      set(e.clientY >= r.bottom - BAND && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right)
    }
    const onLeave = () => set(false)
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave) }
  }, [containerRef])

  return (
    <div className={clsx('absolute bottom-6 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-150',
      show ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}>
      <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-white/90 dark:bg-surface-dark/90 backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10 shadow-md">
        <Btn title="Zoom out" onClick={() => eng()?.zoomOut()}><Ico d="M5 12h14" /></Btn>
        <Btn title="Zoom in" onClick={() => eng()?.zoomIn()}><Ico d="M12 5v14M5 12h14" /></Btn>
        <Btn title="Reset zoom" onClick={() => eng()?.resetZoom()}>
          {/* fit / four-corner expand */}
          <Ico d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" />
        </Btn>
        <span className="w-px h-4 mx-0.5 bg-slate-200 dark:bg-white/10" />
        <Btn title="Scroll back (older)" onClick={() => eng()?.scrollBars(-6)}><Ico d="M15 18l-6-6 6-6" /></Btn>
        <Btn title="Scroll forward (newer)" onClick={() => eng()?.scrollBars(6)}><Ico d="M9 18l6-6-6-6" /></Btn>
        <span className="w-px h-4 mx-0.5 bg-slate-200 dark:bg-white/10" />
        <Btn title="Reset to latest" onClick={() => eng()?.resetView()}>
          <Ico d="M3 12a9 9 0 109-9 9 9 0 00-6.3 2.6L3 8M3 3v5h5" />
        </Btn>
      </div>
    </div>
  )
}
