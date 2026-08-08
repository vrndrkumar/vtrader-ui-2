import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { useChartStore } from '../../store/chartStore'
import { useStrategyStore } from '../../store/strategyStore'
import { useWatchlistStore } from '../../store/watchlistStore'
import { OptionChainTable, buildPositionMap } from '../optionchain/OptionChainTable'
import { IndexSelect } from '../optionchain/IndexSelect'
import { useLiveOptionChain } from '../optionchain/useOptionChain'
import { computePayoff, strategyPnlAt, maxDte, avgIv } from './payoff'
import { PayoffChart } from './PayoffChart'
import { RunningStrategyBar } from './RunningStrategyBar'
import { type OptType, type Side, type StrategyLeg } from '../../types/options'
import type { ChartSymbol } from '../../types/market'
import { submitStrategy } from '@/services/orders/placeOrder'
import { PositionsTab } from '../tradebook/PositionsTab'
import { OrdersTab, orderStatusCounts } from '../tradebook/OrdersTab'
import { useTradebookStore } from '../tradebook/tradebookStore'

function inr(n: number | null): string {
  if (n === null) return '∞'
  const a = Math.abs(n)
  const s = a >= 1e5 ? `${(a / 1e5).toFixed(2)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}k` : a.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return `${n < 0 ? '-' : ''}₹${s}`
}
function popEstimate(points: { price: number; expiry: number }[], spot: number, sd: number): number {
  if (!sd || !points.length) return 0
  let num = 0, den = 0
  for (const p of points) { const w = Math.exp(-0.5 * ((p.price - spot) / sd) ** 2); den += w; if (p.expiry > 0) num += w }
  return den ? Math.round((100 * num) / den) : 0
}

type Tab = 'strategy' | 'positions' | 'orders'
type View = 'graph' | 'table' | 'greeks'

