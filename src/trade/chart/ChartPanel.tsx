import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { KLineChartEngine } from './KLineChartEngine'
import type { ChartEngine } from './ChartEngine'
import { ChartOrderLayer } from './ChartOrderLayer'
import { engineRegistry } from './engineRegistry'
import { dataSource } from '../data/dataSource'
import { marksFromCandles, setDailyMarks } from '../data/realtime/dailyMarks'
import { placeOrder } from '@/services/orders/placeOrder'
import { ChartPlusOrder } from './ChartPlusOrder'
import { IndexPlusOrder } from './IndexPlusOrder'
import { IndexBracketLayer } from './IndexBracketLayer'
import { BarCountdown } from './BarCountdown'
import { useQuote } from '../store/marketStore'
import { useChartLayoutStore } from '../store/chartLayoutStore'
import { useBrokerStore, resolveQty } from '@/store/brokerStore'
import { lotSizeFor } from '@/services/orders/lotSize'
import { useIndicatorParams } from '../store/indicatorParamsStore'
import { useDrawingStore } from '../store/drawingStore'
import { TF_MINUTES, type Candle } from '../types/market'

const isDark = () => document.documentElement.classList.contains('dark')
const fmtVol = (v: number) => (v >= 1e7 ? `${(v / 1e7).toFixed(2)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(Math.round(v)))

export function ChartPanel({ panelId }: { panelId: string }) {
  const elRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ChartEngine | null>(null)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)
  const [lastC, setLastC] = useState<Candle | null>(null)
  const [hoverC, setHoverC] = useState<Candle | null>(null)

  const config = useChartLayoutStore((s) => s.panels[panelId])
  const showIndexOrders = useChartLayoutStore((s) => s.showIndexOrders)
  const barCountdown = useChartLayoutStore((s) => s.barCountdown)
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
    const unsubCross = engine.subscribeCrosshair(setHoverC)
    return () => { unsubCross(); ro.disconnect(); mo.disconnect(); engineRegistry.delete(panelId); engine.dispose(); engineRef.current = null }
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
      // Persist + re-anchor drawings: save on any change, and rebuild from the
      // stored time+price defs now that the (new-timeframe) bars are loaded.
      engine.setDrawingChangeHandler((list) => useDrawingStore.getState().save(symbol.key, list))
      engine.restoreDrawings(useDrawingStore.getState().get(symbol.key))
      // Seed prev-close/last-price from these candles to avoid a second candle
      // request — but NOT for an index: an index's change% baseline must be the
      // official prior-session (daily) close, which intraday candles can't give,
      // so let the daily marks fetch drive it instead.
      const marks = marksFromCandles(candles)
      if (marks && symbol.kind !== 'INDEX') setDailyMarks(symbol.key, marks)
      const bucketMs = TF_MINUTES[config.timeframe] * 60_000
      // Weekly/monthly can't be bucketed by fixed minutes (calendar weeks/months
      // aren't fixed-length), so just merge live ticks into the last candle; a new
      // W/M candle appears when history reloads.
      const coarse = config.timeframe === 'W' || config.timeframe === 'M'
      let last: Candle = { ...candles[candles.length - 1] }
      setLastC(last)
      unsub = dataSource.subscribeQuote(symbol, (q) => {
        const b = coarse ? last.timestamp : Math.floor(q.ts / bucketMs) * bucketMs
        if (b > last.timestamp) last = { timestamp: b, open: q.ltp, high: q.ltp, low: q.ltp, close: q.ltp, volume: 0 }
        else if (b === last.timestamp) last = { ...last, close: q.ltp, high: Math.max(last.high, q.ltp), low: Math.min(last.low, q.ltp) }
        else return
        engineRef.current?.updateLast(last)
        setLastC(last)
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
    const gp = useIndicatorParams.getState().get
    want.forEach((n) => { if (!have.has(n)) engine.toggleIndicator(n, gp(n)) })
    have.forEach((n) => { if (!want.has(n)) engine.toggleIndicator(n) })
  }, [config?.indicators])

  // ── From-chart trading ──
  const accounts = useBrokerStore((s) => s.accounts)
  const selectedIds = useBrokerStore((s) => s.selectedIds)

  const trade = (side: 'BUY' | 'SELL') => {
    const sym = config?.symbol
    if (!sym) return
    // Real order via the global service: Quick Trade ON → submit MKT immediately
    // across selected brokers; OFF → open the shared Order Window for review.
    // Quantity defaults to each broker's lots (resolveQty ÷ lot size) inside placeOrder.
    placeOrder({ symbolName: sym.candleSymbol, indexName: sym.key.split('_')[0], side, display: sym.display, priceType: 'MKT', ltp: quote?.ltp })
  }

  // Default order quantity (lots × lot size) for the chart "+" trade menu.
  const orderQty = (() => {
    const b = accounts.find((a) => selectedIds.includes(a.id)); const sym = config?.symbol
    if (!b || !sym) return 0
    const size = lotSizeFor(sym.key.split('_')[0])
    return Math.max(1, Math.round(resolveQty(b, sym.key) / size)) * size
  })()

  const up = (quote?.chg ?? 0) >= 0
  const ohlc = hoverC ?? lastC

  return (
    <div
      ref={rootRef}
      onMouseDown={() => setActive(panelId)}
      className={clsx('relative h-full w-full bg-white dark:bg-surface-dark', active ? 'ring-2 ring-inset ring-brand-500 z-10' : 'ring-1 ring-inset ring-slate-200 dark:ring-slate-800')}
    >
      {/* From-chart SELL / BUY (bid–ask) — left-anchored so it never overlaps the price axis */}
      {config?.symbol?.kind === 'OPTION' && quote && (
        <div className="absolute top-[38px] left-1.5 z-20 flex items-stretch rounded-lg overflow-hidden shadow-md ring-1 ring-black/10 dark:ring-white/10 select-none">
          <button onClick={(e) => { e.stopPropagation(); trade('SELL') }} className="flex flex-col items-center justify-center leading-none gap-0.5 px-2 py-1 bg-red-500 hover:bg-red-600 transition-colors text-white">
            <span className="text-[11px] font-bold tabular-nums">{(quote.bid ?? quote.ltp).toFixed(2)}</span>
            <span className="text-[8px] font-semibold tracking-widest opacity-90">SELL</span>
          </button>
          <span className="grid place-items-center px-1 bg-white dark:bg-slate-800 text-[9px] font-semibold text-slate-500 tabular-nums">{Math.max(0, (quote.ask ?? quote.ltp) - (quote.bid ?? quote.ltp)).toFixed(2)}</span>
          <button onClick={(e) => { e.stopPropagation(); trade('BUY') }} className="flex flex-col items-center justify-center leading-none gap-0.5 px-2 py-1 bg-blue-600 hover:bg-blue-700 transition-colors text-white">
            <span className="text-[11px] font-bold tabular-nums">{(quote.ask ?? quote.ltp).toFixed(2)}</span>
            <span className="text-[8px] font-semibold tracking-widest opacity-90">BUY</span>
          </button>
        </div>
      )}

      {/* Symbol + compact OHLC strip (inline, short labels, follows crosshair) */}
      {config?.symbol && (
        <div className="absolute top-1 left-1.5 z-10 flex items-center gap-2 px-1.5 py-0.5 rounded-md bg-white/75 dark:bg-surface-dark/75 backdrop-blur-sm pointer-events-none max-w-[calc(100%-16px)] overflow-hidden">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 shrink-0">{config.symbol.display}</span>
          {ohlc && (() => {
            const cu = ohlc.close >= ohlc.open
            const cc = cu ? 'text-green-600' : 'text-red-600'
            return (
              <span className="flex items-center gap-1.5 text-[10px] tabular-nums whitespace-nowrap">
                <span><span className="text-slate-400">O</span> <span className={cc}>{ohlc.open.toFixed(2)}</span></span>
                <span><span className="text-slate-400">H</span> <span className={cc}>{ohlc.high.toFixed(2)}</span></span>
                <span><span className="text-slate-400">L</span> <span className={cc}>{ohlc.low.toFixed(2)}</span></span>
                <span><span className="text-slate-400">C</span> <span className={cc}>{ohlc.close.toFixed(2)}</span></span>
                {ohlc.volume != null && <span className="hidden sm:inline"><span className="text-slate-400">V</span> <span className="text-slate-500 dark:text-slate-300">{fmtVol(ohlc.volume)}</span></span>}
              </span>
            )
          })()}
          {quote && <span className={clsx('text-[10px] font-semibold tabular-nums shrink-0', up ? 'text-green-600' : 'text-red-600')}>{up ? '+' : ''}{quote.chgPct?.toFixed(2)}%</span>}
        </div>
      )}
      <div ref={elRef} className="h-full w-full" />
      {config?.symbol && <ChartOrderLayer engineRef={engineRef} symbolKey={config.symbol.key} ltp={quote?.ltp ?? 0} />}
      {config?.symbol?.kind === 'OPTION' && quote && <ChartPlusOrder engineRef={engineRef} containerRef={rootRef} symbol={config.symbol} ltp={quote.ltp} qty={orderQty} />}
      {config?.symbol?.kind === 'INDEX' && quote && <IndexPlusOrder engineRef={engineRef} containerRef={rootRef} index={config.symbol.key} ltp={quote.ltp} />}
      {config?.symbol?.kind === 'INDEX' && showIndexOrders && <IndexBracketLayer engineRef={engineRef} index={config.symbol.key} ltp={quote?.ltp ?? 0} />}
      {config?.symbol && barCountdown && quote && <BarCountdown engineRef={engineRef} ltp={quote.ltp} timeframe={config.timeframe} />}
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
