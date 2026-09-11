// ── Launcher dock ────────────────────────────────────────────────────────────
// Re-open launchers for the floating trade tools (Order Basket, Scheduled
// baskets, Combined protects). Rendered IN-FLOW in the empty space at the bottom
// of the left sidebar (between the nav and the user footer) so it never overlaps
// anything. Shows only on the Trade route, and only pills whose tool has items
// with its panel currently closed.

import { useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { useBasketStore } from '../store/basketStore'
import { useScheduledBasketStore } from '../store/scheduledBasketStore'
import { useGroupMonitorStore } from '../store/groupMonitorStore'

function Pill({ onClick, count, label, accent, collapsed, children }: {
  onClick: () => void; count: number; label: string; accent: string; collapsed: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={label}
      className={clsx('relative w-full h-9 rounded-lg inline-flex items-center text-[13px] font-semibold border shadow-sm transition active:scale-95',
        'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.07]',
        collapsed ? 'justify-center px-0' : 'gap-2 pl-2.5 pr-3')}>
      <span className={clsx('shrink-0', accent)}>{children}</span>
      {!collapsed && <span className="flex-1 text-left">{label}</span>}
      <span className={clsx('grid place-items-center h-5 min-w-5 px-1.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300 text-[11px]', collapsed && 'absolute -top-1 -right-1 ring-2 ring-[#F9FAFB] dark:ring-[#0B1020]')}>{count}</span>
    </button>
  )
}

export function LauncherDock({ collapsed = false }: { collapsed?: boolean }) {
  const { pathname } = useLocation()
  const basketOrders = useBasketStore((s) => s.orders.length)
  const basketOpen = useBasketStore((s) => s.open)
  const setBasketOpen = useBasketStore((s) => s.setOpen)

  const scheduled = useScheduledBasketStore((s) => s.baskets.length)
  const schedOpen = useScheduledBasketStore((s) => s.managerOpen)
  const setSchedOpen = useScheduledBasketStore((s) => s.setManagerOpen)

  const groups = useGroupMonitorStore((s) => s.groups.length)
  const protOpen = useGroupMonitorStore((s) => s.managerOpen)
  const setProtOpen = useGroupMonitorStore((s) => s.setManagerOpen)

  if (!pathname.startsWith('/trade')) return null
  const showBasket = basketOrders > 0 && !basketOpen
  const showSched = scheduled > 0 && !schedOpen
  const showProt = groups > 0 && !protOpen
  if (!showBasket && !showSched && !showProt) return null

  return (
    <div className={clsx('shrink-0 flex flex-col gap-1.5', collapsed ? 'px-2 pb-2' : 'px-3 pb-2')}>
      {showProt && (
        <Pill onClick={() => setProtOpen(true)} count={groups} label="Protects" collapsed={collapsed} accent="text-violet-500 dark:text-violet-400">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" /></svg>
        </Pill>
      )}
      {showSched && (
        <Pill onClick={() => setSchedOpen(true)} count={scheduled} label="Scheduled" collapsed={collapsed} accent="text-indigo-500 dark:text-indigo-400">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        </Pill>
      )}
      {showBasket && (
        <Pill onClick={() => setBasketOpen(true)} count={basketOrders} label="Basket" collapsed={collapsed} accent="text-slate-500 dark:text-slate-400">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 11h14l-1.2 7.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 11z" /><path d="M9 11L12 4l3 7" /></svg>
        </Pill>
      )}
    </div>
  )
}