export function StrategyBuilder({ onOpenStrikeChart }: { onOpenStrikeChart?: (cs: ChartSymbol) => void }) {
  const symbolCode = useChartStore((s) => s.symbolCode)
  const setSymbol = useChartStore((s) => s.setSymbol)
  const [expiry, setExpiry] = useState('')
  const { chain, expiries } = useLiveOptionChain(symbolCode, expiry)
  useEffect(() => { setExpiry('') }, [symbolCode])
  useEffect(() => { if (expiries.length && !expiries.includes(expiry)) setExpiry(expiries[0]) }, [expiries, expiry])
  const step = symbolCode === 'SENSEX' ? 100 : 50

  const { legs, product, sameQty, addFromChain, removeLeg, updateLeg, clear, setProduct, setSameQty, setLegs } = useStrategyStore()
  const [tab, setTab] = useState<Tab>('strategy')
  const [view, setView] = useState<View>('graph')
  const [target, setTarget] = useState<number | null>(null)
  const [timeFrac, setTimeFrac] = useState(1) // 1 = today, 0 = expiry
  const [zoomed, setZoomed] = useState(true)

  // Legs the user has unchecked are excluded from payoff + trade (kept in the list).
  const [disabled, setDisabled] = useState<Set<string>>(new Set())
  const enabledLegs = useMemo(() => legs.filter((l) => !disabled.has(l.id)), [legs, disabled])
  const toggleLeg = (id: string) => setDisabled((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const payoff = useMemo(() => computePayoff(enabledLegs, chain.spot), [enabledLegs, chain.spot])
  const spot = chain.spot

  const addWatch = useWatchlistStore((s) => s.add)
  const onAction = (strike: number, optType: OptType, side: Side, ltp: number, iv: number) => { addFromChain({ symbolCode, expiry, strike, optType, side, ltp, iv }) }
  const onWatch = (strike: number, optType: OptType, ltp: number) => {
    addWatch({ id: `${symbolCode}_${expiry}_${optType}_${strike}`, symbol: `${symbolCode}_${expiry.replace(/\s/g, '')}_${optType}_${strike}`, display: `${symbolCode} ${strike} ${optType}`, ltp })
    toast.success('Added to watchlist')
  }
  // Load a running strategy (from the selector bar) into the builder.
  const loadRunning = (runLegs: StrategyLeg[], index: string) => { if (index && index !== symbolCode) setSymbol(index); setDisabled(new Set()); setLegs(runLegs) }
  // Start a fresh strategy — clear everything so the user builds from scratch.
  const newStrategy = () => { clear(); setDisabled(new Set()); setTarget(null); setTimeFrac(1) }
  // Roll a leg to another strike by dragging (exit old strike → enter new).
  const rollLeg = (leg: StrategyLeg, newStrike: number) => {
    if (newStrike === leg.strike) return
    const row = chain.rows.find((r) => r.strike === newStrike)
    const d = row ? (leg.optType === 'CE' ? row.call : row.put) : undefined
    updateLeg(leg.id, { strike: newStrike, ...(d ? { ltp: d.ltp, price: d.ltp, iv: d.iv } : {}) })
  }
  const changeStrike = (leg: StrategyLeg, dir: 1 | -1) => {
    const strike = leg.strike + dir * step
    const row = chain.rows.find((r) => r.strike === strike)
    const d = row ? (leg.optType === 'CE' ? row.call : row.put) : undefined
    updateLeg(leg.id, { strike, ...(d ? { ltp: d.ltp, price: d.ltp, iv: d.iv } : {}) })
  }
  const toggleType = (leg: StrategyLeg) => {
    const row = chain.rows.find((r) => r.strike === leg.strike)
    const t: OptType = leg.optType === 'CE' ? 'PE' : 'CE'
    const d = row ? (t === 'CE' ? row.call : row.put) : undefined
    updateLeg(leg.id, { optType: t, ...(d ? { ltp: d.ltp, price: d.ltp, iv: d.iv } : {}) })
  }

  // Live positions / orders for this index.
  const tbPositions = useTradebookStore((s) => s.positions)
  const tbOrders = useTradebookStore((s) => s.orders)
  const orderStatus = useTradebookStore((s) => s.orderStatus)
  const posRows = useMemo(() => tbPositions.filter((p) => p.indexName === symbolCode), [tbPositions, symbolCode])
  const posMap = useMemo(() => buildPositionMap(tbPositions, symbolCode), [tbPositions, symbolCode])
  const indexOrders = useMemo(() => tbOrders.filter((o) => o.indexName === symbolCode), [tbOrders, symbolCode])
  const ordRows = useMemo(() => orderStatus === 'ALL' ? indexOrders : indexOrders.filter((o) => o.status === orderStatus), [indexOrders, orderStatus])
  const ordCounts = useMemo(() => orderStatusCounts(indexOrders), [indexOrders])

  const trade = () => {
    if (!enabledLegs.length) return toast.error('Select at least one leg')
    void submitStrategy(enabledLegs.map((l) => ({
      side: l.side, indexName: symbolCode,
      symbolName: `${symbolCode}_${l.expiry.replace(/\s/g, '')}_${l.optType}_${l.strike}`,
      priceType: l.priceType === 'Market' ? 'MKT' : 'LMT', price: l.price, qty: l.qty,
    }))).then(() => useTradebookStore.getState().reload())
  }

  // ── Analysis derivations ──
  const lo = payoff.points[0]?.price ?? Math.round(spot * 0.72)
  const hi = payoff.points[payoff.points.length - 1]?.price ?? Math.round(spot * 1.28)
  const effTarget = Math.min(hi, Math.max(lo, target ?? Math.round(spot)))
  const dteDays = maxDte(enabledLegs)
  const daysLeft = Math.max(0, Math.round(dteDays * timeFrac))
  const sd = spot * (avgIv(enabledLegs) / 100) * Math.sqrt(dteDays / 365)
  const chartData = useMemo(() => payoff.points.map((p) => ({ price: p.price, expiry: p.expiry, projected: strategyPnlAt(enabledLegs, p.price, timeFrac) })), [payoff.points, enabledLegs, timeFrac])
  const bands = useMemo(() => sd > 0 ? [-2, -1, 1, 2].map((k) => ({ price: Math.round(spot + k * sd), label: `${k > 0 ? '+' : ''}${k}SD` })).filter((b) => b.price > lo && b.price < hi) : [], [sd, spot, lo, hi])
  const projAtTarget = enabledLegs.length ? strategyPnlAt(enabledLegs, effTarget, timeFrac) : 0
  const pop = popEstimate(payoff.points, spot, sd)

  const focus = [effTarget, ...enabledLegs.map((l) => l.strike), ...payoff.breakevens].filter((x) => Number.isFinite(x))
  const halfW = Math.max(2.5 * (sd || spot * 0.02), spot * 0.03, ...focus.map((x) => Math.abs(x - spot) * 1.25))
  const winLo = Math.max(lo, Math.round(spot - halfW))
  const winHi = Math.min(hi, Math.round(spot + halfW))
  const zoomData = chartData.filter((d) => d.price >= winLo && d.price <= winHi)
  const viewData = zoomed && zoomData.length >= 8 ? zoomData : chartData
  const viewBands = zoomed ? bands.filter((b) => b.price >= winLo && b.price <= winHi) : bands
  const credit = payoff.netPremium >= 0
  const rr = payoff.maxProfit != null && payoff.maxLoss != null && payoff.maxLoss !== 0 ? Math.abs(payoff.maxProfit / payoff.maxLoss) : null
  const romMax = payoff.maxProfit != null && payoff.marginEst > 0 ? (payoff.maxProfit / payoff.marginEst) * 100 : null

  return (
    <div className="flex h-full min-h-0">
      {/* Option chain (left) — same header as the trade page: index picker
          (with live LTP / change%) on top, then the Calls / expiry / Puts table. */}
      <div className="w-[360px] shrink-0 flex flex-col min-h-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark">
        <IndexSelect value={symbolCode} onChange={setSymbol} />
        <div className="flex-1 min-h-0">
        <OptionChainTable chain={chain} expiries={expiries} expiry={expiry} onExpiry={setExpiry} onAction={onAction} onWatch={onWatch} positions={posMap}
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
          onChart={(strike, optType) => onOpenStrikeChart?.({ key: `${symbolCode}_${expiry}_${optType}_${strike}`, candleSymbol: `${symbolCode}_${expiry}_${optType}_${strike}`, display: `${symbolCode} ${strike} ${optType}`, kind: 'OPTION' })} />
        </div>
      </div>

      {/* Strategy panel (right) */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-surface-dark">
        <div className="flex items-center gap-1 h-12 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shrink-0">
          <span className="font-bold text-slate-800 dark:text-slate-100 mr-3">{symbolCode}</span>
          {(['strategy', 'positions', 'orders'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={clsx('h-8 px-3 rounded-lg text-sm font-semibold capitalize transition-colors', tab === t ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5')}>
              {t}{t === 'strategy' && legs.length ? <span className="ml-1 text-[10px] opacity-80">{legs.length}</span> : null}
            </button>
          ))}
        </div>

        {tab === 'positions' ? (
          <div className="flex-1 min-h-0 bg-white dark:bg-card-dark"><PositionsTab rows={posRows} /></div>
        ) : tab === 'orders' ? (
          <div className="flex-1 min-h-0 bg-white dark:bg-card-dark"><OrdersTab rows={ordRows} counts={ordCounts} /></div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-5xl mx-auto p-4 space-y-4">
              {/* Running strategy selectors (replaces presets) */}
              <RunningStrategyBar expiries={expiries} onLoad={loadRunning} />

              {/* Builder card */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{legs.length ? 'Strategy' : 'Build a strategy'}</p>
                    <p className="text-[11px] text-slate-400">{legs.length ? `${legs.length} leg${legs.length > 1 ? 's' : ''}` : 'Select a running strategy above, or add legs from the chain'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Segmented value={product} onChange={(v) => setProduct(v)} options={[{ v: 'Normal', l: 'NRML' }, { v: 'MIS', l: 'MIS' }]} />
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 cursor-pointer select-none">
                      <span className={clsx('relative h-4 w-7 rounded-full transition-colors', sameQty ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600')}>
                        <input type="checkbox" checked={sameQty} onChange={(e) => setSameQty(e.target.checked)} className="sr-only" />
                        <span className={clsx('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', sameQty ? 'left-3.5' : 'left-0.5')} />
                      </span>Same qty
                    </label>
                    <button onClick={newStrategy} className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-brand-200 dark:border-brand-800 text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>New
                    </button>
                    {legs.length > 0 && <button onClick={() => clear()} className="text-[11px] font-semibold text-slate-400 hover:text-red-500">Clear</button>}
                  </div>
                </div>

                {legs.length === 0 ? (
                  <div className="m-4 py-12 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                    <svg viewBox="0 0 24 24" className="h-8 w-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-300">No legs yet</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Select a running strategy above, or hover a strike and tap <b className="text-brand-600">B</b>/<b className="text-red-600">S</b>.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="grid grid-cols-[28px_64px_1fr_1.4fr_64px_1.1fr_72px_28px] gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <span />
                      <span>B/S</span><span>Expiry</span><span className="text-center">Strike</span><span className="text-center">Type</span><span className="text-center">Qty</span><span className="text-right">Price</span><span />
                    </div>
                    {legs.map((l) => {
                      const off = !disabled.has(l.id)
                      return (
                        <div key={l.id} className={clsx('grid grid-cols-[28px_64px_1fr_1.4fr_64px_1.1fr_72px_28px] gap-2 px-4 py-2 items-center hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-opacity', !off && 'opacity-45')}>
                          {/* Include checkbox */}
                          <input type="checkbox" checked={off} onChange={() => toggleLeg(l.id)} className="h-4 w-4 accent-brand-600 cursor-pointer justify-self-center" title={off ? 'Exclude from payoff' : 'Include in payoff'} />
                          <button onClick={() => updateLeg(l.id, { side: l.side === 'BUY' ? 'SELL' : 'BUY' })} className={clsx('h-7 rounded-lg text-xs font-bold transition-transform active:scale-95', l.side === 'BUY' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30' : 'bg-red-50 text-red-600 dark:bg-red-900/30')}>{l.side}</button>
                          <select value={l.expiry} onChange={(e) => updateLeg(l.id, { expiry: e.target.value })} className="h-7 bg-slate-100 dark:bg-white/5 rounded-lg px-2 text-xs font-medium outline-none">
                            {(expiries.length ? expiries : [l.expiry]).map((e) => <option key={e}>{e}</option>)}
                          </select>
                          {/* Strike — drag horizontally to roll */}
                          <div className="flex items-center justify-center gap-1">
                            <StepBtn onClick={() => changeStrike(l, -1)}>−</StepBtn>
                            <StrikeRoller leg={l} step={step} onRoll={rollLeg} />
                            <StepBtn onClick={() => changeStrike(l, 1)}>+</StepBtn>
                          </div>
                          <button onClick={() => toggleType(l)} className={clsx('h-7 rounded-lg text-xs font-bold transition-transform active:scale-95', l.optType === 'CE' ? 'bg-green-50 text-green-600 dark:bg-green-900/30' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30')}>{l.optType}</button>
                          <div className="flex items-center justify-center gap-1">
                            <StepBtn onClick={() => updateLeg(l.id, { qty: Math.max(l.lot, l.qty - l.lot) })}>−</StepBtn>
                            <span className="w-12 text-center tabular-nums font-medium">{l.qty}</span>
                            <StepBtn onClick={() => updateLeg(l.id, { qty: l.qty + l.lot })}>+</StepBtn>
                          </div>
                          <span className="text-right tabular-nums text-sm text-slate-600 dark:text-slate-300">{l.ltp.toFixed(2)}</span>
                          <button onClick={() => removeLeg(l.id)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 justify-self-end transition"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg></button>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-white/[0.02]">
                  <div className="flex gap-5">
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Net {credit ? 'credit' : 'debit'}</p><p className={clsx('text-base font-bold tabular-nums', credit ? 'text-green-600' : 'text-red-600')}>{inr(Math.round(payoff.netPremium))}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Margin (est.)</p><p className="text-base font-bold tabular-nums text-slate-700 dark:text-slate-200">{inr(Math.round(payoff.marginEst))}</p></div>
                  </div>
                  <button onClick={trade} disabled={!legs.length} className="group flex items-center gap-2 px-7 py-2.5 rounded-xl text-white font-bold bg-gradient-to-r from-brand-600 to-indigo-500 shadow-lg shadow-brand-600/25 disabled:opacity-40 disabled:shadow-none transition-all hover:-translate-y-0.5 active:scale-95">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>Trade
                  </button>
                </div>
              </div>

              {legs.length > 0 && (
                <>
                  {/* Summary bar */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shadow-sm grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
                    <div className="p-4 space-y-2.5">
                      <Row label="Max profit" value={inr(payoff.maxProfit)} tone="green" hint={romMax != null ? `${romMax >= 0 ? '+' : ''}${romMax.toFixed(0)}% on margin` : undefined} />
                      <Row label="Max loss" value={inr(payoff.maxLoss)} tone="red" />
                      <Row label="Breakeven" value={payoff.breakevens.length ? payoff.breakevens.join('  ·  ') : '—'} />
                    </div>
                    <div className="p-4 space-y-2.5">
                      <Row label="Reward / Risk" value={rr != null ? `1 : ${rr.toFixed(2)}` : 'NA'} />
                      <Row label="Probability of profit" value={`${pop}%`} tone={pop >= 50 ? 'green' : 'slate'} />
                      <Row label={`Net ${credit ? 'credit' : 'debit'}`} value={inr(Math.round(payoff.netPremium))} tone={credit ? 'green' : 'red'} />
                    </div>
                    <div className="p-4 space-y-2.5">
                      <Row label="Margin required" value={inr(Math.round(payoff.marginEst))} />
                      <Row label="Premium" value={inr(Math.round(Math.abs(payoff.netPremium)))} />
                      <Row label="Days to expiry" value={`${dteDays}D`} />
                    </div>
                  </div>

                  {/* Payoff hero card */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                      <Segmented value={view} onChange={setView} options={[{ v: 'graph', l: 'Payoff Graph' }, { v: 'table', l: 'P&L Table' }, { v: 'greeks', l: 'Greeks' }]} />
                      <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
                        <span className="flex items-center gap-1.5"><span className="w-3.5 h-[3px] rounded-full bg-emerald-500 inline-block" /> On expiry</span>
                        <span className="flex items-center gap-1.5"><span className="w-3.5 h-[3px] rounded-full bg-blue-500 inline-block" /> On target</span>
                      </div>
                    </div>

                    {view === 'graph' && (
                      <div className="p-3">
                        <div className="relative h-80">
                          <button onClick={() => setZoomed((z) => !z)} className="absolute top-0.5 right-1 z-10 flex items-center gap-1 h-7 px-2.5 rounded-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur ring-1 ring-slate-200 dark:ring-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 shadow-sm hover:bg-white dark:hover:bg-slate-700 transition active:scale-95">
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4M8 11h6" />{!zoomed && <path d="M11 8v6" />}</svg>
                            {zoomed ? 'Zoom out' : 'Zoom in'}
                          </button>
                          <PayoffChart data={viewData} spot={spot} breakevens={payoff.breakevens} target={effTarget} bands={viewBands} />
                          <div className={clsx('absolute left-1/2 -translate-x-1/2 bottom-1 px-3 py-1 rounded-full text-xs font-bold shadow-lg', projAtTarget >= 0 ? 'bg-green-600 text-white' : 'bg-red-600 text-white')}>
                            Projected {projAtTarget >= 0 ? 'profit' : 'loss'}: {inr(projAtTarget)}
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-semibold text-slate-500">{symbolCode} Target</span>
                              <button onClick={() => setTarget(null)} className="text-[11px] font-medium text-brand-600 hover:underline">Reset</button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] tabular-nums text-slate-400 w-12">{(((effTarget - spot) / spot) * 100).toFixed(1)}%</span>
                              <StepBtn onClick={() => setTarget(Math.max(lo, effTarget - step))}>−</StepBtn>
                              <input value={effTarget} onChange={(e) => setTarget(Number(e.target.value) || spot)} className="w-20 h-7 text-center text-sm tabular-nums rounded-lg bg-slate-100 dark:bg-white/5 outline-none" />
                              <StepBtn onClick={() => setTarget(Math.min(hi, effTarget + step))}>+</StepBtn>
                            </div>
                            <input type="range" min={lo} max={hi} step={step} value={effTarget} onChange={(e) => setTarget(Number(e.target.value))} className="w-full mt-2 accent-brand-600" />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-semibold text-slate-500">Days to expiry <span className="text-slate-400">· {daysLeft}D left</span></span>
                              <button onClick={() => setTimeFrac(1)} className="text-[11px] font-medium text-brand-600 hover:underline">Reset</button>
                            </div>
                            <input type="range" min={0} max={1} step={0.02} value={timeFrac} onChange={(e) => setTimeFrac(Number(e.target.value))} className="w-full accent-blue-600" />
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1"><span>Expiry</span><span>Today</span></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {view === 'table' && (
                      <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-slate-50 dark:bg-white/[0.03] text-[10px] uppercase tracking-wide text-slate-400">
                            <tr><th className="text-left font-medium px-4 py-2">{symbolCode} price</th><th className="text-right font-medium px-4 py-2">P&L on target</th><th className="text-right font-medium px-4 py-2">P&L at expiry</th></tr>
                          </thead>
                          <tbody>
                            {chartData.filter((_, i) => i % 8 === 0).map((d) => (
                              <tr key={d.price} className="border-t border-slate-100 dark:border-slate-800/60">
                                <td className="px-4 py-1.5 tabular-nums font-medium">{d.price}</td>
                                <td className={clsx('px-4 py-1.5 text-right tabular-nums', d.projected >= 0 ? 'text-green-600' : 'text-red-600')}>{inr(d.projected)}</td>
                                <td className={clsx('px-4 py-1.5 text-right tabular-nums font-semibold', d.expiry >= 0 ? 'text-green-600' : 'text-red-600')}>{inr(d.expiry)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {view === 'greeks' && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                        <Greek label="Delta" value={payoff.greeks.delta} hint="Directional exposure" />
                        <Greek label="Theta" value={payoff.greeks.theta} hint="Daily time decay" />
                        <Greek label="Gamma" value={payoff.greeks.gamma} hint="Delta sensitivity" />
                        <Greek label="Vega" value={payoff.greeks.vega} hint="Vol sensitivity" />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StepBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="h-6 w-6 grid place-items-center rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 transition active:scale-90">{children}</button>
}

// Drag the strike horizontally to roll the leg to another strike (≈24px per step).
function StrikeRoller({ leg, step, onRoll }: { leg: StrategyLeg; step: number; onRoll: (leg: StrategyLeg, strike: number) => void }) {
  const drag = useRef<{ startX: number; base: number; moved: boolean } | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const PX = 24

  function down(clientX: number) { drag.current = { startX: clientX, base: leg.strike, moved: false } }
  function move(clientX: number) {
    if (!drag.current) return
    const deltaSteps = Math.round((clientX - drag.current.startX) / PX)
    if (deltaSteps !== 0) drag.current.moved = true
    setPreview(drag.current.base + deltaSteps * step)
  }
  function up() {
    if (drag.current && preview != null && drag.current.moved) onRoll(leg, preview)
    drag.current = null; setPreview(null)
  }
  const shown = preview ?? leg.strike
  return (
    <span
      onMouseDown={(e) => { e.preventDefault(); down(e.clientX) }}
      onMouseMove={(e) => move(e.clientX)}
      onMouseUp={up}
      onMouseLeave={up}
      onTouchStart={(e) => down(e.touches[0].clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
      onTouchEnd={up}
      title="Drag to roll to another strike"
      className={clsx('w-14 text-center tabular-nums font-semibold select-none cursor-ew-resize rounded-md py-0.5 transition-colors',
        preview != null && preview !== leg.strike ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10')}
    >
      {shown}
    </span>
  )
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-white/5">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={clsx('px-2.5 h-7 rounded-md text-xs font-bold transition-colors', value === o.v ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500')}>{o.l}</button>
      ))}
    </div>
  )
}

function Row({ label, value, tone = 'slate', hint }: { label: string; value: string; tone?: 'green' | 'red' | 'slate'; hint?: string }) {
  const val = tone === 'green' ? 'text-green-600' : tone === 'red' ? 'text-red-600' : 'text-slate-800 dark:text-slate-100'
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right">
        <span className={clsx('text-sm font-bold tabular-nums', val)}>{value}</span>
        {hint && <span className="block text-[10px] text-slate-400">{hint}</span>}
      </span>
    </div>
  )
}

function Greek({ label, value, hint }: { label: string; value: number; hint: string }) {
  const pos = value >= 0
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2.5 ring-1 ring-slate-100 dark:ring-white/10">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={clsx('text-lg font-bold tabular-nums', value === 0 ? 'text-slate-500' : pos ? 'text-green-600' : 'text-red-600')}>{value > 0 ? '+' : ''}{value}</p>
      <p className="text-[10px] text-slate-400">{hint}</p>
    </div>
  )
}
