import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { KLineChartEngine } from './KLineChartEngine'
import type { ChartEngine } from './ChartEngine'
import { engineRegistry } from './engineRegistry'
import { dataSource } from '../data/dataSource'
import { useQuote } from '../store/marketStore'
import { useChartLayoutStore } from '../store/chartLayoutStore'
import { TF_MINUTES, type Candle } from '../types/market'

const isDark = () => document.documentElement.classList.contains('dark')

export function ChartPanel({ panelId }: { panelId: string }) {
  const elRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ChartEngine | null>(null)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)

  const config = useChartLayoutStore((s) => s.panels[panelId])
  const active = useChartLayoutStore((s) => s.activePanelId === panelId)
  const setActive = useChartLayoutStore((s) => s.setActive)
  const quote = useQuote(config?.symbol?.key ?? '')

  // Create / dispose engine once.
  useEffect(() => {
    if (!elRef.current) return
    const engine = new KLineChartEngine(elRef.current, isDark())
    engineRef.current = engine
    engineRegistry.set(panelId, engine)
    const ro = new ResizeObserver(() => engine.resize())
    ro.observe(elRef.current)
    const mo = new MutationObserver(() => engine.setTheme(isDark()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { ro.disconnect(); mo.disconnect(); engineRegistry.delete(panelId); engine.dispose(); engineRef.current = null }
  }, [panelId])

  // Load data + live feed when the assigned symbol / timeframe changes.
  useEffect(() => {
    const engine = engineRef.current
    const symbol = config?.symbol
    if (!engine || !symbol) { setEmpty(!symbol); setLoading(false); return }
    let unsub: (() => void) | undefined
    let cancelled = false
    setLoading(true); setEmpty(false)

    dataSource.getCandles(symbol, config.timeframe).then((candles) => {
      if (cancelled || !engineRef.current) return
      setLoading(false)
      if (!candles.length) { setEmpty(true); return }
      engine.setData(candles)
      const bucketMs = TF_MINUTES[config.timeframe] * 60_000
      let last: Candle = { ...candles[candles.length - 1] }
      unsub = dataSource.subscribeQuote(symbol, (q) => {
        const b = Math.floor(q.ts / bucketMs) * bucketMs
        if (b > last.timestamp) last = { timestamp: b, open: q.ltp, high: q.ltp, low: q.ltp, close: q.ltp, volume: 0 }
        else if (b === last.timestamp) last = { ...last, close: q.ltp, high: Math.max(last.high, q.ltp), low: Math.min(last.low, q.ltp) }
        else return
        engineRef.current?.updateLast(last)
      })
    })
    return () => { cancelled = true; unsub?.() }
  }, [config?.symbol, config?.timeframe])

  // Keep engine indicators in sync with persisted config (toolbar acts on active).
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !config) return
    const want = new Set(config.indicators)
    const have = new Set(engine.activeIndicators())
    want.forEach((n) => { if (!have.has(n)) engine.toggleIndicator(n) })
    have.forEach((n) => { if (!want.has(n)) engine.toggleIndicator(n) })
  }, [config?.indicators])

  const up = (quote?.chg ?? 0) >= 0

  return (
    <div
      onMouseDown={() => setActive(panelId)}
      className={clsx('relative h-full w-full bg-white dark:bg-surface-dark', active ? 'ring-2 ring-inset ring-brand-500 z-10' : 'ring-1 ring-inset ring-slate-200 dark:ring-slate-800')}
    >
      {/* Symbol label (top-left overlay, row 1 — KLineCharts legend sits below it) */}
      {config?.symbol && (
        <div className="absolute top-1 left-1.5 z-10 flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-white/75 dark:bg-surface-dark/75 backdrop-blur-sm pointer-events-none">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{config.symbol.display}</span>
          {quote && <span className={clsx('text-[11px] font-medium tabular-nums', up ? 'text-green-600' : 'text-red-600')}>{quote.ltp.toFixed(2)} {up ? '+' : ''}{quote.chgPct?.toFixed(2)}%</span>}
        </div>
      )}
      <div ref={elRef} className="h-full w-full" />
      {loading && config?.symbol && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg className="animate-spin h-5 w-5 text-brand-600" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        </div>
      )}
      {empty && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400 text-center px-4">
          <svg viewBox="0 0 24 24" className="h-7 w-7 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 17l6-6 4 4 8-8" /></svg>
          <p className="text-xs font-medium">{config?.symbol ? 'No data for this range' : 'Empty panel'}</p>
          <p className="text-[11px]">{config?.symbol ? '' : 'Select this panel, then assign a symbol from the toolbar.'}</p>
        </div>
      )}
    </div>
  )
}
