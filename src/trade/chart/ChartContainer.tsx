import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { KLineChartEngine } from './KLineChartEngine'
import type { ChartEngine } from './ChartEngine'
import { dataSource } from '../data/dataSource'
import { useQuote } from '../store/marketStore'
import { TF_MINUTES, TIMEFRAMES, type Candle, type ChartSymbol, type Timeframe } from '../types/market'
import { placeOrder } from '@/services/orders/placeOrder'

function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

const INDICATOR_GROUPS: { group: string; items: string[] }[] = [
  { group: 'Overlays', items: ['MA', 'EMA', 'BOLL', 'SAR'] },
  { group: 'Oscillators', items: ['VOL', 'MACD', 'RSI', 'KDJ'] },
]

const DRAW_TOOLS: { name: string; label: string; d: string }[] = [
  { name: 'segment', label: 'Trend line', d: 'M4 20L20 4' },
  { name: 'horizontalStraightLine', label: 'Horizontal', d: 'M3 12h18' },
  { name: 'verticalStraightLine', label: 'Vertical', d: 'M12 3v18' },
  { name: 'rayLine', label: 'Ray', d: 'M4 20L20 4M20 4h-5M20 4v5' },
  { name: 'priceLine', label: 'Price line', d: 'M3 12h14M17 9l4 3-4 3' },
  { name: 'fibonacciLine', label: 'Fibonacci', d: 'M3 5h18M3 10h18M3 14h18M3 19h18' },
]

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? 'h-4 w-4'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

interface Props {
  symbol: ChartSymbol
  /** Option strikes are tradable → show Buy/Sell in the header. */
  tradable?: boolean
  defaultTimeframe?: Timeframe
}

export function ChartContainer({ symbol, tradable, defaultTimeframe = '5' }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ChartEngine | null>(null)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)
  const [menu, setMenu] = useState<null | 'ind' | 'draw'>(null)
  const [activeInd, setActiveInd] = useState<string[]>([])
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe)
  const quote = useQuote(symbol.key)

  // Create / dispose the engine once per mount.
  useEffect(() => {
    if (!elRef.current) return
    const engine = new KLineChartEngine(elRef.current, isDark())
    engineRef.current = engine
    const ro = new ResizeObserver(() => engine.resize())
    ro.observe(elRef.current)
    const mo = new MutationObserver(() => engine.setTheme(isDark()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { ro.disconnect(); mo.disconnect(); engine.dispose(); engineRef.current = null }
  }, [])

  // Load data + start the live feed whenever symbol/timeframe changes.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    let unsub: (() => void) | undefined
    let cancelled = false
    setLoading(true); setEmpty(false)
    setActiveInd([])

    dataSource.getCandles(symbol, timeframe).then((candles) => {
      if (cancelled || !engineRef.current) return
      setLoading(false)
      if (!candles.length) { setEmpty(true); return }
      engine.setData(candles)

      const bucketMs = TF_MINUTES[timeframe] * 60_000
      let last: Candle = { ...candles[candles.length - 1] }
      unsub = dataSource.subscribeQuote(symbol, (q) => {
        const bucketStart = Math.floor(q.ts / bucketMs) * bucketMs
        if (bucketStart > last.timestamp) {
          last = { timestamp: bucketStart, open: q.ltp, high: q.ltp, low: q.ltp, close: q.ltp, volume: 0 }
        } else if (bucketStart === last.timestamp) {
          last = { ...last, close: q.ltp, high: Math.max(last.high, q.ltp), low: Math.min(last.low, q.ltp) }
        } else { return }
        engineRef.current?.updateLast(last)
      })
    })
    return () => { cancelled = true; unsub?.() }
  }, [symbol, timeframe])

  const toggleIndicator = (name: string) => { engineRef.current?.toggleIndicator(name); setActiveInd(engineRef.current?.activeIndicators() ?? []) }
  const startDrawing = (name: string) => { engineRef.current?.startDrawing(name); setMenu(null) }
  const clearDrawings = () => engineRef.current?.clearDrawings()
  const toggleFullscreen = () => { if (!document.fullscreenElement) wrapRef.current?.requestFullscreen?.(); else document.exitFullscreen?.() }
  const trade = (side: 'BUY' | 'SELL') => placeOrder({
    symbolName: symbol.candleSymbol,
    indexName: symbol.key.split('_')[0],
    display: symbol.display,
    side, ltp: quote?.ltp, priceType: 'MKT',
  })

  const toolBtn = 'flex items-center gap-1.5 h-8 px-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors'
  const up = (quote?.chg ?? 0) >= 0

  return (
    <div ref={wrapRef} className="flex flex-col h-full w-full bg-white dark:bg-surface-dark">
      {/* Header */}
      <div className="flex items-center gap-1 h-11 px-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[160px]">{symbol.display}</span>
        {quote && (
          <span className={clsx('text-xs font-medium tabular-nums', up ? 'text-green-600' : 'text-red-600')}>
            {quote.ltp.toFixed(2)} {up ? '+' : ''}{quote.chgPct?.toFixed(2)}%
          </span>
        )}
        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((tf) => (
            <button key={tf.value} onClick={() => setTimeframe(tf.value)} className={clsx('h-7 px-2 rounded-md text-xs font-semibold', tf.value === timeframe ? 'bg-brand-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5')}>{tf.label}</button>
          ))}
        </div>
        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        {/* Indicators */}
        <div className="relative">
          <button className={toolBtn} onClick={() => setMenu(menu === 'ind' ? null : 'ind')}>
            <Icon d="M3 17l5-5 4 3 8-9" />Ind{activeInd.length > 0 && <span className="text-[10px] px-1 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400">{activeInd.length}</span>}
          </button>
          {menu === 'ind' && (
            <div className="absolute z-40 mt-1 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-xl py-2 animate-fade-in">
              {INDICATOR_GROUPS.map((g) => (
                <div key={g.group} className="px-1">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{g.group}</p>
                  {g.items.map((name) => {
                    const on = activeInd.includes(name)
                    return (
                      <button key={name} onClick={() => toggleIndicator(name)} className="flex w-full items-center justify-between px-2 py-1.5 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-white/5">
                        <span className={clsx(on ? 'text-brand-600 font-medium' : 'text-slate-700 dark:text-slate-300')}>{name}</span>
                        {on && <Icon d="M5 12l4 4 10-10" className="h-4 w-4 text-brand-600" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Drawings */}
        <div className="relative">
          <button className={toolBtn} onClick={() => setMenu(menu === 'draw' ? null : 'draw')}><Icon d="M4 20L20 4M14 4h6v6" />Draw</button>
          {menu === 'draw' && (
            <div className="absolute z-40 mt-1 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-xl py-1.5 animate-fade-in">
              {DRAW_TOOLS.map((t) => (
                <button key={t.name} onClick={() => startDrawing(t.name)} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5">
                  <Icon d={t.d} className="h-4 w-4 text-slate-400" />{t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={toolBtn} onClick={clearDrawings} title="Clear drawings"><Icon d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></button>

        <div className="ml-auto flex items-center gap-1">
          {tradable && (
            <>
              <button onClick={() => trade('BUY')} className="h-7 px-3 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold">B</button>
              <button onClick={() => trade('SELL')} className="h-7 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold">S</button>
              <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
            </>
          )}
          <button className={toolBtn} onClick={toggleFullscreen} title="Fullscreen"><Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-0">
        <div ref={elRef} className="h-full w-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg className="animate-spin h-6 w-6 text-brand-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        {empty && !loading && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">No candle data for this range.</div>}
      </div>

      {menu && <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />}
    </div>
  )
}
