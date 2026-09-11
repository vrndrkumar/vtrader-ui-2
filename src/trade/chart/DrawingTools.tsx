import { useState } from 'react'
import { clsx } from 'clsx'
import { useChartLayoutStore } from '../store/chartLayoutStore'
import { engineRegistry } from './engineRegistry'
import { setPendingText } from './customOverlays'
import { getToolDefault } from './drawingDefaults'

interface Tool { name: string; label: string; d: string; text?: boolean; soon?: boolean }
interface Section { label?: string; tools: Tool[] }
interface Group { key: string; label: string; d: string; sections: Section[] }

const CURSOR = 'M5 3l15 7.5-6.2 1.8-1.8 6.2z'

const GROUPS: Group[] = [
  { key: 'lines', label: 'Lines', d: 'M4 20L20 4', sections: [{ tools: [
    { name: 'segment', label: 'Trend line', d: 'M4 20L20 4' },
    { name: 'rayLine', label: 'Ray', d: 'M4 20L20 4M20 4h-5M20 4v5' },
    { name: 'straightLine', label: 'Extended line', d: 'M3 21L21 3' },
    { name: 'horizontalStraightLine', label: 'Horizontal line', d: 'M3 12h18' },
    { name: 'horizontalRayLine', label: 'Horizontal ray', d: 'M3 12h15M18 9v6' },
    { name: 'verticalStraightLine', label: 'Vertical line', d: 'M12 3v18' },
    { name: 'parallelStraightLine', label: 'Parallel channel', d: 'M4 15L20 6M4 20L20 11' },
    { name: 'priceChannelLine', label: 'Price channel', d: 'M4 7h16M4 12h16M4 17h16' },
    { name: 'priceLine', label: 'Price line', d: 'M3 12h12M15 9l5 3-5 3' },
  ] }] },
  { key: 'fib', label: 'Fibonacci', d: 'M4 5h16M4 10h16M4 14h16M4 19h16', sections: [{ tools: [
    { name: 'fibRetracement', label: 'Fib retracement', d: 'M4 5h16M4 10h16M4 14h16M4 19h16' },
  ] }] },
  { key: 'forecast', label: 'Forecast & Measure', d: 'M6 20V4h9l-2 3 2 3H6', sections: [
    { label: 'Forecasting', tools: [
      { name: 'shapeLong', label: 'Long position', d: 'M5 21V7M2 10l3-3 3 3M9 12h11' },
      { name: 'shapeShort', label: 'Short position', d: 'M5 3v14M2 14l3 3 3-3M9 12h11' },
      { name: 'positionForecast', label: 'Position forecast', d: 'M4 18l5-5 4 3 6-8M16 8h4v4', soon: true },
      { name: 'barsPattern', label: 'Bars pattern', d: 'M6 8v8M10 5v14M14 9v6M18 7v10', soon: true },
      { name: 'ghostFeed', label: 'Ghost feed', d: 'M5 10v6M9 7v10M13 9v6M17 8v8', soon: true },
      { name: 'sector', label: 'Sector', d: 'M4 20a16 16 0 0116-16M4 20h16', soon: true },
    ] },
    { label: 'Volume-based', tools: [
      { name: 'anchoredVwap', label: 'Anchored VWAP', d: 'M4 16l4-6 3 4 4-8 5 10', soon: true },
      { name: 'fixedRangeVp', label: 'Fixed range volume profile', d: 'M4 4v16M4 6h8M4 10h5M4 14h9M4 18h4', soon: true },
      { name: 'anchoredVp', label: 'Anchored volume profile', d: 'M20 4v16M20 6h-8M20 10h-5M20 14h-9M20 18h-4', soon: true },
    ] },
    { label: 'Measurers', tools: [
      { name: 'measurePrice', label: 'Price range', d: 'M12 4v16M9 7l3-3 3 3M9 17l3 3 3-3' },
      { name: 'measureDate', label: 'Date range', d: 'M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3' },
      { name: 'measureBoth', label: 'Date and price range', d: 'M4 5h16v14H4zM4 10h16M10 5v14' },
    ] },
  ] },
  { key: 'shapes', label: 'Shapes', d: 'M4 6h16v12H4z', sections: [{ tools: [
    { name: 'shapeRect', label: 'Rectangle', d: 'M4 6h16v12H4z' },
    { name: 'shapeCircle', label: 'Circle', d: 'M12 3a9 9 0 100 18 9 9 0 000-18z' },
  ] }] },
  { key: 'text', label: 'Text', d: 'M6 5h12M12 5v14', sections: [{ tools: [
    { name: 'shapeText', label: 'Text label', d: 'M6 5h12M12 5v14', text: true },
  ] }] },
]

