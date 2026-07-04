import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { istParts } from '../utils/marketStatus'
import { useExpiryStatus, type ExpiryKind } from '../hooks/useExpiryStatus'

const RIBBON: Record<ExpiryKind, { label: string; cls: string }> = {
  NONE: { label: 'NO EXPIRY', cls: 'bg-emerald-500' },
  WEEKLY: { label: 'WEEKLY EXP', cls: 'bg-amber-500' },
  MONTHLY: { label: 'MONTHLY EXP', cls: 'bg-rose-500' },
}

export function MarketClock() {
  const [now, setNow] = useState(() => istParts())
  useEffect(() => {
    const t = setInterval(() => setNow(istParts()), 1000)
    return () => clearInterval(t)
  }, [])
  const expiry = useExpiryStatus()
  const ribbon = RIBBON[expiry]
  const [hh, mm, ss] = now.time.split(':')

  return (
    <div className="shrink-0 flex items-center px-2.5 border-l border-slate-200 dark:border-slate-800">
      <div className="relative flex items-center gap-3.5 h-[52px] pl-3 pr-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-brand-50 to-white dark:from-slate-800 dark:to-slate-900 shadow-sm">
        {/* Expiry ribbon (top-right, like a "PRIMARY" tab) */}
        <span className={clsx('absolute -top-2.5 right-4 z-10 px-2.5 py-[3px] rounded-full text-[9px] font-bold uppercase tracking-wider text-white shadow-md ring-2 ring-white dark:ring-card-dark', ribbon.cls)}>
          {ribbon.label}
        </span>

        {/* Clock icon */}
        <div className="relative h-11 w-11 rounded-2xl grid place-items-center bg-gradient-to-br from-brand-500 to-indigo-500 text-white shadow">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
        </div>

        {/* Date + time */}
        <div className="text-left leading-none">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">{now.day} · {now.date}</p>
          <p className="text-[26px] font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {hh}:{mm}<span className="text-brand-600 dark:text-brand-400">:{ss}</span>
            <span className="text-[10px] font-medium text-slate-400 ml-1.5 align-top">IST</span>
          </p>
        </div>
      </div>
    </div>
  )
}
