import { useEffect, useRef, useState, type ReactNode } from 'react'

// Dependency-free resizable grid. All chart layouts are regular col×row grids,
// so a single CSS grid with draggable column/row dividers covers every layout
// and gives uniform (TradingView-style) resize. Sizes persist per layout.

interface Sizes { cols: number[]; rows: number[] }
const KEY = (id: string) => `vt_grid_${id}`

function loadSizes(id: string, cols: number, rows: number): Sizes {
  try {
    const raw = localStorage.getItem(KEY(id))
    if (raw) {
      const s = JSON.parse(raw) as Sizes
      if (s.cols?.length === cols && s.rows?.length === rows) return s
    }
  } catch { /* ignore */ }
  return { cols: Array(cols).fill(1), rows: Array(rows).fill(1) }
}

const HANDLE = 5 // px

export function ResizableGrid({ layoutId, cols, rows, renderCell }: {
  layoutId: string; cols: number; rows: number; renderCell: (index: number) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [sizes, setSizes] = useState<Sizes>(() => loadSizes(layoutId, cols, rows))
  const sizesRef = useRef(sizes)
  sizesRef.current = sizes

  useEffect(() => { setSizes(loadSizes(layoutId, cols, rows)) }, [layoutId, cols, rows])

  const persist = (s: Sizes) => { try { localStorage.setItem(KEY(layoutId), JSON.stringify(s)) } catch { /* ignore */ } }

  const startDrag = (type: 'col' | 'row', index: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const base = type === 'col' ? sizesRef.current.cols : sizesRef.current.rows
    const total = base.reduce((a, b) => a + b, 0)
    const px = type === 'col' ? rect.width : rect.height
    const startPos = type === 'col' ? e.clientX : e.clientY
    const a0 = base[index], b0 = base[index + 1]
    const min = total * 0.08
    document.body.style.userSelect = 'none'
    document.body.style.cursor = type === 'col' ? 'col-resize' : 'row-resize'
    let latest = sizesRef.current

    const move = (ev: PointerEvent) => {
      const delta = ((type === 'col' ? ev.clientX : ev.clientY) - startPos) / px * total
      let a = a0 + delta, b = b0 - delta
      if (a < min) { b -= min - a; a = min }
      if (b < min) { a -= min - b; b = min }
      const arr = [...base]; arr[index] = a; arr[index + 1] = b
      latest = type === 'col' ? { ...sizesRef.current, cols: arr } : { ...sizesRef.current, rows: arr }
      setSizes(latest)
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      persist(latest)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  // Interleave fr tracks with fixed handle tracks.
  const colTemplate = sizes.cols.map((f) => `${f}fr`).join(` ${HANDLE}px `)
  const rowTemplate = sizes.rows.map((f) => `${f}fr`).join(` ${HANDLE}px `)

  const cells: ReactNode[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        <div key={`cell-${r}-${c}`} style={{ gridColumn: 2 * c + 1, gridRow: 2 * r + 1 }} className="min-w-0 min-h-0 overflow-hidden">
          {renderCell(r * cols + c)}
        </div>,
      )
    }
  }
  const handles: ReactNode[] = []
  for (let c = 0; c < cols - 1; c++) {
    handles.push(
      <div key={`vh-${c}`} onPointerDown={startDrag('col', c)} style={{ gridColumn: 2 * c + 2, gridRow: '1 / -1' }}
        className="cursor-col-resize bg-slate-200 dark:bg-slate-800 hover:bg-brand-400 transition-colors z-20" />,
    )
  }
  for (let r = 0; r < rows - 1; r++) {
    handles.push(
      <div key={`hh-${r}`} onPointerDown={startDrag('row', r)} style={{ gridRow: 2 * r + 2, gridColumn: '1 / -1' }}
        className="cursor-row-resize bg-slate-200 dark:bg-slate-800 hover:bg-brand-400 transition-colors z-20" />,
    )
  }

  return (
    <div ref={ref} className="h-full w-full grid" style={{ gridTemplateColumns: colTemplate, gridTemplateRows: rowTemplate }}>
      {cells}
      {handles}
    </div>
  )
}
