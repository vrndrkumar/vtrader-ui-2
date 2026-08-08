// ── AdjustmentModal ────────────────────────────────────────────────────────────
// Option chain overlay for adjusting an open option position.
// Features:
//   • Live option chain (CE | Strike | PE) via useLiveOptionChain
//   • Current position highlighted + ATM marker
//   • Expiry picker
//   • Exit mode: qty input, MKT/LMT, confirm button
//   • Roll mode: click a new strike → exit current + enter new; net debit/credit preview

import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { placeOrderApi } from '@/api/trade'
import type { Trade } from '@/types/reports'
import { useLiveOptionChain } from '@/trade/features/optionchain/useOptionChain'
import { useMarketStore } from '@/trade/store/marketStore'

// ── Symbol parsing ────────────────────────────────────────────────────────────

function detectIndex(sym: string): string {
  const u = sym.toUpperCase()
  if (u.startsWith('BANKNIFTY'))  return 'BANKNIFTY'
  if (u.startsWith('MIDCPNIFTY')) return 'MIDCPNIFTY'
  if (u.startsWith('FINNIFTY'))   return 'FINNIFTY'
  if (u.startsWith('NIFTY'))      return 'NIFTY'
  if (u.startsWith('BANKEX'))     return 'BANKEX'
  if (u.startsWith('SENSEX'))     return 'SENSEX'
  return 'NIFTY'
}

interface ParsedOption {
  index: string
  rawExpiry: string   // "31JUL25"
  optType: 'CE' | 'PE'
  strike: number
}

function parseOption(sym: string): ParsedOption | null {
  const parts = sym.split('_')
  if (parts.length < 4) return null
  const optType = parts[parts.length - 2] as 'CE' | 'PE'
  if (!['CE', 'PE'].includes(optType)) return null
  const strike = parseInt(parts[parts.length - 1], 10)
  if (isNaN(strike)) return null
  return { index: detectIndex(sym), rawExpiry: parts[1] ?? '', optType, strike }
}

function buildSymbol(index: string, rawExpiry: string, optType: 'CE' | 'PE', strike: number): string {
  return `${index}_${rawExpiry}_${optType}_${strike}`
}

const INR = (n: number) => Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const pnlCls = (n: number) => n >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'

// ── Option chain sub-component ────────────────────────────────────────────────

interface ChainProps {
  index: string
  expiry: string
  currentStrike: number
  currentOptType: 'CE' | 'PE'
  rollStrike: number | null
  onSelectRollStrike: (strike: number) => void
  mode: 'exit' | 'roll'
}

