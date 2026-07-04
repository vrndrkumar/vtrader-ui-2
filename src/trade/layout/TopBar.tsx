import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useConnectionState } from '../hooks/useConnectionState'
import { isMarketOpen } from '../utils/marketStatus'
import { IndexStrip } from './IndexStrip'
import { MarketClock } from './MarketClock'
import { BrokerSelector } from '@/components/broker/BrokerSelector'

function StatusPill() {
  const conn = useConnectionState()
  const [marketOpen, setMarketOpen] = useState(isMarketOpen())
  useEffect(() => { const t = setInterval(() => setMarketOpen(isMarketOpen()), 30_000); return () => clearInterval(t) }, [])
  const status: 'LIVE' | 'CONNECTING' | 'CLOSED' = !marketOpen ? 'CLOSED' : conn === 'open' ? 'LIVE' : 'CONNECTING'
  return (
    <span className={clsx(
      'flex items-center gap-1.5 h-9 px-3 text-[11px] font-semibold rounded-lg border',
      status === 'LIVE' ? 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:border-green-800'
        : status === 'CONNECTING' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
          : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/10 dark:border-slate-700',
    )}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', status === 'LIVE' ? 'bg-green-500' : status === 'CONNECTING' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400')} />
      {status === 'LIVE' ? 'Live' : status === 'CONNECTING' ? 'Connecting' : 'Closed'}
    </span>
  )
}

export function TopBar() {
  return (
    <header className="flex items-stretch h-[68px] border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shrink-0">
      <IndexStrip />
      <MarketClock />
      <div className="shrink-0 flex items-center gap-2.5 px-3 border-l border-slate-200 dark:border-slate-800">
        <StatusPill />
        <BrokerSelector />
      </div>
    </header>
  )
}
