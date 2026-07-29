// ── Holdings Module ────────────────────────────────────────────────────────────
// Derives non-options positions from trade history and presents a premium
// portfolio experience with real AI insight from the Stock Master API.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { toast } from 'react-hot-toast'
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, AreaChart, Area, Legend,
} from 'recharts'
import { getTrades, getTradeOrders } from '@/api/reports'
import type { Trade, TradeOrder } from '@/types/reports'
import { parseInstrument } from '@/journal/utils'
import { useMarketStore } from '@/trade/store/marketStore'
import { realtime } from '@/trade/data/realtime/realtimeService'
import { searchInsightSymbols, fetchStockInsight } from '@/insight/api'
import type { InsightSymbol, StockInsightResponse } from '@/insight/types'
import { BadgeChip, ConvictionStars, RiskChip, LifecycleStepper } from '@/insight/components/Badges'
import { ScoreRing } from '@/insight/components/ReportWidgets'

// ── Sector / industry colors (covers both NSE API names and legacy local names) ─

const SECTOR_COLORS: Record<string, string> = {
  // NSE Insight API sector names
  'Technology':             '#6366f1',
  'Financial Services':     '#3b82f6',
  'Energy':                 '#f59e0b',
  'Consumer Cyclical':      '#10b981',
  'Consumer Defensive':     '#34d399',
  'Healthcare':             '#ec4899',
  'Basic Materials':        '#84cc16',
  'Industrials':            '#f97316',
  'Communication Services': '#06b6d4',
  'Utilities':              '#a78bfa',
  'Real Estate':            '#fb923c',
  // Legacy local fallback names
  'Financials':             '#3b82f6',
  'Consumer':               '#10b981',
  'Materials':              '#84cc16',
  'Communication':          '#06b6d4',
  'Other':                  '#94a3b8',
}

// Palette for sectors/industries not in SECTOR_COLORS
const CHART_PALETTE = [
  '#6366f1', '#3b82f6', '#f59e0b', '#10b981', '#ec4899',
  '#f97316', '#06b6d4', '#84cc16', '#a78bfa', '#fb923c',
  '#34d399', '#38bdf8', '#fbbf24', '#f87171', '#c084fc',
]

function sectorColor(s: string | null | undefined): string {
  if (!s) return '#94a3b8'
  if (SECTOR_COLORS[s]) return SECTOR_COLORS[s]
  // Hash the name → consistent unique color for any unknown sector/industry
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return CHART_PALETTE[h % CHART_PALETTE.length]
}

// ── Holding types ─────────────────────────────────────────────────────────────

type MarketCap = 'Large' | 'Mid' | 'Small'

interface Holding {
  tradeId: string
  symbol: string        // raw trade symbol, e.g. POKARNA_EQ
  ticker: string        // display label, e.g. POKARNA
  insightSymbol: string // Insight API format, e.g. POKARNA-EQ
  brokerName: string
  quantity: number
  avgBuyPrice: number
  investedValue: number
  realizedPnl: number
  unrealizedPnlFallback: number
  firstBuyDate: string
  lastUpdated: string | null
  companyName: string
  sector: string
  industry: string
  cap: MarketCap
  color: string
  category: 'ETF' | 'EQUITY' | 'MF' | null
}

interface EnrichedHolding extends Holding {
  ltp: number
  currentValue: number
  totalPnl: number
  returnsPct: number
  allocationPct: number
  signal: AISignal
  signalCls: string
  confidence: number
}

type AISignal = 'Strong Hold' | 'Hold' | 'Buy More' | 'Average Now' | 'Reduce' | 'Exit' | 'Watch Closely'
type SortKey = 'name' | 'value' | 'returns' | 'invested' | 'pnl' | 'alloc'
type Tab = 'overview' | 'holdings' | 'intelligence' | 'dividends' | 'events'

// ── Derivation helpers ────────────────────────────────────────────────────────

function deriveHoldings(trades: Trade[]): Holding[] {
  return trades
    .filter(t => {
      if (t.status === 'CLOSED') return false
      const { kind } = parseInstrument(t.symbol_name)
      return kind !== 'CE' && kind !== 'PE'
    })
    .map(t => {
      // Strip exchange prefix (NSE:, BSE:, NFO: etc.) before any processing
      const cleanName = t.symbol_name.replace(/^[A-Z0-9]+:/i, '')
      const { underlying } = parseInstrument(cleanName)
      // ticker = short display name (e.g. NIFTYBEES)
      const ticker = underlying.replace(/_EQ$/i, '').replace(/_FUT$/i, '').toUpperCase()
      // insightSymbol = Insight API format: NIFTYBEES_EQ → NIFTYBEES-EQ
      const insightSymbol = cleanName.replace(/_/g, '-').toUpperCase()
      const qty = Math.abs(t.total_quantity)
      return {
        tradeId: t.trade_id,
        symbol: t.symbol_name,
        ticker,
        insightSymbol,
        brokerName: t.broker_name,
        quantity: qty,
        avgBuyPrice: t.avg_entry_price,
        investedValue: qty * t.avg_entry_price,
        realizedPnl: t.realized_pnl,
        unrealizedPnlFallback: t.unrealized_pnl,
        firstBuyDate: t.first_placed_time,
        lastUpdated: t.last_updated_time,
        companyName: ticker,         // will be overridden by Stock Master
        sector: 'Other',             // will be overridden by Stock Master
        industry: 'Unknown',         // will be overridden by Stock Master
        cap: 'Large' as MarketCap,
        color: '#94a3b8',            // will be overridden after master loads
        category: null as 'ETF' | 'EQUITY' | 'MF' | null,
      }
    })
}

/** Merges Stock Master data into holdings, then computes live metrics. */
function enrichHoldings(
  holdings: Holding[],
  quotes: Record<string, { ltp: number }>,
  master: Map<string, InsightSymbol>,
): EnrichedHolding[] {
  // First pass: apply master data + live prices
  const rows = holdings.map(h => {
    const info = master.get(h.insightSymbol)
    const sector    = info?.sector    ?? h.sector
    const industry  = info?.industry  ?? h.industry
    const companyName = info?.symbol_name ?? h.companyName
    const category  = info?.category  ?? h.category
    const color     = sectorColor(sector)

    const qLtp = quotes[h.symbol]?.ltp ?? quotes[h.ticker]?.ltp ?? 0
    const ltp = qLtp > 0
      ? qLtp
      : (h.investedValue + h.unrealizedPnlFallback) / Math.max(1, h.quantity)
    const currentValue = h.quantity * ltp
    const totalPnl = (currentValue - h.investedValue) + h.realizedPnl

    return { ...h, sector, industry, companyName, category, color, ltp, currentValue, totalPnl }
  })

  const totalPortfolioValue = rows.reduce((s, r) => s + r.currentValue, 0)

  return rows.map(r => {
    const returnsPct    = r.investedValue > 0 ? (r.totalPnl / r.investedValue) * 100 : 0
    const allocationPct = totalPortfolioValue > 0 ? (r.currentValue / totalPortfolioValue) * 100 : 0
    const { signal, cls, confidence } = computeAISignal(returnsPct, allocationPct)
    return { ...r, returnsPct, allocationPct, signal, signalCls: cls, confidence }
  })
}

