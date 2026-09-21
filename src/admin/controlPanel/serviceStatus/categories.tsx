// ── Service categories registry ──────────────────────────────────────────────
// Single source of truth for the Service Status dashboard's category boxes.
// A category with `live: true` is actively monitored (its services report in via
// the backend health monitor). `live: false` categories render as elegant
// "coming soon" boxes until their services start reporting — add the backend
// heartbeats later and flip the flag (or the services simply appear).

import type { ReactNode } from 'react'

export interface Category {
  id: string
  name: string
  description: string
  accent: string        // tailwind gradient for the icon chip
  icon: ReactNode
  live: boolean
}

const ic = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)

export const CATEGORIES: Category[] = [
  { id: 'data', name: 'Market Data', description: 'Candles, option chain, EOD & backfills', live: true,
    accent: 'from-sky-500 to-blue-600',
    icon: ic(<><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></>) },
  { id: 'feeds', name: 'Live Feeds', description: 'Realtime tick ingestion & broker streams', live: false,
    accent: 'from-amber-500 to-orange-600',
    icon: ic(<><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16" /><circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none" /></>) },
  { id: 'socket', name: 'Sockets', description: 'WebSocket gateways & realtime fan-out', live: false,
    accent: 'from-cyan-500 to-teal-600',
    icon: ic(<><path d="M12 2v6M12 16v6M2 12h6M16 12h6" /><circle cx="12" cy="12" r="3" /></>) },
  { id: 'orders', name: 'Order Management', description: 'Order routing, execution & fills', live: false,
    accent: 'from-emerald-500 to-green-600',
    icon: ic(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>) },
  { id: 'algo', name: 'Algo Strategies', description: 'Strategy runners & signal generation', live: false,
    accent: 'from-violet-500 to-purple-600',
    icon: ic(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>) },
  { id: 'ai', name: 'AI Insights', description: 'Insight & analysis engines', live: false,
    accent: 'from-fuchsia-500 to-pink-600',
    icon: ic(<><path d="M12 2a7 7 0 017 7c0 3.5-2 6-4 7.5V19a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2.5C7 15 5 12.5 5 9a7 7 0 017-7z" /><line x1="9" y1="22" x2="15" y2="22" /></>) },
  { id: 'backend', name: 'Backend', description: 'Core application & API services', live: false,
    accent: 'from-slate-500 to-slate-700',
    icon: ic(<><rect x="2" y="3" width="20" height="6" rx="1.5" /><rect x="2" y="13" width="20" height="6" rx="1.5" /><path d="M6 6h.01M6 16h.01" /></>) },
  { id: 'logins', name: 'Logins & Auth', description: 'Broker sessions & token refresh', live: false,
    accent: 'from-rose-500 to-red-600',
    icon: ic(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></>) },
]
