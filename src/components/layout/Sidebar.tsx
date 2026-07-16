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
  /** Locked (non-interactive) for USER role; admin can navigate normally. */
  comingSoon?: boolean
}

interface NavGroup {
  kind: 'group'
  id: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
  children: NavLeaf[]
}

type NavEntry = NavLeaf | NavGroup

// ── Icons (all 24 × 24 SVG) ──────────────────────────────────────────────────

const Ico = ({ d, children }: { d?: string; children?: React.ReactNode }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d ? <path d={d} /> : children}
  </svg>
)

// ── Nav definition ────────────────────────────────────────────────────────────

const NAV: NavEntry[] = [
  {
    kind: 'link',
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <Ico>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </Ico>
    ),
  },
  {
    kind: 'link',
    to: '/trade',
    label: 'Trade',
    icon: (
      <Ico>
        <path d="M3 3v18h18" />
        <path d="M7 14l3-3 3 3 5-6" />
        <circle cx="21" cy="8" r="1.6" fill="currentColor" stroke="none" />
      </Ico>
    ),
  },
  {
    kind: 'link',
    to: '/brokers',
    label: 'Brokers',
    comingSoon: true,
    icon: (
      <Ico>
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </Ico>
    ),
  },
  {
    kind: 'link',
    to: '/strategies',
    label: 'Algo Strategies',
    comingSoon: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    kind: 'link',
    to: '/journal',
    label: 'Journal',
    comingSoon: true,
    icon: (
      <Ico>
        <path d="M4 4a2 2 0 012-2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
        <path d="M14 2v6h6M8 12h8M8 16h5" />
      </Ico>
    ),
  },
  {
    kind: 'link',
    to: '/reports',
    label: 'Reports',
    icon: (
      <Ico>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </Ico>
    ),
  },
  {
    kind: 'group',
    id: 'ai-insights',
    label: 'AI Insights',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a7 7 0 017 7c0 3.5-2 6-4 7.5V19a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2.5C7 15 5 12.5 5 9a7 7 0 017-7z" />
        <line x1="9" y1="22" x2="15" y2="22" />
        <line x1="12" y1="17" x2="12" y2="22" />
      </svg>
    ),
    children: [
      {
        kind: 'link',
        to: '/insight',
        label: 'Stock Insights',
        icon: (
          <Ico>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
            <path d="M8 13l2-2 1.5 1.5L14 9" />
          </Ico>
        ),
      },
      {
        kind: 'link',
        to: '/insight/options',
        label: 'Option Insights',
        icon: (
          <Ico>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </Ico>
        ),
      },
    ],
  },
  {
    kind: 'group',
    id: 'admin',
    label: 'Admin',
    adminOnly: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L3 7l9 5 9-5-9-5z" />
        <path d="M3 17l9 5 9-5" />
        <path d="M3 12l9 5 9-5" />
      </svg>
    ),
    children: [
      {
        kind: 'link',
        to: '/analytics',
        label: 'Analytics',
        icon: (
          <Ico>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </Ico>
        ),
      },
      {
        kind: 'link',
        to: '/signals',
        label: 'Signal Generator',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        ),
      },
    ],
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function SoonBadge() {
  return (
    <span className="ml-auto text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0 leading-none">
      SOON
    </span>
  )
}

function LeafLink({
  item,
  collapsed,
  locked,
  indent,
}: {
  item: NavLeaf
  collapsed: boolean
  locked: boolean
  indent?: boolean
}) {
  if (locked) {
    return (
      <div
        title="Coming soon — launching in a future release"
        className={clsx(
          'flex items-center gap-3 rounded-xl text-sm font-medium select-none cursor-not-allowed',
          indent ? 'px-2.5 py-2' : 'px-3 py-2.5',
          'text-slate-400 dark:text-slate-600 opacity-60',
        )}
      >
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && (
          <>
            <span className="truncate flex-1">{item.label}</span>
            <SoonBadge />
          </>
        )}
      </div>
    )
  }

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-150',
          indent ? 'px-2.5 py-2' : 'px-3 py-2.5',
          isActive
            ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white',
        )
      }
    >
      <span className="shrink-0">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  )
}

function GroupSection({
  group,
  collapsed,
}: {
  group: NavGroup
  collapsed: boolean
}) {
  const location = useLocation()
  const anyChildActive = group.children.some((c) => location.pathname === c.to || location.pathname.startsWith(c.to + '/'))
  const [open, setOpen] = useState(anyChildActive)

  // Collapsed mode — render children flat (icon only)
  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {group.children.map((child) => (
          <LeafLink key={child.to} item={child} collapsed={true} locked={false} />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors duration-150',
          anyChildActive
            ? 'text-brand-600 dark:text-brand-400'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300',
        )}
      >
        <span className="shrink-0">{group.icon}</span>
        <span className="flex-1 text-left">{group.label}</span>
        <svg
          viewBox="0 0 24 24"
          className={clsx('h-3.5 w-3.5 shrink-0 transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Children */}
      {open && (
        <div className="mt-0.5 ml-3 pl-3 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
          {group.children.map((child) => (
            <LeafLink key={child.to} item={child} collapsed={false} locked={false} indent />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'ADMIN'

  // Full name when available; fall back to the part of the email before '@'
  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username.split('@')[0]
    : ''
  const avatarLetter = displayName.slice(0, 1).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const visible = NAV.filter((entry) => {
    if (entry.kind === 'group') return isAdmin || !entry.adminOnly
    return true // all leaves are always visible (comingSoon controls interactivity)
  })

  return (
    <aside
      className={clsx(
        'flex flex-col h-screen sticky top-0 shrink-0 bg-white dark:bg-card-dark border-r border-slate-200 dark:border-slate-800 transition-all duration-300 z-30',
        collapsed ? 'w-[68px]' : 'w-56',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <button
          onClick={onToggle}
          className="shrink-0 text-brand-600 dark:text-brand-400 hover:opacity-80 transition-opacity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor" className="h-7 w-7">
            <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.15" />
            <polyline points="4,22 10,12 16,18 22,8 28,14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="28" cy="14" r="2" fill="currentColor" />
          </svg>
        </button>
        {!collapsed && (
          <span className="font-bold text-slate-900 dark:text-white text-lg tracking-tight whitespace-nowrap">
            VTrader
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {visible.map((entry) => {
          if (entry.kind === 'group') {
            return (
              <GroupSection key={entry.id} group={entry} collapsed={collapsed} />
            )
          }
          // NavLeaf
          const locked = !!(entry.comingSoon && !isAdmin)
          return (
            <LeafLink key={entry.to} item={entry} collapsed={collapsed} locked={locked} />
          )
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 p-3 space-y-1">

        {/* User identity — single row, name not email */}
        <div className={clsx('flex items-center gap-2.5 px-2 py-2', collapsed && 'justify-center')}>
          <div className="h-7 w-7 rounded-full bg-brand-100 dark:bg-brand-900/30 grid place-items-center shrink-0">
            <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400">
              {avatarLetter}
            </span>
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate leading-none">
                {displayName}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-none">
                {isAdmin ? 'Administrator' : 'User'}
              </p>
            </div>
          )}
          {!collapsed && <ThemeToggle />}
        </div>

        {/* Theme toggle in collapsed mode */}
        {collapsed && (
          <div className="flex justify-center py-1">
            <ThemeToggle />
          </div>
        )}

        <button
          onClick={handleLogout}
          className={clsx(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors',
            collapsed && 'justify-center',
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
