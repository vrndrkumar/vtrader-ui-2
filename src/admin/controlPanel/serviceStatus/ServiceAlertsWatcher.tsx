// ── ServiceAlertsWatcher (headless, admin-only) ───────────────────────────────
// Mounted once in AppLayout → admins get toasts on ANY page. Read-state is
// PERSISTED on the server: closing a toast (or it auto-closing) marks the alert
// acked, and only UN-ACKED alerts are ever toasted. So once an admin reads an
// alert it never shows again — not on reload, not in a new session.
// Every toast auto-closes after AUTO_CLOSE_MS (default 5s) OR when the admin
// clicks the close button; either way it's marked read.
// Non-admins do nothing.

import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { useAuth } from '@/hooks/useAuth'
import { useServiceHealth, type AlertRow } from './serviceHealthStore'

const LABEL: Record<string, string> = {
  engine: 'Candle Engine', api: 'Candle API', confirm: 'Confirm Service', chain: 'Chain Service',
  'data-feed': 'Live Data Feed', eod: 'EOD Finalize', 'eod-backfill': 'EOD Backfill',
  'stocks-eod': 'Stocks EOD', 'eod-chain': 'EOD Full Chain', fyers: 'Fyers Rate Limit',
  'quant-signal': 'Quant Signals', 'signal-generator': 'Signal Generator', 'strategy-monitor': 'Strategy Monitor',
  'zero-hero': 'Zero Hero Strategy', 'ema-cross': 'EMA Cross Directional', 'intplus-expiry': 'IntPlus Expiry',
  'trade-app': 'Trade App', 'livefeed-fyers': 'Fyers Livefeed', 'livefeed-angelone': 'AngelOne Livefeed',
  'delta-livefeed': 'Delta Livefeed', 'order-sockets': 'Order Socket', orchestrator: 'Trade Orchestrator',
  insights: 'AI Insights',
}

export function ServiceAlertsWatcher() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const refresh = useServiceHealth((s) => s.refresh)
  const ack = useServiceHealth((s) => s.ack)
  const alerts = useServiceHealth((s) => s.alerts)
  const shown = useRef<Set<number>>(new Set())  // toasted this session (avoid dupes within a session)

  // poll while an admin is signed in
  useEffect(() => {
    if (!isAdmin) return
    refresh()
    const t = setInterval(refresh, 25_000)
    return () => clearInterval(t)
  }, [isAdmin, refresh])

  // toast only UN-ACKED alerts; closing / auto-closing marks them read (acked)
  useEffect(() => {
    if (!isAdmin) return

    const AUTO_CLOSE_MS = 5000                     // all toasts close after 5s
    const fire = (a: AlertRow) => {
      const down = a.severity === 'down'
      const recovery = a.severity === 'ok'
      const duration = AUTO_CLOSE_MS
      const kicker = down ? 'Service down' : recovery ? 'Recovered' : 'Warning'
      const markRead = () => { void ack(a.id) }   // persist read on the server

      // auto-close also marks it read
      setTimeout(markRead, duration + 150)

      toast.custom((t) => (
        <div className={clsx(
          'pointer-events-auto w-[360px] max-w-[92vw] rounded-xl border shadow-xl px-4 py-3 flex items-start gap-3',
          'bg-white dark:bg-[#121A2B]',
          down ? 'border-red-300 dark:border-red-500/40'
            : recovery ? 'border-emerald-300 dark:border-emerald-500/40'
            : 'border-amber-300 dark:border-amber-500/40',
        )}>
          <span className={clsx('mt-1 h-2.5 w-2.5 rounded-full shrink-0',
            down ? 'bg-red-500 animate-pulse' : recovery ? 'bg-emerald-500' : 'bg-amber-500')} />
          <div className="flex-1 min-w-0">
            <p className={clsx('text-[10.5px] font-bold uppercase tracking-wide',
              down ? 'text-red-600 dark:text-red-400' : recovery ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
              {kicker} · {LABEL[a.service] || a.service}
            </p>
            <p className="text-[13px] text-slate-800 dark:text-slate-100 mt-0.5 leading-snug break-words">{a.message}</p>
          </div>
          <button onClick={() => { toast.dismiss(t.id); markRead() }}
            className="shrink-0 -mr-1 -mt-1 h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Dismiss">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ), { id: `svc-alert-${a.id}`, duration })
    }

    for (const a of [...alerts].reverse()) {
      if (a.acked) continue                 // already read on the server → never show
      if (shown.current.has(a.id)) continue // already toasted this session
      shown.current.add(a.id)
      fire(a)
    }
  }, [alerts, isAdmin, ack])

  return null
}
