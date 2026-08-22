import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAuth } from '@/hooks/useAuth'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavLeaf {
  kind: 'link'
  to: string
  label: string
  icon: React.ReactNode
  comingSoon?: boolean
  adminOnly?: boolean
}
interface NavGroup {
  kind: 'group'
  id: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
  children: NavLeaf[]
}
interface NavSep {
  kind: 'sep'
  label?: string
  adminOnly?: boolean
}
type NavEntry = NavLeaf | NavGroup | NavSep

// ── Icon helper ───────────────────────────────────────────────────────────────

const I = ({ children, d }: { children?: React.ReactNode; d?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4"
    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {d ? <path d={d} /> : children}
  </svg>
)

// ── Nav data ──────────────────────────────────────────────────────────────────

const NAV: NavEntry[] = [
  {
    kind: 'link', to: '/dashboard', label: 'Dashboard',
    icon: <I><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></I>,
  },
  {
    kind: 'link', to: '/trade', label: 'Trade',
    icon: <I><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /><circle cx="21" cy="8" r="1.5" fill="currentColor" stroke="none" /></I>,
  },

  { kind: 'sep', label: 'Portfolio' },

  {
    kind: 'link', to: '/holdings', label: 'Holdings',
    icon: <I>
      <path d="M3 3v18h18" />
      <rect x="7" y="10" width="3" height="8" />
      <rect x="12" y="6" width="3" height="12" />
      <rect x="17" y="13" width="3" height="5" />
    </I>,
  },
  {
    kind: 'link', to: '/brokers', label: 'Brokers', comingSoon: true,
    icon: <I><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></I>,
  },
  {
    kind: 'link', to: '/strategies', label: 'Algo Strategies', comingSoon: true,
    icon: <I><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></I>,
  },
  {
    kind: 'link', to: '/journal', label: 'Journal',
    icon: <I><path d="M4 4a2 2 0 012-2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2z" /><path d="M14 2v6h6M8 12h8M8 16h5" /></I>,
  },
  {
    kind: 'link', to: '/reports', label: 'Reports',
    icon: <I><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></I>,
  },

  { kind: 'sep', label: 'Intelligence' },

  {
    kind: 'group', id: 'ai', label: 'AI Insights',
    icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 017 7c0 3.5-2 6-4 7.5V19a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2.5C7 15 5 12.5 5 9a7 7 0 017-7z" /><line x1="9" y1="22" x2="15" y2="22" /></svg>,
    children: [
      { kind: 'link', to: '/insight', label: 'Stock Insights', icon: <I><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /><path d="M8 13l2-2 1.5 1.5L14 9" /></I> },
      { kind: 'link', to: '/insight/options', label: 'Option Insights', icon: <I><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2" /></I> },
    ],
  },

  { kind: 'sep', label: 'System', adminOnly: true },

  {
    kind: 'group', id: 'admin', label: 'Admin', adminOnly: true,
    icon: <I><path d="M12 2L3 7l9 5 9-5-9-5z" /><path d="M3 17l9 5 9-5" /><path d="M3 12l9 5 9-5" /></I>,
    children: [
      { kind: 'link', to: '/admin/control-panel/strategies', label: 'Control Panel', icon: <I><path d="M12 2L3 7l9 5 9-5-9-5z" /><path d="M3 17l9 5 9-5" /><path d="M3 12l9 5 9-5" /></I> },
      { kind: 'link', to: '/analytics', label: 'Analytics', icon: <I><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></I> },
      { kind: 'link', to: '/signals', label: 'Signal Generator', icon: <I><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></I> },
      { kind: 'link', to: '/strategy-lab', label: 'Strategy Lab', icon: <I><path d="M9 3v6l-5 9a2 2 0 002 3h12a2 2 0 002-3l-5-9V3" /><path d="M7 3h10" /></I> },
      { kind: 'link', to: '/admin/option-simulator', label: 'Option Simulator', icon: <I><path d="M3 3v18h18" /><path d="M7 13l3-4 3 3 4-6" /><circle cx="7" cy="13" r="0.5" fill="currentColor" /></I> },
    ],
  },
]

// ── Icon container ────────────────────────────────────────────────────────────

function IconBox({ children, active, muted }: { children: React.ReactNode; active?: boolean; muted?: boolean }) {
  return (
    <span className={clsx(
      'shrink-0 h-[30px] w-[30px] rounded-lg flex items-center justify-center transition-all duration-200',
      active
        ? 'bg-brand-500/20 text-brand-400 shadow-[0_0_14px_-2px_rgba(251,191,36,0.4)]'
        : muted
        ? 'bg-white/[0.04] dark:bg-white/[0.04] text-slate-400 dark:text-slate-600'
        : [
            'bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-500',
            'group-hover:bg-slate-200 dark:group-hover:bg-white/[0.1]',
            'group-hover:text-slate-700 dark:group-hover:text-slate-300',
          ],
    )}>
      {children}
    </span>
  )
}

// ── Nav link ──────────────────────────────────────────────────────────────────

function Leaf({ item, collapsed, locked, sub }: {
  item: NavLeaf; collapsed: boolean; locked: boolean; sub?: boolean
}) {
  const pad = sub ? 'pl-3 pr-3 py-1.5' : 'px-2.5 py-1.5'
  // Exact-path match: a parent route (/insight) must NOT light up while a
  // nested one (/insight/options) is open.
  const { pathname } = useLocation()
  const activeExact = pathname === item.to

  if (locked) {
    return (
      <div title="Coming soon" className={clsx(
        'group flex items-center gap-3 rounded-xl cursor-not-allowed select-none',
        pad,
      )}>
        <IconBox muted>{item.icon}</IconBox>
        {!collapsed && (
          <>
            <span className="flex-1 text-[13px] font-medium text-slate-400 dark:text-slate-600 truncate">{item.label}</span>
            <span className="shrink-0 text-[9px] font-bold tracking-widest text-amber-500/70 dark:text-amber-600/60 border border-amber-400/25 rounded-full px-1.5 py-0.5 leading-none">
              SOON
            </span>
          </>
        )}
      </div>
    )
  }

  return (
    <NavLink to={item.to} end>
      {() => {
        const isActive = activeExact
        return (
        <div className={clsx(
          'group relative flex items-center gap-3 rounded-xl transition-all duration-150 cursor-pointer',
          pad,
          isActive
            ? [
                'bg-gradient-to-r from-brand-500/[0.12] via-brand-500/[0.06] to-transparent',
                'dark:from-brand-500/[0.15] dark:via-brand-500/[0.06]',
              ]
            : 'hover:bg-slate-100/80 dark:hover:bg-white/[0.05]',
        )}>
          {/* Active left rail */}
          {isActive && (
            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-gradient-to-b from-brand-400 to-brand-600" />
          )}
          <IconBox active={isActive}>{item.icon}</IconBox>
          {!collapsed && (
            <span className={clsx(
              'flex-1 text-[13px] truncate transition-colors duration-150',
              isActive
                ? 'font-semibold text-brand-700 dark:text-brand-300'
                : 'font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white',
            )}>
              {item.label}
            </span>
          )}
        </div>
        )
      }}
    </NavLink>
  )
}

// ── Group ─────────────────────────────────────────────────────────────────────

function Group({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const loc = useLocation()
  const anyActive = group.children.some((c) => loc.pathname === c.to || loc.pathname.startsWith(c.to + '/'))
  const [open, setOpen] = useState(anyActive)

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {group.children.map((c) => <Leaf key={c.to} item={c} collapsed locked={false} sub />)}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'relative group w-full flex items-center gap-3 px-2.5 py-1.5 rounded-xl transition-all duration-150',
          anyActive
            ? 'bg-gradient-to-r from-brand-500/[0.12] via-brand-500/[0.06] to-transparent dark:from-brand-500/[0.15]'
            : 'hover:bg-slate-100/80 dark:hover:bg-white/[0.05]',
        )}
      >
        {anyActive && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-gradient-to-b from-brand-400 to-brand-600" />
        )}
        <IconBox active={anyActive}>{group.icon}</IconBox>
        <span className={clsx(
          'flex-1 text-left text-[13px] truncate transition-colors duration-150',
          anyActive
            ? 'font-semibold text-brand-700 dark:text-brand-300'
            : 'font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white',
        )}>
          {group.label}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={clsx('h-3 w-3 shrink-0 transition-transform duration-200',
            open ? 'rotate-180 text-brand-500 dark:text-brand-400' : 'text-slate-400 dark:text-slate-600',
          )}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mt-0.5 ml-[19px] border-l border-slate-200 dark:border-white/[0.07] pl-3 space-y-0.5 py-0.5">
          {group.children.map((c) => <Leaf key={c.to} item={c} collapsed={false} locked={false} sub />)}
        </div>
      )}
    </div>
  )
}

