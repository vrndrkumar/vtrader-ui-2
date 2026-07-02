import { Fragment, type CSSProperties } from 'react'
import { clsx } from 'clsx'
import type { OptionChain, OptType, Side } from '../../types/options'
import { EXPIRIES } from '../../types/options'

interface Props {
  chain: OptionChain
  compact?: boolean
  expiry: string
  onExpiry: (e: string) => void
  onAction: (strike: number, optType: OptType, side: Side, ltp: number, iv: number) => void
  onWatch?: (strike: number, optType: OptType, ltp: number, iv: number) => void
  onChart?: (strike: number, optType: OptType) => void
}

/** OI in lakhs, 2 decimals — keeps decimals vertically aligned. */
const lakh = (oi: number) => (oi / 1e5).toFixed(2)

const ROW_H = 44 // px — fixed row height so dynamic updates never shift layout
const STRIKE_W = 64
const IV_W = 34

function marker(strike: number, c: OptionChain): { label: string; cls: string } | null {
  if (strike === c.maxPain) return { label: 'Max Pain', cls: 'text-amber-700 dark:text-amber-400' }
  if (strike === c.oiSupport) return { label: 'OI Support', cls: 'text-green-700 dark:text-green-400' }
  if (strike === c.oiResistance) return { label: 'OI Resist', cls: 'text-red-700 dark:text-red-400' }
  return null
}

/** One numeric cell: value on top, change% below. min-w-0 + truncate = no reflow. */
function Cell({ value, chg, align, strong }: { value: string; chg: number; align: 'right' | 'left'; strong?: boolean }) {
  return (
    <div className={clsx('flex flex-col justify-center min-w-0 overflow-hidden px-2', align === 'right' ? 'items-end' : 'items-start')}>
      <span className={clsx('max-w-full truncate text-[11px] tabular-nums leading-tight text-slate-800 dark:text-slate-100', strong ? 'font-semibold' : 'font-medium')}>{value}</span>
      <span className={clsx('max-w-full truncate text-[9px] tabular-nums leading-tight', chg >= 0 ? 'text-green-600' : 'text-red-600')}>{chg >= 0 ? '+' : ''}{chg}%</span>
    </div>
  )
}

function IvCell({ iv, align }: { iv: number; align: 'right' | 'left' }) {
  return <div className={clsx('flex items-center min-w-0 overflow-hidden px-1 text-[10px] tabular-nums text-slate-400', align === 'right' ? 'justify-end' : 'justify-start')}>{iv.toFixed(1)}</div>
}

function Actions({ side, onBuy, onSell, onChart, onWatch }: {
  side: 'ce' | 'pe'; onBuy: () => void; onSell: () => void; onChart: () => void; onWatch: () => void
}) {
  const icon = 'h-6 w-6 rounded-md grid place-items-center bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
  return (
    <div className={clsx(
      'absolute top-1/2 -translate-y-1/2 z-10 hidden items-center gap-1 p-0.5 rounded-lg bg-white dark:bg-slate-800 shadow-md ring-1 ring-slate-200 dark:ring-slate-600',
      side === 'ce' ? 'right-1 group-hover/ce:flex' : 'left-1 group-hover/pe:flex',
    )}>
      <button onClick={(e) => { e.stopPropagation(); onBuy() }} className="h-6 w-6 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[11px] font-bold">B</button>
      <button onClick={(e) => { e.stopPropagation(); onSell() }} className="h-6 w-6 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold">S</button>
      <button onClick={(e) => { e.stopPropagation(); onChart() }} title="Chart" className={icon}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-6 4 3 5-7 4 5" /></svg>
      </button>
      <button onClick={(e) => { e.stopPropagation(); onWatch() }} title="Add to watchlist" className={icon}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" /></svg>
      </button>
    </div>
  )
}

