import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import type { Trade } from '@/types/reports'
import { computeDailyPnlMap, computeMonthlyPnl } from '@/utils/analytics'
import { computeStats, formatPnl } from '@/utils/tradeStats'

interface Props {
  trades: Trade[]
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// India FY: April of startYear → March of startYear+1
function fyMonths(startYear: number) {
  const months: string[] = []
  for (let m = 4; m <= 12; m++) months.push(`${startYear}-${String(m).padStart(2, '0')}`)
  for (let m = 1; m <= 3; m++) months.push(`${startYear + 1}-${String(m).padStart(2, '0')}`)
  return months
}

function getFyStart(date: Date) {
  return date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear()
}

export function CalendarView({ trades }: Props) {
  // Determine FY range from trade dates; default to most-recent trade's FY
  const { fyStart, availableFYs } = useMemo(() => {
    const dates = trades
      .map((t) => t.first_placed_time?.split('T')[0]?.split(' ')[0])
      .filter(Boolean)
      .sort()

    const now = new Date()
    const currentFY = getFyStart(now)

    if (dates.length === 0) return { fyStart: currentFY, availableFYs: [currentFY] }

    const first  = new Date(dates[0])
    const last   = new Date(dates[dates.length - 1])
    const firstFY  = getFyStart(first)
    const latestFY = getFyStart(last)          // FY of the most recent trade
    const maxFY    = Math.max(latestFY, currentFY)

    const FYs: number[] = []
    for (let y = firstFY; y <= maxFY; y++) FYs.push(y)
    return { fyStart: latestFY, availableFYs: FYs }   // ← default = latest trade's FY
  }, [trades])

  const [selectedFY, setSelectedFY] = useState(fyStart)
  const [showSummary, setShowSummary] = useState(false)

  const dailyMap   = useMemo(() => computeDailyPnlMap(trades), [trades])
  const monthlyMap = useMemo(() => computeMonthlyPnl(dailyMap), [dailyMap])
  const stats      = useMemo(() => computeStats(trades), [trades])

  // Max abs daily PnL for color intensity
  const maxAbsPnl = useMemo(() => {
    const vals = Object.values(dailyMap).map(Math.abs)
    return vals.length === 0 ? 1 : Math.max(...vals)
  }, [dailyMap])

  const months = fyMonths(selectedFY)

  const fyPnl = useMemo(() => {
    return months.reduce((s, m) => s + (monthlyMap[m] ?? 0), 0)
  }, [months, monthlyMap])

  const tradingDays = Object.keys(dailyMap).length
  const profitDays  = Object.values(dailyMap).filter((p) => p > 0).length
  const profitDayPct = tradingDays === 0 ? 0 : (profitDays / tradingDays) * 100

  return (
    <div>
      {/* Top bar: Net P&L | FY selector */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Net P&L</span>
          <span className={clsx('font-bold text-base', fyPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
            {formatPnl(fyPnl)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            {showSummary ? 'Hide Summary' : 'View Summary'}
          </button>

          {/* FY selector */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400">
            {availableFYs.length > 1 && (
              <button
                onClick={() => setSelectedFY((y) => Math.max(availableFYs[0], y - 1))}
                className="hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                disabled={selectedFY <= availableFYs[0]}
              >◀</button>
            )}
            <span>FY {selectedFY}–{selectedFY + 1}</span>
            {availableFYs.length > 1 && (
              <button
                onClick={() => setSelectedFY((y) => Math.min(availableFYs[availableFYs.length - 1], y + 1))}
                className="hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                disabled={selectedFY >= availableFYs[availableFYs.length - 1]}
              >▶</button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-5 items-start">
        {/* ── Calendar grid ── */}
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
            {months.map((ym) => (
              <MonthBlock
                key={ym}
                yearMonth={ym}
                dailyMap={dailyMap}
                monthPnl={monthlyMap[ym] ?? 0}
                maxAbsPnl={maxAbsPnl}
              />
            ))}
          </div>
        </div>

        {/* ── Summary panel ── */}
        {showSummary && (
          <div className="w-56 shrink-0">
            <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sticky top-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Realised P&L Summary</p>
                <button onClick={() => setShowSummary(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                <SumRow label="Net P&L" value={formatPnl(stats.totalRealizedPnl)} colored pnl={stats.totalRealizedPnl} />
                <SumRow label="Gross P&L (₹)" value={`+${formatPnl(Math.max(0, stats.totalRealizedPnl))}`} />

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Profitable days</p>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-green-600 dark:text-green-400">{profitDayPct.toFixed(0)}%</span>
                    <span className="font-semibold text-red-500 dark:text-red-400">{(100 - profitDayPct).toFixed(0)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden flex">
                    <div className="bg-green-500 h-full" style={{ width: `${profitDayPct}%` }} />
                    <div className="bg-red-400 h-full" style={{ width: `${100 - profitDayPct}%` }} />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Trading stats</p>
                  <SumRow label="Total trades" value={trades.filter((t) => t.status === 'CLOSED').length.toString()} />
                  <SumRow label="Win rate" value={`${stats.winRate.toFixed(1)}%`} />
                  <SumRow label="Profit factor" value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'} />
                  <SumRow label="Avg P&L / trade" value={formatPnl(stats.avgPnlPerTrade)} colored pnl={stats.avgPnlPerTrade} />
                  <SumRow label="Best trade" value={formatPnl(stats.bestTrade)} colored pnl={stats.bestTrade} />
                  <SumRow label="Worst trade" value={formatPnl(stats.worstTrade)} colored pnl={stats.worstTrade} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Month block ───────────────────────────────────────────────────────────────

function MonthBlock({
  yearMonth, dailyMap, monthPnl, maxAbsPnl,
}: {
  yearMonth: string
  dailyMap: Record<string, number>
  monthPnl: number
  maxAbsPnl: number
}) {
  const [year, month] = yearMonth.split('-').map(Number)
  const firstDow  = new Date(year, month - 1, 1).getDay() // 0=Sun
  const totalDays = new Date(year, month, 0).getDate()

  // Blank leading cells + day cells
  const cells = [
    ...Array.from({ length: firstDow }, () => ({ day: 0, date: '', pnl: null as number | null })),
    ...Array.from({ length: totalDays }, (_, i) => {
      const d   = i + 1
      const date = `${yearMonth}-${String(d).padStart(2, '0')}`
      return { day: d, date, pnl: dailyMap[date] ?? null }
    }),
  ]

  const hasTrades = monthPnl !== 0

  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        {hasTrades && (
          <span className={clsx(
            'text-xs font-bold',
            monthPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400',
          )}>
            {monthPnl >= 0 ? '+' : ''}{formatPnl(monthPnl)}
          </span>
        )}
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500 py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5 gap-x-0.5">
        {cells.map((cell, i) => {
          if (cell.day === 0) return <div key={`e-${i}`} />

          const hasTrade  = cell.pnl !== null
          const isProfit  = hasTrade && cell.pnl! > 0
          const isLoss    = hasTrade && cell.pnl! < 0
          const intensity = hasTrade ? Math.min(1, Math.abs(cell.pnl!) / maxAbsPnl) : 0

          let bgClass = ''
          let textClass = 'text-slate-300 dark:text-slate-600' // no trades

          if (isProfit) {
            if (intensity > 0.7)      { bgClass = 'bg-green-700'; textClass = 'text-white' }
            else if (intensity > 0.4) { bgClass = 'bg-green-500'; textClass = 'text-white' }
            else if (intensity > 0.15){ bgClass = 'bg-green-200'; textClass = 'text-green-900' }
            else                       { bgClass = 'bg-green-100'; textClass = 'text-green-800' }
          } else if (isLoss) {
            if (intensity > 0.7)      { bgClass = 'bg-red-600';   textClass = 'text-white' }
            else if (intensity > 0.4) { bgClass = 'bg-red-400';   textClass = 'text-white' }
            else if (intensity > 0.15){ bgClass = 'bg-red-200';   textClass = 'text-red-900' }
            else                       { bgClass = 'bg-red-100';   textClass = 'text-red-800' }
          }

          return (
            <div
              key={cell.date}
              className={clsx(
                'flex items-center justify-center rounded-md text-[11px] font-semibold',
                'h-8 cursor-default transition-opacity hover:opacity-80',
                bgClass,
                textClass,
              )}
              title={hasTrade ? `${cell.date}: ${formatPnl(cell.pnl!)}` : cell.date}
            >
              {cell.day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Summary row ───────────────────────────────────────────────────────────────

function SumRow({ label, value, colored, pnl }: { label: string; value: string; colored?: boolean; pnl?: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={clsx(
        'text-xs font-semibold',
        colored && pnl !== undefined
          ? pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
          : 'text-slate-800 dark:text-slate-200',
      )}>
        {value}
      </span>
    </div>
  )
}
