/**
 * DashboardPage v6
 *
 * Layout
 *   ① Header — greeting · market status · broker strip
 *   ② KPI cards (4)
 *   ③ Today's Activity — Manual + Algo strategy boxes
 *   ④ P&L Trend chart (full-width)
 *   ⑤ Option Insight — index sentiment, signals, opportunities
 *   ⑤b Stock Picks — compact conviction list
 *   ⑥ Live Positions & Orders — full tradebook panel
 *   ⑦ Quick nav
 */

import { useEffect, useMemo, useState } from 'react'
import { useOptionInsights } from '@/insight/options/useOptionInsights'
import type { OptIndex } from '@/insight/options/useOptionInsights'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useAuth } from '@/hooks/useAuth'
import { useBrokerStore } from '@/store/brokerStore'
import { getTrades } from '@/api/reports'
import { getUserStrategies } from '@/api/strategy'
import { fetchDashboard } from '@/insight/api'
import { isUserStrategyDeployed, MANUAL_CODES } from '@/types/strategy'
import type { Trade } from '@/types/reports'
import type { UserStrategy } from '@/types/strategy'
import type { RankingEntry, DashboardData } from '@/insight/types'
import { useTradebookStore } from '@/trade/features/tradebook/tradebookStore'
import { PositionsTab } from '@/trade/features/tradebook/PositionsTab'
import { OrdersTab, orderStatusCounts } from '@/trade/features/tradebook/OrdersTab'
import { totalPnl } from '@/trade/features/tradebook/types'
import type { Position } from '@/trade/features/tradebook/types'
import { inr, pnlCls } from '@/trade/features/tradebook/format'
import { useMarketStore } from '@/trade/store/marketStore'
import { realtime } from '@/trade/data/realtime/realtimeService'

// ─── Live PnL helpers ────────────────────────────────────────────────────────
//
// REALIZED  → always `t.realized_pnl` from the trade ledger API. The broker
//             positions API does NOT reliably return realized PnL, so we never
//             override this with broker data.
//
// UNREALIZED → computed live from tick data (via useTradebookStore positions).
//   Priority:
//     1. Broker position found → (ltp - avgPrice) × netQty  (handles partials,
//        direction, and uses the most accurate avg price)
//     2. LTP found in tick map but no position → qty × (ltp - entry)
//     3. Fall back to ledger snapshot `t.unrealized_pnl`

type LtpMap = Map<string, number>   // symbol → latest tick LTP

/**
 * True when a trade is actively running (position is open).
 * The API uses 'LONG' for long positions and 'SHORT' for short positions;
 * 'OPEN' may also appear on older records.
 */
const isOpenTrade = (t: { status: string }) => t.status !== 'CLOSED'

/**
 * Build symbol→LTP map.
 * Primary source: live market-store quotes (updated on every WS tick).
 * Fallback: broker position LTP (stale API snapshot, only used until first tick).
 */
function buildLtpMap(
  quotes: Record<string, { ltp: number }>,
  positions: Position[],
): LtpMap {
  const m: LtpMap = new Map()
  // Stale fallback first so live quotes overwrite
  for (const p of positions) m.set(p.symbol, p.ltp)
  // Live quotes win — updated on every WebSocket tick
  for (const [sym, q] of Object.entries(quotes)) {
    if (q.ltp) m.set(sym, q.ltp)
  }
  return m
}

/** Live unrealized for ONE open trade. Returns 0 for closed/zero-qty trades. */
function computeUnrealized(t: Trade, ltpMap: LtpMap): number {
  if (!isOpenTrade(t) || t.total_quantity === 0) return 0

  const ltp = ltpMap.get(t.symbol_name)
  if (ltp != null) {
    // SHORT (negative qty): entered by selling → avg_exit_price is the sell/entry price
    // LONG  (positive qty): entered by buying  → avg_entry_price is the buy/entry price
    const ref = t.total_quantity < 0 ? (t.avg_exit_price ?? 0) : t.avg_entry_price
    return t.total_quantity * (ltp - ref)
  }

  // Fallback: ledger snapshot (stale but correct sign — better than 0)
  return t.unrealized_pnl
}

// ─── IST date helpers ─────────────────────────────────────────────────────────
// India market trades happen in IST. Comparing UTC dates against IST trade
// timestamps is safe during market hours (UTC and IST share the same calendar
// date from 00:00 IST = 18:30 UTC-prev to 05:29 IST = 23:59 UTC), but we
// convert explicitly to be sure.
const IST_MS = 5.5 * 3_600_000

function todayIST(): string {
  // Add IST offset to UTC, then take the date portion of the resulting "UTC" string
  return new Date(Date.now() + IST_MS).toISOString().slice(0, 10)
}

/** Normalise a group/strategy name for comparison (uppercase trim). */
const normCode = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()

// ─── formatters ───────────────────────────────────────────────────────────────

const INR = (n: number) =>
  Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })

