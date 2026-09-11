import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { useChartStore } from '../store/chartStore'
import { useQuote, useMarketStore } from '../store/marketStore'
import { recordEntrySpot } from '../store/entrySpotStore'
import { SYMBOLS } from '../types/market'
import { type OptType, type Side } from '../types/options'
import { OptionChainTable, buildPositionMap } from '../features/optionchain/OptionChainTable'
import { useTradebookStore } from '../features/tradebook/tradebookStore'
import { IndexSelect } from '../features/optionchain/IndexSelect'
import { useLiveOptionChain } from '../features/optionchain/useOptionChain'
import { useWatchlistStore } from '../store/watchlistStore'
import { useStocksStore } from '../store/stocksStore'
import type { Stock } from '@/api/stocks'
import { SymbolSearch, type SymbolResult } from '@/journal/SymbolSearch'
import { useBasketStore } from '../store/basketStore'
import { BasketModeToggle } from '../basket/Basket'
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

// Stable per-sector accent colour (hash the name into a fixed palette).
const SECTOR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7']
const sectorColor = (s: string) => SECTOR_COLORS[Math.abs([...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % SECTOR_COLORS.length]

const EX_CLS: Record<string, string> = {
  NSE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  BSE: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
}

function StockRow({ st, onClick }: { st: Stock; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex items-center justify-between gap-2 w-full pl-5 pr-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <div className="min-w-0">
        <p className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">{st.symbolCode}</p>
        <p className="text-[10.5px] text-slate-400 truncate leading-tight">{st.symbolName}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {st.exchange && <span className={clsx('px-1 py-px rounded text-[8.5px] font-bold tracking-wide', EX_CLS[st.exchange] ?? 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400')}>{st.exchange}</span>}
        <span className="text-[12px] font-semibold tabular-nums text-slate-700 dark:text-slate-200 w-14 text-right">{st.ltp != null ? st.ltp.toFixed(2) : '—'}</span>
      </div>
    </button>
  )
}

function SectorGroup({ sector, stocks, onPick }: { sector: string; stocks: Stock[]; onPick: (s: Stock) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-50 dark:border-white/[0.04]">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 w-full px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: sectorColor(sector) }} />
        <span className="flex-1 text-left text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate">{sector}</span>
        <span className="text-[10px] font-medium tabular-nums text-slate-400 bg-slate-100 dark:bg-white/10 rounded-full px-1.5">{stocks.length}</span>
        <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5 text-slate-400 transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && <div className="pb-1">{stocks.map((st) => <StockRow key={st.symbolCode} st={st} onClick={() => onPick(st)} />)}</div>}
    </div>
  )
}

function Watchlist() {
  const symbolCode = useChartStore((s) => s.symbolCode)
  const setSymbol = useChartStore((s) => s.setSymbol)
  const items = useWatchlistStore((s) => s.items)
  const remove = useWatchlistStore((s) => s.remove)
  const stocks = useStocksStore((s) => s.list)
  const loadStocks = useStocksStore((s) => s.load)
  const loading = useStocksStore((s) => s.loading)

  useEffect(() => { void loadStocks() }, [loadStocks])

  // Load a stock as a normal (non-option) chart on the active panel.
  const pickStock = (st: Stock) => applySymbol({ key: st.symbolCode, candleSymbol: st.symbolCode, display: st.symbolName, kind: 'INDEX' })

  // Keypress search uses the shared /data/search API (same as the manual-order
  // add). On pick: an index switches the index context; anything else loads as a
  // chart on the active panel.
  const loadFromResult = (r: SymbolResult) => {
    const isOpt = (r.type ?? '').toUpperCase() === 'OPTION'
    if (!isOpt && SYMBOLS.some((s) => s.code === r.symbol)) { setSymbol(r.symbol); return }
    applySymbol({ key: r.symbol, candleSymbol: r.symbol, display: r.name || r.symbol, kind: isOpt ? 'OPTION' : 'INDEX' })
  }

  const bySector = useMemo(() => {
    const m = new Map<string, Stock[]>()
    for (const st of stocks) { const s = st.sector || 'Other'; const arr = m.get(s); if (arr) arr.push(st); else m.set(s, [st]) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [stocks])

  return (
    <div className="flex flex-col h-full">
      <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
        <SymbolSearch value="" onChange={() => { /* free text handled internally */ }} onSelect={loadFromResult} placeholder="Search stocks & indices…" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <SectionLabel>Indices</SectionLabel>
        {SYMBOLS.map((s) => <WatchRow key={s.code} code={s.code} display={s.display} active={s.code === symbolCode} onClick={() => setSymbol(s.code)} />)}

        {items.length > 0 && (
          <>
            <SectionLabel>My Options</SectionLabel>
            {items.map((it) => <OptionWatchRow key={it.id} display={it.display} ltp={it.ltp} onRemove={() => remove(it.id)} />)}
          </>
        )}

        <SectionLabel>Stocks by sector{loading ? ' · loading…' : bySector.length ? ` · ${bySector.length} sectors` : ''}</SectionLabel>
        {bySector.map(([sector, sts]) => <SectorGroup key={sector} sector={sector} stocks={sts} onPick={pickStock} />)}
        {!loading && bySector.length === 0 && <div className="px-4 py-8 text-center text-[12px] text-slate-400">No stocks available</div>}
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

  const onAction = (strike: number, optType: OptType, side: Side, ltp: number) => {
    const symbolName = `${symbolCode}_${expiry.replace(/\s/g, '')}_${optType}_${strike}`
    // Basket mode → collect the order instead of placing it (regardless of Quick Trade).
    if (useBasketStore.getState().mode) {
      useBasketStore.getState().add({
        symbolName, indexName: symbolCode, display: `${symbolCode} ${strike} ${optType}`,
        strike, optType, expiry: expiry.replace(/\s/g, ''), side, lots: 1, priceType: 'MKT', price: 0, ltp,
      })
      toast.success(`${side} ${strike} ${optType} added to basket`)
      return
    }
    const idxSpot = useMarketStore.getState().quotes[symbolCode]?.ltp
    if (idxSpot) recordEntrySpot(symbolName, idxSpot)
    return placeOrder({ symbolName, indexName: symbolCode, display: `${symbolCode} ${strike} ${optType}`, side, ltp, priceType: 'MKT' })
  }
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
      <div className="flex items-center gap-2 h-11 px-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex-1">{title}</span>
        {panel !== 'watchlist' && <BasketModeToggle />}
        <button onClick={onClose} title="Collapse" className="flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 shrink-0">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {panel === 'watchlist' ? <Watchlist /> : <OptionChainPanel />}
      </div>
    </aside>
  )
}
