import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { useChartStore } from '../../store/chartStore'
import { useStrategyStore } from '../../store/strategyStore'
import { useWatchlistStore } from '../../store/watchlistStore'
import { OptionChainTable } from '../optionchain/OptionChainTable'
import { useLiveOptionChain } from '../optionchain/useOptionChain'
import { computePayoff } from './payoff'
import { PayoffChart } from './PayoffChart'
import { buildPreset, PRESETS, type PresetName } from './presets'
import { type OptType, type Side, type StrategyLeg } from '../../types/options'
import type { ChartSymbol } from '../../types/market'

function inr(n: number | null): string {
  if (n === null) return 'Unlimited'
  const a = Math.abs(n)
  const s = a >= 1e5 ? `${(a / 1e5).toFixed(2)}L` : a.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return `${n < 0 ? '-' : ''}₹${s}`
}

type Tab = 'strategy' | 'positions' | 'orders'

export function StrategyBuilder({ onOpenStrikeChart }: { onOpenStrikeChart?: (cs: ChartSymbol) => void }) {
  const symbolCode = useChartStore((s) => s.symbolCode)
  const [expiry, setExpiry] = useState('')
  const { chain, expiries } = useLiveOptionChain(symbolCode, expiry)
  useEffect(() => { setExpiry('') }, [symbolCode])
  useEffect(() => { if (expiries.length && !expiries.includes(expiry)) setExpiry(expiries[0]) }, [expiries, expiry])
  const step = symbolCode === 'SENSEX' ? 100 : 50

  const { legs, product, sameQty, addFromChain, removeLeg, updateLeg, clear, setProduct, setSameQty, setLegs } = useStrategyStore()
  const [tab, setTab] = useState<Tab>('strategy')
  const [preset, setPreset] = useState<PresetName | null>(null)

  const payoff = useMemo(() => computePayoff(legs, chain.spot), [legs, chain.spot])

  const addWatch = useWatchlistStore((s) => s.add)
  const onAction = (strike: number, optType: OptType, side: Side, ltp: number, iv: number) => {
    addFromChain({ symbolCode, expiry, strike, optType, side, ltp, iv })
    setPreset(null)
  }
  const onWatch = (strike: number, optType: OptType, ltp: number) => {
    addWatch({ id: `${symbolCode}_${expiry}_${optType}_${strike}`, symbol: `${symbolCode}_${expiry.replace(/\s/g, '')}_${optType}_${strike}`, display: `${symbolCode} ${strike} ${optType}`, ltp })
    toast.success('Added to watchlist')
  }
  const applyPreset = (name: PresetName) => { setLegs(buildPreset(name, chain)); setPreset(name) }
  const changeStrike = (leg: StrategyLeg, dir: 1 | -1) => {
    const strike = leg.strike + dir * step
    const row = chain.rows.find((r) => r.strike === strike)
    const d = row ? (leg.optType === 'CE' ? row.call : row.put) : undefined
    updateLeg(leg.id, { strike, ...(d ? { ltp: d.ltp, price: d.ltp, iv: d.iv } : {}) })
    setPreset(null)
  }
  const toggleType = (leg: StrategyLeg) => {
    const row = chain.rows.find((r) => r.strike === leg.strike)
    const t: OptType = leg.optType === 'CE' ? 'PE' : 'CE'
    const d = row ? (t === 'CE' ? row.call : row.put) : undefined
    updateLeg(leg.id, { optType: t, ...(d ? { ltp: d.ltp, price: d.ltp, iv: d.iv } : {}) })
    setPreset(null)
  }
  const trade = () => {
    if (!legs.length) return toast.error('Add at least one leg')
    toast.success(`${preset ?? 'Custom'} · ${legs.length} legs sent (simulated)`)
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Option chain (left) */}
      <div className="w-[360px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark">
        <OptionChainTable chain={chain} expiries={expiries} expiry={expiry} onExpiry={setExpiry} onAction={onAction} onWatch={onWatch}
          onChart={(strike, optType) => onOpenStrikeChart?.({
            key: `${symbolCode}_${expiry}_${optType}_${strike}`,
            candleSymbol: `${symbolCode}_${expiry}_${optType}_${strike}`,
            display: `${symbolCode} ${strike} ${optType}`,
            kind: 'OPTION',
          })} />
      </div>

      {/* Strategy panel (right) */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-surface-dark">
        {/* Tabs */}
        <div className="flex items-center gap-4 h-11 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shrink-0">
          <span className="font-semibold text-slate-800 dark:text-slate-100">{symbolCode}</span>
          {(['strategy', 'positions', 'orders'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={clsx('h-11 text-sm font-medium capitalize border-b-2 -mb-px', tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 dark:text-slate-400')}>{t}</button>
          ))}
        </div>

        {tab !== 'strategy' ? (
          <div className="flex-1 grid place-items-center text-sm text-slate-400 capitalize">No {tab} yet.</div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {/* Preset chips */}
            <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
              {PRESETS.map((p) => (
                <button key={p} onClick={() => applyPreset(p)} className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border', preset === p ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5')}>{p}</button>
              ))}
            </div>

            {/* Legs toolbar */}
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{preset ?? (legs.length ? 'Custom Strategy' : 'Build a strategy')}</span>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => setProduct(product === 'Normal' ? 'MIS' : 'Normal')} className="text-slate-500 dark:text-slate-400">Product: <span className="font-medium text-slate-700 dark:text-slate-200">{product}</span></button>
                <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={sameQty} onChange={(e) => setSameQty(e.target.checked)} className="accent-brand-600" /> Same qty
                </label>
                <button onClick={() => { clear(); setPreset(null) }} className="text-red-500 font-medium">Clear all</button>
              </div>
            </div>

            {/* Legs table */}
            <div className="px-2">
              {legs.length === 0 ? (
                <div className="mx-2 my-4 py-10 text-center text-sm text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                  Pick a preset, or hover a strike in the chain and click <span className="font-semibold text-brand-600">B</span> / <span className="font-semibold text-red-600">S</span>.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="text-left font-medium px-2 py-1.5">B/S</th>
                      <th className="text-left font-medium px-2 py-1.5">Expiry</th>
                      <th className="text-center font-medium px-2 py-1.5">Strike</th>
                      <th className="text-center font-medium px-2 py-1.5">Type</th>
                      <th className="text-center font-medium px-2 py-1.5">Qty</th>
                      <th className="text-right font-medium px-2 py-1.5">Price</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {legs.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-2">
                          <button onClick={() => updateLeg(l.id, { side: l.side === 'BUY' ? 'SELL' : 'BUY' })} className={clsx('px-2 py-1 rounded-md text-xs font-bold w-14', l.side === 'BUY' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30' : 'bg-red-50 text-red-600 dark:bg-red-900/30')}>{l.side}</button>
                        </td>
                        <td className="px-2 py-2">
                          <select value={l.expiry} onChange={(e) => updateLeg(l.id, { expiry: e.target.value })} className="bg-slate-100 dark:bg-white/5 rounded-md px-2 py-1 text-xs outline-none">
                            {(expiries.length ? expiries : [l.expiry]).map((e) => <option key={e}>{e}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => changeStrike(l, -1)} className="h-6 w-6 rounded bg-slate-100 dark:bg-white/5 text-slate-500">−</button>
                            <span className="w-14 text-center tabular-nums font-medium">{l.strike}</span>
                            <button onClick={() => changeStrike(l, 1)} className="h-6 w-6 rounded bg-slate-100 dark:bg-white/5 text-slate-500">+</button>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button onClick={() => toggleType(l)} className={clsx('px-2 py-1 rounded-md text-xs font-bold', l.optType === 'CE' ? 'bg-green-50 text-green-600 dark:bg-green-900/30' : 'bg-red-50 text-red-600 dark:bg-red-900/30')}>{l.optType}</button>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => updateLeg(l.id, { qty: Math.max(l.lot, l.qty - l.lot) })} className="h-6 w-6 rounded bg-slate-100 dark:bg-white/5 text-slate-500">−</button>
                            <span className="w-12 text-center tabular-nums">{l.qty}</span>
                            <button onClick={() => updateLeg(l.id, { qty: l.qty + l.lot })} className="h-6 w-6 rounded bg-slate-100 dark:bg-white/5 text-slate-500">+</button>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{l.ltp.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right">
                          <button onClick={() => removeLeg(l.id)} className="text-slate-400 hover:text-red-500"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Margin + Trade */}
            <div className="flex items-center justify-between px-4 py-3 mt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex gap-6 text-xs">
                <div><p className="text-slate-400">Net {payoff.netPremium >= 0 ? 'Credit' : 'Debit'}</p><p className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{inr(Math.round(payoff.netPremium))}</p></div>
                <div><p className="text-slate-400">Req. Margin (est.)</p><p className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{inr(Math.round(payoff.marginEst))}</p></div>
              </div>
              <button onClick={trade} disabled={!legs.length} className="px-8 py-2.5 rounded-lg text-white font-semibold bg-gradient-to-r from-brand-600 to-indigo-500 disabled:opacity-40">Trade</button>
            </div>

            {/* Analyse */}
            <div className="px-4 pb-4">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Analyse</p>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <Metric label="Max profit (est.)" value={inr(payoff.maxProfit)} tone={payoff.maxProfit === null || payoff.maxProfit > 0 ? 'green' : 'slate'} />
                <Metric label="Max loss (est.)" value={inr(payoff.maxLoss)} tone="red" />
                <Metric label="Breakeven" value={payoff.breakevens.length ? payoff.breakevens.join(', ') : '—'} />
                <Metric label="Net premium" value={inr(Math.round(payoff.netPremium))} />
              </div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <Metric label="Delta" value={String(payoff.greeks.delta)} />
                <Metric label="Theta" value={String(payoff.greeks.theta)} />
                <Metric label="Gamma" value={String(payoff.greeks.gamma)} />
                <Metric label="Vega" value={String(payoff.greeks.vega)} />
              </div>
              <div className="flex items-center gap-4 mb-1 text-[11px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-500 inline-block" /> Today</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-pink-600 inline-block" /> Expiry</span>
                <span className="ml-auto">Greeks &amp; Today curve are Black-Scholes estimates</span>
              </div>
              <div className="h-64 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-card-dark p-2">
                <PayoffChart points={payoff.points} spot={chain.spot} breakevens={payoff.breakevens} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'green' | 'red' | 'slate' }) {
  return (
    <div className={clsx('rounded-lg px-3 py-2', tone === 'green' ? 'bg-green-50 dark:bg-green-900/15' : tone === 'red' ? 'bg-red-50 dark:bg-red-900/15' : 'bg-slate-100 dark:bg-white/5')}>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={clsx('text-sm font-semibold tabular-nums', tone === 'green' ? 'text-green-600' : tone === 'red' ? 'text-red-600' : 'text-slate-700 dark:text-slate-200')}>{value}</p>
    </div>
  )
}