function computeAISignal(ret: number, alloc: number): { signal: AISignal; cls: string; confidence: number } {
  if (ret > 40 && alloc > 25) return { signal: 'Reduce',        cls: 'reduce', confidence: 75 }
  if (ret > 50)               return { signal: 'Reduce',        cls: 'reduce', confidence: 70 }
  if (ret > 20)               return { signal: 'Strong Hold',   cls: 'hold',   confidence: 84 }
  if (ret > 8)                return { signal: 'Hold',          cls: 'hold',   confidence: 78 }
  if (ret > -5)               return { signal: 'Hold',          cls: 'hold',   confidence: 67 }
  if (ret > -15)              return { signal: 'Average Now',   cls: 'buy',    confidence: 61 }
  if (ret > -30)              return { signal: 'Watch Closely', cls: 'watch',  confidence: 64 }
  return                             { signal: 'Exit',          cls: 'exit',   confidence: 52 }
}

// ── Number formatters ─────────────────────────────────────────────────────────

function fmtINR(v: number, compact = false): string {
  const abs = Math.abs(v)
  let s: string
  if (compact) {
    s = abs >= 1e7 ? `₹${(abs / 1e7).toFixed(2)}Cr`
      : abs >= 1e5 ? `₹${(abs / 1e5).toFixed(2)}L`
      : abs >= 1e3 ? `₹${(abs / 1e3).toFixed(2)}K`
      : `₹${abs.toFixed(2)}`
  } else {
    s = `₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }
  return v < 0 ? `-${s}` : s
}

function fmtPct(v: number, sign = true): string {
  return `${sign && v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Tiny shared primitives ────────────────────────────────────────────────────

const pnlCls = (v: number) =>
  v >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'

const SignalBadge = ({ signal, cls }: { signal: AISignal; cls: string }) => {
  const colors: Record<string, string> = {
    hold:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    buy:    'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    reduce: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    exit:   'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    watch:  'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  }
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap',
      colors[cls] ?? colors.hold,
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {signal}
    </span>
  )
}

// ── Ticker avatar ─────────────────────────────────────────────────────────────

function TickerAvatar({ ticker, color, size = 36 }: { ticker: string; color: string; size?: number }) {
  return (
    <div
      className="shrink-0 rounded-xl flex items-center justify-center font-bold text-white text-[11px] shadow-sm"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${color}cc, ${color}88)`,
        boxShadow: `0 2px 8px ${color}44`,
      }}
    >
      {ticker.slice(0, 2)}
    </div>
  )
}

// ── Diversification score ring (renamed from ScoreRing to avoid import conflict) ─

function DivScoreRing({ score, label, size = 80 }: { score: number; label: string; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" style={{ position: 'absolute', top: 0, left: 0 }}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth="6" className="text-slate-100 dark:text-white/10" fill="none" />
          <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="6" fill="none"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xl font-extrabold tabular-nums" style={{ color }}>{score}</p>
        </div>
      </div>
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">{label}</p>
    </div>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-slate-100 dark:bg-white/5', className)} />
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, subPositive, accent, loading, large,
}: {
  label: string
  value: string
  sub?: string
  subPositive?: boolean
  accent?: 'green' | 'red' | 'blue'
  loading?: boolean
  large?: boolean
}) {
  const accentCls = accent === 'green' ? 'text-emerald-500 dark:text-emerald-400'
    : accent === 'red' ? 'text-rose-500 dark:text-rose-400'
    : accent === 'blue' ? 'text-brand-600 dark:text-brand-400'
    : 'text-slate-900 dark:text-white'

  return (
    <div className="relative bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5 overflow-hidden group hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-all duration-200">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brand-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 mb-2">{label}</p>
      {loading
        ? <Skeleton className="h-8 w-32 mb-2" />
        : <p className={clsx('font-extrabold tabular-nums', large ? 'text-3xl' : 'text-xl', accentCls)}>{value}</p>
      }
      {sub && !loading && (
        <p className={clsx('text-[11px] font-semibold mt-1.5',
          subPositive === true  ? 'text-emerald-500 dark:text-emerald-400'
          : subPositive === false ? 'text-rose-500 dark:text-rose-400'
          : 'text-slate-400 dark:text-slate-500',
        )}>
          {sub}
        </p>
      )}
    </div>
  )
}

// ── Custom recharts tooltip ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-xs">
      {label && <p className="text-slate-400 dark:text-slate-500 mb-1.5 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          {p.color && <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />}
          <span className="text-slate-500 dark:text-slate-400">{p.name}:</span>
          <span className="font-bold text-slate-800 dark:text-white tabular-nums">{fmtINR(p.value, true)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Allocation pie ─────────────────────────────────────────────────────────────

function AllocationPie({ data }: {
  data: Array<{ ticker: string; name: string; value: number; pct: number; color: string }>
}) {
  const [active, setActive] = useState<number | null>(null)

  if (!data.length) return (
    <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">No holdings data</div>
  )

  return (
    <div className="h-[280px] flex items-center gap-4">
      <ResponsiveContainer width="55%" height="100%">
        <PieChart>
          <Pie
            data={data} cx="50%" cy="50%" innerRadius={65} outerRadius={100}
            paddingAngle={2} dataKey="value"
            onMouseEnter={(_, idx) => setActive(idx)}
            onMouseLeave={() => setActive(null)}
          >
            {data.map((d, i) => (
              <Cell
                key={d.ticker} fill={d.color}
                opacity={active === null || active === i ? 1 : 0.4}
                stroke="none"
                style={{ filter: active === i ? `drop-shadow(0 0 6px ${d.color}66)` : 'none', transition: 'opacity 0.2s, filter 0.2s' }}
              />
            ))}
          </Pie>
          <Tooltip content={({ active: a, payload: p }) => {
            if (!a || !p?.length) return null
            const d = p[0].payload as typeof data[0]
            return (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-xs">
                <p className="font-bold text-slate-800 dark:text-white">{d.name}</p>
                <p className="text-slate-500 dark:text-slate-400">{fmtINR(d.value, true)} · {d.pct.toFixed(1)}%</p>
              </div>
            )
          }} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex-1 space-y-2 overflow-y-auto max-h-[260px] pr-1">
        {data.slice(0, 10).map((d, i) => (
          <div
            key={d.ticker}
            className={clsx('flex items-center gap-2 py-1 px-2 rounded-lg transition-colors cursor-default', active === i && 'bg-slate-50 dark:bg-white/5')}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate flex-1">{d.ticker}</span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{d.pct.toFixed(1)}%</span>
          </div>
        ))}
        {data.length > 10 && (
          <p className="text-[10px] text-slate-400 pl-2 pt-1">+{data.length - 10} more</p>
        )}
      </div>
    </div>
  )
}

// ── Sector / industry horizontal bar chart ─────────────────────────────────────

function DistributionBar({ data, emptyMsg }: {
  data: Array<{ label: string; value: number; pct: number; color: string; count: number }>
  emptyMsg: string
}) {
  if (!data.length) return (
    <div className="h-[180px] flex items-center justify-center text-sm text-slate-400">{emptyMsg}</div>
  )
  return (
    <div className="h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} width={110} tickLine={false} axisLine={false} />
          <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.08)" />
          <Tooltip content={({ active: a, payload: p }) => {
            if (!a || !p?.length) return null
            const d = p[0].payload as typeof data[0]
            return (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-xs">
                <p className="font-bold text-slate-800 dark:text-white mb-1">{d.label}</p>
                <p className="text-slate-500">{fmtINR(d.value, true)} · {d.pct.toFixed(1)}% · {d.count} pos</p>
              </div>
            )
          }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Portfolio growth area chart ─────────────────────────────────────────────

function PortfolioGrowthChart({ holdings }: { holdings: EnrichedHolding[] }) {
  const chartData = useMemo(() => {
    if (!holdings.length) return []
    const sorted = [...holdings].sort((a, b) => a.firstBuyDate.localeCompare(b.firstBuyDate))
    let cumInvested = 0, cumCurrent = 0
    const points: Array<{ date: string; invested: number; current: number }> = []
    for (const h of sorted) {
      cumInvested += h.investedValue
      cumCurrent  += h.currentValue
      points.push({ date: h.firstBuyDate.slice(0, 10), invested: Math.round(cumInvested), current: Math.round(cumCurrent) })
    }
    points.push({ date: new Date().toISOString().slice(0, 10), invested: cumInvested, current: cumCurrent })
    return points
  }, [holdings])

  if (!chartData.length) return <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">No data</div>

  const minVal = Math.min(...chartData.map(d => Math.min(d.invested, d.current)))
  const maxVal = Math.max(...chartData.map(d => Math.max(d.invested, d.current)))
  const domain: [number, number] = [Math.floor(minVal * 0.95), Math.ceil(maxVal * 1.02)]

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradInvested" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
            tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
            tickFormatter={v => fmtINR(v, true)} domain={domain} width={70} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="invested" name="Invested" stroke="#94a3b8" strokeWidth={1.5} fill="url(#gradInvested)" dot={false} />
          <Area type="monotone" dataKey="current" name="Current Value" stroke="#6366f1" strokeWidth={2} fill="url(#gradCurrent)" dot={false} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Holdings table ────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'

function HoldingsTable({
  holdings, loading, onSelect, selected,
}: {
  holdings: EnrichedHolding[]
  loading: boolean
  onSelect: (h: EnrichedHolding | null) => void
  selected: string | null
}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'value', dir: 'desc' })

  const toggleSort = (key: SortKey) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' })
  }

  const sortedFiltered = useMemo(() => {
    const q = search.toLowerCase()
    let rows = q
      ? holdings.filter(h => h.ticker.toLowerCase().includes(q) || h.companyName.toLowerCase().includes(q) || h.sector.toLowerCase().includes(q))
      : holdings
    const dir = sort.dir === 'desc' ? -1 : 1
    rows = [...rows].sort((a, b) => {
      switch (sort.key) {
        case 'name':     return dir * a.companyName.localeCompare(b.companyName)
        case 'value':    return dir * (a.currentValue - b.currentValue)
        case 'returns':  return dir * (a.returnsPct - b.returnsPct)
        case 'invested': return dir * (a.investedValue - b.investedValue)
        case 'pnl':      return dir * (a.totalPnl - b.totalPnl)
        case 'alloc':    return dir * (a.allocationPct - b.allocationPct)
        default:         return 0
      }
    })
    return rows
  }, [holdings, search, sort])

  const Th = ({ label, sortKey, right }: { label: string; sortKey?: SortKey; right?: boolean }) => (
    <th
      className={clsx(
        'px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 whitespace-nowrap',
        right ? 'text-right' : 'text-left',
        sortKey && 'cursor-pointer select-none hover:text-slate-600 dark:hover:text-slate-300',
      )}
      onClick={sortKey ? () => toggleSort(sortKey) : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey && sort.key === sortKey && (
          <svg viewBox="0 0 24 24" className={clsx('h-3 w-3 transition-transform', sort.dir === 'asc' && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </span>
    </th>
  )

  return (
    <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search holdings…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-brand-400 transition-colors"
          />
        </div>
        <span className="text-xs text-slate-400">{sortedFiltered.length} positions</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50/90 dark:bg-white/[0.02] backdrop-blur border-b border-slate-100 dark:border-slate-800">
            <tr>
              <Th label="Company" sortKey="name" />
              <Th label="Qty" />
              <Th label="Avg Price" right />
              <Th label="LTP" right />
              <Th label="Invested" sortKey="invested" right />
              <Th label="Current Value" sortKey="value" right />
              <Th label="P&L" sortKey="pnl" right />
              <Th label="Returns" sortKey="returns" right />
              <Th label="Allocation" sortKey="alloc" right />
              <Th label="Signal" />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-50 dark:border-slate-800/50">
                  {Array.from({ length: 10 }).map((__, j) => (
                    <td key={j} className="px-4 py-4">
                      <div className={clsx('animate-pulse rounded-xl bg-slate-100 dark:bg-white/5 h-3')} style={{ width: [140, 40, 60, 60, 80, 90, 70, 60, 50, 80][j] }} />
                    </td>
                  ))}
                </tr>
              ))
              : sortedFiltered.length === 0
              ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <svg viewBox="0 0 24 24" className="h-10 w-10 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 21H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2z" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
                      <p className="text-sm font-medium">{search ? 'No matching holdings' : 'No open holdings found'}</p>
                      <p className="text-xs">Non-options open positions from your trade history appear here</p>
                    </div>
                  </td>
                </tr>
              )
              : sortedFiltered.map(h => (
                <HoldingRow key={h.tradeId} h={h} isSelected={selected === h.tradeId} onSelect={onSelect} />
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HoldingRow({ h, isSelected, onSelect }: { h: EnrichedHolding; isSelected: boolean; onSelect: (h: EnrichedHolding | null) => void }) {
  const pnlPos = h.totalPnl >= 0
  return (
    <tr
      onClick={() => onSelect(isSelected ? null : h)}
      className={clsx(
        'border-t border-slate-50 dark:border-slate-800/50 cursor-pointer group transition-colors duration-100',
        isSelected ? 'bg-brand-50/50 dark:bg-brand-900/10' : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.025]',
      )}
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <TickerAvatar ticker={h.ticker} color={h.color} size={34} />
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 dark:text-slate-100 leading-tight truncate">{h.companyName}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              <span className="font-bold">{h.ticker}</span>
              {h.sector !== 'Other' && <> · {h.sector}</>}
              {h.category && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-white/10 text-slate-500">{h.category}</span>}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5 tabular-nums text-slate-600 dark:text-slate-400">{h.quantity.toLocaleString('en-IN')}</td>
      <td className="px-4 py-3.5 tabular-nums text-right text-slate-600 dark:text-slate-400">{fmtINR(h.avgBuyPrice)}</td>
      <td className="px-4 py-3.5 tabular-nums text-right font-semibold text-slate-800 dark:text-slate-200">{fmtINR(h.ltp)}</td>
      <td className="px-4 py-3.5 tabular-nums text-right text-slate-500 dark:text-slate-500">{fmtINR(h.investedValue, true)}</td>
      <td className="px-4 py-3.5 tabular-nums text-right font-semibold text-slate-800 dark:text-slate-200">{fmtINR(h.currentValue, true)}</td>
      <td className="px-4 py-3.5 tabular-nums text-right">
        <span className={clsx('font-semibold', pnlCls(h.totalPnl))}>{pnlPos ? '+' : ''}{fmtINR(h.totalPnl, true)}</span>
      </td>
      <td className="px-4 py-3.5 text-right">
        <span className={clsx('inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full',
          pnlPos ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400',
        )}>
          {pnlPos ? '▲' : '▼'} {Math.abs(h.returnsPct).toFixed(2)}%
        </span>
      </td>
      <td className="px-4 py-3.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(h.allocationPct, 100)}%`, background: h.color }} />
          </div>
          <span className="text-[11px] text-slate-500 tabular-nums w-10 text-right">{h.allocationPct.toFixed(1)}%</span>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <SignalBadge signal={h.signal} cls={h.signalCls} />
      </td>
    </tr>
  )
}

