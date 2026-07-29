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

// ─── strategy card data ──────────────────────────────────────────────────────

interface StrategyCardData {
  id: string
  code: string
  isManual: boolean
  openTrades: Trade[]
  closedTrades: Trade[]
  totalUnrealized: number
  totalRealized: number
}

// ─── compact strategy card ────────────────────────────────────────────────────

function StrategyCard({ data, ltpMap, onClick }: {
  data: StrategyCardData; ltpMap: LtpMap; onClick: () => void
}) {
  const { code, isManual, openTrades, closedTrades, totalUnrealized, totalRealized } = data
  const grandTotal = totalRealized + totalUnrealized
  const pos        = grandTotal >= 0
  const wins       = closedTrades.filter(t => t.realized_pnl > 0).length
  const winPct     = closedTrades.length ? Math.round((wins / closedTrades.length) * 100) : null
  const isActive   = openTrades.length > 0

  const sparkData = useMemo(
    () => closedTrades.slice(-14).map(t => t.realized_pnl),
    [closedTrades],
  )

  const profitable = openTrades.filter(t => computeUnrealized(t, ltpMap) >= 0).length
  const losing     = openTrades.length - profitable
  const aiMsg: string | null =
    openTrades.length === 0
      ? (closedTrades.length > 0 ? `${wins} win${wins !== 1 ? 's' : ''} out of ${closedTrades.length} closed` : null)
      : profitable > 0 && losing > 0
        ? `${profitable} in profit · ${losing} need${losing === 1 ? 's' : ''} attention`
        : profitable === openTrades.length
          ? `All ${profitable} position${profitable !== 1 ? 's' : ''} profitable`
          : `${losing} position${losing !== 1 ? 's' : ''} need attention`

  const accentGrad = isManual
    ? 'from-violet-500 to-indigo-600'
    : pos
      ? 'from-emerald-400 to-teal-500'
      : 'from-rose-400 to-red-500'

  const stats = [
    {
      label: 'Realized',
      value: `${totalRealized >= 0 ? '+' : '−'}₹${INR(Math.abs(totalRealized))}`,
      cls: totalRealized >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400',
    },
    {
      label: 'Unrealized',
      value: `${totalUnrealized >= 0 ? '+' : '−'}₹${INR(Math.abs(totalUnrealized))}`,
      cls: totalUnrealized >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-500 dark:text-red-400',
    },
    { label: 'Win Rate', value: winPct != null ? `${winPct}%` : '—', cls: 'text-amber-500 dark:text-amber-400' },
  ]

  return (
    <button
      onClick={onClick}
      className="group text-left w-full bg-white dark:bg-white/[0.03] rounded-2xl border border-slate-200/70 dark:border-white/[0.07] shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none overflow-hidden hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.35)] transition-all duration-200 flex flex-col"
    >
      {/* Gradient top accent */}
      <div className={clsx('h-[3px] w-full bg-gradient-to-r', accentGrad)} />

      <div className="flex-1 p-5 flex flex-col gap-3.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/25">
                {isManual ? 'Manual' : 'Algo'}
              </span>
              {isActive && (
                <span className="flex items-center gap-1 text-[9px] font-black text-emerald-500 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              )}
            </div>
            <p className="text-[15px] font-black text-slate-900 dark:text-white/90 truncate leading-tight">{code}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={clsx('text-[22px] font-black tabular-nums leading-none', pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
              {pos ? '+' : '−'}₹{INR(grandTotal)}
            </p>
            <p className="text-[9px] text-slate-400 dark:text-white/25 mt-0.5 font-medium">total P&amp;L</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          {stats.map(s => (
            <div key={s.label} className="bg-slate-50/80 dark:bg-white/[0.025] rounded-xl px-3 py-2 text-center border border-slate-100 dark:border-white/[0.04]">
              <p className={clsx('text-[12px] font-black tabular-nums', s.cls)}>{s.value}</p>
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/25 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Counts + sparkline */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className={clsx('h-2 w-2 rounded-full', isActive ? 'bg-indigo-400 animate-pulse' : 'bg-slate-300 dark:bg-white/20')} />
              <span className="text-[11px] font-bold text-slate-700 dark:text-white/60">{openTrades.length}</span>
              <span className="text-[10px] text-slate-400 dark:text-white/25">running</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-white/20" />
              <span className="text-[11px] font-bold text-slate-500 dark:text-white/40">{closedTrades.length}</span>
              <span className="text-[10px] text-slate-400 dark:text-white/25">closed</span>
            </div>
          </div>
          {sparkData.length >= 2 && <Spark data={sparkData} positive={pos} />}
        </div>

        {/* AI summary */}
        {aiMsg && (
          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-white/30 bg-slate-50 dark:bg-white/[0.025] rounded-xl px-3 py-1.5 border border-slate-100 dark:border-white/[0.04]">
            <span className="text-brand-500 shrink-0">✦</span>
            <span className="truncate">{aiMsg}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
        <span className="text-[10px] text-slate-400 dark:text-white/25">Click to view all trades</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-brand-600 dark:text-brand-400 group-hover:text-brand-700 transition-colors">
          View details
          <svg viewBox="0 0 24 24" className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </button>
  )
}

// ─── strategy table (table-view alternative) ──────────────────────────────────

function StrategyTable({ cards, onSelect }: {
  cards: StrategyCardData[]; onSelect: (d: StrategyCardData) => void
}) {
  return (
    <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-slate-200/70 dark:border-white/[0.07] shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/[0.06]">
              {['Strategy', 'Status', 'Running', 'Closed', 'Realized', 'Unrealized', 'Win Rate', 'Total P&L'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-white/25 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
            {cards.map(card => {
              const total  = card.totalRealized + card.totalUnrealized
              const pos    = total >= 0
              const wins   = card.closedTrades.filter(t => t.realized_pnl > 0).length
              const winPct = card.closedTrades.length ? Math.round((wins / card.closedTrades.length) * 100) : null
              return (
                <tr key={card.id} onClick={() => onSelect(card)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className={clsx('h-2 w-2 rounded-full shrink-0', card.openTrades.length > 0 ? 'bg-indigo-400 animate-pulse' : 'bg-slate-300 dark:bg-white/20')} />
                      <div>
                        <p className="text-[12px] font-bold text-slate-800 dark:text-white/80 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{card.code}</p>
                        <p className="text-[9px] text-slate-400 dark:text-white/25">{card.isManual ? 'Manual' : 'Algo'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={clsx('text-[9px] font-black px-2 py-0.5 rounded-full', card.openTrades.length > 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-white/25')}>
                      {card.openTrades.length > 0 ? 'LIVE' : 'IDLE'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[12px] font-bold text-slate-700 dark:text-white/60">{card.openTrades.length}</td>
                  <td className="px-4 py-3.5 text-[12px] text-slate-500 dark:text-white/40">{card.closedTrades.length}</td>
                  <td className="px-4 py-3.5">
                    <span className={clsx('text-[12px] font-bold tabular-nums', card.totalRealized >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                      {card.totalRealized >= 0 ? '+' : '−'}₹{INR(Math.abs(card.totalRealized))}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={clsx('text-[12px] font-bold tabular-nums', card.totalUnrealized >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-500 dark:text-red-400')}>
                      {card.totalUnrealized >= 0 ? '+' : '−'}₹{INR(Math.abs(card.totalUnrealized))}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-[12px] font-bold text-amber-500 dark:text-amber-400">{winPct != null ? `${winPct}%` : '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={clsx('text-[13px] font-black tabular-nums', pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                      {pos ? '+' : '−'}₹{INR(Math.abs(total))}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── strategy detail drawer ───────────────────────────────────────────────────

function StrategyDrawer({ data, ltpMap, onClose }: {
  data: StrategyCardData | null; ltpMap: LtpMap; onClose: () => void
}) {
  const navigate          = useNavigate()
  const isOpen            = data !== null
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Reset when switching strategy
  useEffect(() => { setShowAll(false) }, [data?.id])

  const grandTotal = (data?.totalRealized ?? 0) + (data?.totalUnrealized ?? 0)
  const pos        = grandTotal >= 0
  const wins       = data?.closedTrades.filter(t => t.realized_pnl > 0).length ?? 0
  const winPct     = data?.closedTrades.length ? Math.round((wins / data.closedTrades.length) * 100) : null
  const SHOW_N     = 5
  const moreCount  = data ? Math.max(0, data.closedTrades.length - SHOW_N) : 0
  const closedList = data
    ? (showAll ? [...data.closedTrades].reverse() : data.closedTrades.slice(-SHOW_N).reverse())
    : []

  const headerGrad = data?.isManual
    ? 'from-violet-600 to-indigo-700'
    : pos ? 'from-emerald-500 to-teal-600' : 'from-red-500 to-rose-600'

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        className={clsx(
          'fixed inset-0 z-40 bg-black/25 dark:bg-black/50 backdrop-blur-[2px] transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'fixed right-0 top-0 bottom-0 z-50 w-[480px] max-w-[100vw]',
          'bg-white dark:bg-[#0c1018] border-l border-slate-200 dark:border-white/[0.07] shadow-2xl',
          'flex flex-col transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {data && (
          <>
            {/* Drawer header */}
            <div className={clsx('shrink-0 relative px-5 py-4 overflow-hidden bg-gradient-to-br', headerGrad)}>
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/[0.07]" />
              <div className="absolute right-4 -top-2 h-16 w-16 rounded-full bg-white/[0.05]" />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/60 mb-0.5">
                      {data.isManual ? 'Manual Trades' : 'Algo Strategy'}
                    </p>
                    <h2 className="text-[18px] font-black text-white leading-tight truncate">{data.code}</h2>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-[22px] font-black text-white tabular-nums leading-none">
                        {pos ? '+' : '−'}₹{INR(grandTotal)}
                      </p>
                      <p className="text-[9px] text-white/50 mt-0.5">total P&amp;L</p>
                    </div>
                    <button
                      onClick={onClose}
                      className="h-8 w-8 grid place-items-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors active:scale-95"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Realized',   v: `${data.totalRealized   >= 0 ? '+' : '−'}₹${INR(Math.abs(data.totalRealized))}` },
                    { label: 'Unrealized', v: `${data.totalUnrealized >= 0 ? '+' : '−'}₹${INR(Math.abs(data.totalUnrealized))}` },
                    { label: 'Win Rate',   v: winPct != null ? `${winPct}%` : '—' },
                  ].map(s => (
                    <div key={s.label} className="bg-white/10 rounded-xl px-3 py-2 text-center">
                      <p className="text-[13px] font-black text-white tabular-nums">{s.v}</p>
                      <p className="text-[8px] font-bold uppercase tracking-wider text-white/50 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">

              {/* Running trades */}
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500 dark:text-indigo-400">Running Trades</p>
                  <span className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
                    {data.openTrades.length}
                  </span>
                </div>

                {data.openTrades.length === 0 ? (
                  <p className="text-center text-[12px] text-slate-400 dark:text-white/25 py-6">No running positions</p>
                ) : (
                  <div className="space-y-2">
                    {data.openTrades.map(t => {
                      const ur = computeUnrealized(t, ltpMap)
                      const up = ur >= 0
                      return (
                        <div key={t.trade_id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-500/[0.07] border border-indigo-100 dark:border-indigo-500/20">
                          <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-slate-900 dark:text-white/90 truncate">{t.symbol_name}</p>
                            <p className="text-[10px] text-slate-400 dark:text-white/30 font-mono mt-0.5">
                              {Math.abs(t.total_quantity)} qty · ₹{t.avg_entry_price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={clsx('text-[13px] font-bold tabular-nums', up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                              {up ? '+' : '−'}₹{INR(Math.abs(ur))}
                            </p>
                            <p className="text-[9px] text-indigo-400 mt-0.5">unrealised</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="mx-5 border-t border-slate-100 dark:border-white/[0.06]" />

              {/* Closed trades */}
              <div className="px-5 pt-4 pb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-white/20" />
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">Closed Trades</p>
                  <span className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-white/30">
                    {data.closedTrades.length}
                  </span>
                </div>

                {data.closedTrades.length === 0 ? (
                  <p className="text-center text-[12px] text-slate-400 dark:text-white/25 py-6">No closed trades today</p>
                ) : (
                  <>
                    {/* Summary strip */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[
                        { label: 'Total Closed', value: data.closedTrades.length, cls: 'text-slate-800 dark:text-white/80' },
                        { label: 'Winners',      value: wins,                           cls: 'text-emerald-600 dark:text-emerald-400' },
                        { label: 'Losers',       value: data.closedTrades.length - wins, cls: 'text-red-500 dark:text-red-400' },
                      ].map(s => (
                        <div key={s.label} className="text-center bg-slate-50 dark:bg-white/[0.025] rounded-xl px-2 py-2.5 border border-slate-100 dark:border-white/[0.04]">
                          <p className={clsx('text-[14px] font-black', s.cls)}>{s.value}</p>
                          <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400 mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Trade list */}
                    <div className="space-y-1.5">
                      {closedList.map(t => {
                        const p = t.realized_pnl >= 0
                        return (
                          <div key={t.trade_id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.025] border border-slate-100 dark:border-white/[0.04]">
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold text-slate-900 dark:text-white/90 truncate">{t.symbol_name}</p>
                              <p className="text-[10px] text-slate-400 dark:text-white/30 font-mono mt-0.5">
                                {Math.abs(t.total_quantity)} qty · ₹{t.avg_entry_price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={clsx('text-[13px] font-bold tabular-nums', p ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                                {p ? '+' : '−'}₹{INR(Math.abs(t.realized_pnl))}
                              </p>
                              <p className={clsx('text-[9px] mt-0.5', p ? 'text-emerald-400' : 'text-red-400')}>realised</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex items-center gap-2">
                      {moreCount > 0 && !showAll && (
                        <button
                          onClick={() => setShowAll(true)}
                          className="flex-1 py-2 text-[11px] font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/15 rounded-xl transition-colors border border-brand-200 dark:border-brand-500/25"
                        >
                          +{moreCount} more trades
                        </button>
                      )}
                      <button
                        onClick={() => navigate('/journal')}
                        className="flex-1 py-2 text-[11px] font-bold text-slate-600 dark:text-white/40 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.07] rounded-xl transition-colors"
                      >
                        View in Journal →
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ─── algo strategy boxes ──────────────────────────────────────────────────────

function AlgoStrategyBoxes({ strategies, trades, loading }: { strategies: UserStrategy[]; trades: Trade[]; loading: boolean }) {
  const [view,   setView]   = useState<'card' | 'table'>('card')
  const [active, setActive] = useState<StrategyCardData | null>(null)

  const tbPositions = useTradebookStore(s => s.positions)
  const quotes      = useMarketStore(s => s.quotes)

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

  const ltpMap = useMemo(() => buildLtpMap(quotes, tbPositions), [quotes, tbPositions])

  // Manual card
  const manualCard = useMemo<StrategyCardData>(() => {
    const all    = trades.filter(t => MANUAL_CODES.has(t.group_name ?? ''))
    const open   = all.filter(isOpenTrade)
    const closed = all.filter(t => t.status === 'CLOSED')
    return {
      id: 'manual', code: 'Manual', isManual: true,
      openTrades: open, closedTrades: closed,
      totalUnrealized: open.reduce((s, t) => s + computeUnrealized(t, ltpMap), 0),
      totalRealized:   all.reduce((s, t)  => s + t.realized_pnl, 0),
    }
  }, [trades, ltpMap])

  // Algo cards
  const algoCards = useMemo<StrategyCardData[]>(() => {
    return strategies.map(strat => {
      const code   = (strat.strategyName ?? strat.strategyCode ?? String(strat.strategy_code ?? '')).trim()
      const codeN  = normCode(code)
      const open   = codeN ? trades.filter(t => isOpenTrade(t) && normCode(t.group_name) === codeN && !MANUAL_CODES.has(t.group_name ?? '')) : []
      const closed = codeN ? trades.filter(t => t.status === 'CLOSED' && normCode(t.group_name) === codeN && !MANUAL_CODES.has(t.group_name ?? '')) : []
      const all    = [...open, ...closed]
      return {
        id: String(strat.id), code, isManual: false,
        openTrades: open, closedTrades: closed,
        totalUnrealized: open.reduce((s, t) => s + computeUnrealized(t, ltpMap), 0),
        totalRealized:   all.reduce((s, t)  => s + t.realized_pnl, 0),
      }
    })
  }, [strategies, trades, ltpMap])

  const allCards   = [manualCard, ...algoCards]
  const hasContent = strategies.length > 0 || manualCard.openTrades.length > 0 || manualCard.closedTrades.length > 0
  if (!loading && !hasContent) return null

  return (
    <div>
      {/* Header + view toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1">
          <SectionHeader
            title="Today's Trading Activity"
            sub="Manual & algo strategies · running and closed trades"
            badge={strategies.length > 0 ? { label: `${strategies.length} ALGO LIVE`, color: 'emerald' } : undefined}
            inline
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.05] rounded-xl p-1">
          {(['card', 'table'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all',
                view === v
                  ? 'bg-white dark:bg-white/[0.09] text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50',
              )}
            >
              {v === 'card' ? (
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 5h18M3 12h18M3 19h18" />
                </svg>
              )}
              {v === 'card' ? 'Cards' : 'Table'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-56 rounded-2xl bg-slate-100 dark:bg-white/[0.05] animate-pulse" style={{ opacity: 1 - i * 0.3 }} />
          ))}
        </div>
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {allCards.map(card => (
            <StrategyCard key={card.id} data={card} ltpMap={ltpMap} onClick={() => setActive(card)} />
          ))}
        </div>
      ) : (
        <StrategyTable cards={allCards} onSelect={setActive} />
      )}

      <StrategyDrawer data={active} ltpMap={ltpMap} onClose={() => setActive(null)} />
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

// ─── command-center header sub-components ────────────────────────────────────

function HeaderKpiChip({
  label, value, sub, positive, icon, pulse,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  positive?: boolean
  icon: React.ReactNode
  pulse?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5 px-3.5 py-3 rounded-xl bg-slate-50/90 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.1] transition-colors">
      <div className="flex items-center justify-between gap-1.5">
        <span className={clsx(
          'shrink-0',
          positive === true  ? 'text-emerald-500 dark:text-emerald-400'
          : positive === false ? 'text-red-500 dark:text-red-400'
          : 'text-slate-400 dark:text-white/25',
        )}>
          {icon}
        </span>
        <div className="flex items-center gap-1 min-w-0">
          {pulse && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />}
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-white/25 truncate">{label}</p>
        </div>
      </div>
      <div className={clsx(
        'text-[16px] font-black tabular-nums leading-none',
        positive === true  ? 'text-emerald-600 dark:text-emerald-400'
        : positive === false ? 'text-red-500 dark:text-red-400'
        : 'text-slate-900 dark:text-white/85',
      )}>
        {value}
      </div>
      {sub && <p className="text-[9px] text-slate-400 dark:text-white/25 leading-none">{sub}</p>}
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

  const hour         = new Date().getHours()
  const greeting     = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const greetingIcon = hour < 5 ? '🌙' : hour < 12 ? '🌤️' : hour < 17 ? '☀️' : '🌆'
  const initials     = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'

  const todayPos = d.todayPnl >= 0
  const mtdPos   = d.mtdPnl >= 0
  const wrPos    = (d.winRate ?? 0) >= 50

  const aiSummary = d.loading ? null : [
    d.strategies.length > 0 && `${d.strategies.length} ${d.strategies.length === 1 ? 'strategy' : 'strategies'} running`,
    `Portfolio ${todayPos ? 'up' : 'down'} ₹${INR(Math.abs(d.todayPnl))} today`,
    d.live.length > 0 && `${d.live.length} position${d.live.length !== 1 ? 's' : ''} open`,
    d.winRate != null && `${Math.round(d.winRate)}% win rate · ${d.closedCount} trades closed`,
    d.picks.length > 0 && `${d.picks.length} AI conviction picks available`,
  ].filter(Boolean).join(' · ')

  return (
    <div
      className="flex-1 min-h-screen bg-slate-50/60 dark:bg-surface-dark"
      style={{ opacity: show ? 1 : 0, transition: 'opacity 0.4s ease' }}
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-7">

        {/* ① Command Center Header */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/[0.07] shadow-[0_2px_16px_rgba(0,0,0,0.06)] dark:shadow-none">
          {/* Ambient gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-brand-50/60 via-transparent to-indigo-50/30 dark:from-brand-900/10 dark:via-transparent dark:to-indigo-900/10 pointer-events-none" />
          {/* Top accent line */}
          <div className={clsx('absolute top-0 left-0 right-0 h-[3px]', todayPos ? 'bg-gradient-to-r from-emerald-400 via-teal-500 to-brand-500' : 'bg-gradient-to-r from-red-400 via-rose-500 to-pink-500')} />

          <div className="relative z-10 p-5 sm:p-6 space-y-4 pt-6">

            {/* ── Row 1: Identity + market status ── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="h-13 w-13 h-[52px] w-[52px] rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
                    <span className="text-[15px] font-black text-white tracking-tight">{initials}</span>
                  </div>
                  <span className={clsx(
                    'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-[#0c1018]',
                    market.open ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600',
                  )} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] text-slate-400 dark:text-white/30">{greetingIcon} {greeting}</span>
                    {isAdmin && (
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-500/25 tracking-widest">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <h1 className="text-[20px] font-black text-slate-900 dark:text-white/90 leading-tight tracking-tight">
                    {name ? `${name}` : 'Dashboard'}
                  </h1>
                  <p className="text-[11px] text-slate-400 dark:text-white/25 mt-0.5 font-medium">{market.longDate}</p>
                </div>
              </div>

              {/* Market status + accounts */}
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className={clsx(
                  'flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[10px] font-black tracking-[0.1em]',
                  market.open
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-400'
                    : 'bg-slate-100 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.07] text-slate-500 dark:text-white/30',
                )}>
                  <span className={clsx('h-1.5 w-1.5 rounded-full', market.open ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-white/20')} />
                  {market.open ? 'MARKET OPEN' : 'MARKET CLOSED'}
                  <span className="opacity-55 font-mono ml-0.5">{market.hhmm} IST</span>
                </div>
                {accounts.length > 0 && (
                  <div className="flex items-center gap-1">
                    {accounts.slice(0, 3).map(a => (
                      <span key={a.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-white/25 border border-slate-200 dark:border-white/[0.05]">
                        {(a as { displayName?: string }).displayName ?? '—'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Row 2: KPI chips ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <HeaderKpiChip
                label="Today's P&L"
                value={d.loading ? '—' : `${todayPos ? '+' : '−'}₹${INR(d.todayPnl)}`}
                sub={d.live.length > 0 ? `${d.live.length} pos. open` : 'No open positions'}
                positive={d.loading ? undefined : todayPos || undefined}
                icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>}
              />
              <HeaderKpiChip
                label="30-Day Return"
                value={d.loading ? '—' : `${mtdPos ? '+' : '−'}₹${INR(d.mtdPnl)}`}
                sub="realized"
                positive={d.loading ? undefined : mtdPos || undefined}
                icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>}
              />
              <HeaderKpiChip
                label="Win Rate · 30D"
                value={d.loading || d.winRate == null ? '—' : `${Math.round(d.winRate)}%`}
                sub={d.closedCount > 0 ? `${d.closedCount} trades` : 'No data yet'}
                positive={d.loading || d.winRate == null ? undefined : wrPos || undefined}
                icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>}
              />
              <HeaderKpiChip
                label="Running"
                value={d.loading ? '—' : String(d.live.length)}
                sub="open positions"
                positive={d.live.length > 0 ? true : undefined}
                pulse={d.live.length > 0}
                icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
              />
              <HeaderKpiChip
                label="Strategies"
                value={d.loading ? '—' : String(d.strategies.length)}
                sub={d.strategies.length > 0 ? 'algo live' : 'none active'}
                positive={d.strategies.length > 0 ? true : undefined}
                pulse={d.strategies.length > 0}
                icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></svg>}
              />
              <HeaderKpiChip
                label="Closed Today"
                value={d.loading ? '—' : String(d.closedCount)}
                sub="trades executed"
                icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>}
              />
            </div>

            {/* ── Row 3: Sparkline KPIs (with trends) ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

            {/* ── Row 4: AI summary + quick actions ── */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
              {/* AI portfolio summary */}
              {aiSummary && (
                <div className="flex-1 flex items-start gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-50/80 to-indigo-50/50 dark:from-brand-900/20 dark:to-indigo-900/10 border border-brand-100 dark:border-brand-500/20 min-w-0">
                  <div className="shrink-0 mt-0.5 h-5 w-5 rounded-md bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center">
                    <span className="text-[11px] text-brand-600 dark:text-brand-400">✦</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400 mb-0.5">AI Portfolio Summary</p>
                    <p className="text-[11px] text-slate-600 dark:text-white/45 leading-relaxed truncate">{aiSummary}</p>
                  </div>
                </div>
              )}

              {/* Quick actions */}
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {(([
                  { label: 'Trade', to: '/trade', icon: '⚡', primary: true },
                  { label: 'Holdings', to: '/holdings', icon: '📊' },
                  { label: 'AI Insights', to: '/insight', icon: '✦' },
                  { label: 'Journal', to: '/journal', icon: '📓' },
                  { label: 'Reports', to: '/reports', icon: '📈' },
                  { label: 'Options', to: '/insight/options', icon: '🎯' },
                  ...(isAdmin ? [{ label: 'Analytics', to: '/analytics', icon: '🔬' }] : []),
                ] as Array<{ label: string; to: string; icon: string; primary?: boolean }>)).map(a => (
                  <button
                    key={a.to}
                    onClick={() => navigate(a.to)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all hover:-translate-y-px active:scale-95 whitespace-nowrap',
                      a.primary
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/30 hover:bg-brand-700'
                        : 'bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-white/45 hover:bg-slate-50 dark:hover:bg-white/[0.07]',
                    )}
                  >
                    <span className="text-[10px]">{a.icon}</span>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
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

        <p className="text-center text-[10px] text-slate-300 dark:text-white/12 pb-2 tracking-wider">
          30-DAY WINDOW · UNREALISED P&amp;L INCLUDED · NOT INVESTMENT ADVICE
        </p>

      </div>
    </div>
  )
}