function OptionChainGrid({ index, expiry, currentStrike, currentOptType, rollStrike, onSelectRollStrike, mode }: ChainProps) {
  const { chain } = useLiveOptionChain(index, expiry)
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({})

  // Scroll to ATM on load
  useEffect(() => {
    if (!chain.atm) return
    const el = rowRefs.current[chain.atm]
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain.atm])

  const visibleRows = useMemo(() => {
    if (!chain.rows.length) return []
    const atmIdx = chain.rows.findIndex(r => r.strike >= chain.atm)
    const lo = Math.max(0, atmIdx - 10)
    const hi = Math.min(chain.rows.length, atmIdx + 11)
    return chain.rows.slice(lo, hi)
  }, [chain])

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2 text-left font-bold text-[10px] uppercase tracking-widest text-slate-500 dark:text-white/30 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-white/[0.06] w-[38%]">
              CALLS
            </th>
            <th className="px-2 py-2 text-center font-bold text-[10px] uppercase tracking-widest text-slate-500 dark:text-white/30 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-white/[0.06] w-[24%]">
              STRIKE
            </th>
            <th className="px-3 py-2 text-right font-bold text-[10px] uppercase tracking-widest text-slate-500 dark:text-white/30 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-white/[0.06] w-[38%]">
              PUTS
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(row => {
            const isAtm = row.strike === chain.atm
            const isCurrent = row.strike === currentStrike
            const isRollTarget = mode === 'roll' && row.strike === rollStrike

            return (
              <tr
                key={row.strike}
                ref={el => { rowRefs.current[row.strike] = el }}
                onClick={() => mode === 'roll' && onSelectRollStrike(row.strike)}
                className={clsx(
                  'transition-colors border-b border-slate-50 dark:border-white/[0.03]',
                  mode === 'roll' && 'cursor-pointer',
                  isCurrent && 'bg-brand-50/80 dark:bg-brand-900/20',
                  isRollTarget && !isCurrent && 'bg-emerald-50 dark:bg-emerald-900/20',
                  !isCurrent && !isRollTarget && isAtm && 'bg-amber-50/50 dark:bg-amber-900/10',
                  !isCurrent && !isRollTarget && !isAtm && 'hover:bg-slate-50 dark:hover:bg-white/[0.03]',
                )}
              >
                {/* Call side */}
                <td className="px-3 py-2.5">
                  {row.call ? (
                    <div className={clsx('text-right', isCurrent && currentOptType === 'CE' && 'font-bold')}>
                      <div className="text-slate-800 dark:text-white/80 font-semibold tabular-nums">
                        {row.call.ltp.toFixed(2)}
                      </div>
                      <div className={clsx('text-[10px] tabular-nums', row.call.ltpChgPct >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                        {row.call.ltpChgPct >= 0 ? '+' : ''}{row.call.ltpChgPct}%
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-300 dark:text-white/15 text-right text-[10px]">—</div>
                  )}
                </td>

                {/* Strike */}
                <td className="px-2 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    {isCurrent && (
                      <div
                        className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse shrink-0"
                        title="Your position"
                      />
                    )}
                    {isRollTarget && (
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    )}
                    <span className={clsx(
                      'font-black tabular-nums text-[11px]',
                      isAtm ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200',
                      isCurrent && 'text-brand-600 dark:text-brand-400',
                      isRollTarget && !isCurrent && 'text-emerald-600 dark:text-emerald-400',
                    )}>
                      {row.strike.toLocaleString('en-IN')}
                    </span>
                    {isAtm && !isCurrent && (
                      <span className="text-[8px] font-black text-amber-500 bg-amber-50 dark:bg-amber-900/30 px-1 rounded">ATM</span>
                    )}
                  </div>
                </td>

                {/* Put side */}
                <td className="px-3 py-2.5">
                  {row.put ? (
                    <div className={clsx(isCurrent && currentOptType === 'PE' && 'font-bold')}>
                      <div className="text-slate-800 dark:text-white/80 font-semibold tabular-nums">
                        {row.put.ltp.toFixed(2)}
                      </div>
                      <div className={clsx('text-[10px] tabular-nums', row.put.ltpChgPct >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                        {row.put.ltpChgPct >= 0 ? '+' : ''}{row.put.ltpChgPct}%
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-300 dark:text-white/15 text-[10px]">—</div>
                  )}
                </td>
              </tr>
            )
          })}
          {!visibleRows.length && (
            <tr>
              <td colSpan={3} className="px-3 py-12 text-center text-[12px] text-slate-400 dark:text-white/20">
                Waiting for live chain data…
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  trade: Trade
  onClose: () => void
  onDone: () => void
}

type Mode = 'exit' | 'roll'
type PriceType = 'MKT' | 'LMT'

export function AdjustmentModal({ trade, onClose, onDone }: Props) {
  const parsed = useMemo(() => parseOption(trade.symbol_name), [trade.symbol_name])

  // selectedExpiry must be declared BEFORE useLiveOptionChain so it can be used as the hook argument
  const [selectedExpiry, setSelectedExpiry] = useState(parsed?.rawExpiry ?? '')

  const { chain: liveChain, expiries } = useLiveOptionChain(
    parsed?.index ?? 'NIFTY',
    selectedExpiry,
  )

  const quotes = useMarketStore(s => s.quotes)
  const spot = quotes[parsed?.index ?? '']?.ltp ?? liveChain.spot ?? 0
  const ltp = quotes[trade.symbol_name]?.ltp ?? 0

  const absQty = Math.abs(trade.total_quantity)
  const isLong = trade.total_quantity > 0
  const unrealized = ltp && trade.avg_entry_price
    ? trade.total_quantity * (ltp - (isLong ? trade.avg_entry_price : (trade.avg_exit_price ?? trade.avg_entry_price)))
    : trade.unrealized_pnl

  // State
  const [mode, setMode] = useState<Mode>('exit')
  const [priceType, setPriceType] = useState<PriceType>('MKT')
  const [limitPrice, setLimitPrice] = useState(ltp > 0 ? ltp : trade.avg_entry_price)
  const [exitQty, setExitQty] = useState(absQty)
  const [rollStrike, setRollStrike] = useState<number | null>(null)
  const [rollPriceType, setRollPriceType] = useState<PriceType>('MKT')
  const [placing, setPlacing] = useState(false)

  // Sync selectedExpiry when live expiries arrive and current value is empty
  useEffect(() => {
    if (expiries.length > 0 && !selectedExpiry) setSelectedExpiry(expiries[0])
  }, [expiries, selectedExpiry])

  // Roll: get new strike's LTP from chain
  const rollChainRow = useMemo(() => {
    if (!rollStrike) return null
    return liveChain.rows.find(r => r.strike === rollStrike) ?? null
  }, [rollStrike, liveChain])

  const rollLtp = useMemo(() => {
    if (!rollChainRow || !parsed) return 0
    const side = parsed.optType === 'CE' ? rollChainRow.call : rollChainRow.put
    return side?.ltp ?? 0
  }, [rollChainRow, parsed])

  // Net premium for roll (credit = positive)
  const rollNetPremium = useMemo(() => {
    if (!parsed) return 0
    const exitPremium = ltp > 0 ? ltp : trade.avg_entry_price
    // If we were long CE: exit by selling (credit = exitPremium), enter new by buying (debit = rollLtp)
    // net = exitPremium - rollLtp (positive = credit, negative = debit)
    return isLong
      ? (exitPremium - rollLtp) * exitQty
      : (rollLtp - exitPremium) * exitQty
  }, [isLong, ltp, trade.avg_entry_price, rollLtp, exitQty, parsed])

  // ── Place orders ──────────────────────────────────────────────────────────

  const exitSide = isLong ? 'SELL' : 'BUY'
  const entrySide = isLong ? 'BUY' : 'SELL'

  async function handleExit() {
    if (!parsed) { toast.error('Cannot parse symbol'); return }
    setPlacing(true)
    try {
      await placeOrderApi({
        txnType: exitSide,
        quantity: exitQty,
        priceType,
        price: priceType === 'LMT' ? limitPrice : 0,
        triggerPrice: 0,
        symbolName: trade.symbol_name,
        lot: 1,
        brokerName: trade.broker_name,
        indexName: parsed.index,
      })
      toast.success(`Exit order placed — ${exitQty} × ${trade.symbol_name}`)
      onDone()
      onClose()
    } catch {
      toast.error('Order placement failed')
    } finally {
      setPlacing(false)
    }
  }

  async function handleRoll() {
    if (!parsed || !rollStrike) { toast.error('Select a target strike first'); return }
    const rollSymbol = buildSymbol(parsed.index, parsed.rawExpiry, parsed.optType, rollStrike)
    setPlacing(true)
    try {
      // Step 1: exit current position
      await placeOrderApi({
        txnType: exitSide,
        quantity: exitQty,
        priceType: rollPriceType,
        price: 0,
        triggerPrice: 0,
        symbolName: trade.symbol_name,
        lot: 1,
        brokerName: trade.broker_name,
        indexName: parsed.index,
      })
      // Step 2: enter new position at roll strike
      await placeOrderApi({
        txnType: entrySide,
        quantity: exitQty,
        priceType: rollPriceType,
        price: 0,
        triggerPrice: 0,
        symbolName: rollSymbol,
        lot: 1,
        brokerName: trade.broker_name,
        indexName: parsed.index,
      })
      toast.success(`Rolled to ${parsed.optType} ${rollStrike.toLocaleString('en-IN')}`)
      onDone()
      onClose()
    } catch {
      toast.error('Roll order failed')
    } finally {
      setPlacing(false)
    }
  }

  // ── Dismiss on Escape ──────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  if (!parsed) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center max-w-sm w-full">
          <p className="text-slate-500 dark:text-white/40 text-sm mb-4">Cannot parse option symbol for adjustment</p>
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-bold">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ minHeight: 520 }}
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h2 className="text-[14px] font-black text-slate-900 dark:text-white">
                Adjust Position
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-white/35">
                {parsed.index} · {parsed.optType} {parsed.strike.toLocaleString('en-IN')} · {isLong ? '↑ Long' : '↓ Short'} {absQty} qty
              </p>
            </div>
          </div>

          {/* Live P&L chip */}
          <div className="flex items-center gap-3">
            {ltp > 0 && (
              <div className="text-right">
                <div className={clsx('text-[15px] font-black tabular-nums', pnlCls(unrealized))}>
                  {unrealized >= 0 ? '+' : '−'}₹{INR(Math.abs(unrealized))}
                </div>
                <div className="text-[9px] text-slate-400 dark:text-white/25">unrealized P&L</div>
              </div>
            )}
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-white/[0.07] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0">

          {/* Left: Option chain */}
          <div className="flex flex-col flex-1 border-r border-slate-100 dark:border-white/[0.06] min-h-0">
            {/* Chain header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.06] shrink-0 bg-slate-50/60 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-slate-700 dark:text-white/70">{parsed.index}</span>
                {spot > 0 && (
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-white/35 tabular-nums">
                    @ {spot.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              {/* Expiry pills */}
              <div className="flex items-center gap-1 overflow-x-auto">
                {expiries.slice(0, 4).map(exp => (
                  <button
                    key={exp}
                    onClick={() => setSelectedExpiry(exp)}
                    className={clsx(
                      'px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap transition-colors',
                      selectedExpiry === exp
                        ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400'
                        : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]',
                    )}
                  >
                    {exp}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'roll' && (
              <div className="px-4 py-2 bg-emerald-50/60 dark:bg-emerald-900/10 border-b border-emerald-100 dark:border-emerald-900/20 shrink-0">
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                  Click a strike to select your roll target
                  {rollStrike && ` — currently: ${parsed.optType} ${rollStrike.toLocaleString('en-IN')}`}
                </p>
              </div>
            )}

            {/* Chain table */}
            <OptionChainGrid
              index={parsed.index}
              expiry={selectedExpiry}
              currentStrike={parsed.strike}
              currentOptType={parsed.optType}
              rollStrike={rollStrike}
              onSelectRollStrike={setRollStrike}
              mode={mode}
            />
          </div>

          {/* Right: Action panel */}
          <div className="w-72 shrink-0 flex flex-col p-5 gap-4 overflow-y-auto">

            {/* Position summary */}
            <div className="rounded-xl border border-slate-100 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.025] p-3.5 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 mb-1">
                Current Position
              </p>
              {[
                { label: 'Symbol', value: `${parsed.strike.toLocaleString('en-IN')} ${parsed.optType}` },
                { label: 'Direction', value: isLong ? '↑ Long (BUY)' : '↓ Short (SELL)' },
                { label: 'Qty', value: absQty.toString() },
                { label: 'Entry', value: `₹${trade.avg_entry_price.toFixed(2)}` },
                { label: 'LTP', value: ltp > 0 ? `₹${ltp.toFixed(2)}` : '—' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 dark:text-white/30">{r.label}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{r.value}</span>
                </div>
              ))}
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07]">
              {(['exit', 'roll'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={clsx(
                    'flex-1 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-all',
                    mode === m
                      ? 'bg-white dark:bg-white/[0.12] text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50',
                  )}
                >
                  {m === 'exit' ? '⬢ Exit' : '↔ Roll'}
                </button>
              ))}
            </div>

            {/* ── Exit mode ── */}
            {mode === 'exit' && (
              <div className="space-y-3">
                {/* Qty */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/30 mb-1.5">
                    Exit Quantity
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={absQty}
                      value={exitQty}
                      onChange={e => setExitQty(Math.min(absQty, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="flex-1 h-9 px-3 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.05] text-slate-800 dark:text-white text-sm font-semibold outline-none focus:border-brand-400 dark:focus:border-brand-500 tabular-nums"
                    />
                    <button
                      onClick={() => setExitQty(absQty)}
                      className="h-9 px-2.5 rounded-xl border border-slate-200 dark:border-white/[0.1] text-[10px] font-bold text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors whitespace-nowrap"
                    >
                      Full
                    </button>
                  </div>
                  {exitQty < absQty && (
                    <p className="mt-1 text-[10px] text-amber-500 dark:text-amber-400">
                      Partial exit — {absQty - exitQty} qty remains open
                    </p>
                  )}
                </div>

                {/* Price type */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/30 mb-1.5">
                    Order Type
                  </label>
                  <div className="flex gap-1.5">
                    {(['MKT', 'LMT'] as PriceType[]).map(pt => (
                      <button
                        key={pt}
                        onClick={() => setPriceType(pt)}
                        className={clsx(
                          'flex-1 h-8 rounded-lg text-[11px] font-bold transition-all',
                          priceType === pt
                            ? 'bg-brand-500 text-white shadow-sm'
                            : 'border border-slate-200 dark:border-white/[0.1] text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.05]',
                        )}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>
                </div>

                {priceType === 'LMT' && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/30 mb-1.5">
                      Limit Price
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={limitPrice}
                      onChange={e => setLimitPrice(parseFloat(e.target.value) || 0)}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.05] text-slate-800 dark:text-white text-sm font-semibold outline-none focus:border-brand-400 dark:focus:border-brand-500 tabular-nums"
                    />
                  </div>
                )}

                {/* Preview */}
                <div className="rounded-xl bg-slate-50 dark:bg-white/[0.025] border border-slate-100 dark:border-white/[0.06] p-3 space-y-1">
                  <p className="text-[10px] text-slate-400 dark:text-white/25 font-semibold">Order Preview</p>
                  <p className="text-[12px] font-black text-slate-800 dark:text-white">
                    {exitSide} {exitQty} × {parsed.strike.toLocaleString('en-IN')} {parsed.optType}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-white/35">
                    {priceType === 'MKT' ? 'Market order' : `Limit @ ₹${limitPrice.toFixed(2)}`}
                  </p>
                  {ltp > 0 && exitQty > 0 && (
                    <p className={clsx('text-[11px] font-semibold', pnlCls(unrealized))}>
                      Est. P&L: {unrealized >= 0 ? '+' : '−'}₹{INR(Math.abs(unrealized))}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleExit}
                  disabled={placing}
                  className={clsx(
                    'w-full h-10 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                    exitSide === 'SELL'
                      ? 'bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-500/25'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/25',
                    placing && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  {placing ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-6-8.49" />
                      </svg>
                      Placing…
                    </>
                  ) : (
                    `${exitSide} ${exitQty} — Exit Position`
                  )}
                </button>
              </div>
            )}

            {/* ── Roll mode ── */}
            {mode === 'roll' && (
              <div className="space-y-3">
                {/* Current leg summary */}
                <div className="rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-900/30 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-1">Exit (Step 1)</p>
                  <p className="text-[12px] font-bold text-red-700 dark:text-red-400">
                    {exitSide} {exitQty} × {parsed.strike.toLocaleString('en-IN')} {parsed.optType}
                  </p>
                  <p className="text-[10px] text-red-400 mt-0.5">Market order</p>
                </div>

                {rollStrike ? (
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-900/30 p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-1">Enter (Step 2)</p>
                    <p className="text-[12px] font-bold text-emerald-700 dark:text-emerald-400">
                      {entrySide} {exitQty} × {rollStrike.toLocaleString('en-IN')} {parsed.optType}
                    </p>
                    {rollLtp > 0 && (
                      <p className="text-[10px] text-emerald-500 mt-0.5">LTP: ₹{rollLtp.toFixed(2)}</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-white/[0.08] p-4 text-center">
                    <p className="text-[11px] text-slate-400 dark:text-white/25">← Click a strike in the chain</p>
                  </div>
                )}

                {/* Net premium */}
                {rollStrike && (
                  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.025] border border-slate-100 dark:border-white/[0.06] p-3">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 dark:text-white/30">Net premium</span>
                      <span className={clsx('font-black tabular-nums', pnlCls(rollNetPremium))}>
                        {rollNetPremium >= 0 ? '+' : '−'}₹{INR(Math.abs(rollNetPremium))}
                        <span className="text-[9px] font-normal ml-1">
                          {rollNetPremium >= 0 ? 'credit' : 'debit'}
                        </span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Qty */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/30 mb-1.5">
                    Roll Quantity
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={absQty}
                      value={exitQty}
                      onChange={e => setExitQty(Math.min(absQty, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="flex-1 h-9 px-3 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.05] text-slate-800 dark:text-white text-sm font-semibold outline-none focus:border-brand-400 tabular-nums"
                    />
                    <button
                      onClick={() => setExitQty(absQty)}
                      className="h-9 px-2.5 rounded-xl border border-slate-200 dark:border-white/[0.1] text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
                    >
                      Full
                    </button>
                  </div>
                </div>

                {/* Price type for roll */}
                <div className="flex gap-1.5">
                  {(['MKT', 'LMT'] as PriceType[]).map(pt => (
                    <button
                      key={pt}
                      onClick={() => setRollPriceType(pt)}
                      className={clsx(
                        'flex-1 h-8 rounded-lg text-[11px] font-bold transition-all',
                        rollPriceType === pt
                          ? 'bg-brand-500 text-white shadow-sm'
                          : 'border border-slate-200 dark:border-white/[0.1] text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.05]',
                      )}
                    >
                      {pt}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleRoll}
                  disabled={placing || !rollStrike}
                  className={clsx(
                    'w-full h-10 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                    rollStrike
                      ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                      : 'bg-slate-100 dark:bg-white/[0.05] text-slate-400 cursor-not-allowed',
                    placing && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  {placing ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-6-8.49" />
                      </svg>
                      Rolling…
                    </>
                  ) : rollStrike ? (
                    `Roll → ${parsed.optType} ${rollStrike.toLocaleString('en-IN')}`
                  ) : (
                    'Select target strike'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
