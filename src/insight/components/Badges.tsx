import { clsx } from 'clsx'
import type { Badge, Conviction, RankSlot, RiskLevel, WarningTag } from '../types'

const BADGE_STYLES: Record<Badge, { cls: string; dot: string }> = {
  'HIDDEN GEM CANDIDATE': { cls: 'bg-violet-600 text-white', dot: 'bg-violet-300' },
  'EARLY DISCOVERY': { cls: 'bg-violet-500 text-white', dot: 'bg-violet-200' },
  'QUIET ACCUMULATION': { cls: 'bg-indigo-500 text-white', dot: 'bg-indigo-200' },
  'TRANSITION STARTED': { cls: 'bg-brand-600 text-white', dot: 'bg-brand-300' },
  'BUILDING STRENGTH': { cls: 'bg-brand-500 text-white', dot: 'bg-brand-200' },
  'LEADERSHIP EMERGING': { cls: 'bg-amber-500 text-white', dot: 'bg-amber-200' },
  'MOMENTUM ESTABLISHED': { cls: 'bg-emerald-600 text-white', dot: 'bg-emerald-300' },
  WATCHLIST: { cls: 'bg-slate-500 text-white', dot: 'bg-slate-300' },
  QUIET: { cls: 'bg-slate-400 dark:bg-slate-600 text-white', dot: 'bg-slate-200' },
}

export function BadgeChip({ badge, size = 'sm' }: { badge: Badge | null; size?: 'sm' | 'lg' }) {
  if (!badge) return <span className="text-xs text-slate-400">—</span>
  const st = BADGE_STYLES[badge] ?? { cls: 'bg-slate-500 text-white', dot: 'bg-slate-300' }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-bold tracking-tight whitespace-nowrap',
        size === 'lg' ? 'px-3.5 py-1.5 text-xs' : 'px-2.5 py-0.5 text-[10px]',
        st.cls,
      )}
    >
      <span className={clsx('rounded-full', size === 'lg' ? 'h-2 w-2' : 'h-1.5 w-1.5', st.dot)} />
      {badge}
    </span>
  )
}

export function WarningTagChip({ tag }: { tag: WarningTag }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
      ⚠ {tag}
    </span>
  )
}

const RISK_STYLES: Record<RiskLevel, string> = {
  LOW: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  MEDIUM: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  HIGH: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
}

export function RiskChip({ level, size = 'sm' }: { level: RiskLevel | null; size?: 'sm' | 'lg' }) {
  if (!level) return <span className="text-xs text-slate-400">—</span>
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md border font-bold',
        size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]',
        RISK_STYLES[level],
      )}
    >
      {level} RISK
    </span>
  )
}

export function ScoreCell({ value, tone }: { value: number | null; tone: 'discovery' | 'transition' | 'momentum' }) {
  if (value == null) return <span className="text-slate-300 dark:text-slate-600">—</span>
  const color =
    tone === 'discovery' ? 'text-violet-600 dark:text-violet-400'
    : tone === 'transition' ? 'text-brand-600 dark:text-brand-400'
    : 'text-emerald-600 dark:text-emerald-400'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx('font-bold tabular-nums', value >= 55 && color, value < 55 && 'text-slate-600 dark:text-slate-300')}>
        {value}
      </span>
      <span className="h-1 w-10 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <span
          className={clsx('block h-full rounded-full',
            tone === 'discovery' ? 'bg-violet-500' : tone === 'transition' ? 'bg-brand-500' : 'bg-emerald-500')}
          style={{ width: `${value}%` }}
        />
      </span>
    </span>
  )
}

export function ConvictionStars({ conviction, size = 'sm' }: { conviction: Conviction | { stars: number; label: string } | null; size?: 'sm' | 'lg' }) {
  if (!conviction) return null
  return (
    <span className={clsx('inline-flex items-center gap-1.5', size === 'lg' ? 'text-base' : 'text-xs')}>
      <span className="text-amber-400 tracking-tight" aria-label={`${conviction.stars} of 5`}>
        {'★'.repeat(conviction.stars)}
        <span className="text-slate-300 dark:text-slate-600">{'★'.repeat(5 - conviction.stars)}</span>
      </span>
      <span className={clsx('font-bold text-slate-700 dark:text-slate-200', size === 'lg' ? 'text-sm' : 'text-[10px]')}>
        {conviction.label}
      </span>
    </span>
  )
}

export function RankCaption({ slot, context }: { slot: RankSlot | null | undefined; context: string }) {
  if (!slot) return <span className="text-[10px] text-slate-400">not ranked yet</span>
  return (
    <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
      #{slot.rank} of {slot.total} {context}
      {slot.topPct != null && <span className="font-bold text-slate-700 dark:text-slate-200"> · Top {slot.topPct}%</span>}
    </span>
  )
}

/** Opportunity lifecycle stepper: Discovery → Transition → Momentum. */
export function LifecycleStepper({ stage, earliness }: { stage: string; earliness?: string | null }) {
  const steps = [
    { key: 'discovery', label: 'Discovery', color: 'bg-violet-500' },
    { key: 'transition', label: 'Transition', color: 'bg-brand-500' },
    { key: 'momentum', label: 'Momentum', color: 'bg-emerald-500' },
  ]
  const activeIdx = steps.findIndex((s) => s.key === stage)
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div
              className={clsx(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors',
                i === activeIdx
                  ? `${s.color} text-white shadow-sm`
                  : i < activeIdx
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500',
              )}
            >
              {i === activeIdx && <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
              {s.label}
            </div>
            {i < steps.length - 1 && <span className="text-slate-300 dark:text-slate-600 text-xs">→</span>}
          </div>
        ))}
      </div>
      {earliness && <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{earliness}</p>}
    </div>
  )
}
