import { clsx } from 'clsx'
import { useQuote } from '../store/marketStore'
import type { StripIndex } from '../config/indices'

const fmtPrice = (n: number, d = 2) => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })

export function IndexCard({ cfg, active, onSelect }: { cfg: StripIndex; active: boolean; onSelect?: () => void }) {
  const q = useQuote(cfg.code)
  const hasData = !!q
  const hasChg = q?.chg != null && q?.chgPct != null
  const up = (q?.chg ?? 0) >= 0

  return (
    <button
      onClick={cfg.selectable ? onSelect : undefined}
      className={clsx(
        'group relative flex-1 min-w-[140px] h-full px-3.5 flex flex-col justify-center text-left border-r border-slate-100 dark:border-white/5 transition-colors',
        cfg.selectable && 'cursor-pointer',
        !cfg.selectable && 'cursor-default',
        active
          ? 'bg-brand-50 dark:bg-brand-900/30'
          : cfg.selectable && 'hover:bg-slate-50 dark:hover:bg-white/5',
      )}
    >
      {active && <span className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500" />}
      <div className="flex items-center justify-between gap-1 leading-none">
        <span className={clsx('text-[11px] font-semibold tracking-wide truncate', active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400')}>{cfg.name}</span>
        {hasChg && (
          <svg viewBox="0 0 24 24" className={clsx('h-3 w-3 shrink-0', up ? 'text-green-500' : 'text-red-500')} fill="currentColor">
            <path d={up ? 'M12 6l6 8H6z' : 'M12 18l-6-8h12z'} />
          </svg>
        )}
      </div>
      <span className={clsx('mt-1.5 text-[14px] font-bold tabular-nums leading-none tracking-tight', !hasData ? 'text-slate-400' : up ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500')}>
        {hasData ? fmtPrice(q!.ltp, cfg.decimals) : '--'}
      </span>
      <div className="mt-1.5 leading-none">
        {hasChg ? (
          <span className={clsx('text-[10.5px] font-medium tabular-nums', up ? 'text-green-600' : 'text-red-600')}>
            {up ? '+' : ''}{q!.chg!.toFixed(2)} · {up ? '+' : ''}{q!.chgPct!.toFixed(2)}%
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">{hasData ? 'live' : 'Waiting for data'}</span>
        )}
      </div>
    </button>
  )
}