function shortDate(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ─── hooks ────────────────────────────────────────────────────────────────────

function useAfter(ms: number) {
  const [on, set] = useState(false)
  useEffect(() => { const t = setTimeout(() => set(true), ms); return () => clearTimeout(t) }, [ms])
  return on
}

function useMarket() {
  const [s, set] = useState({ open: false, hhmm: '', longDate: '' })
  useEffect(() => {
    const tick = () => {
      const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const wd = d.getDay(), m = d.getHours() * 60 + d.getMinutes()
      set({
        open: wd >= 1 && wd <= 5 && m >= 555 && m < 930,
        hhmm: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        longDate: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      })
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [])
  return s
}

// ─── dashboard data ───────────────────────────────────────────────────────────

interface DashData {
  loading: boolean
  live: Trade[]
  todayTrades: Trade[]
  todayPnl: number
  mtdPnl: number
  winRate: number | null
  closedCount: number
  daily: Record<string, number>
  strategies: UserStrategy[]
  // insight
  picks: RankingEntry[]
  momentumLeaders: RankingEntry[]
  newSignals: RankingEntry[]
  sectorLeaders: RankingEntry[]
  upgraded: RankingEntry[]
  downgraded: RankingEntry[]
  topHiddenGems: RankingEntry[]
  biggestImprovers: RankingEntry[]
  analyzedCount: number
}

function useDash(): DashData {
  const [todayTrades, setTodayTrades] = useState<Trade[]>([])  // fromDate+toDate=today → strategy boxes
  const [trades, setTrades]           = useState<Trade[]>([])  // 30-day → chart + MTD PnL
  const [strategies, setStrats]       = useState<UserStrategy[]>([])
  const [insight, setInsight]         = useState<DashboardData | null>(null)
  const [loading, setLoading]         = useState(true)

  // Broker positions: used as LTP fallback before first tick arrives
  const accounts    = useBrokerStore(s => s.accounts)
  const tbPositions = useTradebookStore(s => s.positions)
  const tbLoad      = useTradebookStore(s => s.load)
  const brokerKey   = accounts.map(b => b.id).join(',')
  useEffect(() => {
    if (accounts.length > 0) void tbLoad(accounts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerKey])

  // Live market quotes (updated on every WebSocket tick → triggers re-render)
  const quotes = useMarketStore(s => s.quotes)

  useEffect(() => {
    const todayStr = todayIST()
    const from30   = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    void Promise.allSettled([
      getTrades({ fromDate: todayStr, toDate: todayStr }),  // today only: for strategy boxes
      getTrades({ fromDate: from30 }),                      // 30-day: for chart + MTD
      getUserStrategies(),
      fetchDashboard(),
    ]).then(([tTodayR, t30R, sR, dR]) => {
      if (tTodayR.status === 'fulfilled') setTodayTrades(tTodayR.value)
      if (t30R.status   === 'fulfilled') setTrades(t30R.value)
      if (sR.status     === 'fulfilled') setStrats(sR.value.filter(isUserStrategyDeployed))
      if (dR.status     === 'fulfilled') setInsight(dR.value as DashboardData)
      setLoading(false)
    })
  }, [])

  const live   = useMemo(() => todayTrades.filter(isOpenTrade), [todayTrades])
  const closed = useMemo(() => trades.filter(t => t.status === 'CLOSED'), [trades])

  // Subscribe to tick feed for every open trade symbol so quotes stay live
  const openSymKey = useMemo(
    () => [...new Set(live.map(t => t.symbol_name).filter(Boolean))].sort().join(','),
    [live],
  )
  useEffect(() => {
    if (!openSymKey) return
    realtime.start()
    const unsubs = openSymKey.split(',').map(s => realtime.subscribeSymbolTick(s, { prime: false }))
    return () => unsubs.forEach(u => u())
  }, [openSymKey])

  // LTP map: quotes win (live ticks), broker positions are fallback until first tick
  const ltpMap = useMemo(() => buildLtpMap(quotes, tbPositions), [quotes, tbPositions])

  // Realized: sum t.realized_pnl from ALL today's trades — open trades carry partial
  //           realized PnL from partial exits, so we must include them too.
  // Unrealized: tick-accurate live calc (ltpMap refreshes on every tick).
  const todayPnl = useMemo(
    () =>
      todayTrades.reduce((s, t) => s + t.realized_pnl, 0) +
      live.reduce((s, t) => s + computeUnrealized(t, ltpMap), 0),
    [todayTrades, live, ltpMap],
  )

  const mtdPnl  = useMemo(() => closed.reduce((s, t) => s + t.realized_pnl, 0), [closed])
  const winRate = useMemo(
    () => closed.length ? (closed.filter(t => t.realized_pnl > 0).length / closed.length) * 100 : null,
    [closed],
  )

  const daily = useMemo(() => {
    const m: Record<string, number> = {}
    closed.forEach(t => {
      // Use last_updated_time for chart bucketing — this is the close/update date
      const d = (t.last_updated_time ?? t.first_placed_time).slice(0, 10)
      m[d] = (m[d] ?? 0) + t.realized_pnl
    })
    return m
  }, [closed])

  return {
    loading, live, todayTrades,
    todayPnl, mtdPnl, winRate, closedCount: closed.length,
    daily, strategies,
    picks:             insight?.topPicks?.slice(0, 6)        ?? [],
    momentumLeaders:   insight?.momentumLeaders?.slice(0, 8) ?? [],
    newSignals:        insight?.newSignals?.slice(0, 6)       ?? [],
    sectorLeaders:     insight?.sectorLeaders?.slice(0, 6)    ?? [],
    upgraded:          insight?.upgraded?.slice(0, 6)         ?? [],
    downgraded:        insight?.downgraded?.slice(0, 4)       ?? [],
    topHiddenGems:     insight?.topHiddenGems?.slice(0, 6)    ?? [],
    biggestImprovers:  insight?.biggestImprovers?.slice(0, 4) ?? [],
    analyzedCount:     insight?.analyzedCount                 ?? 0,
  }
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function Spark({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) return <div style={{ width: 64, height: 24 }} />
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const W = 64, H = 24, P = 2
  const xs = data.map((_, i) => P + (i / (data.length - 1)) * (W - 2 * P))
  const ys = data.map(v => H - P - ((v - min) / range) * (H - 2 * P))
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const area = `${line} L${xs[xs.length - 1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`
  const col  = positive ? '#10B981' : '#EF4444'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id={`sk-${positive ? 'p' : 'n'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.25" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sk-${positive ? 'p' : 'n'})`} />
      <path d={line} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.5" fill={col} />
    </svg>
  )
}

function KpiCard({ label, value, sub, positive, accent, sparkData }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode
  positive?: boolean; accent: string; sparkData?: number[]
}) {
  return (
    <div className="relative bg-white dark:bg-white/[0.03] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] p-5 shadow-sm dark:shadow-none overflow-hidden flex flex-col gap-3">
      {/* Color accent strip */}
      <div className={clsx('absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full', accent)} />

      <div className="flex items-start justify-between gap-2 pl-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30 leading-tight">
          {label}
        </p>
        {sparkData && sparkData.length >= 2 && <Spark data={sparkData} positive={positive ?? true} />}
      </div>

      <div className="pl-2">
        <div className={clsx(
          'text-[26px] font-black tabular-nums leading-none',
          positive === true  ? 'text-emerald-600 dark:text-emerald-400' :
          positive === false ? 'text-red-500 dark:text-red-400' :
          'text-slate-900 dark:text-white/90',
        )}>
          {value}
        </div>
        {sub && <p className="mt-1.5 text-[11px] text-slate-500 dark:text-white/30">{sub}</p>}
      </div>
    </div>
  )
}

// ─── algo strategy boxes ──────────────────────────────────────────────────────

interface StrategyBoxData {
  strat: UserStrategy
  code: string
  openTrades: Trade[]
  closedTrades: Trade[]
  totalUnrealized: number
  totalRealized: number
}

function TradeRow({ symbol, qty, entry, pnl, live }: {
  symbol: string; qty: number; entry: number; pnl: number; live: boolean
}) {
  const pos = pnl >= 0
  return (
    <div className={clsx(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl',
      live
        ? 'bg-indigo-50/60 dark:bg-indigo-500/[0.07] border border-indigo-100 dark:border-indigo-500/20'
        : 'bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.04]',
    )}>
      {live && <span className="shrink-0 h-2 w-2 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_6px_rgba(99,102,241,0.6)]" />}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-slate-900 dark:text-white/90 truncate leading-tight">{symbol}</p>
        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
          {qty} qty · ₹{entry.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={clsx('text-[13px] font-bold tabular-nums leading-tight', pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
          {pos ? '+' : '−'}₹{INR(pnl)}
        </p>
        <p className={clsx('text-[9px] font-semibold mt-0.5', live ? 'text-indigo-400' : pos ? 'text-emerald-400' : 'text-red-400')}>
          {live ? 'unrealised' : 'realised'}
        </p>
      </div>
    </div>
  )
}

function StrategyBox({ code, openTrades, closedTrades, totalUnrealized, totalRealized, isManual, ltpMap }: Omit<StrategyBoxData, 'strat'> & { isManual?: boolean; ltpMap: LtpMap }) {
  const grandTotal = totalRealized + totalUnrealized
  const pos = grandTotal >= 0
  const hasAny = openTrades.length > 0 || closedTrades.length > 0
  const wins = closedTrades.filter(t => t.realized_pnl > 0).length
  const winPct = closedTrades.length ? Math.round((wins / closedTrades.length) * 100) : null

  const headerGradient = isManual
    ? 'bg-gradient-to-br from-violet-600 to-indigo-700'
    : pos
      ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
      : 'bg-gradient-to-br from-red-500 to-rose-600'

  return (
    <div className="shrink-0 w-[400px] flex flex-col bg-white dark:bg-white/[0.03] rounded-2xl border border-slate-200/70 dark:border-white/[0.07] shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none overflow-hidden">
      {/* Hero header */}
      <div className={clsx('relative px-5 py-4 overflow-hidden', headerGradient)}>
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/[0.08]" />
        <div className="absolute -right-2 -top-2 h-16 w-16 rounded-full bg-white/[0.06]" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
              {isManual ? 'Manual Trades' : 'Algo Strategy'}
            </span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[18px] font-black text-white leading-tight truncate">{code}</p>
              <p className="text-[11px] text-white/60 mt-1">
                Today · {openTrades.length} running · {closedTrades.length} closed
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[22px] font-black text-white tabular-nums leading-none">
                {pos ? '+' : '−'}₹{INR(grandTotal)}
              </p>
              <p className="text-[10px] text-white/50 mt-0.5 font-medium">total P&amp;L</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-white/[0.06] border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex flex-col items-center py-2.5 gap-0.5">
          <p className={clsx('text-[14px] font-black tabular-nums', totalRealized >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
            {totalRealized >= 0 ? '+' : '−'}₹{INR(totalRealized)}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Realised</p>
        </div>
        <div className="flex flex-col items-center py-2.5 gap-0.5">
          <p className={clsx('text-[14px] font-black tabular-nums', totalUnrealized >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-500 dark:text-red-400')}>
            {totalUnrealized >= 0 ? '+' : '−'}₹{INR(totalUnrealized)}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Unrealised</p>
        </div>
        <div className="flex flex-col items-center py-2.5 gap-0.5">
          <p className="text-[14px] font-black tabular-nums text-amber-500 dark:text-amber-400">
            {winPct != null ? `${winPct}%` : '—'}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Win rate</p>
        </div>
      </div>

      {/* Trade lists */}
      <div className="flex-1 px-4 py-3 space-y-4">
        {openTrades.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500 dark:text-indigo-400">Running trades</p>
              <span className="ml-auto text-[10px] font-bold text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded-full">{openTrades.length}</span>
            </div>
            <div className="space-y-1.5">
              {openTrades.map(t => (
                <TradeRow key={t.trade_id} symbol={t.symbol_name} qty={t.total_quantity} entry={t.avg_entry_price} pnl={computeUnrealized(t, ltpMap)} live />
              ))}
            </div>
          </div>
        )}

        {closedTrades.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/30">Closed trades</p>
              <span className="ml-auto text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded-full">{closedTrades.length}</span>
            </div>
            <div className="space-y-1.5">
              {closedTrades.map(t => (
                <TradeRow key={t.trade_id} symbol={t.symbol_name} qty={t.total_quantity} entry={t.avg_entry_price} pnl={t.realized_pnl} live={false} />
              ))}
            </div>
          </div>
        )}

        {!hasAny && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-white/[0.05] grid place-items-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-300 dark:text-white/15" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[13px] font-medium text-slate-400 dark:text-white/25">No trades today</p>
            <p className="text-[11px] text-slate-300 dark:text-white/15">
              {isManual ? 'No manual trades placed yet' : "Strategy is live but hasn't traded yet"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function AlgoStrategyBoxes({ strategies, trades, loading }: { strategies: UserStrategy[]; trades: Trade[]; loading: boolean }) {
  // `trades` is already today-only (API called with fromDate=today&toDate=today).
  // No client-side date filtering needed — just split by group_name and status.

  // Live quotes from WebSocket tick feed (same source as TradebookPanel)
  const tbPositions = useTradebookStore(s => s.positions)
  const quotes      = useMarketStore(s => s.quotes)

  // Subscribe to tick feed for every open trade symbol
  const openSymKey = useMemo(() => {
    const syms = [...new Set(trades.filter(isOpenTrade).map(t => t.symbol_name).filter(Boolean))].sort()
    return syms.join(',')
  }, [trades])
  useEffect(() => {
    if (!openSymKey) return
    realtime.start()
    const unsubs = openSymKey.split(',').map(s => realtime.subscribeSymbolTick(s, { prime: false }))
    return () => unsubs.forEach(u => u())
  }, [openSymKey])

  // LTP map: live quotes primary, broker positions as fallback
  const ltpMap = useMemo(() => buildLtpMap(quotes, tbPositions), [quotes, tbPositions])

  const { manualOpen, manualClosed, manualUnrealized, manualRealized } = useMemo(() => {
    const manualAll    = trades.filter(t => MANUAL_CODES.has(t.group_name ?? ''))
    const manualOpen   = manualAll.filter(isOpenTrade)
    const manualClosed = manualAll.filter(t => t.status === 'CLOSED')
    return {
      manualOpen, manualClosed,
      manualUnrealized: manualOpen.reduce((s, t) => s + computeUnrealized(t, ltpMap), 0),
      manualRealized:   manualAll.reduce((s, t)  => s + t.realized_pnl, 0),
    }
  }, [trades, ltpMap])

  const strategyData = useMemo<StrategyBoxData[]>(() => {
    console.debug('[Dashboard] today trades group_names:', [...new Set(trades.map(t => t.group_name))])

    return strategies.map(strat => {
      const code  = (strat.strategyName ?? strat.strategyCode ?? String(strat.strategy_code ?? '')).trim()
      const codeN = normCode(code)

      const openTrades = codeN
        ? trades.filter(t =>
            isOpenTrade(t) &&
            normCode(t.group_name) === codeN &&
            !MANUAL_CODES.has(t.group_name ?? ''),
          )
        : []
      const closedTrades = codeN
        ? trades.filter(t =>
            t.status === 'CLOSED' &&
            normCode(t.group_name) === codeN &&
            !MANUAL_CODES.has(t.group_name ?? ''),
          )
        : []

      const allStratTrades = [...openTrades, ...closedTrades]
      return {
        strat, code, openTrades, closedTrades,
        totalUnrealized: openTrades.reduce((s, t)     => s + computeUnrealized(t, ltpMap), 0),
        totalRealized:   allStratTrades.reduce((s, t) => s + t.realized_pnl, 0),
      }
    })
  }, [strategies, trades, ltpMap])

  const hasContent = strategies.length > 0 || manualOpen.length > 0 || manualClosed.length > 0
  if (!loading && !hasContent) return null

  return (
    <div>
      <SectionHeader
        title="Today's Trading Activity"
        sub="Manual & algo strategies · running and closed trades"
        badge={strategies.length > 0 ? { label: `${strategies.length} ALGO LIVE`, color: 'emerald' } : undefined}
      />
      {loading ? (
        <div className="flex gap-5 overflow-x-hidden">
          {[0, 1, 2].map(i => (
            <div key={i} className="shrink-0 w-[400px] h-72 rounded-2xl bg-slate-100 dark:bg-white/[0.05] animate-pulse" style={{ opacity: 1 - i * 0.25 }} />
          ))}
        </div>
      ) : (
        <div className="flex gap-5 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <StrategyBox
            code="Manual"
            openTrades={manualOpen}
            closedTrades={manualClosed}
            totalUnrealized={manualUnrealized}
            totalRealized={manualRealized}
            isManual
            ltpMap={ltpMap}
          />
          {strategyData.map(({ strat, code, openTrades, closedTrades, totalUnrealized, totalRealized }) => (
            <StrategyBox
              key={strat.id}
              code={code}
              openTrades={openTrades}
              closedTrades={closedTrades}
              totalUnrealized={totalUnrealized}
              totalRealized={totalRealized}
              ltpMap={ltpMap}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── P&L chart ────────────────────────────────────────────────────────────────

interface ChartPoint { date: string; pnl: number; cumulative: number }

function PnlChart({ daily, mtdPnl, loading }: { daily: Record<string, number>; mtdPnl: number; loading: boolean }) {
  const data: ChartPoint[] = useMemo(() => {
    const sorted = Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)).slice(-30)
    let cum = 0
    return sorted.map(([iso, pnl]) => {
      cum += pnl
      return { date: shortDate(new Date(iso)), pnl, cumulative: cum }
    })
  }, [daily])

  const isPos   = mtdPnl >= 0
  const stroke  = isPos ? '#10B981' : '#EF4444'
  const yFmt = (v: number) => {
    const a = Math.abs(v)
    if (a >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`
    if (a >= 1_000)   return `₹${(v / 1_000).toFixed(0)}K`
    return `₹${v}`
  }

  return (
    <div className="bg-white dark:bg-white/[0.025] rounded-2xl border border-slate-200/70 dark:border-white/[0.06] shadow-sm dark:shadow-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.05]">
        <div>
          <h2 className="text-[14px] font-bold text-slate-800 dark:text-white/80">P&amp;L Trend · 30 Days</h2>
          <p className="text-[10px] text-slate-400 dark:text-white/25 mt-0.5">Cumulative realised returns · daily bars below</p>
        </div>
        {!loading && (
          <div className="text-right">
            <p className={clsx('text-[20px] font-black tabular-nums', isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
              {isPos ? '+' : '−'}₹{INR(mtdPnl)}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-white/25 mt-0.5">30-day realised</p>
          </div>
        )}
      </div>

      {/* Chart body */}
      <div className="px-4 py-4">
        {loading || !data.length ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 text-slate-300 dark:text-white/15">
            {loading
              ? <div className="h-full w-full bg-slate-100 dark:bg-white/[0.04] rounded-xl animate-pulse" />
              : <>
                  <svg viewBox="0 0 24 24" className="h-10 w-10 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M3 17l5-5 4 4 9-9M21 7h-4v4" /></svg>
                  <p className="text-[13px]">No trading history yet</p>
                </>}
          </div>
        ) : (
          <div className="space-y-1">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pos-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#10B981" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0}    />
                  </linearGradient>
                  <linearGradient id="neg-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#EF4444" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(100,116,139,0.6)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(100,116,139,0.6)' }} axisLine={false} tickLine={false} width={52} tickFormatter={yFmt} />
                <ReferenceLine y={0} stroke={stroke} strokeOpacity={0.2} strokeDasharray="4 3" />
                <Area type="monotone" dataKey="cumulative" stroke={stroke} strokeWidth={2} fill={isPos ? 'url(#pos-fill)' : 'url(#neg-fill)'} dot={false} activeDot={{ r: 4, fill: stroke, stroke: 'white', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={44}>
              <BarChart data={data} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                <ReferenceLine y={0} stroke="rgba(100,116,139,0.12)" />
                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                  {data.map((entry, i) => (
                    <Cell key={`c-${i}`} fill={entry.pnl >= 0 ? '#10B981' : '#EF4444'} fillOpacity={0.65} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── insight pick cards ───────────────────────────────────────────────────────

// ─── badge helpers ────────────────────────────────────────────────────────────

const BADGE_CLR: Record<string, string> = {
  'HIDDEN GEM CANDIDATE': 'text-violet-600 dark:text-violet-400',
  'EARLY DISCOVERY':      'text-indigo-600 dark:text-indigo-400',
  'MOMENTUM ESTABLISHED': 'text-emerald-600 dark:text-emerald-400',
  'BUILDING STRENGTH':    'text-sky-600 dark:text-sky-400',
  'TRANSITION STARTED':   'text-amber-600 dark:text-amber-400',
  'LEADERSHIP EMERGING':  'text-teal-600 dark:text-teal-400',
  'QUIET ACCUMULATION':   'text-slate-500 dark:text-slate-400',
}

// ─── compact stock picks list ─────────────────────────────────────────────────

function StockPicksList({ picks, loading, onNav }: {
  picks: RankingEntry[]; loading: boolean; onNav: () => void
}) {
  const navigate = useNavigate()
  return (
    <div className="bg-white dark:bg-white/[0.025] rounded-2xl border border-slate-200/70 dark:border-white/[0.06] shadow-sm dark:shadow-none overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.05]">
        <div>
          <p className="text-[13px] font-bold text-slate-800 dark:text-white/80">Top Conviction Picks</p>
          <p className="text-[10px] text-slate-400 dark:text-white/25 mt-0.5">Highest conviction · Insight engine</p>
        </div>
        <button onClick={onNav} className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors">
          View all →
        </button>
      </div>

      {loading ? (
        <div className="divide-y divide-slate-50 dark:divide-white/[0.03]">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="h-4 w-4 rounded bg-slate-100 dark:bg-white/[0.05] animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-24 rounded bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
                <div className="h-2.5 w-32 rounded bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
              </div>
              <div className="h-4 w-8 rounded bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
            </div>
          ))}
        </div>
      ) : !picks.length ? (
        <div className="py-10 text-center text-[13px] text-slate-400 dark:text-white/20">No picks yet</div>
      ) : (
        <ul className="divide-y divide-slate-50 dark:divide-white/[0.03]">
          {picks.map((p, i) => {
            const stars = p.conviction != null ? Math.max(1, Math.min(5, Math.round(p.conviction / 20))) : 0
            const badgeCls = p.badge ? (BADGE_CLR[p.badge] ?? 'text-slate-400') : 'text-slate-400'
            return (
              <li key={p.symbol_code}>
                <button
                  onClick={() => navigate(`/insight/${encodeURIComponent(p.symbol_code)}`)}
                  className="group w-full text-left flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.025] transition-colors"
                >
                  <span className="shrink-0 w-5 text-[11px] font-black tabular-nums text-center text-slate-300 dark:text-white/15">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-slate-900 dark:text-white/90 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{p.symbol_code}</span>
                      <span className="text-[11px]">
                        <span className="text-amber-400">{'★'.repeat(stars)}</span>
                        <span className="text-slate-200 dark:text-white/[0.07]">{'★'.repeat(5 - stars)}</span>
                      </span>
                    </div>
                    {p.badge && (
                      <p className={clsx('text-[9px] font-bold tracking-wide uppercase mt-0.5 truncate', badgeCls)}>{p.badge}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-extrabold text-violet-600 dark:text-violet-400 tabular-nums">D:{p.discovery_score ?? '—'}</p>
                    {p.sector && <p className="text-[9px] text-slate-400 dark:text-white/20 truncate max-w-[68px] mt-0.5">{p.sector}</p>}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── option insight section ───────────────────────────────────────────────────

const IDX_GRADIENT: Record<OptIndex, string> = {
  NIFTY:     'from-orange-500 to-amber-600',
  BANKNIFTY: 'from-blue-600 to-indigo-700',
  SENSEX:    'from-violet-600 to-purple-700',
}

const IDX_LABEL: Record<OptIndex, string> = {
  NIFTY:     'NIFTY',
  BANKNIFTY: 'BANK NIFTY',
  SENSEX:    'SENSEX',
}

function MiniOptionCard({ index }: { index: OptIndex }) {
  const navigate = useNavigate()
  const { report, loading } = useOptionInsights(index)
  const r = report

  const isActive  = r ? r.trader.decision !== 'NO TRADE' : false
  const gatesPassed = r ? r.strategy.gates.filter(g => g.pass === true).length : 0
  const gatesTotal  = r ? r.strategy.gates.length : 0
  const pct = gatesTotal ? gatesPassed / gatesTotal : 0
  const R = 30, C = 2 * Math.PI * R
  const arcColor = isActive ? '#34d399' : pct >= 0.75 ? '#fbbf24' : pct >= 0.5 ? '#818cf8' : '#94a3b8'

  return (
    <div className="flex-1 min-w-[260px] max-w-[380px] flex flex-col bg-white dark:bg-white/[0.03] rounded-2xl border border-slate-200/70 dark:border-white/[0.07] shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none overflow-hidden">
      {/* Header gradient */}
      <div className={clsx('relative px-5 py-4 overflow-hidden bg-gradient-to-br', IDX_GRADIENT[index])}>
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/[0.08]" />
        <div className="relative z-10 flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/55 mb-1">Option Insight</p>
            <p className="text-[18px] font-black text-white leading-tight">{IDX_LABEL[index]}</p>
          </div>
          {r && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black bg-white/15 text-white">
              <span className={clsx('h-1.5 w-1.5 rounded-full', r.session.marketOpen ? 'bg-emerald-400 animate-pulse' : 'bg-white/50')} />
              {r.session.marketOpen ? 'LIVE' : 'CLOSED'}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 flex flex-col gap-3">
        {loading && !r ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-6 w-3/4 rounded-lg bg-slate-100 dark:bg-white/[0.05]" />
            <div className="h-4 w-full rounded-lg bg-slate-100 dark:bg-white/[0.04]" />
            <div className="h-4 w-2/3 rounded-lg bg-slate-100 dark:bg-white/[0.03]" />
          </div>
        ) : r ? (
          <>
            {/* Decision */}
            <div>
              <p className={clsx('text-[18px] font-black leading-tight tracking-tight',
                isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white/80')}>
                {r.trader.decision}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-white/35 mt-1 line-clamp-2 leading-relaxed">
                {r.trader.reason}
              </p>
            </div>

            {/* Setup pill (when active) */}
            {r.trader.setup && (
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx(
                  'text-[11px] font-black px-2.5 py-1 rounded-full',
                  r.trader.setup.action === 'BUY'
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
                )}>
                  {r.trader.setup.action} {r.trader.setup.strike.toLocaleString('en-IN')} {r.trader.setup.side}
                </span>
                <span className="text-amber-400 text-[11px]">
                  {'★'.repeat(r.trader.setup.stars)}<span className="text-slate-200 dark:text-white/10">{'★'.repeat(5 - r.trader.setup.stars)}</span>
                </span>
              </div>
            )}

            {/* Stats row */}
            <div className="flex items-center gap-4 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
              {/* Readiness mini-arc */}
              <div className="relative h-16 w-16 shrink-0">
                <svg viewBox="0 0 72 72" className="h-16 w-16 -rotate-90">
                  <circle cx="36" cy="36" r={R} fill="none" strokeWidth="6" stroke="rgba(148,163,184,0.15)" />
                  <circle cx="36" cy="36" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
                    stroke={arcColor} strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[14px] font-black text-slate-900 dark:text-white tabular-nums">{gatesPassed}<span className="text-[10px] text-slate-400">/{gatesTotal}</span></span>
                </div>
              </div>
              {/* Quality + probabilities */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 dark:text-white/30">Market quality</span>
                  <span className={clsx('font-black', (r.quality.score ?? 0) >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500')}>
                    {r.quality.score ?? '—'}/100
                  </span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                  {[
                    { v: r.probabilities.bullish,    c: 'bg-emerald-500' },
                    { v: r.probabilities.rangebound, c: 'bg-slate-400' },
                    { v: r.probabilities.highVol,    c: 'bg-amber-500' },
                    { v: r.probabilities.bearish,    c: 'bg-rose-500' },
                  ].filter(x => x.v > 0).map((x, i) => (
                    <div key={i} className={clsx('h-full transition-all duration-700 rounded-sm', x.c)} style={{ width: `${x.v}%` }} />
                  ))}
                </div>
                <p className="text-[9px] text-slate-400 dark:text-white/20 truncate">{r.quality.interpretation}</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-[12px] text-slate-300 dark:text-white/20 py-4 text-center">No data yet</p>
        )}

        <button
          onClick={() => navigate('/insight/options')}
          className="mt-auto text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors text-right"
        >
          Full analysis →
        </button>
      </div>
    </div>
  )
}

function OptionInsightSection() {
  const navigate = useNavigate()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader
          title="Option Insight"
          sub="Live index option analysis · NIFTY · BANKNIFTY · SENSEX"
          inline
        />
        <button
          onClick={() => navigate('/insight/options')}
          className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors"
        >
          Full option insight →
        </button>
      </div>

      <div className="flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <MiniOptionCard index="NIFTY" />
        <MiniOptionCard index="BANKNIFTY" />
        <MiniOptionCard index="SENSEX" />
      </div>
    </div>
  )
}

// ─── tradebook panel ──────────────────────────────────────────────────────────

function DashboardTradebook() {
  const accounts = useBrokerStore(s => s.accounts)
  const store    = useTradebookStore()
  const [tab, setTab] = useState<'positions' | 'orders'>('positions')

  const brokerKey = accounts.map(b => b.id).join(',')
  useEffect(() => {
    if (accounts.length > 0) void store.load(accounts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerKey])

  const openPositions  = useMemo(() => store.positions.filter(p => p.status === 'OPEN'), [store.positions])
  const counts         = useMemo(() => orderStatusCounts(store.orders), [store.orders])
  const liveOrderCount = (counts.OPEN ?? 0) + (counts.PENDING ?? 0)
  const netPnl         = useMemo(() => openPositions.reduce((a, p) => a + totalPnl(p), 0), [openPositions])
  const filteredOrders = useMemo(
    () => store.orderStatus === 'ALL' ? store.orders : store.orders.filter(o => o.status === store.orderStatus),
    [store.orders, store.orderStatus],
  )

  return (
    <div className="bg-white dark:bg-white/[0.025] rounded-2xl border border-slate-200/70 dark:border-white/[0.06] shadow-sm dark:shadow-none overflow-hidden">
      {/* Tab header */}
      <div className="flex items-center gap-1 px-4 border-b border-slate-100 dark:border-white/[0.05]">
        <div className="flex items-center h-11">
          {(['positions', 'orders'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx(
                'h-full px-3 text-[13px] font-semibold border-b-2 transition-colors capitalize',
                tab === t
                  ? 'border-brand-500 text-slate-800 dark:text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200',
              )}>
              {t}
              <span className={clsx('ml-1.5 text-xs font-medium', tab === t ? 'text-slate-500' : 'text-slate-400')}>
                {t === 'positions' ? openPositions.length : `${liveOrderCount} live`}
              </span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {tab === 'positions' && openPositions.length > 0 && !store.loading && (
          <span className={clsx('text-[12px] font-bold tabular-nums mr-2', pnlCls(netPnl))}>{inr(netPnl, true)}</span>
        )}
        <button onClick={() => void store.reload()} title="Refresh"
          className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
          <svg viewBox="0 0 24 24" className={clsx('h-4 w-4', store.loading && 'animate-spin')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" />
          </svg>
        </button>
      </div>

      {/* Body */}
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400 dark:text-white/25">
          <svg viewBox="0 0 24 24" className="h-8 w-8 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 21h18M9 8h1m5 0h1M9 12h1m5 0h1M9 16h1m5 0h1M5 21V7a2 2 0 012-2h10a2 2 0 012 2v14" />
          </svg>
          <p className="text-[13px]">No broker connected</p>
        </div>
      ) : store.loading && !store.positions.length && !store.orders.length ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
          <svg viewBox="0 0 24 24" className="h-6 w-6 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" />
          </svg>
          <p className="text-[13px]">Loading positions &amp; orders…</p>
        </div>
      ) : (
        <div style={{ height: 440 }} className="relative overflow-hidden">
          {tab === 'positions'
            ? <PositionsTab rows={openPositions} />
            : <OrdersTab rows={filteredOrders} counts={counts} />}
        </div>
      )}
    </div>
  )
}

// ─── shared section header ────────────────────────────────────────────────────

function SectionHeader({ title, sub, badge, inline }: {
  title: string; sub?: string
  badge?: { label: string; color: 'emerald' | 'violet' | 'amber' }
  inline?: boolean
}) {
  const BADGE_CLS = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    violet:  'text-violet-600 dark:text-violet-400',
    amber:   'text-amber-600 dark:text-amber-400',
  }
  const DOT_CLS = {
    emerald: 'bg-emerald-500',
    violet:  'bg-violet-500',
    amber:   'bg-amber-500',
  }
  return (
    <div className={clsx('flex items-center gap-3', !inline && 'mb-4')}>
      <div>
        <h2 className="text-[14px] font-bold text-slate-800 dark:text-white/80">{title}</h2>
        {sub && <p className="text-[10px] text-slate-400 dark:text-white/25 mt-0.5">{sub}</p>}
      </div>
      {badge && (
        <span className={clsx('flex items-center gap-1.5 text-[10px] font-black tracking-widest ml-1', BADGE_CLS[badge.color])}>
          <span className={clsx('h-2 w-2 rounded-full animate-pulse shadow-sm', DOT_CLS[badge.color])} />
          {badge.label}
        </span>
      )}
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const accounts = useBrokerStore(s => s.accounts)
  const market   = useMarket()
  const d        = useDash()
  const show     = useAfter(40)

  const isAdmin = user?.role === 'ADMIN'
  const name    = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username.split('@')[0]
    : ''

  const spark7 = useMemo(() => {
    const sorted = Object.entries(d.daily).sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([, v]) => v)
    return sorted.length >= 2 ? sorted : []
  }, [d.daily])

  const sparkCum = useMemo(() => {
    let cum = 0
    return Object.entries(d.daily).sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([, v]) => { cum += v; return cum })
  }, [d.daily])

  const hour     = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const todayPos = d.todayPnl >= 0
  const mtdPos   = d.mtdPnl >= 0
  const wrPos    = (d.winRate ?? 0) >= 50

  return (
    <div
      className="flex-1 min-h-screen bg-slate-50/60 dark:bg-surface-dark"
      style={{ opacity: show ? 1 : 0, transition: 'opacity 0.4s ease' }}
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-7">

        {/* ① Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 dark:text-white/25">{greeting}</p>
            <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white/90 tracking-tight mt-0.5">
              {name ? `${name}'s Dashboard` : 'Dashboard'}{isAdmin ? ' · Admin' : ''}
              <span className="ml-2 text-slate-300 dark:text-white/15 font-light">·</span>
              <span className="ml-2 text-[18px] font-semibold text-slate-400 dark:text-white/25">{market.longDate}</span>
            </h1>
            {!d.loading && (
              <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[12px]">
                <span className={clsx('font-semibold', todayPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                  {todayPos ? '+' : '−'}₹{INR(d.todayPnl)} today
                </span>
                {d.winRate != null && (
                  <><span className="text-slate-200 dark:text-white/10">·</span>
                  <span className="text-slate-500 dark:text-white/35">{Math.round(d.winRate)}% win rate</span></>
                )}
                <span className="text-slate-200 dark:text-white/10">·</span>
                <span className="text-slate-500 dark:text-white/35">{d.closedCount} trades closed</span>
                {d.strategies.length > 0 && (
                  <><span className="text-slate-200 dark:text-white/10">·</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {d.strategies.length} {d.strategies.length === 1 ? 'strategy' : 'strategies'} live
                  </span></>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <div className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold tracking-[0.12em]',
              market.open
                ? 'bg-emerald-50 dark:bg-emerald-500/[0.08] border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.07] text-slate-500 dark:text-white/25',
            )}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', market.open ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-white/20')} />
              {market.open ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </div>
            <span className="text-[11px] font-mono text-slate-400 dark:text-white/20">{market.hhmm} IST</span>
            {accounts.length > 0 && (
              <div className="flex items-center gap-1.5">
                {accounts.slice(0, 3).map(a => (
                  <span key={a.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-white/20">
                    {(a as { displayName?: string }).displayName ?? '—'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ② KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Today's P&L"
            value={d.loading ? '—' : `${todayPos ? '+' : '−'}₹${INR(d.todayPnl)}`}
            sub={d.live.length > 0 ? `${d.live.length} open position${d.live.length !== 1 ? 's' : ''} included` : 'No open positions'}
            positive={d.loading ? undefined : todayPos || undefined}
            accent={todayPos ? 'bg-emerald-500' : 'bg-red-500'}
            sparkData={spark7}
          />
          <KpiCard
            label="30-Day Return"
            value={d.loading ? '—' : `${mtdPos ? '+' : '−'}₹${INR(d.mtdPnl)}`}
            sub={`${d.closedCount} trades closed`}
            positive={d.loading ? undefined : mtdPos || undefined}
            accent={mtdPos ? 'bg-emerald-500' : 'bg-red-500'}
            sparkData={sparkCum}
          />
          <KpiCard
            label="Win Rate · 30D"
            value={d.loading || d.winRate == null ? '—' : `${Math.round(d.winRate)}%`}
            sub={d.closedCount > 0 ? `${d.closedCount} closed trades` : 'No data yet'}
            positive={d.loading || d.winRate == null ? undefined : wrPos || undefined}
            accent="bg-amber-400"
            sparkData={spark7.map((v, i) => (i > 0 && v > spark7[i - 1] ? 1 : 0))}
          />
          <KpiCard
            label="Open Positions"
            value={d.loading ? '—' : String(d.live.length)}
            sub={d.strategies.length > 0 ? `${d.strategies.length} algo${d.strategies.length !== 1 ? 's' : ''} running` : 'Manual trading'}
            positive={d.live.length > 0 ? true : undefined}
            accent="bg-brand-500"
          />
        </div>

        {/* ③ Today's Activity — Manual + Algo boxes */}
        <AlgoStrategyBoxes strategies={d.strategies} trades={d.todayTrades} loading={d.loading} />

        {/* ④ P&L Trend — full width */}
        <PnlChart daily={d.daily} mtdPnl={d.mtdPnl} loading={d.loading} />

        {/* ⑤ Option Insight */}
        <OptionInsightSection />

        {/* ⑤b Top Conviction Picks */}
        <StockPicksList picks={d.picks} loading={d.loading} onNav={() => navigate('/insight')} />

        {/* ⑥ Live Positions & Orders */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <SectionHeader
              title="Live Positions & Orders"
              sub="Real broker data · SL / Target / Exit / Modify / Cancel"
              inline
            />
            <button
              onClick={() => navigate('/trade')}
              className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors"
            >
              Full trade module →
            </button>
          </div>
          <DashboardTradebook />
        </div>

        {/* ⑦ Quick nav */}
        <div className="flex items-center justify-center gap-2 flex-wrap py-2">
          {[
            { label: 'Trade Now', to: '/trade', primary: true },
            { label: 'Journal', to: '/journal' },
            { label: 'Reports', to: '/reports' },
            { label: 'Stock Insights', to: '/insight' },
            { label: 'Options', to: '/insight/options' },
            ...(isAdmin ? [{ label: 'Analytics', to: '/analytics' }] : []),
          ].map(c => (
            <button key={c.to} onClick={() => navigate(c.to)}
              className={clsx(
                'px-4 py-2 rounded-full text-[12px] font-semibold transition-all hover:-translate-y-px active:scale-95',
                (c as { primary?: boolean }).primary
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25 hover:bg-brand-700'
                  : 'bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-white/45 hover:bg-slate-50 dark:hover:bg-white/[0.07]',
              )}>
              {c.label}
            </button>
          ))}
        </div>

        <p className="text-center text-[10px] text-slate-300 dark:text-white/12 pb-2 tracking-wider">
          30-DAY WINDOW · UNREALISED P&amp;L INCLUDED · NOT INVESTMENT ADVICE
        </p>

      </div>
    </div>
  )
}
