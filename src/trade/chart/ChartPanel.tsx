import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { KLineChartEngine } from './KLineChartEngine'
import type { ChartEngine, DrawingSelection } from './ChartEngine'
import { ChartOrderLayer } from './ChartOrderLayer'
import { DrawingEditToolbar } from './DrawingEditToolbar'
import { engineRegistry } from './engineRegistry'
import { dataSource } from '../data/dataSource'
import { marksFromCandles, setDailyMarks } from '../data/realtime/dailyMarks'
import { placeOrder } from '@/services/orders/placeOrder'
import { ChartPlusOrder } from './ChartPlusOrder'
import { IndexPlusOrder } from './IndexPlusOrder'
import { IndexBracketLayer } from './IndexBracketLayer'
import { IndexPositionMirror } from './IndexPositionMirror'
import { BarCountdown } from './BarCountdown'
import { useQuote, useMarketStore } from '../store/marketStore'
import { recordEntrySpot } from '../store/entrySpotStore'
import { useChartLayoutStore } from '../store/chartLayoutStore'
import { useBrokerStore, resolveQty } from '@/store/brokerStore'
import { lotSizeFor } from '@/services/orders/lotSize'
import { useIndicatorParams } from '../store/indicatorParamsStore'
import { useDrawingStore } from '../store/drawingStore'
import { TF_MINUTES, type Candle, type ChartSymbol } from '../types/market'

const isDark = () => document.documentElement.classList.contains('dark')

// Index strike spacing (₹): SENSEX / BANKNIFTY / BANKEX step by 100, rest by 50.
const strikeStep = (index: string) => (/SENSEX|BANKNIFTY|BANKEX/.test(index) ? 100 : 50)

