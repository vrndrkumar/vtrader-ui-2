import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useSelectedBrokers } from '@/store/brokerStore'
import { useMarketStore } from '../../store/marketStore'
import { realtime } from '../../data/realtime/realtimeService'
import { useTradebookStore } from './tradebookStore'
import { totalPnl, netQty } from './types'
import { inr, pnlCls } from './format'
import { PositionsTab } from './PositionsTab'
import { OrdersTab, orderStatusCounts } from './OrdersTab'

const optOf = (s: string): 'CE' | 'PE' | '' => { const u = (s || '').toUpperCase(); return u.includes('PE') ? 'PE' : u.includes('CE') ? 'CE' : '' }

const SEG_TONE: Record<string, string> = {
  brand: 'bg-brand-600 text-white shadow-sm shadow-brand-600/25',
  green: 'bg-green-600 text-white shadow-sm shadow-green-600/25',
  red: 'bg-red-600 text-white shadow-sm shadow-red-600/25',
  slate: 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white',
}
interface SegOpt<T> { v: T; l: string; tone?: 'brand' | 'green' | 'red'; icon?: string; dot?: string; count?: number }
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: SegOpt<T>[] }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-white/5 ring-1 ring-black/5 dark:ring-white/5 shrink-0">
      {options.map((o) => {
        const on = value === o.v
        return (
          <button key={o.v} onClick={() => onChange(o.v)}
            className={clsx('flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-bold transition-all active:scale-95', on ? SEG_TONE[o.tone ?? 'slate'] : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>
            {o.icon && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={o.icon} /></svg>}
            {o.dot && <span className={clsx('h-1.5 w-1.5 rounded-full', o.dot)} />}
            {o.l}
            {o.count != null && <span className={clsx('text-[9px] font-semibold tabular-nums px-1 rounded-full', on ? 'bg-white/20' : 'bg-slate-200/70 dark:bg-white/10 text-slate-500')}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
const IC_UP = 'M12 19V5M5 12l7-7 7 7'
const IC_DOWN = 'M12 5v14M5 12l7 7 7-7'

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
const loadCollapsed = (): boolean => { try { const v = sessionStorage.getItem(COLLAPSED_KEY); return v === null ? true : v === '1' } catch { return true } }

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
    // Positions only need the live LTP — skip candle-history priming per symbol.
    const unsubs = symKey.split(',').map((s) => realtime.subscribeSymbolTick(s, { prime: false }))
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

  // Index / CE-PE / side filters (apply to both tabs); status only to positions.
  const matchFS = (r: { indexName: string; symbol: string }, side: 'BUY' | 'SELL') =>
    (store.indexF === 'ALL' || r.indexName === store.indexF) &&
    (store.optType === 'ALL' || optOf(r.symbol) === store.optType) &&
    (store.sideF === 'ALL' || side === store.sideF)

  const posView = useMemo(
    () => positions.filter((p) => (store.posStatus === 'ALL' || p.status === store.posStatus) && matchFS(p, netQty(p) >= 0 ? 'BUY' : 'SELL')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positions, store.posStatus, store.indexF, store.optType, store.sideF],
  )
  const ordBySym = useMemo(() => ordersAll.filter((o) => matchFS(o, o.side)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordersAll, store.indexF, store.optType, store.sideF])
  const counts = useMemo(() => orderStatusCounts(ordBySym), [ordBySym])
  const orders = useMemo(() => store.orderStatus === 'ALL' ? ordBySym : ordBySym.filter((o) => o.status === store.orderStatus), [ordBySym, store.orderStatus])

  // Net P&L = realized + unrealized across ALL positions (closed contribute their
  // realized P&L; open contribute realized + live unrealized). Not just open.
  const netPnl = useMemo(() => positions.reduce((a, p) => a + totalPnl(p), 0), [positions])
  const liveOrders = counts.OPEN + counts.PENDING
  const brokerOpts = useMemo(() => brokers.map((b) => b.displayName), [brokers])
  const indices = useMemo(() => [...new Set([...store.positions, ...store.orders].map((r) => r.indexName).filter(Boolean))], [store.positions, store.orders])
  const filtersActive = store.posStatus !== 'ALL' || store.indexF !== 'ALL' || store.optType !== 'ALL' || store.sideF !== 'ALL'

  // Live per-filter counts for the current tab.
  const cnt = useMemo(() => {
    if (store.tab === 'positions') return {
      open: positions.filter((p) => p.status === 'OPEN').length,
      closed: positions.filter((p) => p.status === 'CLOSED').length,
      ce: positions.filter((p) => optOf(p.symbol) === 'CE').length,
      pe: positions.filter((p) => optOf(p.symbol) === 'PE').length,
      buy: positions.filter((p) => netQty(p) >= 0).length,
      sell: positions.filter((p) => netQty(p) < 0).length,
    }
    return {
      open: 0, closed: 0,
      ce: ordersAll.filter((o) => optOf(o.symbol) === 'CE').length,
      pe: ordersAll.filter((o) => optOf(o.symbol) === 'PE').length,
      buy: ordersAll.filter((o) => o.side === 'BUY').length,
      sell: ordersAll.filter((o) => o.side === 'SELL').length,
    }
  }, [store.tab, positions, ordersAll])

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

          {/* Filter bar */}
          <div className="h-10 shrink-0 flex items-center gap-2.5 px-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-white/[0.015] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {store.tab === 'positions' && (
              <Seg value={store.posStatus} onChange={store.setPosStatus} options={[
                { v: 'ALL', l: 'All' },
                { v: 'OPEN', l: 'Running', tone: 'green', dot: 'bg-green-400', count: cnt.open },
                { v: 'CLOSED', l: 'Closed', dot: 'bg-slate-400', count: cnt.closed },
              ]} />
            )}
            <span className="h-4 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />
            <div className="relative shrink-0">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" /></svg>
              <select value={store.indexF} onChange={(e) => store.setIndexF(e.target.value)}
                className={clsx('h-7 pl-7 pr-6 rounded-lg text-xs font-semibold outline-none appearance-none cursor-pointer ring-1 transition-colors',
                  store.indexF !== 'ALL' ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-300 ring-brand-200 dark:ring-brand-700/50' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 ring-black/5 dark:ring-white/5')}>
                <option value="ALL">All indices</option>
                {indices.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </div>
            <Seg value={store.optType} onChange={store.setOptType} options={[
              { v: 'ALL', l: 'All' },
              { v: 'CE', l: 'CE', tone: 'green', icon: IC_UP, count: cnt.ce },
              { v: 'PE', l: 'PE', tone: 'red', icon: IC_DOWN, count: cnt.pe },
            ]} />
            <Seg value={store.sideF} onChange={store.setSideF} options={[
              { v: 'ALL', l: 'All' },
              { v: 'BUY', l: 'Buy', tone: 'brand', icon: IC_UP, count: cnt.buy },
              { v: 'SELL', l: 'Sell', tone: 'red', icon: IC_DOWN, count: cnt.sell },
            ]} />
            {filtersActive && (
              <button onClick={() => { store.setPosStatus('ALL'); store.setIndexF('ALL'); store.setOptType('ALL'); store.setSideF('ALL') }}
                className="flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-white/5 shrink-0 transition-colors">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>Clear
              </button>
            )}
            <div className="flex-1" />
            <span className="text-[11px] font-medium text-slate-400 shrink-0 pr-1 tabular-nums">{store.tab === 'positions' ? posView.length : orders.length} shown</span>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0">
            {store.tab === 'positions'
              ? <PositionsTab rows={posView} />
              : <OrdersTab rows={orders} counts={counts} />}
          </div>
        </>
      )}
    </div>
  )
}