const ALL: Record<string, Tool> = {}
GROUPS.forEach((g) => g.sections.forEach((s) => s.tools.forEach((t) => { ALL[t.name] = t })))

const FAV_KEY = 'vt_draw_favs'
const loadFavs = (): string[] => { try { const r = localStorage.getItem(FAV_KEY); if (r) return JSON.parse(r).map((n: string) => (n === 'fibonacciLine' ? 'fibRetracement' : n)) } catch { /* */ } return ['segment', 'horizontalStraightLine', 'fibRetracement'] }

const Icon = ({ d, className }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className ?? 'h-[18px] w-[18px]'} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const Star = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6"><path d="M12 3l2.6 5.6 6.1.6-4.6 4 1.4 6-5.5-3.3L6 19.8l1.4-6L2.8 9.8l6.1-.6z" /></svg>
)

export function DrawingTools() {
  const activeId = useChartLayoutStore((s) => s.activePanelId)
  const [selected, setSelected] = useState('cursor')
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [favs, setFavs] = useState<string[]>(loadFavs)

  const pick = (t: Tool) => {
    if (t.soon) return
    if (t.text) { const v = window.prompt('Enter text', 'Text'); if (v == null) return; setPendingText(v || 'Text') }
    engineRegistry.get(activeId)?.startDrawing(t.name, getToolDefault(t.name))
    setSelected(t.name); setOpenGroup(null)
  }
  const toggleFav = (name: string) => setFavs((f) => {
    const next = f.includes(name) ? f.filter((x) => x !== name) : [...f, name]
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)) } catch { /* */ }
    return next
  })

  const railBtn = (active: boolean) => clsx('relative h-9 w-9 grid place-items-center rounded-lg transition-colors',
    active ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/10')

  const favTools = favs.map((n) => ALL[n]).filter(Boolean)

  return (
    <div className="flex flex-col items-center gap-0.5 w-full">
      {favTools.length > 0 && (
        <>
          {favTools.map((t) => (
            <button key={t.name} title={t.label} onClick={() => pick(t)} className={railBtn(selected === t.name)}><Icon d={t.d} /></button>
          ))}
          <div className="my-0.5 h-px w-6 bg-slate-200 dark:bg-slate-700" />
        </>
      )}

      <button title="Cursor" onClick={() => setSelected('cursor')} className={railBtn(selected === 'cursor')}><Icon d={CURSOR} /></button>

      {GROUPS.map((g) => {
        const groupActive = g.sections.some((s) => s.tools.some((t) => t.name === selected))
        return (
          <div key={g.key} className="relative">
            <button title={g.label} onClick={() => setOpenGroup((o) => (o === g.key ? null : g.key))} className={railBtn(groupActive || openGroup === g.key)}>
              <Icon d={g.d} />
              <span className="absolute bottom-1 right-1 h-0 w-0 border-l-[3px] border-t-[3px] border-l-transparent border-t-current opacity-50" />
            </button>
            {openGroup === g.key && (
              <div className="absolute left-full top-0 ml-1.5 z-50 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-2xl py-1.5 animate-fade-in max-h-[70vh] overflow-y-auto">
                {g.sections.map((sec, si) => (
                  <div key={si} className={clsx(si > 0 && 'mt-1 pt-1 border-t border-slate-100 dark:border-slate-800')}>
                    {sec.label && <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{sec.label}</p>}
                    {sec.tools.map((t) => (
                      <div key={t.name} className={clsx('group/row flex items-center gap-2.5 px-3 py-1.5', t.soon ? 'opacity-45' : 'hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer')} onClick={() => pick(t)}>
                        <Icon d={t.d} className="h-[18px] w-[18px] text-slate-500 dark:text-slate-400 shrink-0" />
                        <span className={clsx('flex-1 text-sm', t.name === selected ? 'text-brand-600 font-medium' : 'text-slate-700 dark:text-slate-200')}>{t.label}</span>
                        {t.soon
                          ? <span className="text-[9px] px-1 rounded bg-slate-100 dark:bg-white/10 text-slate-400">soon</span>
                          : <button onClick={(e) => { e.stopPropagation(); toggleFav(t.name) }} className={clsx('shrink-0 transition-opacity', favs.includes(t.name) ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600 opacity-0 group-hover/row:opacity-100 hover:text-amber-400')}><Star on={favs.includes(t.name)} /></button>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div className="my-0.5 h-px w-6 bg-slate-200 dark:bg-slate-700" />
      <button title="Remove all drawings" onClick={() => engineRegistry.get(activeId)?.clearDrawings()} className="h-9 w-9 grid place-items-center rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors">
        <Icon d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
      </button>

      {openGroup && <div className="fixed inset-0 z-40" onClick={() => setOpenGroup(null)} />}
    </div>
  )
}
