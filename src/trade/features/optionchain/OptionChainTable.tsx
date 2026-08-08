import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { clsx } from 'clsx'
import type { OcSide, OptionChain, OptType, Side } from '../../types/options'
import { netQty, type Position } from '../tradebook/types'

/** A rolled position: exit `fromStrike`, enter `toStrike`, same option side, `qty` (signed net). */
export interface AdjustMove { optType: OptType; fromStrike: number; toStrike: number; qty: number }

interface Props {
  chain: OptionChain
  expiries: string[]
  compact?: boolean
  expiry: string
  onExpiry: (e: string) => void
  onAction: (strike: number, optType: OptType, side: Side, ltp: number, iv: number) => void
  onWatch?: (strike: number, optType: OptType, ltp: number, iv: number) => void
  onChart?: (strike: number, optType: OptType) => void
  /** Net running qty per option, keyed `${optType}-${strike}` (positive = long/Buy, negative = short/Sell). */
  positions?: Map<string, number>
  /** Called when the user confirms drag-adjusted (rolled) positions. */
  onAdjustConfirm?: (moves: AdjustMove[]) => void
}

/** Build the running-position map for the given index (expiry-agnostic — the chain shows one expiry at a time). */
export function buildPositionMap(positions: Position[], indexName: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of positions) {
    if (p.indexName !== indexName) continue
    const parts = p.symbol.split('_')
    const optType = parts[parts.length - 2]
    const strike = parseInt(parts[parts.length - 1], 10)
    if ((optType !== 'CE' && optType !== 'PE') || isNaN(strike)) continue
    const q = netQty(p)
    if (q === 0) continue
    const k = `${optType}-${strike}`
    m.set(k, (m.get(k) ?? 0) + q)
  }
  return m
}

/** Running-position chip pinned to the row's outer edge — B (long, cyan) / S (short, rose) with net qty. */
function PosTag({ qty, side }: { qty: number; side: 'ce' | 'pe' }) {
  const buy = qty > 0
  return (
    <span
      title={`Running ${buy ? 'long (Buy)' : 'short (Sell)'} · ${Math.abs(qty)}`}
      className={clsx(
        'pointer-events-none absolute top-1/2 -translate-y-1/2 z-10 inline-flex items-center gap-0.5 h-[17px] px-1.5 text-[10px] font-bold leading-none tabular-nums shadow-sm',
        side === 'ce' ? 'left-0 rounded-r-md' : 'right-0 rounded-l-md',
        buy ? 'bg-cyan-500 text-white' : 'bg-rose-500 text-white',
      )}
    >
      {buy ? 'B' : 'S'}<span className="opacity-90">{Math.abs(qty)}</span>
    </span>
  )
}

/** Grey placeholder that replaces market data while in adjust mode. */
function GreyBlock({ align }: { align: 'right' | 'left' }) {
  return (
    <div className={clsx('flex items-center px-2', align === 'right' ? 'justify-end' : 'justify-start')}>
      <span className="h-3.5 w-11 rounded bg-slate-100 dark:bg-white/[0.06]" />
    </div>
  )
}

/** Draggable position card shown in adjust mode — B/S, qty, and a grip handle.
 *  `ghost` renders a faint, non-draggable "moved from here" marker at the origin strike. */
