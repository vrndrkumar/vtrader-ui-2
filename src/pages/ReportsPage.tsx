import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { clsx } from 'clsx'
import { getTrades } from '@/api/reports'
import { getStrategyConfigs } from '@/api/strategy'
import type { Trade, TradeFilters } from '@/types/reports'
import type { StrategyConfig } from '@/types/strategy'
import { MANUAL_CODES } from '@/types/strategy'
import {
  computeStats,
  computeDailyPnl,
  computeGroupPnl,
  computeSymbolPnl,
  formatPnl,
} from '@/utils/tradeStats'
import { SummaryCards } from '@/components/reports/SummaryCards'
import { FilterBar } from '@/components/reports/FilterBar'
import { TradeTable } from '@/components/reports/TradeTable'
import { OrdersDrawer } from '@/components/reports/OrdersDrawer'
import { CalendarView } from '@/components/reports/CalendarView'
import {
  CumulativePnlChart,
  DailyPnlChart,
  ComposedPnlChart,
  HorizontalBarChart,
  WinLossDonut,
  SymbolRadarChart,
  PnlDistributionChart,
  EmptyChart,
} from '@/components/reports/PnLCharts'

type Tab = 'overview' | 'analytics' | 'trades' | 'calendar'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    id: 'trades',
    label: 'Trades',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
]

// Default: last 30 days
function defaultDateRange() {
  const to   = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { dateFrom: fmt(from), dateTo: fmt(to) }
}

const DEFAULT_FILTERS: TradeFilters = {
  brokerName: '', groupName: '', status: 'ALL', symbolSearch: '',
  ...defaultDateRange(),
}

// ── Skeleton for chart cards ──────────────────────────────────────────────────

function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="animate-pulse" style={{ height }}>
      <div className="h-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
    </div>
  )
}

// ── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, children, className, action,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  return (
    <div className={clsx(
      'bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-4',
      className,
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800 dark:text-white">{title}</p>
          {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  )
}

// ── Stat mini-card for analytics ──────────────────────────────────────────────

function StatMini({ label, value, signed, positive }: {
  label: string; value: string; signed?: boolean; positive?: boolean
}) {
  const cls = signed
    ? value.startsWith('-') ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'
    : positive === undefined ? 'text-slate-900 dark:text-white'
    : positive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'

  return (
    <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">{label}</p>
      <p className={clsx('text-lg font-bold tabular-nums', cls)}>{value}</p>
    </div>
  )
}

// ── Today's session strip ─────────────────────────────────────────────────────

function TodayStrip({ trades, onTodayClick }: { trades: Trade[]; onTodayClick: () => void }) {
  const today = new Date().toISOString().split('T')[0]
  // Filter by last_updated_time (reflects IST date correctly, avoids UTC midnight issues)
  const todayTrades   = useMemo(() =>
    trades.filter((t) => (t.last_updated_time ?? t.first_placed_time ?? '').slice(0, 10) === today),
    [trades, today],
  )
  const openTrades    = todayTrades.filter((t) => t.status !== 'CLOSED')
  const realizedPnl   = todayTrades.reduce((s, t) => s + (t.realized_pnl ?? 0), 0)
  const unrealizedPnl = openTrades.reduce((s, t) => s + (t.unrealized_pnl ?? 0), 0)

  if (!todayTrades.length) return null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTodayClick}
      onKeyDown={(e) => e.key === 'Enter' && onTodayClick()}
      className="relative bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden cursor-pointer hover:border-brand-400 dark:hover:border-brand-600 hover:shadow-md transition-all duration-150 group"
      title="Click to filter today's trades"
    >
      {/* Accent strip */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-500 via-indigo-500 to-teal-500" />

      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">Today's Session</p>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
            {today}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Total Trades', value: todayTrades.length.toString(), color: 'text-slate-800 dark:text-white' },
            { label: 'Open Positions', value: openTrades.length.toString(), color: 'text-amber-600 dark:text-amber-400' },
            {
              label: 'Realized P&L',
              value: formatPnl(realizedPnl),
              color: realizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400',
            },
            {
              label: 'Unrealized P&L',
              value: unrealizedPnl !== 0 ? formatPnl(unrealizedPnl) : '—',
              color: unrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400',
            },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5 font-medium">{s.label}</p>
              <p className={clsx('text-lg font-bold tabular-nums', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {openTrades.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {openTrades.map((t) => (
              <span
                key={t.trade_id}
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-full px-2.5 py-1 text-amber-800 dark:text-amber-300"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                {t.symbol_name.split('_')[0]}
                {t.unrealized_pnl !== 0 && (
                  <span className={t.unrealized_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                    · {formatPnl(t.unrealized_pnl)}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [allTrades, setAllTrades]         = useState<Trade[]>([])
  const [strategies, setStrategies]       = useState<StrategyConfig[]>([])
  const [loading, setLoading]             = useState(true)
  const [syncing, setSyncing]             = useState(false)
  const [filters, setFilters]             = useState<TradeFilters>(DEFAULT_FILTERS)
  const [tab, setTab]                     = useState<Tab>('overview')
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [lastRefresh, setLastRefresh]     = useState<Date>(new Date())
  const today = new Date().toISOString().split('T')[0]

  const fetchTrades = useCallback(async (showSyncing = false) => {
    if (showSyncing) setSyncing(true)
    else setLoading(true)
    try {
      const apiGroup = (filters.groupName && filters.groupName !== 'Manual') ? filters.groupName : undefined
      const [data, strats] = await Promise.all([
        getTrades({
          brokerName: filters.brokerName || undefined,
          groupName:  apiGroup,
          fromDate:   filters.dateFrom || undefined,
          toDate:     filters.dateTo   || undefined,
        }),
        strategies.length === 0 ? getStrategyConfigs().catch(() => []) : Promise.resolve(strategies),
      ])
      setAllTrades(data)
      if (strategies.length === 0) setStrategies(strats)
      setLastRefresh(new Date())
    } catch {
      toast.error('Failed to load trades')
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [filters.brokerName, filters.groupName, filters.dateFrom, filters.dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchTrades() }, [fetchTrades])

  // ── Client-side filtering ─────────────────────────────────────────────────

  const filteredTrades = useMemo(() => allTrades.filter((t) => {
    // Status filter: map UI values to actual API status values
    if (filters.status !== 'ALL') {
      if (filters.status === 'CLOSED' && t.status !== 'CLOSED') return false
      if (filters.status === 'OPEN'   && t.status === 'CLOSED') return false
    }
    if (filters.groupName === 'Manual' && t.group_name && !MANUAL_CODES.has(t.group_name)) return false
    if (filters.symbolSearch) {
      const q = filters.symbolSearch.toUpperCase()
      if (!t.symbol_name.toUpperCase().includes(q) && !t.group_name?.toUpperCase().includes(q)) return false
    }
    // Date filtering is handled server-side by the API (fromDate/toDate params).
    // Client-side date filtering is intentionally skipped to avoid UTC/IST timezone mismatch.
    return true
  }), [allTrades, filters])

  const brokerOptions = useMemo(() => [...new Set(allTrades.map((t) => t.broker_name))].sort(), [allTrades])

  const strategyOptions = useMemo(() => {
    const fromConfig = strategies.map((s) => ({ groupName: s.strategyCode, label: s.strategyName }))
    const configCodes = new Set(strategies.map((s) => s.strategyCode))
    const fromTrades = [...new Set(allTrades.map((t) => t.group_name).filter(Boolean))]
      .filter((g) => !configCodes.has(g) && !MANUAL_CODES.has(g))
      .map((g) => ({ groupName: g, label: g }))
    return [...fromConfig, ...fromTrades]
  }, [strategies, allTrades])

  const stats      = useMemo(() => computeStats(filteredTrades), [filteredTrades])
  const dailyPnl   = useMemo(() => computeDailyPnl(filteredTrades), [filteredTrades])
  const groupPnl   = useMemo(() => computeGroupPnl(filteredTrades), [filteredTrades])
  const symbolPnl  = useMemo(() => computeSymbolPnl(filteredTrades), [filteredTrades])

  const updateFilters = (patch: Partial<TradeFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
  }

  const timeAgo = useMemo(() => {
    const s = Math.floor((Date.now() - lastRefresh.getTime()) / 1000)
    if (s < 60) return 'just now'
    const m = Math.floor(s / 60)
    return `${m}m ago`
  }, [lastRefresh])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Page header ── */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Reports</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {allTrades.length} trades · refreshed {timeAgo}
            </p>
          </div>
          <button
            onClick={() => fetchTrades(true)}
            disabled={syncing}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              'bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700',
              'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10',
              'shadow-sm disabled:opacity-60',
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={clsx('h-4 w-4', syncing && 'animate-spin')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
            {syncing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                tab === t.id
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/25'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-5 max-w-[1400px] mx-auto">

          {/* Filters */}
          <FilterBar
            filters={filters}
            onChange={updateFilters}
            brokerOptions={brokerOptions}
            strategyOptions={strategyOptions}
          />

          {/* KPI Cards */}
          <SummaryCards stats={stats} loading={loading} />

          {/* Today's strip */}
          {!loading && (
            <TodayStrip
              trades={allTrades}
              onTodayClick={() => updateFilters({ dateFrom: today, dateTo: today })}
            />
          )}

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="space-y-5">
              {/* Composed PnL chart - full width */}
              <ChartCard
                title="P&L Overview"
                subtitle="Daily bars + cumulative line"
              >
                {loading
                  ? <ChartSkeleton height={300} />
                  : <ComposedPnlChart data={dailyPnl} height={300} />
                }
              </ChartCard>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="Cumulative P&L" subtitle="Running total over time">
                  {loading ? <ChartSkeleton /> : <CumulativePnlChart data={dailyPnl} />}
                </ChartCard>
                <ChartCard title="Daily P&L" subtitle="Profit/loss per trading day">
                  {loading ? <ChartSkeleton /> : <DailyPnlChart data={dailyPnl} />}
                </ChartCard>
              </div>

              {/* Quick metrics row */}
              {!loading && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <QuickMetric
                    icon="🏆" label="Best Trade"
                    value={formatPnl(stats.bestTrade)}
                    valueClass="text-green-600 dark:text-green-400"
                    sub={stats.largestWin?.symbol_name?.split('_')[0] ?? '—'}
                  />
                  <QuickMetric
                    icon="⚠️" label="Worst Trade"
                    value={formatPnl(stats.worstTrade)}
                    valueClass={stats.worstTrade >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}
                    sub={stats.largestLoss?.symbol_name?.split('_')[0] ?? '—'}
                  />
                  <QuickMetric
                    icon="🎯" label="Profit Factor"
                    value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}
                    valueClass={stats.profitFactor >= 1 ? 'text-brand-600 dark:text-brand-400' : 'text-red-500 dark:text-red-400'}
                    sub="Gross profit / loss"
                  />
                  <QuickMetric
                    icon="📊" label="Avg P&L/Trade"
                    value={formatPnl(stats.avgPnlPerTrade)}
                    valueClass={stats.avgPnlPerTrade >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}
                    sub={`${stats.closedTrades} closed trades`}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Analytics ── */}
          {tab === 'analytics' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

                {/* Win/Loss donut */}
                <ChartCard title="Win / Loss Breakdown" subtitle="Closed trades only">
                  {loading ? <ChartSkeleton height={300} /> : (
                    <WinLossDonut
                      wins={stats.winningTrades}
                      losses={stats.losingTrades}
                      neutral={stats.closedTrades - stats.winningTrades - stats.losingTrades}
                      height={300}
                    />
                  )}
                </ChartCard>

                {/* Strategy PnL */}
                <ChartCard title="Strategy P&L" subtitle="Performance by group">
                  {loading
                    ? <ChartSkeleton height={300} />
                    : groupPnl.length
                      ? <HorizontalBarChart data={groupPnl} height={300} maxItems={8} />
                      : <EmptyChart label="No group data" height={300} />
                  }
                </ChartCard>

                {/* Symbol PnL */}
                <ChartCard title="Symbol P&L" subtitle="Top performing symbols">
                  {loading
                    ? <ChartSkeleton height={300} />
                    : symbolPnl.length
                      ? <HorizontalBarChart data={symbolPnl} height={300} maxItems={8} />
                      : <EmptyChart label="No symbol data" height={300} />
                  }
                </ChartCard>

                {/* Radar */}
                <ChartCard title="Symbol Distribution" subtitle="Radar of trade volume">
                  {loading
                    ? <ChartSkeleton height={280} />
                    : <SymbolRadarChart data={symbolPnl} height={280} />
                  }
                </ChartCard>

                {/* Scatter / distribution */}
                <ChartCard title="Daily P&L Scatter" subtitle="Day-by-day distribution" className="md:col-span-2">
                  {loading ? <ChartSkeleton height={240} /> : <PnlDistributionChart data={dailyPnl} height={240} />}
                </ChartCard>
              </div>

              {/* Stat mini-cards */}
              {!loading && (
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-3">
                  <StatMini label="Profit Factor" value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'} positive={stats.profitFactor >= 1} />
                  <StatMini label="Avg P&L" value={formatPnl(stats.avgPnlPerTrade)} signed />
                  <StatMini label="Best Trade" value={formatPnl(stats.bestTrade)} positive />
                  <StatMini label="Worst Trade" value={formatPnl(stats.worstTrade)} positive={stats.worstTrade >= 0} />
                  <StatMini label="Open Trades" value={stats.openTrades.toString()} />
                  <StatMini label="Closed Trades" value={stats.closedTrades.toString()} />
                </div>
              )}

              {/* Full-width PnL curve */}
              <ChartCard title="Cumulative P&L Curve" subtitle="Full timeline">
                {loading ? <ChartSkeleton height={280} /> : <CumulativePnlChart data={dailyPnl} height={280} />}
              </ChartCard>
            </div>
          )}

          {/* ── Trades ── */}
          {tab === 'trades' && (
            loading
              ? (
                <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-slate-800">
                    <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  </div>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="px-4 py-4 border-b border-slate-100 dark:border-slate-800 animate-pulse flex gap-4">
                      {[120, 80, 60, 50, 40, 55, 45, 60].map((w, j) => (
                        <div key={j} className="h-3 rounded bg-slate-100 dark:bg-slate-800" style={{ width: w }} />
                      ))}
                    </div>
                  ))}
                </div>
              )
              : <TradeTable trades={filteredTrades} onViewOrders={setSelectedTrade} />
          )}

          {/* ── Calendar ── */}
          {tab === 'calendar' && (
            loading
              ? <ChartSkeleton height={500} />
              : <CalendarView trades={filteredTrades} />
          )}

        </div>
      </div>

      {/* Orders drawer */}
      <OrdersDrawer trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
    </div>
  )
}

// ── Quick metric card ─────────────────────────────────────────────────────────

function QuickMetric({ icon, label, value, valueClass, sub }: {
  icon: string; label: string; value: string; valueClass: string; sub: string
}) {
  return (
    <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</p>
      </div>
      <p className={clsx('text-xl font-bold tabular-nums', valueClass)}>{value}</p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}

