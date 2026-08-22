import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { MASTER_MODULES } from './registry'

// ── Control Panel shell ──────────────────────────────────────────────────────
// Scalable master-data workspace: a persistent module rail (left on desktop,
// horizontal scroller on tablet) + a content outlet. New modules appear here
// automatically from the registry.

const BASE = '/admin/control-panel'

export default function ControlPanelLayout() {
  const { pathname } = useLocation()
  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-[#0a0f1a]">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-white/[0.06] bg-white/60 dark:bg-transparent">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl grid place-items-center text-white shadow-sm shrink-0" style={{ background: 'linear-gradient(135deg,#7C5CFF,#FBBF24)' }}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L3 7l9 5 9-5-9-5z" /><path d="M3 17l9 5 9-5M3 12l9 5 9-5" /></svg>
          </span>
          <div className="min-w-0">
            <h1 className="text-[19px] font-black text-slate-900 dark:text-white leading-tight">Control Panel</h1>
            <p className="text-[12px] text-slate-400 dark:text-slate-500">Master data management · VTrader administration</p>
          </div>
          <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/25">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82M4.6 9a1.65 1.65 0 00-.33-1.82" /></svg>
            Admin only
          </span>
        </div>
      </div>

      {/* Body: module rail + content */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Module rail */}
        <nav className="lg:w-[248px] shrink-0 lg:border-r border-b lg:border-b-0 border-slate-200 dark:border-white/[0.06] p-3 lg:overflow-y-auto">
          <p className="hidden lg:block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-600 px-2 mb-2">Master Data</p>
          <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible no-scrollbar">
            {MASTER_MODULES.map((m) => {
              const to = `${BASE}/${m.path}`
              const active = pathname.startsWith(to)
              const inner = (
                <div className={clsx(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 shrink-0 transition-all min-w-[180px] lg:min-w-0',
                  m.ready
                    ? active
                      ? 'bg-gradient-to-r from-brand-500/[0.14] to-transparent border border-brand-300/50 dark:border-brand-500/25'
                      : 'hover:bg-white dark:hover:bg-white/[0.04] border border-transparent'
                    : 'opacity-55 cursor-not-allowed border border-transparent',
                )}>
                  <span className={clsx('h-8 w-8 rounded-lg grid place-items-center shrink-0 transition-colors',
                    active ? 'bg-brand-500/20 text-brand-600 dark:text-brand-400' : 'bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 group-hover:text-slate-700')}>{m.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={clsx('text-[13px] font-semibold truncate', active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200')}>{m.label}</span>
                      {!m.ready && <span className="text-[8.5px] font-bold tracking-wider text-amber-500/80 border border-amber-400/30 rounded-full px-1.5 py-px leading-none">SOON</span>}
                    </div>
                    <p className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate">{m.description}</p>
                  </div>
                </div>
              )
              return m.ready
                ? <NavLink key={m.id} to={to}>{inner}</NavLink>
                : <div key={m.id} title="Coming soon">{inner}</div>
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
