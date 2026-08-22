import { clsx } from 'clsx'
import { statusMeta } from '@/types/strategyConfig'

/** Text + dot status badge (never colour-only). */
export function StatusBadge({ status, size = 'sm' }: { status: string | null | undefined; size?: 'sm' | 'md' }) {
  const m = statusMeta(status)
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap',
      m.badge,
      size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-[11px] px-2.5 py-1',
    )}>
      <span className={clsx('rounded-full', m.dot, size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2')} />
      {m.label}
    </span>
  )
}
