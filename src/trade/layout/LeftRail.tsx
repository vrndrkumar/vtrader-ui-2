import { clsx } from 'clsx'
import { DrawingTools } from '../chart/DrawingTools'

export type PanelKey = 'watchlist' | 'optionchain'
export type TradeView = 'chart' | 'strategy'

interface Props {
  view: TradeView
  panel: PanelKey | null
  onPanel: (k: PanelKey) => void
  onStrategy: () => void
  onToggleCollapse: () => void
}

const railBtn = (active: boolean) =>
  clsx(
    'flex flex-col items-center justify-center gap-0.5 w-12 py-2 rounded-lg text-[10px] font-medium transition-colors',
    active ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5',
  )

export function LeftRail({ view, panel, onPanel, onStrategy, onToggleCollapse }: Props) {
  const chartMode = view === 'chart'
  return (
    <nav className="flex flex-col items-center w-14 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark py-2 gap-1">
      <button
        onClick={onToggleCollapse}
        title={panel ? 'Collapse panel' : 'Expand panel'}
        className="flex items-center justify-center h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 mb-1"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={panel && chartMode ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
        </svg>
      </button>

      <button onClick={() => onPanel('watchlist')} title="Watchlist" className={railBtn(chartMode && panel === 'watchlist')}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
        Watch
      </button>

      <button onClick={() => onPanel('optionchain')} title="Option Chain" className={railBtn(chartMode && panel === 'optionchain')}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4zM4 10h16M12 5v14" /></svg>
        Chain
      </button>

      <div className="my-1 h-px w-8 bg-slate-200 dark:bg-slate-700" />

      <button onClick={onStrategy} title="Options Strategy" className={railBtn(view === 'strategy')}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 15l5-6 4 3 5-7 4 5" /><path d="M3 20h18" /></svg>
        Strategy
      </button>

      {/* Drawing tools — grouped, act on the active chart panel (chart view only) */}
      {chartMode && (
        <div className="mt-5 flex flex-col items-center w-full px-1">
          <span className="mb-2 text-[8px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900/40 px-2 py-0.5 rounded-full">Draw</span>
          <div className="flex flex-col items-center gap-0.5 w-full py-2 rounded-2xl bg-slate-50 dark:bg-white/[0.04]">
            <DrawingTools />
          </div>
        </div>
      )}
    </nav>
  )
}
