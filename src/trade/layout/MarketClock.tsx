import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { istParts, isMarketOpen } from '../utils/marketStatus'
import { useConnectionState } from '../hooks/useConnectionState'
import { useExpiryStatus, type ExpiryKind } from '../hooks/useExpiryStatus'

const MONTHS_FULL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

const EXPIRY: Record<ExpiryKind, { label: string; cls: string }> = {
  NONE: { label: 'NO EXPIRY', cls: 'bg-emerald-500' },
  WEEKLY: { label: 'WEEKLY EXP', cls: 'bg-amber-500' },
  MONTHLY: { label: 'MONTHLY EXP', cls: 'bg-rose-500' },
}

const ORB = {
  LIVE: { core: '#15803d', mid: '#22c55e', glow: 'rgba(34,197,94,0.75)' },
  CLOSED: { core: '#b91c1c', mid: '#ef4444', glow: 'rgba(239,68,68,0.75)' },
  CONNECTING: { core: '#b45309', mid: '#f59e0b', glow: 'rgba(245,158,11,0.75)' },
}

const ILLUS_URL = '/clock-illus.png' // bull vs bear (illustration only)

export function MarketClock() {
  const [now, setNow] = useState(() => istParts())
  useEffect(() => {
    const t = setInterval(() => setNow(istParts()), 1000)
    return () => clearInterval(t)
  }, [])
  const conn = useConnectionState()
  const expiry = useExpiryStatus()
  const ribbon = EXPIRY[expiry]
  const [hh, mm, ss] = now.time.split(':')

  const status: keyof typeof ORB = !isMarketOpen() ? 'CLOSED' : conn === 'open' ? 'LIVE' : 'CONNECTING'
  const orb = ORB[status]
  const statusLabel = status === 'LIVE' ? 'Market open' : status === 'CLOSED' ? 'Market closed' : 'Connecting…'

  return (
    <div className="shrink-0 flex items-center px-2 border-l border-slate-200 dark:border-slate-800">
      {/* Theme-colored card — light in light mode, dark in dark mode */}
      <div className="relative h-[84px] w-[300px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900">
        {/* Illustration on the left */}
        <div className="absolute inset-y-0 left-0 w-[54%] bg-cover bg-left" style={{ backgroundImage: `url('${ILLUS_URL}')` }} />
        {/* Darken the art slightly in dark mode so it blends */}
        <div className="absolute inset-y-0 left-0 w-[54%] hidden dark:block bg-slate-900/35 pointer-events-none" />
        {/* Fade the illustration into the card background */}
        <div className="absolute inset-y-0 left-[26%] w-[34%] bg-gradient-to-r from-transparent to-white dark:to-slate-900 pointer-events-none" />

        {/* Watch details — right */}
        <div className="absolute inset-y-0 right-4 z-10 flex flex-col justify-center items-end text-right">
          <p className="text-[10px] font-bold tracking-wide text-slate-500 dark:text-slate-400">{now.day.toUpperCase()}, {MONTHS_FULL[now.m]} {now.d}</p>
          <p className="text-[25px] font-extrabold tabular-nums leading-none tracking-tight text-slate-900 dark:text-white">
            {hh}:{mm}:{ss}<span className="text-[10px] font-bold align-top ml-1 text-slate-400">IST</span>
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span title={statusLabel} className="h-[18px] w-[18px] rounded-full animate-pulse shrink-0" style={{ background: `radial-gradient(circle, ${orb.core} 0%, ${orb.core} 26%, ${orb.mid} 55%, transparent 80%)`, boxShadow: `0 0 12px 3px ${orb.glow}` }} />
            <span className={clsx('px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-white shadow-sm', ribbon.cls)}>{ribbon.label}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
