import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { clsx } from 'clsx'
import { useAuth } from '@/hooks/useAuth'
import { getTrades } from '@/api/reports'
import { getStrategyConfigs } from '@/api/strategy'
import type { Trade } from '@/types/reports'
import type { StrategyConfig } from '@/types/strategy'
import { MANUAL_CODES } from '@/types/strategy'
import { computeStats, formatPnl } from '@/utils/tradeStats'
import {
  computeDayOfWeekStats,
  computeStrategyMetrics,
  computeOverallStreaks,
  computeDrawdownSeries,
  type DayOfWeekStats,
  type StrategyMetrics,
} from '@/utils/analytics'

type Tab = 'overview' | 'strategies' | 'daytrend'
const WEEKDAY_INDICES = [1, 2, 3, 4, 5] // Mon–Fri

export default function AnalyticsPage() {
  const { user } = useAuth()

  // Admin gate
  if (user && user.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="h-16 w-16 rounded-2xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Admin Only</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Analytics is restricted to admin users.</p>
      </div>
    )
  }

  return <AnalyticsDashboard />
}

function AnalyticsDashboard() {
  const [trades, setTrades]             = useState<Trade[]>([])
  const [strategyConfigs, setStrategyConfigs] = useState<StrategyConfig[]>([])
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState<Tab>('overview')

  // Day-of-week filter (for Day Trend tab)
  const [selectedDays, setSelectedDays] = useState<number[]>(WEEKDAY_INDICES)

  // Broker / group filters
  const [brokerFilter, setBrokerFilter] = useState('')
  const [groupFilter, setGroupFilter]   = useState('')

  const fetchTrades = useCallback(async () => {
    setLoading(true)
    try {
      const apiGroup = (groupFilter && groupFilter !== 'Manual') ? groupFilter : undefined
      const [data, strats] = await Promise.all([
        getTrades({ brokerName: brokerFilter || undefined, groupName: apiGroup }),
        strategyConfigs.length === 0 ? getStrategyConfigs().catch(() => []) : Promise.resolve(strategyConfigs),
      ])
      setTrades(data)
      if (strategyConfigs.length === 0) setStrategyConfigs(strats)
    } catch {
      toast.error('Failed to load trades')
    } finally {
      setLoading(false)
    }
  }, [brokerFilter, groupFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchTrades() }, [fetchTrades])

  // Derived values
  const stats          = useMemo(() => computeStats(trades), [trades])
  const strategies     = useMemo(() => computeStrategyMetrics(trades), [trades])
  const streaks        = useMemo(() => computeOverallStreaks(trades), [trades])
  const drawdownSeries = useMemo(() => computeDrawdownSeries(trades), [trades])
  const dowStats       = useMemo(() => computeDayOfWeekStats(trades), [trades])

  const brokerOptions = useMemo(() => [...new Set(trades.map((t) => t.broker_name))].sort(), [trades])

  // Strategy options: strategyCode = trade group_name
  const strategyDropdownOptions = useMemo(() => {
    const fromConfig = strategyConfigs.map((s) => ({
      value: s.strategyCode,
      label: s.strategyName,
    }))
    const configCodes = new Set(strategyConfigs.map((s) => s.strategyCode))
    const fromTrades = [...new Set(trades.map((t) => t.group_name).filter(Boolean))]
      .filter((g) => !configCodes.has(g) && !MANUAL_CODES.has(g))
      .map((g) => ({ value: g, label: g }))
    return [...fromConfig, ...fromTrades]
  }, [strategyConfigs, trades])

  // Filtered DOW stats based on selectedDays
  const filteredDow = useMemo(
    () => dowStats.filter((d) => selectedDays.includes(d.dayIndex)),
    [dowStats, selectedDays],
  )

  const toggleDay = (d: number) =>
    setSelectedDays((prev) =>
      prev.includes(d) ? (prev.length > 1 ? prev.filter((x) => x !== d) : prev) : [...prev, d],
    )

  const selectCls = 'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:[color-scheme:dark]'

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Deep strategy analysis · {trades.filter((t) => t.status === 'CLOSED').length} closed trades
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className={selectCls} value={brokerFilter} onChange={(e) => setBrokerFilter(e.target.value)}>
            <option value="">All Brokers</option>
            {brokerOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className={selectCls} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">All Groups</option>
            <option value="Manual">Manual</option>
            {strategyDropdownOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button
            onClick={fetchTrades}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={clsx('h-4 w-4', loading && 'animate-spin')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <svg className="animate-spin h-8 w-8 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <>
          {/* Top KPI bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiCard label="Gross P&L" value={formatPnl(stats.totalRealizedPnl)} positive={stats.totalRealizedPnl >= 0} />
            <KpiCard label="Profitable Days %" value={`${stats.winRate.toFixed(1)}%`} positive={stats.winRate >= 50} />
            <KpiCard label="Profitable Trades %" value={`${stats.winRate.toFixed(1)}%`} positive={stats.winRate >= 50} />
            <KpiCard label="Profit Factor" value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'} positive={stats.profitFactor >= 1} />
            <KpiCard label="Win Streak" value={`${streaks.longestWinStreak} trades`} positive />
            <KpiCard label="Loss Streak" value={`${streaks.longestLoseStreak} trades`} positive={false} />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-2xl w-fit">
            {([
              ['overview', 'Overview'],
              ['strategies', 'Strategy Analysis'],
              ['daytrend', 'Day Trends'],
            ] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-5 py-2 rounded-xl text-sm font-semibold transition-all',
                  tab === t
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="space-y-5">
              {/* Streak cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StreakCard label="Current Win Streak" trades={streaks.currentWinStreak} days={streaks.currentWinDayStreak} positive />
                <StreakCard label="Current Loss Streak" trades={streaks.currentLoseStreak} days={streaks.currentLoseDayStreak} positive={false} />
                <StreakCard label="Best Win Streak" trades={streaks.longestWinStreak} days={streaks.longestWinDayStreak} positive />
                <StreakCard label="Worst Loss Streak" trades={streaks.longestLoseStreak} days={streaks.longestLoseDayStreak} positive={false} />
              </div>

              {/* Drawdown chart */}
              <ACard title="Max Drawdown Analysis">
                <DrawdownChart data={drawdownSeries} />
                <div className="flex gap-6 mt-4">
                  <MetricPill
                    label="Max Drawdown"
                    value={formatPnl(Math.max(...drawdownSeries.map((d) => d.drawdown), 0))}
                    negative
                  />
                  <MetricPill
                    label="Peak P&L"
                    value={formatPnl(Math.max(...drawdownSeries.map((d) => d.peak), 0))}
                    positive
                  />
                </div>
              </ACard>

              {/* Top strategy summary */}
              <ACard title="Strategy Summary">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {strategies.slice(0, 6).map((s) => (
                    <StrategyMiniCard key={s.groupName} s={s} />
                  ))}
                </div>
              </ACard>
            </div>
          )}

          {/* ── Strategy Analysis ── */}
          {tab === 'strategies' && (
            <div className="space-y-5">
              <ACard title="Strategy / Group Metrics" noPad>
                <StrategyTable strategies={strategies} />
              </ACard>

              {/* Per strategy expectancy chart */}
              <ACard title="Expectancy by Strategy">
                <ExpectancyChart strategies={strategies} />
              </ACard>
            </div>
          )}

          {/* ── Day Trends ── */}
          {tab === 'daytrend' && (
            <div className="space-y-5">
              {/* Day filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">Filter days:</span>
                {dowStats.map((d) => (
                  <button
                    key={d.dayIndex}
                    onClick={() => toggleDay(d.dayIndex)}
                    className={clsx(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border',
                      selectedDays.includes(d.dayIndex)
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300',
                    )}
                  >
                    {d.shortDay}
                  </button>
                ))}
              </div>

              {/* Day summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                {filteredDow.map((d) => <DayCard key={d.day} stat={d} />)}
              </div>

              {/* Day P&L bar chart */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ACard title="Total P&L by Day">
                  <DayPnlBarChart data={filteredDow} />
                </ACard>
                <ACard title="Win Rate by Day">
                  <DayWinRateChart data={filteredDow} />
                </ACard>
              </div>

              {/* Day detail table */}
              <ACard title="Day-wise Breakdown" noPad>
                <DayDetailTable data={filteredDow} />
              </ACard>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={clsx('text-lg font-bold', positive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
        {value}
      </p>
    </div>
  )
}

// ── Streak Card ───────────────────────────────────────────────────────────────

function StreakCard({ label, trades, days, positive }: { label: string; trades: number; days: number; positive: boolean }) {
  const color = positive
    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
    : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'

  return (
    <div className={clsx('rounded-2xl border p-4', color)}>
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={clsx('text-3xl font-bold', positive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
        {trades}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">trades · {days} days</p>
    </div>
  )
}

// ── Drawdown chart (SVG) ──────────────────────────────────────────────────────

function DrawdownChart({ data }: { data: { date: string; cumPnl: number; drawdown: number; peak: number }[] }) {
  if (data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No data</div>
  }

  const W = 700, H = 160
  const PAD = { t: 10, r: 16, b: 28, l: 56 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b

  const cumPnls = data.map((d) => d.cumPnl)
  const ddowns  = data.map((d) => -d.drawdown)
  const allVals = [...cumPnls, ...ddowns]
  const minY = Math.min(...allVals)
  const maxY = Math.max(...allVals)

  const scY = (v: number) => PAD.t + ((maxY - v) / (maxY - minY || 1)) * iH
  const scX = (i: number) => PAD.l + (i / Math.max(data.length - 1, 1)) * iW

  const cumPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${scX(i).toFixed(1)},${scY(d.cumPnl).toFixed(1)}`).join(' ')
  const ddPath  = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${scX(i).toFixed(1)},${scY(-d.drawdown).toFixed(1)}`).join(' ')
  const zeroY   = scY(0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 300 }}>
      {/* Zero line */}
      <line x1={PAD.l} y1={zeroY} x2={PAD.l + iW} y2={zeroY} stroke="currentColor" strokeWidth="0.5" className="text-slate-300 dark:text-slate-700" strokeDasharray="4 3" />

      {/* Drawdown fill */}
      <path
        d={`${ddPath} L${scX(data.length-1).toFixed(1)},${zeroY.toFixed(1)} L${PAD.l},${zeroY.toFixed(1)} Z`}
        fill="#ef444430"
      />
      {/* Drawdown line */}
      <path d={ddPath} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2" />

      {/* Cumulative PnL line */}
      <path d={cumPath} fill="none" stroke="#16a34a" strokeWidth="2" strokeLinejoin="round" />

      {/* Y labels */}
      {[minY, 0, maxY].map((v, i) => (
        <text key={i} x={PAD.l - 6} y={scY(v) + 4} textAnchor="end" fontSize="9" className="fill-slate-400 dark:fill-slate-500">
          {formatPnl(v)}
        </text>
      ))}

      {/* X labels */}
      {[0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((idx) => (
        <text key={idx} x={scX(idx)} y={H - 4} textAnchor="middle" fontSize="9" className="fill-slate-400 dark:fill-slate-500">
          {data[idx].date.slice(5)}
        </text>
      ))}

      {/* Legend */}
      <g transform={`translate(${PAD.l}, ${PAD.t})`}>
        <line x1="0" y1="6" x2="12" y2="6" stroke="#16a34a" strokeWidth="2" />
        <text x="15" y="10" fontSize="9" className="fill-slate-500 dark:fill-slate-400">Cumulative P&L</text>
        <line x1="80" y1="6" x2="92" y2="6" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="95" y="10" fontSize="9" className="fill-slate-500 dark:fill-slate-400">Drawdown</text>
      </g>
    </svg>
  )
}

// ── Strategy mini card ────────────────────────────────────────────────────────

function StrategyMiniCard({ s }: { s: StrategyMetrics }) {
  return (
    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{s.groupName}</p>
        <span className={clsx(
          'text-xs font-bold',
          s.totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400',
        )}>
          {formatPnl(s.totalPnl)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniPill label="Win%" value={`${s.winRate.toFixed(0)}%`} />
        <MiniPill label="Expec." value={formatPnl(s.expectancy)} />
        <MiniPill label="PF" value={s.profitFactor > 99 ? '∞' : s.profitFactor.toFixed(2)} />
      </div>
    </div>
  )
}

function MiniPill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase">{label}</p>
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{value}</p>
    </div>
  )
}

// ── Strategy table ────────────────────────────────────────────────────────────

function StrategyTable({ strategies }: { strategies: StrategyMetrics[] }) {
  if (strategies.length === 0) {
    return <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">No strategy data</div>
  }

  const cols = [
    { label: 'Strategy', key: 'groupName' },
    { label: 'Trades', key: 'totalTrades' },
    { label: 'Win%', key: 'winRate' },
    { label: 'Expectancy', key: 'expectancy' },
    { label: 'Profit Factor', key: 'profitFactor' },
    { label: 'Max DD', key: 'maxDrawdown' },
    { label: 'Max DD%', key: 'maxDrawdownPct' },
    { label: 'Avg P&L', key: 'avgPnl' },
    { label: 'Best', key: 'bestTrade' },
    { label: 'Worst', key: 'worstTrade' },
    { label: 'Win Streak', key: 'longestWinStreak' },
    { label: 'Loss Streak', key: 'longestLoseStreak' },
    { label: 'Win Days', key: 'consecutiveWinningDays' },
    { label: 'Loss Days', key: 'consecutiveLoosingDays' },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-slate-800">
          <tr>
            {cols.map((c) => (
              <th key={c.key} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {strategies.map((s) => (
            <tr key={s.groupName} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{s.groupName}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.totalTrades}</td>
              <td className="px-4 py-3">
                <WinRatePill rate={s.winRate} />
              </td>
              <td className={clsx('px-4 py-3 font-semibold', s.expectancy >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                {formatPnl(s.expectancy)}
              </td>
              <td className={clsx('px-4 py-3 font-semibold', s.profitFactor >= 1 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                {s.profitFactor > 99 ? '∞' : s.profitFactor.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-red-500 dark:text-red-400 font-semibold">
                {formatPnl(-s.maxDrawdown)}
              </td>
              <td className="px-4 py-3 text-red-500 dark:text-red-400">
                {s.maxDrawdownPct.toFixed(1)}%
              </td>
              <td className={clsx('px-4 py-3 font-semibold', s.avgPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                {formatPnl(s.avgPnl)}
              </td>
              <td className="px-4 py-3 text-green-600 dark:text-green-400 font-semibold">{formatPnl(s.bestTrade)}</td>
              <td className="px-4 py-3 text-red-500 dark:text-red-400 font-semibold">{formatPnl(s.worstTrade)}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 4 12 14.01 9 11.01"/><path d="M22 4l-10 10"/></svg>
                  {s.longestWinStreak}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 dark:text-red-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 20 12 9.99 9 12.99"/><path d="M22 20l-10-10"/></svg>
                  {s.longestLoseStreak}
                </span>
              </td>
              <td className="px-4 py-3 text-green-600 dark:text-green-400 font-semibold">{s.consecutiveWinningDays}</td>
              <td className="px-4 py-3 text-red-500 dark:text-red-400 font-semibold">{s.consecutiveLoosingDays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WinRatePill({ rate }: { rate: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div
          className={clsx('h-full rounded-full', rate >= 50 ? 'bg-green-500' : 'bg-red-500')}
          style={{ width: `${rate}%` }}
        />
      </div>
      <span className={clsx('text-xs font-semibold', rate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
        {rate.toFixed(1)}%
      </span>
    </div>
  )
}

// ── Expectancy chart ──────────────────────────────────────────────────────────

function ExpectancyChart({ strategies }: { strategies: StrategyMetrics[] }) {
  if (strategies.length === 0) return <div className="h-32 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No data</div>

  const max = Math.max(...strategies.map((s) => Math.abs(s.expectancy)), 1)

  return (
    <div className="space-y-3">
      {strategies.map((s) => {
        const pct = (Math.abs(s.expectancy) / max) * 100
        const pos = s.expectancy >= 0
        return (
          <div key={s.groupName} className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 w-32 truncate">{s.groupName}</span>
            <div className="flex-1 h-6 bg-slate-100 dark:bg-white/5 rounded-lg overflow-hidden">
              <div
                className={clsx('h-full rounded-lg flex items-center px-2 transition-all', pos ? 'bg-green-500' : 'bg-red-500')}
                style={{ width: `${Math.max(pct, 4)}%` }}
              >
                <span className="text-[10px] font-bold text-white">{formatPnl(s.expectancy)}</span>
              </div>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500 w-16 text-right">{s.totalTrades} trades</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Day cards ─────────────────────────────────────────────────────────────────

function DayCard({ stat }: { stat: DayOfWeekStats }) {
  const pos = stat.totalPnl >= 0
  return (
    <div className={clsx(
      'rounded-2xl border p-4',
      pos
        ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
        : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800',
    )}>
      <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">{stat.day}</p>
      <p className={clsx('text-xl font-bold mb-1', pos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
        {formatPnl(stat.totalPnl)}
      </p>
      <div className="space-y-1 mt-2">
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{stat.totalTrades} trades · {stat.winRate.toFixed(0)}% win</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{stat.profitableDays}/{stat.tradingDays} days profitable</p>
      </div>
    </div>
  )
}

// ── Day P&L bar chart (SVG) ───────────────────────────────────────────────────

function DayPnlBarChart({ data }: { data: DayOfWeekStats[] }) {
  if (data.length === 0) return <div className="h-40 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No data</div>

  const vals  = data.map((d) => d.totalPnl)
  const minY  = Math.min(0, Math.min(...vals))
  const maxY  = Math.max(0, Math.max(...vals))
  const W = 400, H = 160
  const PAD = { t: 10, r: 16, b: 28, l: 56 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b
  const scY = (v: number) => PAD.t + ((maxY - v) / (maxY - minY || 1)) * iH
  const zeroY = scY(0)
  const barW  = Math.max(20, Math.min(40, iW / data.length - 8))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 260 }}>
      <line x1={PAD.l} y1={zeroY} x2={PAD.l + iW} y2={zeroY} stroke="currentColor" strokeWidth="0.5" className="text-slate-300 dark:text-slate-700" />
      {data.map((d, i) => {
        const x = PAD.l + (iW / data.length) * i + (iW / data.length - barW) / 2
        const y = scY(d.totalPnl)
        const h = Math.abs(zeroY - y)
        const barY = d.totalPnl >= 0 ? y : zeroY
        return (
          <g key={d.day}>
            <rect x={x} y={barY} width={barW} height={Math.max(2, h)} rx="4"
              fill={d.totalPnl >= 0 ? '#16a34a' : '#ef4444'} className="opacity-80 hover:opacity-100 transition-opacity">
              <title>{d.day}: {formatPnl(d.totalPnl)}</title>
            </rect>
            <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="10" fontWeight="600"
              className="fill-slate-500 dark:fill-slate-400">
              {d.shortDay}
            </text>
          </g>
        )
      })}
      {[minY, 0, maxY].filter((v, i, a) => a.indexOf(v) === i).map((v, i) => (
        <text key={i} x={PAD.l - 6} y={scY(v) + 4} textAnchor="end" fontSize="9" className="fill-slate-400 dark:fill-slate-500">
          {formatPnl(v)}
        </text>
      ))}
    </svg>
  )
}

// ── Day win rate chart (SVG) ──────────────────────────────────────────────────

function DayWinRateChart({ data }: { data: DayOfWeekStats[] }) {
  if (data.length === 0) return <div className="h-40 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No data</div>

  return (
    <div className="space-y-3 pt-2">
      {data.map((d) => (
        <div key={d.day} className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 w-10">{d.shortDay}</span>
          <div className="flex-1 h-6 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex">
            <div className="bg-green-500 h-full flex items-center justify-center" style={{ width: `${d.winRate}%` }}>
              {d.winRate > 10 && <span className="text-[9px] font-bold text-white">{d.winningTrades}W</span>}
            </div>
            <div className="bg-red-400 h-full flex items-center justify-center" style={{ width: `${100 - d.winRate}%` }}>
              {(100 - d.winRate) > 10 && <span className="text-[9px] font-bold text-white">{d.losingTrades}L</span>}
            </div>
          </div>
          <span className={clsx('text-xs font-bold w-12 text-right', d.winRate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
            {d.winRate.toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Day detail table ──────────────────────────────────────────────────────────

function DayDetailTable({ data }: { data: DayOfWeekStats[] }) {
  const cols = ['Day', 'Trades', 'Win%', 'Total P&L', 'Avg P&L', 'Best', 'Worst', 'Trading Days', 'Profitable Days']

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-slate-800">
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.map((d) => (
            <tr key={d.day} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{d.day}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{d.totalTrades}</td>
              <td className="px-4 py-3"><WinRatePill rate={d.winRate} /></td>
              <td className={clsx('px-4 py-3 font-bold', d.totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                {formatPnl(d.totalPnl)}
              </td>
              <td className={clsx('px-4 py-3 font-semibold', d.avgPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                {formatPnl(d.avgPnl)}
              </td>
              <td className="px-4 py-3 text-green-600 dark:text-green-400 font-semibold">{formatPnl(d.bestPnl)}</td>
              <td className="px-4 py-3 text-red-500 dark:text-red-400 font-semibold">{formatPnl(d.worstPnl)}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{d.tradingDays}</td>
              <td className="px-4 py-3">
                <span className={clsx('font-semibold', d.profitableDays / Math.max(d.tradingDays, 1) >= 0.5 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                  {d.profitableDays}
                </span>
                <span className="text-slate-400 dark:text-slate-500"> / {d.tradingDays}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Reusable card wrapper ─────────────────────────────────────────────────────

function ACard({ title, children, noPad, className }: { title: string; children: React.ReactNode; noPad?: boolean; className?: string }) {
  return (
    <div className={clsx('bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800', !noPad && 'p-5', className)}>
      {noPad
        ? <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-5 py-4 border-b border-slate-100 dark:border-slate-800">{title}</p>
        : <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">{title}</p>
      }
      <div className={noPad ? '' : ''}>
        {children}
      </div>
    </div>
  )
}

function MetricPill({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={clsx('text-sm font-bold', positive ? 'text-green-600 dark:text-green-400' : negative ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-slate-200')}>
        {value}
      </p>
    </div>
  )
}
