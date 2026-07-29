import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { useChartLayoutStore, applySymbol, applyTimeframe, type SyncState } from '../store/chartLayoutStore'
import { getLayout, layoutsByCount } from './layouts'
import { LayoutIcon } from './LayoutIcon'
import { useWatchlistStore } from '../store/watchlistStore'
import { SYMBOLS, indexChartSymbol, TIMEFRAMES, type ChartSymbol } from '../types/market'
import { BrokerSelector } from '@/components/broker/BrokerSelector'
import { INDICATORS, INDICATOR_GROUPS } from './indicatorMeta'
import { IndicatorSettings } from './IndicatorSettings'

const GEAR = 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z'
const SYNC_ROWS: { key: keyof SyncState; label: string; wired: boolean }[] = [
  { key: 'symbol', label: 'Symbol', wired: true },
  { key: 'interval', label: 'Interval', wired: true },
  { key: 'crosshair', label: 'Crosshair', wired: false },
  { key: 'time', label: 'Time', wired: false },
  { key: 'dateRange', label: 'Date range', wired: false },
]

const Icon = ({ d, className }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className ?? 'h-4 w-4'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const toolBtn = 'flex items-center gap-1.5 h-8 px-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors'

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={clsx('relative h-4 w-7 rounded-full transition-colors shrink-0', on ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600')}>
      <span className={clsx('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', on ? 'left-[14px]' : 'left-0.5')} />
    </button>
  )
}

// ── Combined Layout + Sync menu (right side) ─────────────────────────────────
function LayoutMenu() {
  const layoutId = useChartLayoutStore((s) => s.layoutId)
  const setLayout = useChartLayoutStore((s) => s.setLayout)
  const sync = useChartLayoutStore((s) => s.sync)
  const setSync = useChartLayoutStore((s) => s.setSync)
  const showIndexOrders = useChartLayoutStore((s) => s.showIndexOrders)
  const setShowIndexOrders = useChartLayoutStore((s) => s.setShowIndexOrders)
  const barCountdown = useChartLayoutStore((s) => s.barCountdown)
  const setBarCountdown = useChartLayoutStore((s) => s.setBarCountdown)
  const [open, setOpen] = useState(false)
  const current = getLayout(layoutId)

  return (
    <div className="relative">
      <button className={toolBtn} onClick={() => setOpen((o) => !o)} title="Chart layout">
        <span className="text-slate-500 dark:text-slate-400"><LayoutIcon tree={current.tree} size={15} /></span>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-xl py-1.5 animate-fade-in">
            <div className="max-h-[320px] overflow-y-auto px-2">
              {layoutsByCount().map(({ count, layouts }) => (
                <div key={count} className="flex items-start gap-2 py-1">
                  <span className="w-3 pt-1.5 text-[10px] text-slate-400 tabular-nums">{count}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {layouts.map((l) => {
                      const on = l.id === layoutId
                      return (
                        <button key={l.id} onClick={() => { setLayout(l.id); setOpen(false) }} title={l.id}
                          className={clsx('h-8 w-8 grid place-items-center rounded-md border', on ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-500' : 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 hover:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5')}>
                          <LayoutIcon tree={l.tree} size={18} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-800">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sync in layout</p>
              {SYNC_ROWS.map((r) => (
                <div key={r.key} className="flex items-center justify-between px-3 py-1.5">
                  <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                    {r.label}
                    {!r.wired && <span className="text-[9px] px-1 rounded bg-slate-100 dark:bg-white/10 text-slate-400">soon</span>}
                  </span>
                  <Toggle on={sync[r.key]} onChange={(v) => setSync({ [r.key]: v })} />
                </div>
              ))}
            </div>
            <div className="mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-800">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Index chart</p>
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-sm text-slate-700 dark:text-slate-200">Show orders on chart</span>
                <Toggle on={showIndexOrders} onChange={setShowIndexOrders} />
              </div>
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-sm text-slate-700 dark:text-slate-200">Countdown to bar close</span>
                <Toggle on={barCountdown} onChange={setBarCountdown} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SymbolPicker({ active }: { active: ChartSymbol | null }) {
  const items = useWatchlistStore((s) => s.items)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const options = useMemo<ChartSymbol[]>(() => [
    ...SYMBOLS.map((s) => indexChartSymbol(s.code)),
    ...items.map((it) => ({ key: it.symbol, candleSymbol: it.symbol, display: it.display, kind: 'OPTION' as const })),
  ], [items])
  const filtered = options.filter((o) => o.display.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="relative">
      <button className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => setOpen((o) => !o)}>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 max-w-[150px] truncate">{active?.display ?? 'Select symbol'}</span>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-xl animate-fade-in">
            <div className="p-2 border-b border-slate-100 dark:border-slate-800">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol…" className="w-full h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-white/5 text-sm outline-none" />
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.map((o) => (
                <button key={o.key} onClick={() => { applySymbol(o); setOpen(false) }} className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-white/5">
                  <span className={clsx(o.key === active?.key ? 'text-brand-600 font-medium' : 'text-slate-700 dark:text-slate-300')}>{o.display}</span>
                  <span className="text-[10px] text-slate-400">{o.kind}</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-400">Add strikes to your watchlist to chart them.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function ChartToolbar({ onFullscreen }: { onFullscreen: () => void }) {
  const panels = useChartLayoutStore((s) => s.panels)
  const activeId = useChartLayoutStore((s) => s.activePanelId)
  const setPanelIndicators = useChartLayoutStore((s) => s.setPanelIndicators)
  const active = panels[activeId]
  const [menu, setMenu] = useState<null | 'ind'>(null)
  const [settings, setSettings] = useState<string | null>(null)

  const toggleIndicator = (name: string) => {
    const cur = active?.indicators ?? []
    setPanelIndicators(activeId, cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name])
  }

  return (
    <div className="flex items-center gap-1.5 h-11 px-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shrink-0">
      <SymbolPicker active={active?.symbol ?? null} />

      <div className="flex items-center gap-0.5 ml-1">
        {TIMEFRAMES.map((tf) => (
          <button key={tf.value} onClick={() => applyTimeframe(tf.value)} className={clsx('h-7 px-2 rounded-md text-xs font-semibold', active?.timeframe === tf.value ? 'bg-brand-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5')}>{tf.label}</button>
        ))}
      </div>

      <div className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-700" />

      <div className="relative">
        <button className={toolBtn} onClick={() => setMenu(menu === 'ind' ? null : 'ind')}><Icon d="M3 17l5-5 4 3 8-9" />Indicators{(active?.indicators.length ?? 0) > 0 && <span className="text-[10px] px-1 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400">{active!.indicators.length}</span>}</button>
        {menu === 'ind' && (
          <div className="absolute z-40 mt-1 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-xl py-2 animate-fade-in">
            {INDICATOR_GROUPS.map((g) => (
              <div key={g.group} className="px-1">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{g.group}</p>
                {g.items.map((name) => {
                  const on = active?.indicators.includes(name)
                  return (
                    <div key={name} className="flex items-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/5">
                      <button onClick={() => toggleIndicator(name)} className="flex-1 flex items-center justify-between px-2 py-1.5 text-sm">
                        <span className={clsx(on ? 'text-brand-600 font-medium' : 'text-slate-700 dark:text-slate-300')}>{INDICATORS[name]?.label ?? name}</span>
                        {on && <Icon d="M5 12l4 4 10-10" className="h-4 w-4 text-brand-600" />}
                      </button>
                      {on && (
                        <button title="Settings" onClick={() => setSettings(name)} className="mr-1 h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:text-brand-600 hover:bg-slate-200/60 dark:hover:bg-white/10">
                          <Icon d={GEAR} className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <BrokerSelector />
        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <LayoutMenu />
        <button className={toolBtn} onClick={onFullscreen} title="Fullscreen"><Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></button>
      </div>

      {menu && <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />}
      {settings && <IndicatorSettings name={settings} onClose={() => setSettings(null)} />}
    </div>
  )
}