function PosDragCard({ qty, side, moved, dragging, ghost, onDragStart, onDragEnd }: {
  qty: number; side: 'ce' | 'pe'; moved?: boolean; dragging?: boolean; ghost?: boolean
  onDragStart?: () => void; onDragEnd?: () => void
}) {
  const buy = qty > 0
  const grip = <svg viewBox="0 0 24 24" className="h-3 w-3 opacity-70" fill="currentColor"><circle cx="9" cy="5" r="1.4" /><circle cx="15" cy="5" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="19" r="1.4" /><circle cx="15" cy="19" r="1.4" /></svg>
  return (
    <div
      draggable={!ghost}
      onDragStart={ghost ? undefined : onDragStart}
      onDragEnd={ghost ? undefined : onDragEnd}
      title={ghost ? 'Moved from here' : undefined}
      className={clsx(
        'absolute top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 h-7 pl-1.5 pr-2 rounded-lg select-none transition-all',
        side === 'ce' ? 'left-1' : 'right-1',
        ghost
          ? clsx('z-10 opacity-35 border border-dashed', buy ? 'border-cyan-400 text-cyan-600 dark:text-cyan-400' : 'border-rose-400 text-rose-600 dark:text-rose-400')
          : clsx('z-30 cursor-grab active:cursor-grabbing ring-1 shadow-sm',
              buy ? 'bg-cyan-50 dark:bg-cyan-950/40 ring-cyan-300 dark:ring-cyan-800 text-cyan-700 dark:text-cyan-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 ring-rose-300 dark:ring-rose-800 text-rose-700 dark:text-rose-300'),
        dragging && 'opacity-40',
        moved && !ghost && 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-900',
      )}
    >
      <span className="text-slate-400 dark:text-slate-500">{grip}</span>
      <span className={clsx('h-4 w-4 rounded grid place-items-center text-[10px] font-black text-white', buy ? 'bg-cyan-500' : 'bg-rose-500', ghost && 'opacity-70')}>{buy ? 'B' : 'S'}</span>
      <span className="text-[12px] font-bold tabular-nums">{qty > 0 ? '+' : '−'}{Math.abs(qty)}</span>
    </div>
  )
}

/** OI in lakhs, 2 decimals. Returns '—' when the feed hasn't provided OI. */
const lakh = (oi?: number) => (oi == null ? '—' : (oi / 1e5).toFixed(2))
const px2 = (n?: number) => (n == null ? '—' : n.toFixed(2))

const ROW_H = 44
const STRIKE_W = 64
const IV_W = 34

function marker(strike: number, c: OptionChain): { label: string; cls: string } | null {
  if (strike === c.maxPain) return { label: 'Max Pain', cls: 'text-amber-700 dark:text-amber-400' }
  if (strike === c.oiSupport) return { label: 'OI Support', cls: 'text-green-700 dark:text-green-400' }
  if (strike === c.oiResistance) return { label: 'OI Resist', cls: 'text-red-700 dark:text-red-400' }
  return null
}

function Cell({ value, chg, align, strong }: { value: string; chg?: number; align: 'right' | 'left'; strong?: boolean }) {
  return (
    <div className={clsx('flex flex-col justify-center min-w-0 px-2', align === 'right' ? 'items-end' : 'items-start')}>
      <span className={clsx('max-w-full truncate text-[11px] tabular-nums leading-tight text-slate-800 dark:text-slate-100', strong ? 'font-semibold' : 'font-medium')}>{value}</span>
      {chg != null && (
        <span className={clsx('max-w-full truncate text-[9px] tabular-nums leading-tight', chg >= 0 ? 'text-green-600' : 'text-red-600')}>{chg >= 0 ? '+' : ''}{chg}%</span>
      )}
    </div>
  )
}

function IvCell({ iv, align }: { iv?: number; align: 'right' | 'left' }) {
  return <div className={clsx('flex items-center min-w-0 px-1 text-[10px] tabular-nums text-slate-400', align === 'right' ? 'justify-end' : 'justify-start')}>{iv == null ? '—' : iv.toFixed(1)}</div>
}

function Actions({ side, onBuy, onSell, onChart, onWatch, onAdjust }: {
  side: 'ce' | 'pe'; onBuy: () => void; onSell: () => void; onChart: () => void; onWatch: () => void; onAdjust?: () => void
}) {
  const icon = 'h-5 w-5 rounded grid place-items-center bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
  return (
    <div className={clsx(
      'absolute top-1/2 -translate-y-1/2 z-20 hidden items-center gap-0.5 p-0.5 rounded-lg bg-white dark:bg-slate-800 shadow-md ring-1 ring-slate-200 dark:ring-slate-600',
      side === 'ce' ? 'right-0.5 group-hover/ce:flex' : 'left-0.5 group-hover/pe:flex',
    )}>
      <button onClick={(e) => { e.stopPropagation(); onBuy() }} className="h-5 w-5 rounded bg-cyan-500 hover:bg-cyan-600 text-white text-[10px] font-bold">B</button>
      <button onClick={(e) => { e.stopPropagation(); onSell() }} className="h-5 w-5 rounded bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold">S</button>
      <button onClick={(e) => { e.stopPropagation(); onChart() }} title="Chart" className={icon}>
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-6 4 3 5-7 4 5" /></svg>
      </button>
      <button onClick={(e) => { e.stopPropagation(); onWatch() }} title="Add to watchlist" className={icon}>
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" /></svg>
      </button>
      <button onClick={(e) => { e.stopPropagation(); onAdjust?.() }} title="Adjust" className={icon}>
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="3" x2="12" y2="8" /><line x1="9.5" y1="5.5" x2="14.5" y2="5.5" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="9.5" y1="18.5" x2="14.5" y2="18.5" />
        </svg>
      </button>
    </div>
  )
}

