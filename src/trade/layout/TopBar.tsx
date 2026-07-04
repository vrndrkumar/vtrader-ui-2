import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useChartStore } from '../store/chartStore'
import { useQuote } from '../store/marketStore'
import { useConnectionState } from '../hooks/useConnectionState'
import { isMarketOpen } from '../utils/marketStatus'
import { BrokerSelector } from '@/components/broker/BrokerSelector'
import { SYMBOLS, getSymbol } from '../types/market'

function fmt(n: number | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function TopBar() {
  const symbolCode = useChartStore((s) => s.symbolCode)
  const setSymbol = useChartStore((s) => s.setSymbol)
  const quote = useQuote(symbolCode)
  const conn = useConnectionState()
  const [open, setOpen] = useState(false)
  const [marketOpen, setMarketOpen] = useState(isMarketOpen())
  useEffect(() => { const t = setInterval(() => setMarketOpen(isMarketOpen()), 30_000); return () => clearInterval(t) }, [])

  const status: 'LIVE' | 'CONNECTING' | 'CLOSED' = !marketOpen ? 'CLOSED' : conn === 'open' ? 'LIVE' : 'CONNECTING'

  const sym = getSymbol(symbolCode)
  const up = (quote?.chg ?? 0) >= 0

  return (
    <header className="flex items-center gap-3 h-14 px-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shrink-0">
      {/* Symbol switcher */}
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
        >
          <span className="font-bold text-slate-900 dark:text-white">{sym.display}</span>
          <span className={clsx('text-base font-semibold tabular-nums', up ? 'text-green-600' : 'text-red-600')}>{fmt(quote?.ltp)}</span>
          <span className={clsx('text-xs font-medium tabular-nums px-1.5 py-0.5 rounded', up ? 'text-green-700 bg-green-50 dark:bg-green-900/20' : 'text-red-700 bg-red-50 dark:bg-red-900/20')}>
            {up ? '+' : ''}{fmt(quote?.chg)} · {up ? '+' : ''}{quote?.chgPct?.toFixed(2) ?? '0.00'}%
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute z-40 mt-1 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-xl py-1 animate-fade-in">
              {SYMBOLS.map((s) => {
                const on = s.code === symbolCode
                return (
                  <button
                    key={s.code}
                    onClick={() => { setSymbol(s.code); setOpen(false) }}
                    className={clsx('flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/5', on ? 'text-brand-600 font-semibold' : 'text-slate-700 dark:text-slate-300')}
                  >
                    {s.display}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-400">{s.type}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      <span className={clsx(
        'flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-md border',
        status === 'LIVE' ? 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:border-green-800'
          : status === 'CONNECTING' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
            : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/10 dark:border-slate-700',
      )}>
        <span className={clsx('h-1.5 w-1.5 rounded-full', status === 'LIVE' ? 'bg-green-500' : status === 'CONNECTING' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400')} />
        {status === 'LIVE' ? 'Live' : status === 'CONNECTING' ? 'Connecting' : 'Closed'}
      </span>

      <div className="ml-auto">
        <BrokerSelector />
      </div>
    </header>
  )
}