// ── Holding detail panel ──────────────────────────────────────────────────────

function HoldingDetailPanel({ h, onClose }: { h: EnrichedHolding; onClose: () => void }) {
  const [orders, setOrders] = useState<TradeOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [insight, setInsight] = useState<StockInsightResponse | null | undefined>(undefined) // undefined=loading, null=failed/no data
  const [insightLoading, setInsightLoading] = useState(true)
  const pnlPos = h.totalPnl >= 0

  useEffect(() => {
    setOrdersLoading(true)
    getTradeOrders(h.tradeId)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false))
  }, [h.tradeId])

  useEffect(() => {
    setInsight(undefined)
    setInsightLoading(true)
    fetchStockInsight(h.insightSymbol)
      .then(setInsight)
      .catch(() => setInsight(null))
      .finally(() => setInsightLoading(false))
  }, [h.insightSymbol])

  const analysis = insight?.analysis ?? null

  return (
    <div className="h-full flex flex-col bg-white dark:bg-card-dark overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <TickerAvatar ticker={h.ticker} color={h.color} size={44} />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate leading-tight">{h.companyName}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {h.ticker}
                {h.sector !== 'Other' && <> · {h.sector}</>}
                {h.industry !== 'Unknown' && h.industry !== h.sector && <> · {h.industry}</>}
                {h.category && <span className="ml-1 px-1 rounded text-[9px] font-bold bg-slate-100 dark:bg-white/10 text-slate-500">{h.category}</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 h-8 w-8 grid place-items-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-90"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Hero metrics ── */}
        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Current Value', value: fmtINR(h.currentValue, true), cls: 'text-slate-900 dark:text-white' },
            { label: 'Invested', value: fmtINR(h.investedValue, true), cls: 'text-slate-900 dark:text-white' },
            { label: 'Total P&L', value: `${pnlPos ? '+' : ''}${fmtINR(h.totalPnl, true)}`, cls: pnlCls(h.totalPnl) },
            { label: 'Returns', value: fmtPct(h.returnsPct), cls: pnlCls(h.returnsPct) },
          ].map(m => (
            <div key={m.label} className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-slate-800 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{m.label}</p>
              <p className={clsx('text-base font-extrabold tabular-nums', m.cls)}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* ── Price row ── */}
        <div className="px-5 pb-4">
          <div className="rounded-xl bg-gradient-to-br from-brand-50 to-indigo-50 dark:from-brand-900/10 dark:to-indigo-900/10 border border-brand-100 dark:border-brand-900/30 p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] text-brand-600 dark:text-brand-400 font-bold uppercase tracking-widest mb-1">LTP</p>
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{fmtINR(h.ltp)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 mb-1">Avg Buy Price</p>
                <p className="text-lg font-bold tabular-nums text-slate-600 dark:text-slate-300">{fmtINR(h.avgBuyPrice)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 mb-1">Quantity</p>
                <p className="text-lg font-bold tabular-nums text-slate-600 dark:text-slate-300">{h.quantity.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── View Full Report CTA ── */}
        <div className="px-5 pb-4">
          <Link
            to={`/insight/${h.insightSymbol}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-xs font-bold shadow-sm hover:from-brand-700 hover:to-violet-700 transition-all active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            View Full Stock Insight Report
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
        </div>

        {/* ── AI Insight section ── */}
        <div className="px-5 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">AI Stock Analysis</p>

          {insightLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-20" />
              <Skeleton className="h-24" />
            </div>
          ) : analysis ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {/* Badge + conviction + risk header */}
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-white/[0.02] dark:to-indigo-900/10">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <BadgeChip badge={analysis.badge} size="sm" />
                  <div className="flex items-center gap-2">
                    <ConvictionStars conviction={insight!.conviction} size="sm" />
                    <RiskChip level={analysis.riskLevel} size="sm" />
                  </div>
                </div>
                <LifecycleStepper stage={analysis.family} earliness={analysis.earliness} />
              </div>

              {/* Score rings */}
              <div className="px-4 py-4 flex items-center justify-around border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-white/[0.01]">
                <ScoreRing value={analysis.scores.discovery}  label="Discovery"  tone="auto" />
                <ScoreRing value={analysis.scores.transition} label="Transition" tone="auto" />
                <ScoreRing value={analysis.scores.momentum}   label="Momentum"   tone="auto" />
              </div>

              {/* AI summary */}
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">AI Summary</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{analysis.summary}</p>
                {analysis.honesty && (
                  <p className="mt-2 text-[10px] italic text-amber-600 dark:text-amber-500 leading-relaxed">{analysis.honesty}</p>
                )}
              </div>

              {/* Key signals (positive evidence items) */}
              {(() => {
                const items = [
                  ...(analysis.evidence?.discovery.items  ?? []),
                  ...(analysis.evidence?.transition.items ?? []),
                  ...(analysis.evidence?.momentum.items   ?? []),
                ].filter(e => e.ok).slice(0, 5)
                if (!items.length) return null
                return (
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Key Signals</p>
                    <div className="space-y-2">
                      {items.map((e, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-[13px] text-emerald-500">✓</span>
                          <div>
                            <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 leading-tight">{e.label}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{e.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Risk factors */}
              {analysis.riskFactors.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Risk Factors</p>
                  <div className="space-y-2">
                    {analysis.riskFactors.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={clsx(
                          'mt-0.5 shrink-0 text-[11px] font-bold',
                          r.level === 'high' ? 'text-rose-500' : 'text-amber-500',
                        )}>
                          {r.level === 'high' ? '⚠' : '•'}
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 leading-tight">{r.label}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{r.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 px-4 py-5 text-center">
              <p className="text-xs text-slate-400">No AI analysis available for {h.ticker} yet.</p>
              <Link
                to={`/insight/${h.insightSymbol}`}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-500 hover:text-brand-600"
              >
                Trigger analysis
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </Link>
            </div>
          )}
        </div>

        {/* ── Portfolio Signal ── */}
        <div className="px-5 pb-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Portfolio Signal</p>
              <div className="flex items-center gap-2">
                <SignalBadge signal={h.signal} cls={h.signalCls} />
                <span className="text-[10px] text-slate-400">{h.confidence}% conf</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Allocation', value: `${h.allocationPct.toFixed(1)}%` },
                { label: 'Realized P&L', value: fmtINR(h.realizedPnl, true) },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-slate-50 dark:bg-white/5 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">{s.label}</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Order timeline ── */}
        <div className="px-5 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Order Timeline</p>
          {ordersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : orders.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">No order history available</p>
          ) : (
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-200 dark:bg-white/10" />
              <div className="space-y-3">
                {orders.slice().reverse().map((o, i) => {
                  const isBuy = o.txnType === 'BUY'
                  return (
                    <div key={`${o.id}-${i}`} className="relative flex items-start gap-3 pl-1">
                      <div className={clsx('shrink-0 h-6 w-6 rounded-full grid place-items-center z-10 text-[9px] font-bold text-white',
                        isBuy ? 'bg-brand-500' : 'bg-rose-500')}>
                        {isBuy ? 'B' : 'S'}
                      </div>
                      <div className="flex-1 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-white/[0.02] px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className={clsx('text-[10px] font-bold', isBuy ? 'text-brand-600 dark:text-brand-400' : 'text-rose-500 dark:text-rose-400')}>
                            {isBuy ? 'BUY' : 'SELL'} × {Math.abs(o.quantity)}
                          </span>
                          <span className="text-[10px] text-slate-400">{fmtINR(o.price)}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(o.placedTime).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── First buy info ── */}
        <div className="px-5 pb-5">
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">First Purchased</p>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">{fmtDate(h.firstBuyDate)}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Broker</p>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">{h.brokerName}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ holdings, loading }: { holdings: EnrichedHolding[]; loading: boolean }) {
  const totalInvested     = holdings.reduce((s, h) => s + h.investedValue, 0)
  const totalCurrentValue = holdings.reduce((s, h) => s + h.currentValue, 0)
  const totalUnrealized   = totalCurrentValue - totalInvested
  const totalRealized     = holdings.reduce((s, h) => s + h.realizedPnl, 0)
  const totalPnl          = totalUnrealized + totalRealized
  const totalReturnsPct   = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  // Allocation data
  const allocationData = useMemo(() => {
    return holdings
      .map(h => ({ ticker: h.ticker, name: h.companyName, value: h.currentValue, pct: h.allocationPct, color: h.color }))
      .sort((a, b) => b.value - a.value)
  }, [holdings])

  // Sector distribution
  const sectorData = useMemo(() => {
    const m = new Map<string, { value: number; count: number }>()
    for (const h of holdings) {
      const e = m.get(h.sector) ?? { value: 0, count: 0 }
      m.set(h.sector, { value: e.value + h.currentValue, count: e.count + 1 })
    }
    const total = [...m.values()].reduce((s, v) => s + v.value, 0)
    return [...m.entries()]
      .map(([label, { value, count }]) => ({
        label,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
        color: sectorColor(label),
        count,
      }))
      .sort((a, b) => b.value - a.value)
  }, [holdings])

  // Industry distribution
  const industryData = useMemo(() => {
    const m = new Map<string, { value: number; count: number }>()
    for (const h of holdings) {
      if (!h.industry || h.industry === 'Unknown') continue
      const e = m.get(h.industry) ?? { value: 0, count: 0 }
      m.set(h.industry, { value: e.value + h.currentValue, count: e.count + 1 })
    }
    const total = [...m.values()].reduce((s, v) => s + v.value, 0)
    return [...m.entries()]
      .map(([label, { value, count }]) => ({
        label,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
        color: sectorColor(label),
        count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [holdings])

  // Asset class distribution (ETF / EQUITY / MF)
  const assetClassData = useMemo(() => {
    const m: Record<string, number> = {}
    for (const h of holdings) {
      const k = h.category ?? 'EQUITY'
      m[k] = (m[k] ?? 0) + h.currentValue
    }
    const colors: Record<string, string> = { EQUITY: '#6366f1', ETF: '#f59e0b', MF: '#10b981' }
    return Object.entries(m).map(([k, v]) => ({ name: k, value: v, color: colors[k] ?? '#94a3b8' }))
  }, [holdings])

  // Diversification score (HHI-based)
  const divScore = useMemo(() => {
    const sectorCount = new Set(holdings.map(h => h.sector)).size
    const count = holdings.length
    const total = holdings.reduce((s, h) => s + h.currentValue, 0)
    let hhi = 0
    for (const h of holdings) {
      const share = total > 0 ? h.currentValue / total : 0
      hhi += share * share
    }
    const hhiScore = count > 1 ? Math.round((1 - hhi) * 100) : 0
    const sectorScore = Math.min(100, sectorCount * 13)
    const countScore = Math.min(100, count * 6)
    return Math.round(hhiScore * 0.5 + sectorScore * 0.3 + countScore * 0.2)
  }, [holdings])

  // Top/Worst performers
  const sorted  = useMemo(() => [...holdings].sort((a, b) => b.returnsPct - a.returnsPct), [holdings])
  const winners = sorted.slice(0, 5)
  const losers  = sorted.slice(-5).reverse()

  return (
    <div className="space-y-5">
      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard loading={loading} label="Portfolio Value"   value={fmtINR(totalCurrentValue, true)}      large accent="blue" />
        <MetricCard loading={loading} label="Total Invested"    value={fmtINR(totalInvested, true)} />
        <MetricCard loading={loading} label="Unrealized P&L"    value={fmtINR(totalUnrealized, true)}         accent={totalUnrealized >= 0 ? 'green' : 'red'} />
        <MetricCard loading={loading} label="Realized P&L"      value={fmtINR(totalRealized, true)}           accent={totalRealized >= 0 ? 'green' : 'red'} />
        <MetricCard loading={loading} label="Total Returns"     value={fmtPct(totalReturnsPct)}               accent={totalReturnsPct >= 0 ? 'green' : 'red'}
          sub={`${totalPnl >= 0 ? '+' : ''}${fmtINR(totalPnl, true)} overall`} subPositive={totalPnl >= 0} />
        <MetricCard loading={loading} label="Holdings" value={String(holdings.length)}
          sub={`${new Set(holdings.map(h => h.sector)).size} sectors`} />
      </div>

      {/* ── Allocation + Sector ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="mb-4">
            <p className="text-sm font-bold text-slate-800 dark:text-white">Portfolio Allocation</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Holdings by current value</p>
          </div>
          {loading ? <Skeleton className="h-[280px]" /> : <AllocationPie data={allocationData} />}
        </div>

        <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="mb-4">
            <p className="text-sm font-bold text-slate-800 dark:text-white">Sector Distribution</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {sectorData.filter(s => s.label !== 'Other').length > 0
                ? 'Real-time from NSE Stock Master'
                : 'Loading sector data…'}
            </p>
          </div>
          {loading
            ? <Skeleton className="h-[180px]" />
            : <DistributionBar data={sectorData} emptyMsg="No sector data available" />
          }
        </div>
      </div>

      {/* ── Industry Distribution + Portfolio Growth ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="mb-4">
            <p className="text-sm font-bold text-slate-800 dark:text-white">Industry Breakdown</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Top 8 industries by value</p>
          </div>
          {loading
            ? <Skeleton className="h-[180px]" />
            : <DistributionBar data={industryData} emptyMsg="No industry data available" />
          }
        </div>

        <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="mb-4">
            <p className="text-sm font-bold text-slate-800 dark:text-white">Portfolio Growth</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Invested vs current value over time</p>
          </div>
          {loading ? <Skeleton className="h-[200px]" /> : <PortfolioGrowthChart holdings={holdings} />}
        </div>
      </div>

      {/* ── Asset class + Market cap + Diversification ── */}
      <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <p className="text-sm font-bold text-slate-800 dark:text-white mb-5">Portfolio Composition</p>
        {loading ? <Skeleton className="h-[140px]" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 items-center">
            {/* Asset class */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Asset Class</p>
              <div className="space-y-3">
                {assetClassData.map(d => {
                  const total = assetClassData.reduce((s, x) => s + x.value, 0)
                  const pct = total > 0 ? (d.value / total) * 100 : 0
                  return (
                    <div key={d.name}>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                          {d.name}
                        </span>
                        <span className="text-slate-500 tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sector concentration */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Top Sectors</p>
              <div className="space-y-3">
                {sectorData.slice(0, 4).map(d => (
                  <div key={d.label}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                        {d.label}
                      </span>
                      <span className="text-slate-500 tabular-nums">{d.pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: d.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Diversification score */}
            <div className="flex flex-col items-center gap-2">
              <DivScoreRing score={divScore} label="Diversification" size={80} />
              <p className="text-xs text-center text-slate-500 dark:text-slate-400 max-w-[120px]">
                {divScore >= 70 ? 'Well diversified across sectors' : divScore >= 40 ? 'Moderate concentration' : 'Highly concentrated — consider rebalancing'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Winners & Losers ── */}
      {!loading && (winners.length > 0 || losers.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <PerfList title="Top Performers" emoji="🏆" holdings={winners} />
          <PerfList title="Underperformers" emoji="⚠️" holdings={losers} />
        </div>
      )}
    </div>
  )
}

function PerfList({ title, emoji, holdings }: { title: string; emoji: string; holdings: EnrichedHolding[] }) {
  return (
    <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <p className="text-sm font-bold text-slate-800 dark:text-white mb-4">{emoji} {title}</p>
      <div className="space-y-2">
        {holdings.map(h => (
          <div key={h.tradeId} className="flex items-center gap-3">
            <TickerAvatar ticker={h.ticker} color={h.color} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{h.ticker}</p>
              <p className="text-[10px] text-slate-400 truncate">{h.companyName !== h.ticker ? h.companyName : h.sector}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={clsx('text-sm font-bold tabular-nums', pnlCls(h.totalPnl))}>
                {h.totalPnl >= 0 ? '+' : ''}{fmtINR(h.totalPnl, true)}
              </p>
              <p className={clsx('text-[10px] font-semibold tabular-nums', pnlCls(h.returnsPct))}>
                {fmtPct(h.returnsPct)}
              </p>
            </div>
          </div>
        ))}
        {holdings.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No data</p>}
      </div>
    </div>
  )
}

// ── Portfolio Intelligence tab ────────────────────────────────────────────────

function IntelligenceTab({ holdings }: { holdings: EnrichedHolding[] }) {
  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0)

  const overweight  = holdings.filter(h => h.allocationPct > 20)
  const underweight = holdings.filter(h => h.allocationPct < 2 && holdings.length > 5)
  const redSignals  = holdings.filter(h => h.signalCls === 'exit' || h.signalCls === 'watch')
  const greenSignals = holdings.filter(h => h.signalCls === 'buy')

  const sectorMap = new Map<string, number>()
  for (const h of holdings) sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + h.currentValue)
  const sectorEntries = [...sectorMap.entries()].sort((a, b) => b[1] - a[1])
  const topSector    = sectorEntries[0]
  const topSectorPct = totalValue > 0 && topSector ? (topSector[1] / totalValue) * 100 : 0

  const insights: Array<{ icon: string; title: string; desc: string; type: 'warn' | 'info' | 'good' }> = []

  if (overweight.length > 0)
    insights.push({ icon: '⚠️', title: 'Concentration Risk', desc: `${overweight.map(h => h.ticker).join(', ')} exceed 20% allocation. Consider rebalancing.`, type: 'warn' })
  if (topSectorPct > 40)
    insights.push({ icon: '📊', title: 'Sector Overexposure', desc: `${topSector[0]} sector represents ${topSectorPct.toFixed(1)}% of your portfolio.`, type: 'warn' })
  if (redSignals.length > 0)
    insights.push({ icon: '🔴', title: 'Action Required', desc: `${redSignals.map(h => h.ticker).join(', ')} need attention — consider reviewing your position.`, type: 'warn' })
  if (underweight.length > 0)
    insights.push({ icon: '📉', title: 'Underweight Positions', desc: `${underweight.map(h => h.ticker).join(', ')} have <2% allocation. Consider consolidating or building position.`, type: 'info' })
  if (greenSignals.length > 0)
    insights.push({ icon: '🟢', title: 'Averaging Opportunities', desc: `${greenSignals.map(h => h.ticker).join(', ')} may benefit from averaging down.`, type: 'info' })
  if (holdings.length >= 8 && topSectorPct < 35)
    insights.push({ icon: '✅', title: 'Good Diversification', desc: 'Portfolio has reasonable spread across holdings and sectors.', type: 'good' })

  const insightColor: Record<string, string> = {
    warn: 'border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-900/10',
    info: 'border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10',
    good: 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-900/10',
  }

  return (
    <div className="space-y-5">
      {/* Signal summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Strong Hold', count: holdings.filter(h => h.signal === 'Strong Hold').length, color: '#3b82f6' },
          { label: 'Hold', count: holdings.filter(h => h.signal === 'Hold').length, color: '#6366f1' },
          { label: 'Action Needed', count: holdings.filter(h => ['Reduce', 'Exit', 'Watch Closely'].includes(h.signal)).length, color: '#f59e0b' },
          { label: 'Avg / Buy More', count: holdings.filter(h => ['Buy More', 'Average Now'].includes(h.signal)).length, color: '#10b981' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center text-xl font-extrabold" style={{ background: `${s.color}18`, color: s.color }}>
              {s.count}
            </div>
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Insights */}
      <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <p className="text-sm font-bold text-slate-800 dark:text-white mb-4">Portfolio Insights</p>
        {insights.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Add more holdings to unlock deeper insights.</p>
        ) : (
          <div className="space-y-3">
            {insights.map((ins, i) => (
              <div key={i} className={clsx('rounded-xl border p-4', insightColor[ins.type])}>
                <div className="flex items-start gap-3">
                  <span className="text-lg shrink-0">{ins.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-0.5">{ins.title}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{ins.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Holdings signal table with link to insight */}
      <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800 dark:text-white">AI Signal Breakdown</p>
          <p className="text-[11px] text-slate-400">Click any row for full AI report</p>
        </div>
        <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
          {holdings.map(h => (
            <Link
              key={h.tradeId}
              to={`/insight/${h.insightSymbol}`}
              className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors"
            >
              <TickerAvatar ticker={h.ticker} color={h.color} size={30} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{h.ticker}</p>
                <p className="text-[10px] text-slate-400 truncate">
                  {h.companyName !== h.ticker ? h.companyName : ''}
                  {h.sector !== 'Other' && <> · {h.sector}</>}
                </p>
              </div>
              <div className="text-right mr-4">
                <p className={clsx('text-xs font-bold tabular-nums', pnlCls(h.returnsPct))}>{fmtPct(h.returnsPct)}</p>
                <p className="text-[10px] text-slate-400">{h.allocationPct.toFixed(1)}% alloc</p>
              </div>
              <div className="text-right mr-4 hidden sm:block">
                <p className="text-[10px] text-slate-400 mb-0.5">Confidence</p>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-1 rounded-full bg-slate-100 dark:bg-white/10">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${h.confidence}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500">{h.confidence}%</span>
                </div>
              </div>
              <SignalBadge signal={h.signal} cls={h.signalCls} />
            </Link>
          ))}
          {holdings.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No holdings data</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Coming soon placeholder ───────────────────────────────────────────────────

function ComingSoonTab({ icon, title, description, features }: {
  icon: React.ReactNode; title: string; description: string; features: string[]
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 max-w-lg mx-auto text-center">
      <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-brand-500/10 to-indigo-500/10 border border-brand-200/50 dark:border-brand-800/50 grid place-items-center mb-6">
        <div className="text-4xl">{icon}</div>
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{description}</p>
      <div className="w-full space-y-2 text-left">
        {features.map(f => (
          <div key={f} className="flex items-center gap-3 bg-slate-50 dark:bg-white/[0.03] rounded-xl px-4 py-3 border border-slate-100 dark:border-slate-800">
            <div className="h-5 w-5 rounded-full bg-brand-100 dark:bg-brand-900/30 grid place-items-center shrink-0">
              <svg viewBox="0 0 24 24" className="h-3 w-3 text-brand-500" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5L20 7" /></svg>
            </div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{f}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── useHoldings hook ──────────────────────────────────────────────────────────

function useHoldings() {
  const [allTrades, setAllTrades]     = useState<Trade[]>([])
  const [stockMaster, setStockMaster] = useState<Map<string, InsightSymbol>>(new Map())
  const [loading, setLoading]         = useState(true)
  const quotes                        = useMarketStore(s => s.quotes)
  const symbolsRef                    = useRef<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const trades = await getTrades({ fromDate: '2020-01-01' })
      setAllTrades(trades)

      // Derive holdings from open non-options trades
      const rawHoldings = deriveHoldings(trades)
      // Use insightSymbol (e.g. POKARNA-EQ) — not ticker (POKARNA) — for the API
      const uniqueInsightSymbols = [...new Set(rawHoldings.map(h => h.insightSymbol))]

      // Batch-fetch Stock Master for real sector/industry/name
      const masterMap = new Map<string, InsightSymbol>()
      await Promise.allSettled(
        uniqueInsightSymbols.map(sym =>
          searchInsightSymbols(sym)
            .then(results => {
              // Exact match on symbol_code (case-insensitive)
              const match = results.find(r => r.symbol_code.toUpperCase() === sym)
              if (match) masterMap.set(sym, match)
            })
            .catch(() => { /* ignore individual failures */ }),
        ),
      )
      setStockMaster(masterMap)
    } catch {
      toast.error('Failed to load holdings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const holdings = useMemo(() => deriveHoldings(allTrades), [allTrades])

  // Subscribe to live ticks for all equity holdings
  useEffect(() => {
    const symbols = holdings.map(h => h.symbol)
    if (JSON.stringify(symbols) === JSON.stringify(symbolsRef.current)) return
    symbolsRef.current = symbols
    if (!symbols.length) return
    realtime.start()
    const unsubs = symbols.flatMap(s => [
      realtime.subscribeSymbolTick(s, { prime: false }),
      realtime.subscribeSymbolTick(s.replace(/_EQ$/i, ''), { prime: false }),
    ])
    return () => unsubs.forEach(u => u())
  }, [holdings])

  const enriched = useMemo(() => enrichHoldings(holdings, quotes, stockMaster), [holdings, quotes, stockMaster])

  return { enriched, loading, reload: load }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HoldingsPage() {
  const { enriched, loading, reload } = useHoldings()
  const [tab, setTab]     = useState<Tab>('overview')
  const [selected, setSelected] = useState<EnrichedHolding | null>(null)

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'overview',      label: 'Overview',      icon: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
    { id: 'holdings',      label: 'Holdings',      icon: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="12" y="6" width="3" height="12" /><rect x="17" y="13" width="3" height="5" /></svg> },
    { id: 'intelligence',  label: 'Intelligence',  icon: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 017 7c0 3.5-2 6-4 7.5V19a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2.5C7 15 5 12.5 5 9a7 7 0 017-7z" /><line x1="9" y1="22" x2="15" y2="22" /></svg> },
    { id: 'dividends',     label: 'Dividends',     icon: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" /></svg> },
    { id: 'events',        label: 'Events',        icon: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
  ]

  const totalCurrentValue = enriched.reduce((s, h) => s + h.currentValue, 0)
  const totalInvested     = enriched.reduce((s, h) => s + h.investedValue, 0)
  const totalPnl          = enriched.reduce((s, h) => s + h.totalPnl, 0)
  const totalReturnsPct   = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Page header ── */}
      <div className="shrink-0 px-6 pt-6 pb-0 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Holdings</h1>
              {!loading && enriched.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800">
                  {enriched.length} positions
                </span>
              )}
            </div>
            {!loading && enriched.length > 0 && (
              <div className="flex items-center gap-3 mt-1">
                <p className="text-xs text-slate-400">
                  Portfolio value{' '}
                  <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{fmtINR(totalCurrentValue, true)}</span>
                </p>
                <span className={clsx('text-xs font-bold tabular-nums', pnlCls(totalReturnsPct))}>
                  {totalReturnsPct >= 0 ? '▲' : '▼'} {Math.abs(totalReturnsPct).toFixed(2)}%
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => reload()}
            disabled={loading}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              'bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700',
              'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 shadow-sm disabled:opacity-60',
            )}
          >
            <svg viewBox="0 0 24 24" className={clsx('h-4 w-4', loading && 'animate-spin')} fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'relative flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-semibold transition-all',
                tab === t.id
                  ? 'bg-white dark:bg-card-dark text-brand-600 dark:text-brand-400 shadow-sm border border-b-0 border-slate-200 dark:border-slate-800 -mb-px z-10'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-white/5',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-[#040810]">

        {/* Empty state — no holdings found */}
        {!loading && enriched.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[480px] px-6 text-center">
            {/* Illustration */}
            <div className="relative mb-6">
              <div className="h-24 w-24 rounded-full bg-gradient-to-br from-brand-500/10 to-indigo-500/10 dark:from-brand-500/20 dark:to-indigo-500/20 flex items-center justify-center ring-1 ring-brand-200/50 dark:ring-brand-500/20">
                <svg viewBox="0 0 24 24" className="h-10 w-10 text-brand-400 dark:text-brand-500" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="7" y="10" width="3" height="8" rx="0.5" />
                  <rect x="12" y="6" width="3" height="12" rx="0.5" />
                  <rect x="17" y="13" width="3" height="5" rx="0.5" />
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-amber-400 dark:bg-amber-500 flex items-center justify-center shadow-sm ring-2 ring-white dark:ring-[#040810]">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <h2 className="text-[18px] font-bold text-slate-800 dark:text-white/85 mb-2">No holdings yet</h2>
            <p className="text-[13px] text-slate-500 dark:text-white/35 max-w-sm leading-relaxed mb-6">
              Holdings are derived from your open equity and futures trades. Add your first trade in the Journal and it will appear here automatically.
            </p>

            <Link
              to="/journal"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 shadow-sm shadow-brand-500/25 transition-all hover:-translate-y-0.5 active:scale-95"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add your first trade in Journal
            </Link>

            <p className="mt-4 text-[11px] text-slate-400 dark:text-white/20">
              Only open EQ / FUT positions appear as holdings · Options are excluded
            </p>
          </div>
        )}

        {/* Normal tabs content */}
        {(loading || enriched.length > 0) && (
        <div className={clsx('mx-auto', tab === 'holdings' ? 'flex h-full min-h-0' : 'p-6 max-w-[1400px]')}>

          {tab === 'overview' && (
            <OverviewTab holdings={enriched} loading={loading} />
          )}

          {tab === 'holdings' && (
            <div className="flex-1 flex min-h-0 gap-0 w-full">
              <div className={clsx('flex-1 overflow-y-auto p-6 min-w-0 transition-all duration-300', selected ? 'pr-3' : '')}>
                <HoldingsTable holdings={enriched} loading={loading} onSelect={setSelected} selected={selected?.tradeId ?? null} />
              </div>
              <div
                className="shrink-0 overflow-hidden transition-[width] duration-300 ease-out border-l border-slate-200 dark:border-slate-800"
                style={{ width: selected ? 400 : 0 }}
              >
                {selected && <HoldingDetailPanel h={selected} onClose={() => setSelected(null)} />}
              </div>
            </div>
          )}

          {tab === 'intelligence' && (
            <IntelligenceTab holdings={enriched} />
          )}

          {tab === 'dividends' && (
            <ComingSoonTab
              icon="💰"
              title="Dividend Tracking"
              description="Get comprehensive visibility into your dividend income — past, present and upcoming. Track yield, income projections, and build a passive income timeline."
              features={[
                'Upcoming dividend calendar with ex-dates and payment dates',
                'Annual & monthly dividend income projections',
                'Dividend yield per holding and portfolio-level yield',
                'Historical dividend payout tracking',
                'DRIP (Dividend Reinvestment) tracking',
                'Sector-wise dividend income breakdown',
              ]}
            />
          )}

          {tab === 'events' && (
            <ComingSoonTab
              icon="📅"
              title="Earnings & Corporate Events"
              description="Stay ahead of market-moving events across your portfolio. Never miss an earnings call, ex-dividend date, bonus issue, or rights offering again."
              features={[
                'Earnings calendar with consensus estimates vs actuals',
                'AGM and EGM announcements',
                'Bonus issue and stock split notifications',
                'Rights issue alerts with subscription deadlines',
                'Corporate action timeline per holding',
                'Industry-level economic events impacting your holdings',
              ]}
            />
          )}
        </div>
        )}

      </div>
    </div>
  )
}