// ── Section separator ─────────────────────────────────────────────────────────

function Sep({ label, collapsed }: { label?: string; collapsed: boolean }) {
  if (collapsed) return <div className="mx-auto my-2 h-px w-8 bg-slate-200 dark:bg-white/[0.06]" />
  return (
    <div className="pt-5 pb-1 px-3">
      <p className="text-[9.5px] font-bold tracking-[0.18em] uppercase text-slate-400 dark:text-slate-600">
        {label}
      </p>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps { collapsed: boolean; onToggle: () => void }

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'ADMIN'

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username.split('@')[0]
    : ''
  const initials = displayName.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  const handleLogout = () => { logout(); navigate('/login') }

  const visible = NAV.filter((e) => !e.adminOnly || isAdmin)

  return (
    <aside className={clsx(
      'relative flex flex-col h-screen sticky top-0 shrink-0 z-30 transition-all duration-300 ease-in-out',
      /* Light */ 'bg-[#F9FAFB] border-r border-slate-200/70',
      /* Dark  */ 'dark:bg-[#0B1020] dark:border-white/[0.06]',
      collapsed ? 'w-[72px]' : 'w-[240px]',
    )}>

      {/* Ambient glow (dark mode only) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-none">
        <div className="absolute -top-20 -left-10 h-60 w-60 rounded-full blur-3xl dark:bg-brand-500/[0.10]" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.08) 0%, rgba(124,92,255,0.06) 60%, transparent 100%)' }} />
      </div>

      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />

      {/* ── Header ── */}
      <div className={clsx(
        'relative flex items-center h-[64px] shrink-0 border-b border-slate-200/70 dark:border-white/[0.06]',
        collapsed ? 'justify-center px-0' : 'px-4 gap-3',
      )}>
        <button onClick={onToggle} className="shrink-0 group/logo">
          {/* VTrader V-Reversal Mark */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"
            className="h-9 w-9 transition-transform duration-200 group-hover/logo:scale-110">
            <defs>
              <linearGradient id="vt-vmark-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7C5CFF" />
                <stop offset="100%" stopColor="#FBBF24" />
              </linearGradient>
            </defs>
            {/* Dark background */}
            <rect width="36" height="36" rx="9" fill="#0C1228" />
            {/* Left arm: amber, from top-left (5,6) down to vertex (18,28) */}
            <line x1="5" y1="6" x2="18" y2="28"
              stroke="#FBBF24" strokeWidth="2.6" strokeLinecap="round" />
            {/* Right arm lower: gradient, from vertex (18,28) up to trigger (24,18) */}
            <line x1="18" y1="28" x2="24" y2="18"
              stroke="url(#vt-vmark-grad)" strokeWidth="2.6" strokeLinecap="round" />
            {/* Right arm upper: purple dimmed, from trigger (24,18) to top-right (31,6) */}
            <line x1="24" y1="18" x2="31" y2="6"
              stroke="#7C5CFF" strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
            {/* Price trigger level — horizontal at y=17 through left arm at x≈12 */}
            <line x1="2" y1="17" x2="9" y2="17"
              stroke="#FBBF24" strokeWidth="1.1" strokeDasharray="2,1.5" strokeLinecap="round" opacity="0.55" />
            <line x1="15" y1="17" x2="21" y2="17"
              stroke="#FBBF24" strokeWidth="1.1" strokeLinecap="round" opacity="0.65" />
            {/* Execution pulse circle on left arm */}
            <circle cx="12" cy="17" r="3.8" fill="#FBBF24" fillOpacity="0.1" />
            <circle cx="12" cy="17" r="2.1" fill="#FBBF24" />
            <circle cx="11.5" cy="16.5" r="0.65" fill="white" opacity="0.85" />
          </svg>
        </button>

        {!collapsed && (
          <div>
            <p className="text-[15px] font-extrabold tracking-tight leading-none">
              <span className="text-slate-900 dark:text-white">Trader</span>
            </p>
            <p className="text-[9px] font-bold tracking-[0.14em] uppercase mt-0.5 truncate max-w-[140px] text-brand-700 dark:text-brand-400">
              Not Just a Platform. Your Trading Engine
            </p>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="relative flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-0.5">
        {visible.map((entry, i) => {
          if (entry.kind === 'sep') return <Sep key={`sep-${i}`} label={entry.label} collapsed={collapsed} />
          if (entry.kind === 'group') return <Group key={entry.id} group={entry} collapsed={collapsed} />
          const locked = !!(entry.comingSoon && !isAdmin)
          return <Leaf key={entry.to} item={entry} collapsed={collapsed} locked={locked} />
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="relative shrink-0 p-3 border-t border-slate-200/70 dark:border-white/[0.06]">
        {/* User card */}
        <div className={clsx(
          'rounded-xl p-2.5 mb-2',
          'bg-white dark:bg-white/[0.04]',
          'border border-slate-200/80 dark:border-white/[0.07]',
          'shadow-sm dark:shadow-none',
          collapsed && 'p-2 flex justify-center',
        )}>
          {collapsed ? (
            <div className="h-8 w-8 rounded-lg grid place-items-center shadow-md"
              style={{ background: 'linear-gradient(135deg,#FBBF24,#7C5CFF)', boxShadow: '0 4px 12px rgba(251,191,36,0.25)' }}>
              <span className="text-[11px] font-bold text-white">{initials}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="relative shrink-0">
                <div className="h-8 w-8 rounded-lg grid place-items-center shadow-md"
                  style={{ background: 'linear-gradient(135deg,#FBBF24,#7C5CFF)', boxShadow: '0 4px 12px rgba(251,191,36,0.25)' }}>
                  <span className="text-[11px] font-bold text-white">{initials}</span>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-[1.5px] border-white dark:border-[#0B1020] shadow-sm" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-800 dark:text-white truncate leading-tight">
                  {displayName || '—'}
                </p>
                <p className="text-[10px] leading-tight mt-px">
                  {isAdmin
                    ? <span className="font-semibold bg-gradient-to-r from-brand-500 to-indigo-500 bg-clip-text text-transparent">Administrator</span>
                    : <span className="text-slate-400 dark:text-slate-500 font-medium">Member</span>
                  }
                </p>
              </div>
              <ThemeToggle />
            </div>
          )}
        </div>

        {/* Theme toggle (collapsed only) */}
        {collapsed && (
          <div className="flex justify-center mb-2">
            <ThemeToggle />
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className={clsx(
            'group flex items-center gap-2.5 w-full rounded-xl transition-all duration-150',
            'text-[12px] font-medium text-slate-400 dark:text-slate-600',
            'hover:bg-red-50 dark:hover:bg-red-500/[0.08]',
            'hover:text-red-500 dark:hover:text-red-400',
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2',
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