export function OptionChainTable({ chain, expiries, compact, expiry, onExpiry, onAction, onWatch, onChart, positions, onAdjustConfirm }: Props) {
  const { rows, spot, atm } = chain
  const cols = compact
    ? `minmax(0,1fr) minmax(0,1fr) ${STRIKE_W}px minmax(0,1fr) minmax(0,1fr)`
    : `${IV_W}px minmax(0,1fr) minmax(0,1fr) ${STRIKE_W}px minmax(0,1fr) minmax(0,1fr) ${IV_W}px`
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: cols }
  const cellCls = 'group/ce relative flex flex-col justify-center min-w-0'
  const pcellCls = 'group/pe relative flex flex-col justify-center min-w-0'

  // ── Adjust mode (drag positions to roll them) ──
  const [adjust, setAdjust] = useState(false)
  const posList = useMemo(() => {
    const out: { key: string; optType: OptType; fromStrike: number; qty: number }[] = []
    positions?.forEach((qty, key) => {
      const [optType, s] = key.split('-')
      if ((optType === 'CE' || optType === 'PE') && qty !== 0) out.push({ key, optType, fromStrike: Number(s), qty })
    })
    return out
  }, [positions])
  const [targets, setTargets] = useState<Map<string, number>>(new Map())
  const dragKey = useRef<string | null>(null)
  const [dropStrike, setDropStrike] = useState<number | null>(null)
  const posKey = useMemo(() => posList.map(p => `${p.key}:${p.qty}`).sort().join(','), [posList])
  useEffect(() => { if (adjust) setTargets(new Map(posList.map(p => [p.key, p.fromStrike]))) }, [adjust, posKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const targetOf = (p: { key: string; fromStrike: number }) => targets.get(p.key) ?? p.fromStrike
  const cardAt = (optType: OptType, strike: number) => posList.find(p => p.optType === optType && targetOf(p) === strike)
  // A faint marker at a position's ORIGINAL strike once it's been moved elsewhere.
  const ghostAt = (optType: OptType, strike: number) => posList.find(p => p.optType === optType && p.fromStrike === strike && targetOf(p) !== p.fromStrike)
  const moves = useMemo(() => posList.filter(p => targetOf(p) !== p.fromStrike).map(p => ({ optType: p.optType, fromStrike: p.fromStrike, toStrike: targetOf(p), qty: p.qty })), [posList, targets]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasMoves = moves.length > 0
  function dropOn(strike: number) {
    setDropStrike(null)
    const k = dragKey.current
    dragKey.current = null
    if (!k) return
    setTargets(prev => { const n = new Map(prev); n.set(k, strike); return n })
  }
  function confirmAdjust() { if (hasMoves) onAdjustConfirm?.(moves); setAdjust(false) }
  function exitAdjust() { setAdjust(false); setTargets(new Map()); dragKey.current = null; setDropStrike(null) }

  // Center the ATM strike in the scroll viewport whenever the chain / index / expiry loads.
  const scrollRef = useRef<HTMLDivElement>(null)
  const atmRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const c = scrollRef.current, a = atmRef.current
    if (!c || !a) return
    const id = requestAnimationFrame(() => {
      const cr = c.getBoundingClientRect(), ar = a.getBoundingClientRect()
      c.scrollTop += (ar.top - cr.top) - (c.clientHeight / 2 - ar.height / 2)
    })
    return () => cancelAnimationFrame(id)
  }, [atm, rows.length, expiry])

  let spotDrawn = false

  return (
    <div className="flex flex-col h-full bg-white dark:bg-card-dark">
      {/* Call / Expiry / Put title bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <span className="flex items-center gap-1 text-xs font-semibold text-green-600"><svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>Calls</span>
        <div className="relative">
          <select
            value={expiry}
            onChange={(e) => onExpiry(e.target.value)}
            disabled={expiries.length === 0}
            className="appearance-none bg-slate-100 dark:bg-white/5 rounded-md pl-3 pr-7 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer disabled:opacity-50"
          >
            {expiries.length === 0 ? <option value="">—</option> : expiries.map((e) => <option key={e}>{e}</option>)}
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

      {/* Rows / empty state */}
      {rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center px-6 text-slate-400">
          <svg viewBox="0 0 24 24" className="h-8 w-8 mb-1 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 5h16v14H4zM4 10h16M12 5v14" /></svg>
          <p className="text-sm font-medium">No option-chain data yet</p>
          <p className="text-xs">Waiting for the live feed. Outside market hours the last saved snapshot appears here.</p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {rows.map((r) => {
            const banner = !spotDrawn && spot > 0 && r.strike > spot
            if (banner) spotDrawn = true
            const isAtm = r.strike === atm
            const ceItm = spot > 0 && r.strike < spot
            const peItm = spot > 0 && r.strike > spot
            const mk = marker(r.strike, chain)
            const ce: OcSide | undefined = r.call
            const pe: OcSide | undefined = r.put
            const posCe = positions?.get(`CE-${r.strike}`)
            const posPe = positions?.get(`PE-${r.strike}`)
            const ceCard = adjust ? cardAt('CE', r.strike) : undefined
            const peCard = adjust ? cardAt('PE', r.strike) : undefined
            const ceGhost = adjust ? ghostAt('CE', r.strike) : undefined
            const peGhost = adjust ? ghostAt('PE', r.strike) : undefined
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
                <div
                  ref={isAtm ? atmRef : undefined}
                  style={{ ...grid, height: ROW_H }}
                  onDragOver={adjust ? (e) => { if (dragKey.current) { e.preventDefault(); setDropStrike(r.strike) } } : undefined}
                  onDrop={adjust ? (e) => { e.preventDefault(); dropOn(r.strike) } : undefined}
                  className={clsx('relative items-stretch border-b border-slate-100 dark:border-slate-800/60',
                    isAtm && 'bg-amber-50/70 dark:bg-amber-900/15',
                    adjust && dropStrike === r.strike && 'bg-indigo-50 dark:bg-indigo-900/25 ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700')}
                >
                  {!adjust && posCe != null && <PosTag qty={posCe} side="ce" />}
                  {!adjust && posPe != null && <PosTag qty={posPe} side="pe" />}
                  {adjust && ceGhost && !ceCard && <PosDragCard qty={ceGhost.qty} side="ce" ghost />}
                  {adjust && peGhost && !peCard && <PosDragCard qty={peGhost.qty} side="pe" ghost />}
                  {adjust && ceCard && <PosDragCard qty={ceCard.qty} side="ce" moved={targetOf(ceCard) !== ceCard.fromStrike} dragging={dragKey.current === ceCard.key} onDragStart={() => { dragKey.current = ceCard.key }} onDragEnd={() => { dragKey.current = null; setDropStrike(null) }} />}
                  {adjust && peCard && <PosDragCard qty={peCard.qty} side="pe" moved={targetOf(peCard) !== peCard.fromStrike} dragging={dragKey.current === peCard.key} onDragStart={() => { dragKey.current = peCard.key }} onDragEnd={() => { dragKey.current = null; setDropStrike(null) }} />}

                  {/* IV (call) */}
                  {!compact && (adjust ? <GreyBlock align="right" /> : <div className={clsx('flex items-center min-w-0', ceItm && 'bg-emerald-50/40 dark:bg-emerald-900/10')}><IvCell iv={ce?.iv} align="right" /></div>)}
                  {/* OI (call) */}
                  {adjust ? <GreyBlock align="right" /> : (
                    <div className={clsx(cellCls, ceItm && 'bg-emerald-50/40 dark:bg-emerald-900/10')}><Cell value={lakh(ce?.oi)} chg={ce?.oiChgPct} align="right" /></div>
                  )}
                  {/* LTP (call) */}
                  {adjust ? <GreyBlock align="right" /> : (
                    <div className={clsx(cellCls, ceItm && 'bg-emerald-50/40 dark:bg-emerald-900/10')}>
                      <Cell value={px2(ce?.ltp)} chg={ce?.ltpChgPct} align="right" strong />
                      {ce && <Actions side="ce" onBuy={() => onAction(r.strike, 'CE', 'BUY', ce.ltp, ce.iv ?? 0)} onSell={() => onAction(r.strike, 'CE', 'SELL', ce.ltp, ce.iv ?? 0)} onChart={() => onChart?.(r.strike, 'CE')} onWatch={() => onWatch?.(r.strike, 'CE', ce.ltp, ce.iv ?? 0)} onAdjust={() => setAdjust(true)} />}
                    </div>
                  )}

                  {/* Strike */}
                  <div className={clsx('flex flex-col items-center justify-center min-w-0 border-x border-slate-200 dark:border-slate-700', isAtm ? 'bg-amber-100/70 dark:bg-amber-800/25' : 'bg-slate-50 dark:bg-white/[0.03]')}>
                    <span className={clsx('text-[13px] font-bold tabular-nums leading-none', isAtm ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200')}>{r.strike}</span>
                    {mk && !adjust && <span className={clsx('mt-0.5 text-[8px] font-semibold leading-none whitespace-nowrap', mk.cls)}>{mk.label}</span>}
                  </div>

                  {/* LTP (put) */}
                  {adjust ? <GreyBlock align="left" /> : (
                    <div className={clsx(pcellCls, peItm && 'bg-rose-50/40 dark:bg-rose-900/10')}>
                      <Cell value={px2(pe?.ltp)} chg={pe?.ltpChgPct} align="left" strong />
                      {pe && <Actions side="pe" onBuy={() => onAction(r.strike, 'PE', 'BUY', pe.ltp, pe.iv ?? 0)} onSell={() => onAction(r.strike, 'PE', 'SELL', pe.ltp, pe.iv ?? 0)} onChart={() => onChart?.(r.strike, 'PE')} onWatch={() => onWatch?.(r.strike, 'PE', pe.ltp, pe.iv ?? 0)} onAdjust={() => setAdjust(true)} />}
                    </div>
                  )}
                  {/* OI (put) */}
                  {adjust ? <GreyBlock align="left" /> : (
                    <div className={clsx(pcellCls, peItm && 'bg-rose-50/40 dark:bg-rose-900/10')}><Cell value={lakh(pe?.oi)} chg={pe?.oiChgPct} align="left" /></div>
                  )}
                  {/* IV (put) */}
                  {!compact && (adjust ? <GreyBlock align="left" /> : <div className={clsx('flex items-center min-w-0', peItm && 'bg-rose-50/40 dark:bg-rose-900/10')}><IvCell iv={pe?.iv} align="left" /></div>)}
                </div>
              </Fragment>
            )
          })}
        </div>
      )}

      {/* Adjust-mode confirm bar */}
      {adjust && (
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/60">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l4-4 4 4M9 5v14" /><path d="M19 15l-4 4-4-4M15 19V5" /></svg>
              Adjust mode
            </span>
            <span className="text-[11px] text-slate-400">{hasMoves ? `${moves.length} position${moves.length > 1 ? 's' : ''} rolled` : 'Drag a position to a new strike'}</span>
          </div>
          <div className="flex items-center justify-end gap-2 px-3 py-2">
            <button onClick={confirmAdjust} disabled={!hasMoves}
              className={clsx('h-8 px-5 rounded-lg text-sm font-bold text-white transition-colors', hasMoves ? 'bg-brand-600 hover:bg-brand-700 shadow-sm' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed')}>
              Confirm
            </button>
            <button onClick={exitAdjust} className="h-8 px-5 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">Dismiss</button>
            <button onClick={() => setTargets(new Map(posList.map(p => [p.key, p.fromStrike])))} disabled={!hasMoves} title="Reset"
              className={clsx('h-8 w-8 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 transition-colors', hasMoves ? 'text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5' : 'text-slate-300 dark:text-slate-600 cursor-not-allowed')}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 109-9 9 9 0 00-6.3 2.6L3 8" /><path d="M3 3v5h5" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
