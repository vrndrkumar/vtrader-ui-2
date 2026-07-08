import { useState } from 'react'
import { clsx } from 'clsx'
import { useChartLayoutStore } from '../store/chartLayoutStore'
import { engineRegistry } from './engineRegistry'

interface Tool { name: string; label: string; d: string; draw: boolean }

// Curated professional drawing set (KLineCharts overlay names).
const TOOLS: Tool[] = [
  { name: 'cursor', label: 'Cursor', draw: false, d: 'M5 3l15 7.5-6.2 1.8-1.8 6.2z' },
  { name: 'segment', label: 'Trend line', draw: true, d: 'M4 20L20 4' },
  { name: 'rayLine', label: 'Ray', draw: true, d: 'M4 20L20 4M20 4h-5M20 4v5' },
  { name: 'straightLine', label: 'Extended line', draw: true, d: 'M3 21L21 3' },
  { name: 'horizontalStraightLine', label: 'Horizontal line', draw: true, d: 'M3 12h18M6 9v6M18 9v6' },
  { name: 'verticalStraightLine', label: 'Vertical line', draw: true, d: 'M12 3v18M9 6h6M9 18h6' },
  { name: 'parallelStraightLine', label: 'Parallel channel', draw: true, d: 'M4 15L20 6M4 20L20 11' },
  { name: 'fibonacciLine', label: 'Fibonacci retracement', draw: true, d: 'M4 5h16M4 10h16M4 14h16M4 19h16' },
  { name: 'priceLine', label: 'Price line', draw: true, d: 'M3 12h12M15 9l5 3-5 3' },
  { name: 'simpleAnnotation', label: 'Text / note', draw: true, d: 'M6 5h12M12 5v14' },
]

export function DrawingToolbar() {
  const activeId = useChartLayoutStore((s) => s.activePanelId)
  const [selected, setSelected] = useState('cursor')

  const pick = (t: Tool) => {
    setSelected(t.name)
    if (t.draw) engineRegistry.get(activeId)?.startDrawing(t.name)
  }
  const clearAll = () => engineRegistry.get(activeId)?.clearDrawings()

  const btn = (active: boolean) => clsx(
    'h-9 w-9 grid place-items-center rounded-lg transition-colors',
    active ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5',
  )
  const Icon = ({ d }: { d: string }) => (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  )

  return (
    <div className="shrink-0 w-11 flex flex-col items-center py-2 gap-0.5 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark">
      {TOOLS.map((t) => (
        <button key={t.name} title={t.label} onClick={() => pick(t)} className={btn(selected === t.name)}>
          <Icon d={t.d} />
        </button>
      ))}
      <div className="my-1 h-px w-6 bg-slate-200 dark:bg-slate-700" />
      <button title="Remove all drawings" onClick={clearAll} className="h-9 w-9 grid place-items-center rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors mt-auto">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
      </button>
    </div>
  )
}
