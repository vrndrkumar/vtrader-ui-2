import { clsx } from 'clsx'

// ── Small shared widgets for the insight report ──────────────────────────────

export function SectionCard({
  step,
  title,
  right,
  children,
  className,
}: {
  step?: number
  title: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={clsx('rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-hidden', className)}>
      <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          {step != null && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold">{step}</span>
          )}
          <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">{title}</h3>
        </div>
        {right}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function ScoreRing({ value, label, tone }: { value: number | null; label: string; tone?: 'good' | 'warn' | 'bad' | 'auto' }) {
  const v = value ?? 0
  const t = tone === 'auto' || !tone ? (v >= 70 ? 'good' : v >= 45 ? 'warn' : 'bad') : tone
  const color = t === 'good' ? '#10b981' : t === 'warn' ? '#f59e0b' : '#ef4444'
  const R = 26
  const C = 2 * Math.PI * R
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-slate-200 dark:stroke-slate-700" />
          {value != null && (
            <circle
              cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
              stroke={color} strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)}
            />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900 dark:text-white">
          {value != null ? value : '—'}
        </span>
      </div>
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 text-center leading-tight max-w-[90px]">{label}</span>
    </div>
  )
}

export function ScoreBar({ label, value, invert }: { label: string; value: number | null; invert?: boolean }) {
  const v = value ?? 0
  const eff = invert ? 100 - v : v
  const color = value == null ? 'bg-slate-300 dark:bg-slate-600' : eff >= 70 ? 'bg-emerald-500' : eff >= 45 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-semibold text-slate-900 dark:text-white">{value != null ? value : 'N/A'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${value != null ? v : 0}%` }} />
      </div>
    </div>
  )
}

const VERDICT_STYLES: Record<string, string> = {
  'Strong Buy': 'bg-emerald-600 text-white',
  Buy: 'bg-emerald-500 text-white',
  'Accumulation Candidate': 'bg-brand-600 text-white',
  Watchlist: 'bg-amber-500 text-white',
  'High Risk Speculative': 'bg-orange-600 text-white',
  Avoid: 'bg-red-600 text-white',
}

export function VerdictBadge({ label, size = 'md' }: { label: string; size?: 'md' | 'lg' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-bold tracking-tight',
        size === 'lg' ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-xs',
        VERDICT_STYLES[label] ?? 'bg-slate-600 text-white',
      )}
    >
      {label}
    </span>
  )
}

export function TrendPill({ trend }: { trend?: string }) {
  const cls =
    trend === 'UPTREND' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
    : trend === 'DOWNTREND' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
  return <span className={clsx('inline-block px-2 py-0.5 rounded-md text-[10px] font-bold', cls)}>{trend ?? '—'}</span>
}

export function Check({ ok }: { ok: boolean | null | undefined }) {
  if (ok == null) return <span className="text-slate-400">—</span>
  return ok ? <span className="text-emerald-500 font-bold">✓</span> : <span className="text-red-500 font-bold">✗</span>
}