// Inline strike control on an option chart — swap CE/PE and step the strike
// (±one strike) without opening the option chain. Rebuilds the canonical
// INDEX_EXPIRY_TYPE_STRIKE symbol and reassigns it to this panel.
function StrikeSwitcher({ panelId, symbolKey }: { panelId: string; symbolKey: string }) {
  const assign = useChartLayoutStore((s) => s.assignSymbol)
  const parts = symbolKey.split('_')
  const strike = Number(parts[parts.length - 1])
  const type = parts[parts.length - 2] as 'CE' | 'PE'
  const expiry = parts[parts.length - 3]
  const index = parts.slice(0, parts.length - 3).join('_')
  if (!index || !expiry || (type !== 'CE' && type !== 'PE') || !Number.isFinite(strike)) return null
  const step = strikeStep(index)
  const build = (t: 'CE' | 'PE', s: number): ChartSymbol => {
    const key = `${index}_${expiry}_${t}_${s}`
    return { key, candleSymbol: key, display: `${index} ${s} ${t}`, kind: 'OPTION' }
  }
  const setStrike = (s: number) => { if (s > 0) assign(panelId, build(type, s)) }
  const setType = (t: 'CE' | 'PE') => { if (t !== type) assign(panelId, build(t, strike)) }
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const seg = 'grid place-items-center h-full px-2 rounded text-[10px] font-bold transition-colors'
  const stepBtn = 'grid place-items-center w-6 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors'

  return (
    <div onMouseDown={stop} className="flex items-stretch h-[26px] rounded-lg overflow-hidden shadow-sm ring-1 ring-black/10 dark:ring-white/10 select-none bg-white dark:bg-slate-800 pointer-events-auto shrink-0">
      {/* CE / PE segmented toggle on a tinted track (sliding-pill look) */}
      <span className="flex items-center gap-0.5 p-[2px] bg-slate-100 dark:bg-white/5">
        <button onMouseDown={stop} onClick={(e) => { stop(e); setType('CE') }} title="Call" className={clsx(seg, type === 'CE' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white')}>CE</button>
        <button onMouseDown={stop} onClick={(e) => { stop(e); setType('PE') }} title="Put" className={clsx(seg, type === 'PE' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white')}>PE</button>
      </span>
      {/* slanted divider */}
      <span className="w-px self-stretch my-1 mx-0.5 bg-slate-200 dark:bg-white/10 -skew-x-12" />
      {/* strike stepper: −, inset strike field, + — the field is visually distinct from the buttons */}
      <button onMouseDown={stop} onClick={(e) => { stop(e); setStrike(strike - step) }} title="Lower strike" className={stepBtn}>
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
      <span className="grid place-items-center my-[3px] mx-0.5 px-2 min-w-[44px] rounded bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-[12px] font-bold tabular-nums tracking-tight text-slate-800 dark:text-slate-100">{strike}</span>
      <button onMouseDown={stop} onClick={(e) => { stop(e); setStrike(strike + step) }} title="Higher strike" className={stepBtn}>
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  )
}
const fmtVol = (v: number) => (v >= 1e7 ? `${(v / 1e7).toFixed(2)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(Math.round(v)))

export function ChartPanel({ panelId }: { panelId: string }) {
  const elRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ChartEngine | null>(null)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)
  const [lastC, setLastC] = useState<Candle | null>(null)
  const [hoverC, setHoverC] = useState<Candle | null>(null)
  const [selDrawing, setSelDrawing] = useState<DrawingSelection | null>(null)

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
    engine.setSelectionHandler(setSelDrawing) // show/hide the floating edit toolbar
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

    // fresh: always re-call the candle API on a symbol/timeframe (re)load, so a
    // timeframe you last viewed earlier is fully backfilled to NOW (no cache gap).
    dataSource.getCandles(symbol, config.timeframe, { fresh: true }).then((candles) => {
      if (cancelled || !engineRef.current) return
      setLoading(false)
      if (!candles.length) { setEmpty(true); return }
      engine.setData(candles)
      // Persist + re-anchor drawings. Save on any user change (debounced,
      // per-drawing) via the store. Re-anchor from whatever the store currently
      // holds — its points carry timestamps, so klinecharts re-maps them to the
      // CURRENT bars on this timeframe. We do NOT re-fetch the backend here (that
      // runs once per symbol, below); fetching on every timeframe change was what
      // let an empty response wipe the drawings. Restore is guarded in the engine,
      // so it never triggers a spurious save.
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

  // Load this symbol's drawings from the backend ONCE per symbol (source of
  // truth), then re-anchor. Kept separate from the data/timeframe effect so a
  // timeframe switch never re-fetches (and so an empty backend reply can't wipe
  // what's on screen — see drawingStore.load, which also migrates local cache up).
  useEffect(() => {
    const key = config?.symbol?.key
    if (!key) return
    let cancelled = false
    void useDrawingStore.getState().load(key).then((list) => {
      if (!cancelled) engineRef.current?.restoreDrawings(list)
    })
    return () => { cancelled = true }
  }, [config?.symbol?.key])

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
    // Remember the index spot at entry so the position anchors at that level on
    // the index chart (mirror feature).
    const idxSpot = useMarketStore.getState().quotes[sym.key.split('_')[0]]?.ltp
    if (idxSpot) recordEntrySpot(sym.candleSymbol, idxSpot)
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

      {/* Header card: line 1 = symbol + expiry chip + (option) strike switcher;
          line 2 = OHLC + change%. Left-anchored & capped so it never reaches the
          price axis / "+" pill on the right. */}
      {config?.symbol && (() => {
        const isOption = config.symbol.kind === 'OPTION'
        const parts = config.symbol.key.split('_')
        const expiry = isOption ? (parts[parts.length - 3] ?? '').replace(/(\d+)([A-Za-z]+)(\d+)/, '$1 $2 $3') : ''
        const headLabel = isOption ? parts.slice(0, parts.length - 3).join('_') : config.symbol.display
        return (
          <div className="absolute top-1 left-1.5 z-10 max-w-[calc(100%-64px)] rounded-lg bg-white/80 dark:bg-surface-dark/80 backdrop-blur-sm px-2 py-1 shadow-sm ring-1 ring-black/5 dark:ring-white/10 pointer-events-none">
            {/* Line 1 */}
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{headLabel}</span>
              {isOption && expiry && (
                <span className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded bg-slate-100 dark:bg-white/10 text-[10px] font-bold tracking-wide text-slate-500 dark:text-slate-300 whitespace-nowrap">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
                  {expiry}
                </span>
              )}
              {isOption && <StrikeSwitcher panelId={panelId} symbolKey={config.symbol.key} />}
              {/* Bid–ask SELL / BUY — grouped with the strike control, with a gap. */}
              {isOption && quote && (
                <div className="flex items-stretch h-[26px] ml-1.5 rounded-lg overflow-hidden shadow-sm ring-1 ring-black/10 dark:ring-white/10 select-none pointer-events-auto">
                  <button onClick={(e) => { e.stopPropagation(); trade('SELL') }} title="Sell at bid" className="flex items-center gap-1 px-2 bg-rose-500 hover:bg-rose-600 transition-colors text-white">
                    <span className="text-[8px] font-bold tracking-wider opacity-85">SELL</span>
                    <span className="text-[11px] font-bold tabular-nums">{(quote.bid ?? quote.ltp).toFixed(2)}</span>
                  </button>
                  <span className="grid place-items-center px-1 bg-white dark:bg-slate-800 text-[9px] font-semibold text-slate-400 tabular-nums">{Math.max(0, (quote.ask ?? quote.ltp) - (quote.bid ?? quote.ltp)).toFixed(2)}</span>
                  <button onClick={(e) => { e.stopPropagation(); trade('BUY') }} title="Buy at ask" className="flex items-center gap-1 px-2 bg-blue-600 hover:bg-blue-700 transition-colors text-white">
                    <span className="text-[11px] font-bold tabular-nums">{(quote.ask ?? quote.ltp).toFixed(2)}</span>
                    <span className="text-[8px] font-bold tracking-wider opacity-85">BUY</span>
                  </button>
                </div>
              )}
            </div>
            {/* Line 2 */}
            <div className="flex items-center gap-2.5 mt-1 overflow-hidden">
              {ohlc && (() => {
                const cu = ohlc.close >= ohlc.open
                const cc = cu ? 'text-green-600' : 'text-red-600'
                return (
                  <span className="flex items-center gap-2 text-[10px] tabular-nums whitespace-nowrap">
                    <span><span className="text-slate-400">O</span> <span className={cc}>{ohlc.open.toFixed(2)}</span></span>
                    <span><span className="text-slate-400">H</span> <span className={cc}>{ohlc.high.toFixed(2)}</span></span>
                    <span><span className="text-slate-400">L</span> <span className={cc}>{ohlc.low.toFixed(2)}</span></span>
                    <span><span className="text-slate-400">C</span> <span className={cc}>{ohlc.close.toFixed(2)}</span></span>
                    {ohlc.volume != null && <span className="hidden sm:inline"><span className="text-slate-400">V</span> <span className="text-slate-500 dark:text-slate-300">{fmtVol(ohlc.volume)}</span></span>}
                  </span>
                )
              })()}
              {quote && <span className={clsx('px-1.5 py-px rounded text-[10px] font-bold tabular-nums shrink-0', up ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')}>{up ? '+' : ''}{quote.chgPct?.toFixed(2)}%</span>}
            </div>
          </div>
        )
      })()}
      <div ref={elRef} className="h-full w-full" />
      {selDrawing && <DrawingEditToolbar engineRef={engineRef} containerRef={rootRef} selection={selDrawing} />}
      {config?.symbol && <ChartOrderLayer engineRef={engineRef} symbolKey={config.symbol.key} ltp={quote?.ltp ?? 0} />}
      {config?.symbol?.kind === 'OPTION' && quote && <ChartPlusOrder engineRef={engineRef} containerRef={rootRef} symbol={config.symbol} ltp={quote.ltp} qty={orderQty} />}
      {config?.symbol?.kind === 'INDEX' && quote && <IndexPlusOrder engineRef={engineRef} containerRef={rootRef} index={config.symbol.key} ltp={quote.ltp} />}
      {config?.symbol?.kind === 'INDEX' && showIndexOrders && <IndexBracketLayer engineRef={engineRef} index={config.symbol.key} ltp={quote?.ltp ?? 0} />}
      {config?.symbol?.kind === 'OPTION' && showIndexOrders && <IndexBracketLayer engineRef={engineRef} symbol={config.symbol.key} ltp={quote?.ltp ?? 0} />}
      {/* "Show orders on chart" → also mirror strike positions onto the index chart
          with SL/Target draggable at spot levels (exit fires on the strike). */}
      {config?.symbol?.kind === 'INDEX' && showIndexOrders && <IndexPositionMirror engineRef={engineRef} index={config.symbol.key} ltp={quote?.ltp ?? 0} />}
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
