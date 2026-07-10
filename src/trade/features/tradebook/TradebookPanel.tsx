import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useSelectedBrokers } from '@/store/brokerStore'
import { useMarketStore } from '../../store/marketStore'
import { realtime } from '../../data/realtime/realtimeService'
import { useTradebookStore } from './tradebookStore'
import { totalPnl } from './types'
import { inr, pnlCls } from './format'
import { PositionsTab } from './PositionsTab'
import { OrdersTab, orderStatusCounts } from './OrdersTab'

const H_KEY = 'vtrader_tradebook_h'          // height persists across sessions
const COLLAPSED_KEY = 'vtrader_tradebook_collapsed' // expanded/collapsed remembered for the session
const MIN_H = 160
const DEFAULT_H = 280
const STRIP_H = 34
const maxH = () => Math.round(window.innerHeight * 0.7)

function loadHeight(): number {
  try { const r = localStorage.getItem(H_KEY); if (r) return Math.min(maxH(), Math.max(MIN_H, Number(r))) } catch { /* */ }
  return DEFAULT_H
}
// Expanded by default; only collapsed if this session chose to.
const loadCollapsed = (): boolean => { try { return sessionStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false } }

export function TradebookPanel() {
  const brokers = useSelectedBrokers()
  const store = useTradebookStore()
  const [collapsed, setCollapsedState] = useState(loadCollapsed)
  const [height, setHeightState] = useState(loadHeight)
  const [resizing, setResizing] = useState(false)
  const dragging = useRef(false)

  const setCollapsed = (c: boolean) => { setCollapsedState(c); try { sessionStorage.setItem(COLLAPSED_KEY, c ? '1' : '0') } catch { /* */ } }

  // Load (re)whenever the selected brokers change.
  const brokerKey = brokers.map((b) => b.id).join(',')
  useEffect(() => { void store.load(brokers) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [brokerKey])

  // Live LTP for every position symbol from the realtime tick feed (TICK_*).
  const quotes = useMarketStore((s) => s.quotes)
  const symKey = useMemo(() => [...new Set(store.positions.map((p) => p.symbol))].filter(Boolean).join(','), [store.positions])
  useEffect(() => {
    if (!symKey) return
    realtime.start()
    const unsubs = symKey.split(',').map((s) => realtime.subscribeSymbolTick(s))
    return () => unsubs.forEach((u) => u())
  }, [symKey])
  // Merge live LTP + day-change (prevClose) from the tick feed onto a position.
  const enrich = <T extends { symbol: string; ltp: number; prevClose: number }>(p: T): T => {
    const q = quotes[p.symbol]
    if (!q) return p
    const ltp = q.ltp ?? p.ltp
    const prevClose = q.chg != null ? +(q.ltp - q.chg).toFixed(2) : p.prevClose // real day baseline
    return { ...p, ltp, prevClose }
  }

  // Drag-to-resize (panel anchored to viewport bottom).
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); dragging.current = true; setResizing(true)
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      setHeightState(Math.min(maxH(), Math.max(MIN_H, window.innerHeight - ev.clientY)))
    }
    const onUp = () => {
      dragging.current = false; setResizing(false)
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      setHeightState((h) => { try { localStorage.setItem(H_KEY, String(h)) } catch { /* */ } return h })
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [])

  const byBroker = <T extends { brokerLabel: string; display: string; symbol: string }>(rows: T[]) =>
    rows.filter((r) =>
      (store.brokerFilter === 'ALL' || r.brokerLabel === store.brokerFilter) &&
      (!store.search || `${r.display} ${r.symbol}`.toLowerCase().includes(store.search.toLowerCase())))

  const positions = useMemo(
    () => byBroker(store.positions).map(enrich),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.positions, store.brokerFilter, store.search, quotes],
  )
  const openPositions = positions.filter((p) => p.status === 'OPEN')
  const ordersAll = useMemo(() => byBroker(store.orders), [store.orders, store.brokerFilter, store.search])
  const counts = useMemo(() => orderStatusCounts(ordersAll), [ordersAll])
  const orders = useMemo(() => store.orderStatus === 'ALL' ? ordersAll : ordersAll.filter((o) => o.status === store.orderStatus), [ordersAll, store.orderStatus])

  const netPnl = useMemo(() => openPositions.reduce((a, p) => a + totalPnl(p), 0), [openPositions])
  const liveOrders = counts.OPEN + counts.PENDING
  const brokerOpts = useMemo(() => brokers.map((b) => b.displayName), [brokers])

  const tabBtn = (id: 'positions' | 'orders', label: string, n: number) => (
    <button onClick={() => store.setTab(id)}
      className={clsx('relative h-full px-3 text-sm font-semibold border-b-2 transition-colors',
        store.tab === id ? 'border-brand-500 text-slate-800 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200')}>
      {label} <span className="text-xs font-medium text-slate-400">{n}</span>
    </button>
  )

  return (
    <div
      style={{ height: collapsed ? STRIP_H : height }}
      className={clsx('relative shrink-0 flex flex-col border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark', !resizing && 'transition-[height] duration-300 ease-in-out')}
    >
      {/* ── Chart Focus Mode: minimal edge toggle ── */}
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="group w-full h-full flex items-center gap-2.5 px-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          title="Show Positions & Orders"
        >
          <span className="h-1 w-8 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-brand-400 transition-colors" />
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400 group-hover:text-brand-500 group-hover:-translate-y-0.5 transition-all" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 15l6-6 6 6" /></svg>
          <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200">Positions &amp; Orders</span>
          <span className="text-[10px] text-slate-400">{openPositions.length} open · {liveOrders} live</span>
          <div className="flex-1" />
          <span className="hidden sm:inline text-xs text-slate-500">P&amp;L <span className={clsx('font-bold tabular-nums', pnlCls(netPnl))}>{inr(netPnl, true)}</span></span>
          <span className="text-[10px] font-medium text-slate-400 group-hover:text-brand-500">Show</span>
        </button>
      ) : (
        <>
          {/* Resize handle */}
          <div onMouseDown={onDragStart} className="group absolute -top-1.5 left-0 right-0 h-3 cursor-row-resize z-20 flex justify-center">
            <div className="mt-1 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-brand-400 transition-colors" />
          </div>

          {/* Header bar */}
          <div className="h-10 shrink-0 flex items-center gap-2 pl-1 pr-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center h-full">
              {tabBtn('positions', 'Positions', openPositions.length)}
              {tabBtn('orders', 'Orders', liveOrders)}
            </div>

            <div className="flex-1" />

            {/* Broker filter */}
            <div className="relative">
              <select value={store.brokerFilter} onChange={(e) => store.setBrokerFilter(e.target.value)}
                className="h-7 pl-2 pr-6 rounded-lg bg-slate-100 dark:bg-white/5 text-xs font-medium text-slate-600 dark:text-slate-300 outline-none appearance-none cursor-pointer">
                <option value="ALL">All brokers</option>
                {brokerOpts.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </div>

            {/* Search */}
            <div className="relative hidden sm:block">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              <input value={store.search} onChange={(e) => store.setSearch(e.target.value)} placeholder="Search…" className="h-7 w-32 pl-7 pr-2 rounded-lg bg-slate-100 dark:bg-white/5 text-xs outline-none" />
            </div>

            {store.tab === 'positions' && (
              <span className="hidden md:inline text-xs text-slate-500">P&amp;L <span className={clsx('font-bold tabular-nums', pnlCls(netPnl))}>{inr(netPnl, true)}</span></span>
            )}

            <button onClick={() => void store.load(brokers)} title="Refresh" className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5">
              <svg viewBox="0 0 24 24" className={clsx('h-4 w-4', store.loading && 'animate-spin')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" /></svg>
            </button>
            <button onClick={() => setCollapsed(true)} title="Hide panel — Chart focus mode" className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-brand-500 transition-colors">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0">
            {store.tab === 'positions'
              ? <PositionsTab rows={positions} />
              : <OrdersTab rows={orders} counts={counts} />}
          </div>
        </>
      )}
    </div>
  )
}