export function OptionChainTable({ chain, compact, expiry, onExpiry, onAction, onWatch, onChart }: Props) {
  const { rows, spot, atm } = chain
  // minmax(0,1fr) => equal, content-independent tracks. Fixed strike + IV widths.
  const cols = compact
    ? `minmax(0,1fr) minmax(0,1fr) ${STRIKE_W}px minmax(0,1fr) minmax(0,1fr)`
    : `${IV_W}px minmax(0,1fr) minmax(0,1fr) ${STRIKE_W}px minmax(0,1fr) minmax(0,1fr) ${IV_W}px`
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: cols }
  // NOTE: no overflow-hidden here — it would clip the hover Buy/Sell bar.
  // Column stability comes from minmax(0,1fr) tracks + min-w-0 + per-value truncate.
  const cell = 'group/ce relative flex flex-col justify-center min-w-0'
  const pcell = 'group/pe relative flex flex-col justify-center min-w-0'

  let spotDrawn = false

  return (
    <div className="flex flex-col h-full bg-white dark:bg-card-dark">
      {/* Call / Expiry / Put title bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <span className="flex items-center gap-1 text-xs font-semibold text-green-600"><svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>Calls</span>
        <div className="relative">
          <select value={expiry} onChange={(e) => onExpiry(e.target.value)} className="appearance-none bg-slate-100 dark:bg-white/5 rounded-md pl-3 pr-7 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer">
            {EXPIRIES.map((e) => <option key={e}>{e}</option>)}
          </select>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-red-600">Puts<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg></span>
      </div>

      {/* Column headers */}
      <div style={grid} className="shrink-0 h-8 items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/[0.02] text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {!compact && <div className="px-1 text-right truncate">IV</div>}
        <div className="px-2 text-right truncate">OI (L)</div>
        <div className="px-2 text-right truncate">LTP</div>
        <div className="text-center truncate">Strike</div>
        <div className="px-2 text-left truncate">LTP</div>
        <div className="px-2 text-left truncate">OI (L)</div>
        {!compact && <div className="px-1 text-left truncate">IV</div>}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {rows.map((r) => {
          const banner = !spotDrawn && r.strike > spot
          if (banner) spotDrawn = true
          const isAtm = r.strike === atm
          const ceItm = r.strike < spot
          const peItm = r.strike > spot
          const mk = marker(r.strike, chain)
          const ceBg = ceItm ? 'bg-emerald-50/40 dark:bg-emerald-900/10' : ''
          const peBg = peItm ? 'bg-rose-50/40 dark:bg-rose-900/10' : ''
          return (
            <Fragment key={r.strike}>
              {banner && (
                <div className="flex items-center gap-2 px-3 h-6">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 dark:bg-black text-white shadow-sm">
                    <span className="text-[11px] font-bold tabular-nums">{spot.toFixed(2)}</span>
                    <span className={clsx('text-[10px] font-medium tabular-nums', chain.spotChg >= 0 ? 'text-green-400' : 'text-red-400')}>
                      {chain.spotChg >= 0 ? '+' : ''}{chain.spotChg.toFixed(2)} ({chain.spotChgPct}%)
                    </span>
                  </span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>
              )}
              <div style={{ ...grid, height: ROW_H }} className={clsx('items-stretch border-b border-slate-100 dark:border-slate-800/60', isAtm && 'bg-amber-50/70 dark:bg-amber-900/15')}>
                {/* CALL side */}
                {!compact && <div className={clsx('flex items-center min-w-0 overflow-hidden', ceBg)}><IvCell iv={r.call.iv} align="right" /></div>}
                <div className={clsx(cell, ceBg)}>
                  <Cell value={lakh(r.call.oi)} chg={r.call.oiChgPct} align="right" />
                </div>
                <div className={clsx(cell, ceBg)}>
                  <Cell value={r.call.ltp.toFixed(2)} chg={r.call.ltpChgPct} align="right" strong />
                  <Actions side="ce"
                    onBuy={() => onAction(r.strike, 'CE', 'BUY', r.call.ltp, r.call.iv)}
                    onSell={() => onAction(r.strike, 'CE', 'SELL', r.call.ltp, r.call.iv)}
                    onChart={() => onChart?.(r.strike, 'CE')}
                    onWatch={() => onWatch?.(r.strike, 'CE', r.call.ltp, r.call.iv)} />
                </div>

                {/* STRIKE spine */}
                <div className={clsx('flex flex-col items-center justify-center min-w-0 overflow-hidden border-x border-slate-200 dark:border-slate-700', isAtm ? 'bg-amber-100/70 dark:bg-amber-800/25' : 'bg-slate-50 dark:bg-white/[0.03]')}>
                  <span className={clsx('text-[13px] font-bold tabular-nums leading-none', isAtm ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200')}>{r.strike}</span>
                  {mk && <span className={clsx('mt-0.5 text-[8px] font-semibold leading-none whitespace-nowrap', mk.cls)}>{mk.label}</span>}
                </div>

                {/* PUT side */}
                <div className={clsx(pcell, peBg)}>
                  <Cell value={r.put.ltp.toFixed(2)} chg={r.put.ltpChgPct} align="left" strong />
                  <Actions side="pe"
                    onBuy={() => onAction(r.strike, 'PE', 'BUY', r.put.ltp, r.put.iv)}
                    onSell={() => onAction(r.strike, 'PE', 'SELL', r.put.ltp, r.put.iv)}
                    onChart={() => onChart?.(r.strike, 'PE')}
                    onWatch={() => onWatch?.(r.strike, 'PE', r.put.ltp, r.put.iv)} />
                </div>
                <div className={clsx(pcell, peBg)}>
                  <Cell value={lakh(r.put.oi)} chg={r.put.oiChgPct} align="left" />
                </div>
                {!compact && <div className={clsx('flex items-center min-w-0 overflow-hidden', peBg)}><IvCell iv={r.put.iv} align="left" /></div>}
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
