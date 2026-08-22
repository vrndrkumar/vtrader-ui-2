// ── Master-data module registry ──────────────────────────────────────────────
// Single source of truth for the Control Panel's left navigation. Adding a new
// master-data module = add an entry here + a nested route. The shell, nav, and
// "coming soon" handling all derive from this list — no layout redesign needed.

export interface MasterModule {
  id: string
  label: string
  description: string
  path: string          // relative to /admin/control-panel
  icon: React.ReactNode
  ready: boolean        // false → shown but disabled ("Soon")
}

const ic = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)

export const MASTER_MODULES: MasterModule[] = [
  { id: 'strategies', label: 'Strategies', description: 'Algo strategy definitions & config', path: 'strategies', ready: true,
    icon: ic(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>) },
  { id: 'brokers', label: 'Brokers', description: 'User broker approvals & config', path: 'brokers', ready: true,
    icon: ic(<><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>) },
  { id: 'users', label: 'Users', description: 'Accounts, roles & access', path: 'users', ready: false,
    icon: ic(<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>) },
  { id: 'indices', label: 'Indices', description: 'Tradable indices & lot sizes', path: 'indices', ready: false,
    icon: ic(<><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></>) },
  { id: 'exchanges', label: 'Exchanges', description: 'Exchange & segment master', path: 'exchanges', ready: false,
    icon: ic(<><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M9 22V12h6v10" /></>) },
  { id: 'instruments', label: 'Instruments', description: 'Symbols & contract master', path: 'instruments', ready: false,
    icon: ic(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>) },
  { id: 'configurations', label: 'Configurations', description: 'System-wide settings', path: 'configurations', ready: false,
    icon: ic(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>) },
]
