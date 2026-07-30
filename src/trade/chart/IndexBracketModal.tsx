// ── Index bracket modal ──────────────────────────────────────────────────────
// Opened from the "+" on an INDEX chart at a chosen index level. Configures a
// bracket that triggers on the INDEX price and trades a selected option strike:
//   • Entry (MKT) when the index crosses the entry level
//   • optional SL / Target (index levels), armed only after entry fills
// Submits to the backend index-bracket endpoint (monitorType:'INDEX').

import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useLiveOptionChain } from '../features/optionchain/useOptionChain'
import { getStrikeRow } from '../data/realtime/optionChainCache'
import { useBrokerStore } from '@/store/brokerStore'
import { lotSizeFor } from '@/services/orders/lotSize'
import { saveIndexBracket } from '@/api/trade'

type OptType = 'CE' | 'PE'
type Side = 'BUY' | 'SELL'

/** Buy CE / Sell PE profit when the index rises → LONG bias; the others → SHORT. */
function biasOf(opt: OptType, side: Side): 'LONG' | 'SHORT' {
  const bullish = (opt === 'CE' && side === 'BUY') || (opt === 'PE' && side === 'SELL')
  return bullish ? 'LONG' : 'SHORT'
}

export function IndexBracketModal({ index, entryLevel, onPlaced, onClose }: {
  index: string
  entryLevel: number
  onPlaced?: () => void
  onClose: () => void
}) {
  const accounts = useBrokerStore((s) => s.accounts)
  const selectedIds = useBrokerStore((s) => s.selectedIds)
  const brokers = useMemo(() => {
    const sel = accounts.filter((a) => selectedIds.includes(a.id))
    return sel.length ? sel : accounts.slice(0, 1)
  }, [accounts, selectedIds])

  const [expiry, setExpiry] = useState('')
  const { chain, expiries } = useLiveOptionChain(index, expiry)
  useEffect(() => { if (!expiry && expiries.length) setExpiry(expiries[0]) }, [expiry, expiries])

  const strikes = useMemo(() => chain.rows.map((r) => r.strike), [chain])
  const [strike, setStrike] = useState<number | null>(null)
  // Default / re-center on ATM whenever the strike list changes.
  useEffect(() => {
    if (!strikes.length) return
    if (strike == null || !strikes.includes(strike)) {
      const atm = chain.atm && strikes.includes(chain.atm) ? chain.atm : strikes[Math.floor(strikes.length / 2)]
      setStrike(atm)
    }
  }, [strikes, chain.atm, strike])

  const [opt, setOpt] = useState<OptType>('CE')
  const [side, setSide] = useState<Side>('BUY')
  const lot = lotSizeFor(index)
  const [lots, setLots] = useState(1)
  const [entry, setEntry] = useState(String(entryLevel.toFixed(2)))
  const [sl, setSl] = useState('')
  const [tgt, setTgt] = useState('')
  const [busy, setBusy] = useState(false)

  const qty = Math.max(1, lots) * lot
  const bias = biasOf(opt, side)
  const contract = strike != null && expiry ? (opt === 'CE' ? getStrikeRow(index, expiry, strike)?.CE : getStrikeRow(index, expiry, strike)?.PE) : undefined
  const symbolName = contract?.symbol
  const premium = contract?.ltp
  const entryNum = Number(entry)
  const valid = brokers.length > 0 && !!symbolName && Number.isFinite(entryNum) && entryNum > 0 && !busy

  const place = async () => {
    if (!brokers.length || !symbolName || !Number.isFinite(entryNum)) return
    setBusy(true)
    try {
      // One OCO bracket per selected broker (fan-out).
      await Promise.all(brokers.map((b) => saveIndexBracket({
        brokerName: b.brokerName,
        indexName: index,
        symbolName,
        product: 'MARGIN',
        direction: bias,
        entrySide: side,
        entryQuantity: qty,
        entryTriggerPrice: +entryNum.toFixed(2),
        stopLoss: sl.trim() && Number(sl) > 0 ? { triggerPrice: +Number(sl).toFixed(2) } : undefined,
        target: tgt.trim() && Number(tgt) > 0 ? { triggerPrice: +Number(tgt).toFixed(2) } : undefined,
      })))
      toast.success(`Index bracket placed · ${opt} ${strike} ${side} · ${brokers.length} broker${brokers.length > 1 ? 's' : ''}`)
      onPlaced?.()
      onClose()
    } catch {
      toast.error('Failed to place index bracket')
    } finally {
      setBusy(false)
    }
  }

  const field = 'h-9 px-2.5 rounded-lg bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:border-brand-400'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Index trade</p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{index} <span className="text-slate-400 font-normal">when index</span> {entryNum > 0 ? entryNum.toFixed(2) : '—'}</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Expiry + CE/PE */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500">Expiry</span>
              <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className={field}>
                {expiries.length === 0 && <option value="">Loading…</option>}
                {expiries.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500">Option</span>
              <div className="grid grid-cols-2 gap-1 h-9">
                {(['CE', 'PE'] as OptType[]).map((o) => (
                  <button key={o} onClick={() => setOpt(o)} className={clsx('rounded-lg text-sm font-bold transition-colors', opt === o ? (o === 'CE' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white') : 'bg-slate-100 dark:bg-white/5 text-slate-500')}>{o}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Strike + Side */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500">Strike {chain.atm ? <span className="text-slate-400">(ATM {chain.atm})</span> : null}</span>
              <select value={strike ?? ''} onChange={(e) => setStrike(Number(e.target.value))} className={field}>
                {strikes.length === 0 && <option value="">Loading…</option>}
                {strikes.map((s) => <option key={s} value={s}>{s}{s === chain.atm ? ' · ATM' : ''}</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500">Action</span>
              <div className="grid grid-cols-2 gap-1 h-9">
                {(['BUY', 'SELL'] as Side[]).map((s) => (
                  <button key={s} onClick={() => setSide(s)} className={clsx('rounded-lg text-sm font-bold transition-colors', side === s ? (s === 'BUY' ? 'bg-blue-600 text-white' : 'bg-red-500 text-white') : 'bg-slate-100 dark:bg-white/5 text-slate-500')}>{s}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Qty */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500">Quantity <span className="text-slate-400">(lot {lot})</span></span>
            <div className="flex items-center gap-1">
              <button onClick={() => setLots((n) => Math.max(1, n - 1))} className="h-8 w-8 grid place-items-center rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500">−</button>
              <span className="w-16 text-center text-sm font-bold tabular-nums">{qty}</span>
              <button onClick={() => setLots((n) => n + 1)} className="h-8 w-8 grid place-items-center rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500">＋</button>
            </div>
          </div>

          {/* Trigger levels (index) */}
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500">Entry (index)</span>
              <input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-red-500">Stop-loss</span>
              <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="—" className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-teal-500">Target</span>
              <input value={tgt} onChange={(e) => setTgt(e.target.value)} inputMode="decimal" placeholder="—" className={field} />
            </label>
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-2 text-[12px] text-slate-600 dark:text-slate-300 space-y-0.5">
            <div className="flex justify-between"><span>Strike symbol</span><span className="font-semibold tabular-nums">{symbolName ?? '—'}</span></div>
            <div className="flex justify-between"><span>Premium (LTP)</span><span className="tabular-nums">{premium != null ? premium.toFixed(2) : '—'}</span></div>
            <div className="flex justify-between"><span>Index bias</span><span className={clsx('font-semibold', bias === 'LONG' ? 'text-emerald-600' : 'text-rose-600')}>{bias}</span></div>
            <div className="flex justify-between"><span>Fill</span><span>MKT on trigger</span></div>
          </div>

          {!brokers.length && <p className="text-[12px] text-amber-600">Select a broker to place orders.</p>}

          <button disabled={!valid} onClick={place}
            className={clsx('w-full h-10 rounded-xl text-sm font-bold text-white transition-colors', valid ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed')}>
            {busy ? 'Placing…' : `Place ${side} ${opt} ${strike ?? ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
