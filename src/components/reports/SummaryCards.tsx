import { clsx } from 'clsx'
import type { TradeStats } from '@/types/reports'
import { formatPnl } from '@/utils/tradeStats'

interface Props {
  stats: TradeStats
  loading?: boolean
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-8 w-8 rounded-xl bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="h-7 w-28 rounded bg-slate-200 dark:bg-slate-700 mb-2" />
      <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  )
}

// ── Trend arrow ───────────────────────────────────────────────────────────────

function TrendBadge({ positive, neutral }: { positive: boolean; neutral?: boolean }) {
  if (neutral) return null
  return (
    <span className={clsx(
      'inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
      positive
        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
        : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    )}>
      {positive ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
      {positive ? 'Good' : 'Bad'}
    </span>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface CardData {
  label: string
  value: string
  sub: string
  positive: boolean
  neutral?: boolean
  icon: React.ReactNode
  accent: string   // tailwind bg gradient class
  iconBg: string
}

function KpiCard({ card }: { card: CardData }) {
  return (
    <div className="relative bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5 overflow-hidden group hover:shadow-lg dark:hover:shadow-slate-900/50 transition-all duration-200">
      {/* Subtle gradient accent top-right */}
      <div className={clsx('absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.07] blur-2xl pointer-events-none', card.accent)} />

      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">
          {card.label}
        </p>
        <div className={clsx('p-2 rounded-xl', card.iconBg)}>
          {card.icon}
        </div>
      </div>

      <p className={clsx(
        'text-2xl font-bold tracking-tight leading-none mb-1',
        card.neutral
          ? 'text-slate-900 dark:text-white'
          : card.positive
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-500 dark:text-red-400',
      )}>
        {card.value}
      </p>

      <div className="flex items-center gap-2 mt-2">
        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate flex-1">{card.sub}</p>
        <TrendBadge positive={card.positive} neutral={card.neutral} />
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function SummaryCards({ stats, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  const cards: CardData[] = [
    {
      label: 'Realized P&L',
      value: formatPnl(stats.totalRealizedPnl),
      sub: `Unrealized: ${formatPnl(stats.totalUnrealizedPnl)}`,
      positive: stats.totalRealizedPnl >= 0,
      accent: 'bg-green-500',
      iconBg: stats.totalRealizedPnl >= 0
        ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400'
        : 'bg-red-100 dark:bg-red-900/20 text-red-500 dark:text-red-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      ),
    },
    {
      label: 'Win Rate',
      value: `${stats.winRate.toFixed(1)}%`,
      sub: `${stats.winningTrades}W · ${stats.losingTrades}L · ${stats.closedTrades} closed`,
      positive: stats.winRate >= 50,
      accent: 'bg-blue-500',
      iconBg: stats.winRate >= 50
        ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
        : 'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    {
      label: 'Profit Factor',
      value: isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞',
      sub: `Gross profit / gross loss`,
      positive: stats.profitFactor >= 1,
      accent: 'bg-indigo-500',
      iconBg: stats.profitFactor >= 1
        ? 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
        : 'bg-red-100 dark:bg-red-900/20 text-red-500 dark:text-red-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      ),
    },
    {
      label: 'Avg P&L / Trade',
      value: formatPnl(stats.avgPnlPerTrade),
      sub: `Best: ${formatPnl(stats.bestTrade)}`,
      positive: stats.avgPnlPerTrade >= 0,
      accent: 'bg-teal-500',
      iconBg: stats.avgPnlPerTrade >= 0
        ? 'bg-teal-100 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
        : 'bg-red-100 dark:bg-red-900/20 text-red-500 dark:text-red-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      label: 'Total Trades',
      value: stats.totalTrades.toString(),
      sub: `${stats.openTrades} open · ${stats.closedTrades} closed`,
      positive: true,
      neutral: true,
      accent: 'bg-slate-400',
      iconBg: 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
    {
      label: 'Worst Trade',
      value: formatPnl(stats.worstTrade),
      sub: stats.largestLoss?.symbol_name?.split('_')[0] ?? 'No losses',
      positive: stats.worstTrade >= 0,
      accent: 'bg-rose-500',
      iconBg: stats.worstTrade >= 0
        ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400'
        : 'bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
        </svg>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => <KpiCard key={card.label} card={card} />)}
    </div>
  )
}
