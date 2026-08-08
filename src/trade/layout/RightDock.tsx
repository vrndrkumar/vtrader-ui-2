import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { useChartStore } from '../store/chartStore'
import { useQuote } from '../store/marketStore'
import { SYMBOLS } from '../types/market'
import { type OptType, type Side } from '../types/options'
import { OptionChainTable, buildPositionMap } from '../features/optionchain/OptionChainTable'
import { useTradebookStore } from '../features/tradebook/tradebookStore'
import { IndexSelect } from '../features/optionchain/IndexSelect'
import { useLiveOptionChain } from '../features/optionchain/useOptionChain'
import { useWatchlistStore } from '../store/watchlistStore'
import { applySymbol } from '../store/chartLayoutStore'
import { placeOrder, submitStrategy } from '@/services/orders/placeOrder'
import type { PanelKey } from './LeftRail'

// ── Watchlist ────────────────────────────────────────────────────────────────

function WatchRow({ code, display, active, onClick }: { code: string; display: string; active: boolean; onClick: () => void }) {
  const q = useQuote(code)
  const up = (q?.chgPct ?? 0) >= 0
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center justify-between px-3 py-2.5 w-full border-l-2 transition-colors',
        active ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-900/20' : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/5',
      )}
    >
      <div className="min-w-0 text-left">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{display}</p>
        <p className="text-[11px] text-slate-400">{code}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{q ? q.ltp.toFixed(2) : '—'}</p>
        <p className={clsx('text-[11px] font-medium tabular-nums', up ? 'text-green-600' : 'text-red-600')}>
          {q?.chg != null ? `${up ? '+' : ''}${q.chg.toFixed(2)} (${up ? '+' : ''}${q.chgPct?.toFixed(2)}%)` : q ? 'live' : '—'}
        </p>
      </div>
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{children}</p>
}

function OptionWatchRow({ display, ltp, onRemove }: { display: string; ltp: number; onRemove: () => void }) {
  return (
    <div className="group flex items-center justify-between px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/5">
      <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{display}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{ltp.toFixed(2)}</span>
        <button onClick={onRemove} title="Remove" className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  )
}

function Watchlist() {
  const symbolCode = useChartStore((s) => s.symbolCode)
  const setSymbol = useChartStore((s) => s.setSymbol)
  const items = useWatchlistStore((s) => s.items)
  const remove = useWatchlistStore((s) => s.remove)
  return (
    <div className="flex flex-col h-full">
      <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-100 dark:bg-white/5">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input placeholder="Search & add symbol" className="flex-1 bg-transparent text-sm outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <SectionLabel>Indices</SectionLabel>
        {SYMBOLS.map((s) => (
          <WatchRow key={s.code} code={s.code} display={s.display} active={s.code === symbolCode} onClick={() => setSymbol(s.code)} />
        ))}
        {items.length > 0 && (
          <>
            <SectionLabel>My Options</SectionLabel>
            {items.map((it) => (
              <OptionWatchRow key={it.id} display={it.display} ltp={it.ltp} onRemove={() => remove(it.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ── Option chain panel (compact) ─────────────────────────────────────────────

function OptionChainPanel() {
  const symbolCode = useChartStore((s) => s.symbolCode)
  const setSymbol = useChartStore((s) => s.setSymbol)
  const [expiry, setExpiry] = useState('')
  const { chain, expiries } = useLiveOptionChain(symbolCode, expiry)
  const addWatch = useWatchlistStore((s) => s.add)
  const tbPositions = useTradebookStore((s) => s.positions)
  const posMap = useMemo(() => buildPositionMap(tbPositions, symbolCode), [tbPositions, symbolCode])

  useEffect(() => { setExpiry('') }, [symbolCode])
  // Default to nearest; also re-select if the current one expired / vanished.
  useEffect(() => { if (expiries.length && !expiries.includes(expiry)) setExpiry(expiries[0]) }, [expiries, expiry])

  const onAction = (strike: number, optType: OptType, side: Side, ltp: number) =>
    placeOrder({
      symbolName: `${symbolCode}_${expiry.replace(/\s/g, '')}_${optType}_${strike}`,
      indexName: symbolCode,
      display: `${symbolCode} ${strike} ${optType}`,
      side, ltp, priceType: 'MKT',
    })
  const onWatch = (strike: number, optType: OptType, ltp: number) => {
    addWatch({ id: `${symbolCode}_${expiry}_${optType}_${strike}`, symbol: `${symbolCode}_${expiry.replace(/\s/g, '')}_${optType}_${strike}`, display: `${symbolCode} ${strike} ${optType}`, ltp })
    toast.success('Added to watchlist')
  }
  return (
    <div className="flex flex-col h-full">
      <IndexSelect value={symbolCode} onChange={setSymbol} />
      <div className="flex-1 min-h-0">
        <OptionChainTable
          chain={chain} expiries={expiries} compact expiry={expiry} onExpiry={setExpiry}
          onAction={onAction} onWatch={onWatch} positions={posMap}
          onAdjustConfirm={(moves) => {
            const legs = moves.flatMap((m) => {
              const q = Math.abs(m.qty), long = m.qty > 0
              const sym = (s: number) => `${symbolCode}_${expiry.replace(/\s/g, '')}_${m.optType}_${s}`
              return [
                { side: (long ? 'SELL' : 'BUY') as Side, indexName: symbolCode, symbolName: sym(m.fromStrike), priceType: 'MKT' as const, price: 0, qty: q },
                { side: (long ? 'BUY' : 'SELL') as Side, indexName: symbolCode, symbolName: sym(m.toStrike), priceType: 'MKT' as const, price: 0, qty: q },
              ]
            })
            void submitStrategy(legs).then(() => useTradebookStore.getState().reload())
          }}
          onChart={(strike, optType) => applySymbol({
            key: `${symbolCode}_${expiry}_${optType}_${strike}`,
            candleSymbol: `${symbolCode}_${expiry}_${optType}_${strike}`,
            display: `${symbolCode} ${strike} ${optType}`,
            kind: 'OPTION',
          })}
        />
      </div>
    </div>
  )
}

// ── Side panel container ─────────────────────────────────────────────────────

export function SidePanel({ panel, onClose }: { panel: PanelKey; onClose: () => void }) {
  const title = panel === 'watchlist' ? 'Watchlist' : 'Option Chain'

  return (
    <aside className="flex flex-col w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark">
      <div className="flex items-center justify-between h-11 px-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</span>
        <button onClick={onClose} title="Collapse" className="flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {panel === 'watchlist' ? <Watchlist /> : <OptionChainPanel />}
      </div>
    </aside>
  )
}
