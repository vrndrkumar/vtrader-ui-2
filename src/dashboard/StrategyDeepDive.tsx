// ── StrategyDeepDive.tsx ─────────────────────────────────────────────────────
// v5 — Strategy Management Workspace (side-by-side)
//
//   ┌─ Header: strategy · broker · tag tabs · net P&L ──────────────────────┐
//   │ ┌── Left rail ──────────┐ ║ ┌── Right pane (hero) ─────────────────┐ │
//   │ │ toolbar Add/Exit/Edit │ ║ │ stats strip (MaxP·MaxL·POP·BE)        │ │
//   │ │ position rows          │ ║ │ ECharts payoff (dual curve, zones)    │ │
//   │ │  · checkbox (drives    │ ║ │ compact price + days sliders          │ │
//   │ │    payoff)             │ ║ │  — OR — inline option-chain (Adjust)  │ │
//   │ │  · swipe → Exit/Rev/…  │ ║ └───────────────────────────────────────┘ │
//   │ │ footer: Booked/Unbkd   │ ║  ▲ draggable divider                       │
//   │ └────────────────────────┘                                              │
//   └────────────────────────────────────────────────────────────────────────┘

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { getTrades } from '@/api/reports'
import { placeOrderApi } from '@/api/trade'
import type { Trade } from '@/types/reports'
import { tagFallbackColor } from '@/journal/TagCombobox'
import { useMarketStore } from '@/trade/store/marketStore'
import { useTradebookStore } from '@/trade/features/tradebook/tradebookStore'
import type { Position } from '@/trade/features/tradebook/types'
import { realtime } from '@/trade/data/realtime/realtimeService'
import { useLiveOptionChain } from '@/trade/features/optionchain/useOptionChain'
import { PayoffChart } from '@/trade/features/strategy/PayoffChart'

// ── Constants ─────────────────────────────────────────────────────────────────

const LEG_COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#F97316', '#84CC16', '#14B8A6']
const BROKER_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']
const RAIL_MIN = 300, RAIL_MAX = 560, RAIL_DEFAULT = 380
const RAIL_KEY = 'sdd.railWidth'

// ── Formatters ────────────────────────────────────────────────────────────────

function inr(n: number, compact = false): string {
  const a = Math.abs(n)
  if (compact) {
    if (a >= 100_000) return `${(a / 100_000).toFixed(1)}L`
    if (a >= 1_000)   return `${Math.round(a / 1_000)}K`
    return `${Math.round(a)}`
  }
  return a.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}
const isOpen = (t: Trade) => t.status !== 'CLOSED'

// ── Symbol helpers ────────────────────────────────────────────────────────────

function detectIndex(sym: string): string {
  const u = sym.toUpperCase()
  if (u.startsWith('BANKNIFTY'))  return 'BANKNIFTY'
  if (u.startsWith('MIDCPNIFTY')) return 'MIDCPNIFTY'
  if (u.startsWith('FINNIFTY'))   return 'FINNIFTY'
  if (u.startsWith('NIFTY'))      return 'NIFTY'
  if (u.startsWith('BANKEX'))     return 'BANKEX'
  if (u.startsWith('SENSEX'))     return 'SENSEX'
  return ''
}

interface ParsedOption { index: string; rawExpiry: string; optType: 'CE' | 'PE'; strike: number }

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
function parseDte(rawExpiry: string): number {
  const M: Record<string, number> = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 }
  try {
    const d = parseInt(rawExpiry.slice(0, 2))
    const m = M[rawExpiry.slice(2, 5).toUpperCase()] ?? 6
    const y = 2000 + parseInt(rawExpiry.slice(5, 7))
    return Math.max(0, Math.ceil((new Date(y, m, d).getTime() - Date.now()) / 86400000))
  } catch { return 21 }
}

// ── Black-Scholes ─────────────────────────────────────────────────────────────

function ncdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}
function bsPrice(S: number, K: number, T: number, sigma: number, type: 'CE' | 'PE'): number {
  if (T <= 0 || sigma <= 0) return type === 'CE' ? Math.max(S - K, 0) : Math.max(K - S, 0)
  const sq = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (0.065 + sigma * sigma / 2) * T) / (sigma * sq)
  const d2 = d1 - sigma * sq
  const df = Math.exp(-0.065 * T)
  return type === 'CE' ? S * ncdf(d1) - K * df * ncdf(d2) : K * df * ncdf(-d2) - S * ncdf(-d1)
}

// ── LTP utilities ─────────────────────────────────────────────────────────────

type LtpMap = Map<string, number>
function buildLtpMap(quotes: Record<string, { ltp: number }>, positions: Position[]): LtpMap {
  const m: LtpMap = new Map()
  for (const p of positions) m.set(p.symbol, p.ltp)
  for (const [sym, q] of Object.entries(quotes)) { if (q.ltp) m.set(sym, q.ltp) }
  return m
}
function liveUnrealized(t: Trade, ltpMap: LtpMap): number {
  if (!isOpen(t) || t.total_quantity === 0) return 0
  const price = ltpMap.get(t.symbol_name)
  if (price != null) {
    const ref = t.total_quantity < 0 ? (t.avg_exit_price ?? 0) : t.avg_entry_price
    return t.total_quantity * (price - ref)
  }
  return t.unrealized_pnl
}

// ── Payoff engine ─────────────────────────────────────────────────────────────

interface OptionLeg { optType: 'CE' | 'PE'; strike: number; qty: number; entry: number; dte: number; iv: number }

function buildSingleOptionLeg(trade: Trade): OptionLeg | null {
  if (!isOpen(trade) || trade.total_quantity === 0) return null
  const p = parseOption(trade.symbol_name)
  if (!p) return null
  // Premium paid/received. For SHORT legs the entry premium lives in avg_exit_price
  // (avg_entry_price is 0 for shorts) — same reference logic as liveUnrealized().
  const isShort = trade.total_quantity < 0
  const entry = isShort ? (trade.avg_exit_price ?? trade.avg_entry_price) : trade.avg_entry_price
  return { optType: p.optType, strike: p.strike, qty: trade.total_quantity, entry, dte: parseDte(p.rawExpiry), iv: 0.20 }
}

interface PayoffPoint { price: number; expiry: number; today: number }

function computePayoffCurve(legs: OptionLeg[], dteOverride?: number, N = 240): PayoffPoint[] {
  if (!legs.length) return []
  const strikes = legs.map(l => l.strike)
  const minStrike = Math.min(...strikes), maxStrike = Math.max(...strikes)
  const center = (minStrike + maxStrike) / 2
  const spread = Math.max(maxStrike - minStrike, center * 0.08)
  const lo = center - spread * 2.4, hi = center + spread * 2.4
  return Array.from({ length: N + 1 }, (_, i) => {
    const S = lo + (hi - lo) * (i / N)
    let expiryPnl = 0, todayPnl = 0
    for (const l of legs) {
      const intrinsic = l.optType === 'CE' ? Math.max(S - l.strike, 0) : Math.max(l.strike - S, 0)
      expiryPnl += l.qty * (intrinsic - l.entry)
      const T = Math.max(0.5, dteOverride ?? l.dte) / 365
      todayPnl += l.qty * (bsPrice(S, l.strike, T, l.iv, l.optType) - l.entry)
    }
    return { price: Math.round(S), expiry: Math.round(expiryPnl), today: Math.round(todayPnl) }
  })
}
function findBreakevenPrices(data: PayoffPoint[]): number[] {
  const bes: number[] = []
  for (let i = 1; i < data.length; i++) {
    const a = data[i - 1], b = data[i]
    if ((a.expiry <= 0 && b.expiry > 0) || (a.expiry >= 0 && b.expiry < 0)) {
      const t = a.expiry / (a.expiry - b.expiry)
      bes.push(Math.round(a.price + t * (b.price - a.price)))
    }
  }
  return bes
}
function detectSpot(trades: Trade[], quotes: Record<string, { ltp: number }>): number {
  const indices: Record<string, number> = {}
  for (const t of trades) {
    if (!isOpen(t)) continue
    const idx = detectIndex(t.symbol_name)
    if (idx) indices[idx] = (indices[idx] ?? 0) + 1
  }
  const top = Object.entries(indices).sort((a, b) => b[1] - a[1])[0]?.[0]
  return top ? (quotes[top]?.ltp ?? 0) : 0
}

function brokerColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return BROKER_COLORS[h % BROKER_COLORS.length]
}

interface TradeLeg { id: string; trade: Trade; optionLeg: OptionLeg | null; color: string; parsed: ParsedOption | null }

// ── Position row (swipe left → single Exit action) ────────────────────────────

const ACTION_W = 84

function PositionRow({ leg, ltpMap, selected, onToggle, onExit, isRowOpen, onOpen }: {
  leg: TradeLeg; ltpMap: LtpMap; selected: boolean
  onToggle: () => void; onExit: () => void
  isRowOpen: boolean; onOpen: (open: boolean) => void
}) {
  const { trade, parsed, color } = leg
  const ltp = ltpMap.get(trade.symbol_name)
  const unreal = liveUnrealized(trade, ltpMap)
  const dir = trade.total_quantity > 0 ? 'B' : 'S'
  const faceRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ startX: 0, dx: 0, active: false, moved: false })

  const setX = (x: number) => { if (faceRef.current) faceRef.current.style.transform = `translateX(${x}px)` }
  useEffect(() => {
    if (faceRef.current) { faceRef.current.style.transition = 'transform .28s cubic-bezier(.22,1,.36,1)'; setX(isRowOpen ? -ACTION_W : 0) }
  }, [isRowOpen])

  function down(clientX: number) { drag.current = { startX: clientX - (isRowOpen ? -ACTION_W : 0), dx: 0, active: true, moved: false }; if (faceRef.current) faceRef.current.style.transition = 'none' }
  function move(clientX: number) {
    if (!drag.current.active) return
    const dx = Math.max(-ACTION_W, Math.min(0, clientX - drag.current.startX))
    if (Math.abs(dx - (isRowOpen ? -ACTION_W : 0)) > 4) drag.current.moved = true
    drag.current.dx = dx; setX(dx)
  }
  function up() {
    if (!drag.current.active) return
    drag.current.active = false
    if (faceRef.current) faceRef.current.style.transition = 'transform .28s cubic-bezier(.22,1,.36,1)'
    if (drag.current.moved) {
      const shouldOpen = drag.current.dx < -ACTION_W * 0.4
      onOpen(shouldOpen); setX(shouldOpen ? -ACTION_W : 0)
    } else {
      setX(isRowOpen ? -ACTION_W : 0)   // snap back, tap handled in onClick
    }
  }

  return (
    <div className="relative overflow-hidden border-b border-slate-50 dark:border-white/[0.03]">
      {/* Single Exit action */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button onClick={() => { onOpen(false); onExit() }}
          className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 transition-colors" style={{ width: ACTION_W }}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          Exit
        </button>
      </div>
      {/* Face */}
      <div ref={faceRef}
        className="relative bg-white dark:bg-[#0e1526] flex items-center gap-2 px-3 py-2.5 cursor-grab active:cursor-grabbing"
        onMouseDown={e => down(e.clientX)}
        onMouseMove={e => move(e.clientX)}
        onMouseUp={up}
        onMouseLeave={up}
        onTouchStart={e => down(e.touches[0].clientX)}
        onTouchMove={e => move(e.touches[0].clientX)}
        onTouchEnd={up}
        onClick={() => { if (drag.current.moved) return; onOpen(!isRowOpen) }}
      >
        <input type="checkbox" checked={selected} onChange={onToggle} onClick={e => e.stopPropagation()}
          className="h-3.5 w-3.5 shrink-0 accent-indigo-500 cursor-pointer" />
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
        <span className={clsx('h-4 w-4 shrink-0 rounded flex items-center justify-center text-[9px] font-black',
          dir === 'B' ? 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/25 text-red-700 dark:text-red-400')}>
          {dir}
        </span>
        <div className="flex-1 min-w-0">
          {parsed ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800 dark:text-white/85 tabular-nums">{parsed.strike.toLocaleString('en-IN')}</span>
                <span className={clsx('px-1 rounded text-[9px] font-black', parsed.optType === 'CE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{parsed.optType}</span>
              </div>
              <span className="text-[9px] font-mono text-slate-400 dark:text-white/20">{parsed.index} · {parsed.rawExpiry}</span>
            </>
          ) : (
            <span className="text-[11px] font-semibold text-slate-600 dark:text-white/55 truncate block">{trade.symbol_name}</span>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className={clsx('text-[12px] font-black tabular-nums', unreal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
            {unreal >= 0 ? '+' : '−'}₹{inr(Math.abs(unreal))}
          </div>
          <div className="text-[9px] text-slate-400 dark:text-white/25 tabular-nums">
            {Math.abs(trade.total_quantity)} @ ₹{trade.avg_entry_price.toFixed(1)}{ltp != null && ` · ${ltp.toFixed(1)}`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Closed row — same layout as PositionRow, greyed, checkable, NO swipe/exit ──

function ClosedRow({ leg, selected, onToggle }: { leg: TradeLeg; selected: boolean; onToggle: () => void }) {
  const { trade, parsed, color } = leg
  const realized = trade.realized_pnl
  return (
    <div className={clsx('flex items-center gap-2 px-3 py-2.5 border-b border-slate-50 dark:border-white/[0.03] bg-slate-50/70 dark:bg-white/[0.02] transition-opacity', !selected && 'opacity-40')}>
      <input type="checkbox" checked={selected} onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0 accent-slate-400 cursor-pointer" title={selected ? 'Exclude booked P&L from payoff' : 'Include booked P&L in payoff'} />
      <span className="h-2 w-2 rounded-full shrink-0 opacity-50" style={{ background: color }} />
      <span className="h-4 shrink-0 rounded px-1 flex items-center justify-center text-[8px] font-black uppercase bg-slate-200 dark:bg-white/[0.08] text-slate-500 dark:text-white/40">closed</span>
      <div className="flex-1 min-w-0">
        {parsed ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-bold text-slate-500 dark:text-white/50 tabular-nums">{parsed.strike.toLocaleString('en-IN')}</span>
              <span className={clsx('px-1 rounded text-[9px] font-black', parsed.optType === 'CE' ? 'text-emerald-600/70 dark:text-emerald-400/60' : 'text-red-500/70 dark:text-red-400/60')}>{parsed.optType}</span>
            </div>
            <span className="text-[9px] font-mono text-slate-400 dark:text-white/20">{parsed.index} · {parsed.rawExpiry}</span>
          </>
        ) : (
          <span className="text-[11px] font-semibold text-slate-500 dark:text-white/45 truncate block">{trade.symbol_name}</span>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className={clsx('text-[12px] font-black tabular-nums', realized >= 0 ? 'text-emerald-600/80 dark:text-emerald-400/70' : 'text-red-500/80 dark:text-red-400/70')}>
          {realized >= 0 ? '+' : '−'}₹{inr(Math.abs(realized))}
        </div>
        <div className="text-[9px] text-slate-400 dark:text-white/25">realized</div>
      </div>
    </div>
  )
}

// ── Draft legs ────────────────────────────────────────────────────────────────

interface DraftLeg { id: string; optType: 'CE' | 'PE'; strike: number; side: 'BUY' | 'SELL'; qty: number; ltp: number; expiry: string }
function draftId(side: 'BUY' | 'SELL', optType: 'CE' | 'PE', strike: number) { return `${side}-${optType}-${strike}` }

// ── Option chain modal (Sensibull-style popup, opened by Add) ─────────────────

interface OptionChainModalProps {
  index: string
  expiry: string
  onExpiry: (e: string) => void
  runningMap: Map<string, number>       // `${optType}-${strike}` → net running qty
  drafts: DraftLeg[]
  onToggleDraft: (d: Omit<DraftLeg, 'qty'>) => void
  onRoll: (optType: 'CE' | 'PE', fromStrike: number, runQty: number, toStrike: number, ltpOld: number, ltpNew: number, expiry: string) => void
  onSpot: (s: number) => void
  onClearAll: () => void
  onClose: () => void
}

function OptionChainModal({ index, expiry, onExpiry, runningMap, drafts, onToggleDraft, onRoll, onSpot, onClearAll, onClose }: OptionChainModalProps) {
  const { chain, expiries } = useLiveOptionChain(index, expiry)
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({})
  const dragFrom = useRef<{ optType: 'CE' | 'PE'; strike: number; qty: number } | null>(null)
  const [dropStrike, setDropStrike] = useState<number | null>(null)
  const spot = chain.spot ?? 0

  function handleDrop(toStrike: number) {
    const df = dragFrom.current
    setDropStrike(null)
    if (!df || df.strike === toStrike) { dragFrom.current = null; return }
    const oldRow = chain.rows.find(r => r.strike === df.strike)
    const newRow = chain.rows.find(r => r.strike === toStrike)
    const ltpOld = (df.optType === 'CE' ? oldRow?.call?.ltp : oldRow?.put?.ltp) ?? 0
    const ltpNew = (df.optType === 'CE' ? newRow?.call?.ltp : newRow?.put?.ltp) ?? 0
    onRoll(df.optType, df.strike, df.qty, toStrike, ltpOld, ltpNew, expiry)
    dragFrom.current = null
  }

  useEffect(() => { if (expiries.length && !expiry) onExpiry(expiries[0]) }, [expiries, expiry, onExpiry])
  useEffect(() => { onSpot(spot) }, [spot, onSpot])
  useEffect(() => { const el = chain.atm ? rowRefs.current[chain.atm] : null; if (el) el.scrollIntoView({ block: 'center' }) }, [chain.atm])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const rows = useMemo(() => {
    if (!chain.rows.length) return []
    const atmIdx = chain.rows.findIndex(r => r.strike >= chain.atm)
    return chain.rows.slice(Math.max(0, atmIdx - 14), Math.min(chain.rows.length, atmIdx + 15))
  }, [chain])

  const maxOi = useMemo(() => {
    let m = 0
    for (const r of rows) { m = Math.max(m, r.call?.oi ?? 0, r.put?.oi ?? 0) }
    return m || 1
  }, [rows])

  const draftSide = (side: 'BUY' | 'SELL', optType: 'CE' | 'PE', strike: number) => drafts.some(d => d.id === draftId(side, optType, strike))
  const oiL = (oi?: number) => (oi == null ? '' : (oi / 1e5).toFixed(1))

  // Buy/Sell control for one side of a strike
  function Side({ optType, strike, ltp, iv, oi, align }: { optType: 'CE' | 'PE'; strike: number; ltp?: number; iv?: number; oi?: number; align: 'left' | 'right' }) {
    const buyOn = draftSide('BUY', optType, strike)
    const sellOn = draftSide('SELL', optType, strike)
    const run = runningMap.get(`${optType}-${strike}`)
    const oiPct = Math.min(100, ((oi ?? 0) / maxOi) * 100)
    const btn = (side: 'BUY' | 'SELL', on: boolean) => (
      <button onClick={() => onToggleDraft({ id: draftId(side, optType, strike), optType, strike, side, ltp: ltp ?? 0, expiry })}
        className={clsx('h-5 w-5 rounded flex items-center justify-center text-[10px] font-black transition-all',
          on ? (side === 'BUY' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white')
             : (side === 'BUY' ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' : 'text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'))}>
        {side === 'BUY' ? 'B' : 'S'}
      </button>
    )
    const controls = <div className={clsx('flex items-center gap-0.5 transition-opacity', (buyOn || sellOn) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>{btn('BUY', buyOn)}{btn('SELL', sellOn)}</div>
    const priceBlock = (
      <div className={clsx('flex flex-col', align === 'right' ? 'items-end' : 'items-start')}>
        <span className="tabular-nums text-[12px] font-semibold text-slate-800 dark:text-white/80 leading-none">{ltp != null ? ltp.toFixed(2) : '—'}</span>
        <span className="tabular-nums text-[9px] text-slate-400 dark:text-white/25 leading-tight">{iv != null ? `${iv.toFixed(1)} iv` : ''}</span>
      </div>
    )
    return (
      <div className={clsx('group relative flex items-center gap-2 px-3 py-1.5 h-full', align === 'right' ? 'flex-row-reverse' : '')}>
        {/* OI bar */}
        <div className={clsx('absolute inset-y-1 rounded', align === 'right' ? 'right-0' : 'left-0')} style={{ width: `${oiPct}%`, background: optType === 'CE' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)' }} />
        <div className={clsx('relative flex items-center gap-2', align === 'right' ? 'flex-row-reverse' : '')}>
          {controls}
          {priceBlock}
          {run != null && (
            <span
              draggable
              onDragStart={() => { dragFrom.current = { optType, strike, qty: run } }}
              onDragEnd={() => { dragFrom.current = null; setDropStrike(null) }}
              title="Drag to another strike to roll"
              className={clsx('px-1 rounded text-[9px] font-black tabular-nums cursor-grab active:cursor-grabbing flex items-center gap-0.5', run > 0 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400')}>
              <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></svg>
              {run > 0 ? '+' : ''}{run}
            </span>
          )}
        </div>
        <span className={clsx('relative tabular-nums text-[9px] text-slate-300 dark:text-white/20 ml-auto', align === 'right' && 'ml-0 mr-auto')}>{oiL(oi)}</span>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-[#0c1220] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] w-full max-w-2xl flex flex-col overflow-hidden" style={{ maxHeight: '86vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06] shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-black text-slate-900 dark:text-white">{index}</h2>
              {spot > 0 && <span className="text-[13px] font-bold tabular-nums text-slate-600 dark:text-white/60">{spot.toLocaleString('en-IN')}</span>}
              <span className={clsx('text-[11px] font-semibold tabular-nums', (chain.spotChgPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                {(chain.spotChgPct ?? 0) >= 0 ? '+' : ''}{(chain.spotChgPct ?? 0).toFixed(2)}%
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-white/25 mt-0.5">Tap B or S on any strike to add it — payoff updates live</p>
          </div>
          <div className="ml-auto flex items-center gap-1 overflow-x-auto">
            {expiries.slice(0, 5).map(exp => (
              <button key={exp} onClick={() => onExpiry(exp)}
                className={clsx('px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors', expiry === exp ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]')}>
                {exp}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] shrink-0">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* Column header */}
        <div className="grid shrink-0 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02] text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25" style={{ gridTemplateColumns: '1fr 108px 1fr' }}>
          <div className="px-3 py-2 text-emerald-600/70 dark:text-emerald-400/60">Calls · LTP / OI</div>
          <div className="px-2 py-2 text-center">Strike</div>
          <div className="px-3 py-2 text-right text-red-600/70 dark:text-red-400/60">Puts · LTP / OI</div>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <tbody>
              {rows.map(row => {
                const isAtm = row.strike === chain.atm
                const hasRun = runningMap.has(`CE-${row.strike}`) || runningMap.has(`PE-${row.strike}`)
                return (
                  <tr key={row.strike} ref={el => { rowRefs.current[row.strike] = el }}
                    onDragOver={e => { if (dragFrom.current) { e.preventDefault(); setDropStrike(row.strike) } }}
                    onDrop={e => { e.preventDefault(); handleDrop(row.strike) }}
                    className={clsx('border-b border-slate-50 dark:border-white/[0.03]', dropStrike === row.strike && 'bg-indigo-50 dark:bg-indigo-900/25 ring-1 ring-indigo-300 dark:ring-indigo-700')}>
                    <td className="p-0 align-middle" style={{ width: '42%' }}><Side optType="CE" strike={row.strike} ltp={row.call?.ltp} iv={row.call?.iv} oi={row.call?.oi} align="left" /></td>
                    <td className="p-0 text-center align-middle" style={{ width: '108px' }}>
                      <div className="flex flex-col items-center justify-center py-1">
                        <div className="flex items-center gap-1">
                          {hasRun && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />}
                          <span className={clsx('font-black tabular-nums text-[12px]', isAtm ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200')}>{row.strike.toLocaleString('en-IN')}</span>
                        </div>
                        {isAtm && <span className="text-[7px] font-black text-amber-500">ATM</span>}
                      </div>
                    </td>
                    <td className="p-0 align-middle" style={{ width: '42%' }}><Side optType="PE" strike={row.strike} ltp={row.put?.ltp} iv={row.put?.iv} oi={row.put?.oi} align="right" /></td>
                  </tr>
                )
              })}
              {!rows.length && <tr><td colSpan={3} className="px-3 py-16 text-center text-[12px] text-slate-400 dark:text-white/20">Waiting for live chain…</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-100 dark:border-white/[0.06] shrink-0">
          <span className="text-[12px] font-bold text-slate-600 dark:text-white/55">{drafts.length} leg{drafts.length !== 1 ? 's' : ''} selected</span>
          {drafts.length > 0 && (
            <button onClick={onClearAll} className="text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors">Clear all</button>
          )}
          <button onClick={onClose} className="ml-auto h-9 px-6 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[13px] font-bold transition-colors">Done</button>
        </div>
      </div>
    </div>
  )
}

// ── Dropdowns ─────────────────────────────────────────────────────────────────

function GroupSelect({ value, onChange, groups, disabled }: { value: string; onChange: (v: string) => void; groups: string[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={rootRef} className="relative">
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}
        className={clsx('flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-xl border text-[13px] font-semibold transition-all bg-white dark:bg-white/[0.05] shadow-sm min-w-[160px]', disabled && 'opacity-50 cursor-not-allowed', open ? 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-400/15 text-slate-800 dark:text-white' : 'border-slate-200 dark:border-white/[0.09] text-slate-700 dark:text-slate-200 hover:border-slate-300')}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
        <span className={clsx('flex-1 text-left truncate', !value && 'text-slate-400 font-normal')}>{value || 'Select strategy…'}</span>
        <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5 text-slate-400 transition-transform shrink-0', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && groups.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-2 w-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {groups.map(g => (
              <button key={g} onMouseDown={e => { e.preventDefault(); onChange(g); setOpen(false) }}
                className={clsx('w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[13px]', value === g ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.05]')}>
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: brokerColor(g) }} />
                <span className="flex-1 truncate">{g}</span>
                {value === g && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BrokerMultiSelect({ brokers, selected, onChange, disabled }: { brokers: string[]; selected: Set<string>; onChange: (s: Set<string>) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const allSelected = selected.size === 0 || selected.size === brokers.length
  function toggle(b: string) { const next = new Set(selected); if (next.has(b)) next.delete(b); else next.add(b); onChange(next.size === brokers.length ? new Set() : next) }
  return (
    <div ref={rootRef} className="relative">
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}
        className={clsx('flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-xl border text-[13px] font-semibold transition-all bg-white dark:bg-white/[0.05] shadow-sm min-w-[130px]', disabled && 'opacity-50 cursor-not-allowed', open ? 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-400/15 text-slate-800 dark:text-white' : 'border-slate-200 dark:border-white/[0.09] text-slate-700 dark:text-slate-200 hover:border-slate-300')}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 dark:text-white/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12h6M9 8h6M9 16h4" strokeLinecap="round" /></svg>
        {!allSelected ? (
          <div className="flex items-center gap-1 flex-1 overflow-hidden">
            {[...selected].slice(0, 2).map(b => <span key={b} className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-white shrink-0" style={{ background: brokerColor(b) }}>{b.slice(0, 4)}</span>)}
            {selected.size > 2 && <span className="text-[10px] text-slate-500 dark:text-white/35">+{selected.size - 2}</span>}
          </div>
        ) : <span className="flex-1 text-left">All brokers</span>}
        <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5 text-slate-400 transition-transform shrink-0', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && brokers.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-2 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          <button onMouseDown={e => { e.preventDefault(); onChange(new Set()) }}
            className={clsx('w-full flex items-center gap-2.5 px-3.5 py-2.5 border-b border-slate-100 dark:border-white/[0.06]', allSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]')}>
            <span className={clsx('h-4 w-4 rounded border-2 flex items-center justify-center shrink-0', allSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-white/20')}>
              {allSelected && <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
            </span>
            <span className="text-[12px] font-semibold">All brokers</span>
          </button>
          <div className="py-1">
            {brokers.map(b => {
              const isSel = allSelected || selected.has(b); const c = brokerColor(b)
              return (
                <button key={b} onMouseDown={e => { e.preventDefault(); toggle(b) }} className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                  <span className="h-4 w-4 rounded border-2 flex items-center justify-center shrink-0" style={isSel ? { borderColor: c, background: c } : { borderColor: '#CBD5E1' }}>
                    {isSel && <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                  </span>
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c }} />
                  <span className="text-[12px] text-slate-700 dark:text-slate-200 truncate flex-1">{b}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

interface TagTab { key: string; label: string; color: string | null; trades: Trade[] }
function buildTabs(trades: Trade[]): TagTab[] {
  const tagMap = new Map<string, { color: string | null; trades: Trade[] }>()
  const untagged: Trade[] = []
  for (const t of trades) {
    const tags = t.tags ?? []
    if (!tags.length) { untagged.push(t); continue }
    for (const tag of tags) {
      if (!tagMap.has(tag.name)) tagMap.set(tag.name, { color: tag.metadata?.colorCode ?? null, trades: [] })
      tagMap.get(tag.name)!.trades.push(t)
    }
  }
  const tabs: TagTab[] = [...tagMap.entries()].map(([name, { color, trades: tds }]) => ({ key: name, label: name, color: color ?? tagFallbackColor(name), trades: tds }))
  if (untagged.length) tabs.push({ key: '__others__', label: 'Others', color: null, trades: untagged })
  return tabs
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function StrategyDeepDive() {
  const [allTrades, setAllTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(false)
  const [initialDone, setInitialDone] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedBrokers, setSelectedBrokers] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [closedOff, setClosedOff] = useState<Set<string>>(new Set())   // closed trade ids excluded from booked P&L
  const [openRowId, setOpenRowId] = useState<string | null>(null)
  const [targetPct, setTargetPct] = useState(0)
  const [dteDays, setDteDays] = useState<number | null>(null)
  // Option-chain (Add) state
  const [chainOpen, setChainOpen] = useState(false)
  const [drafts, setDrafts] = useState<DraftLeg[]>([])
  const [chainQty] = useState(1)
  const [chainExpiry, setChainExpiry] = useState('')
  const [chainSpot, setChainSpot] = useState(0)
  const [executing, setExecuting] = useState(false)

  // Draggable rail width
  const [railW, setRailW] = useState<number>(() => {
    const s = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(RAIL_KEY)) : 0
    return s >= RAIL_MIN && s <= RAIL_MAX ? s : RAIL_DEFAULT
  })
  const dragging = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function move(e: MouseEvent) {
      if (!dragging.current || !bodyRef.current) return
      const rect = bodyRef.current.getBoundingClientRect()
      const w = Math.max(RAIL_MIN, Math.min(RAIL_MAX, e.clientX - rect.left))
      setRailW(w)
    }
    function up() { if (dragging.current) { dragging.current = false; document.body.style.cursor = ''; localStorage.setItem(RAIL_KEY, String(railW)) } }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [railW])

  const quotes = useMarketStore(s => s.quotes)
  const tbPositions = useTradebookStore(s => s.positions)
  const ltpMap = useMemo(() => buildLtpMap(quotes, tbPositions), [quotes, tbPositions])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try { setAllTrades(await getTrades()) } catch { toast.error('Failed to load trades') }
    finally { setLoading(false); setInitialDone(true) }
  }, [])
  useEffect(() => { void fetchAll() }, [fetchAll])

  const distinctGroups = useMemo(() => [...new Set(allTrades.map(t => t.group_name).filter(Boolean))].sort(), [allTrades])
  const distinctBrokers = useMemo(() => [...new Set(allTrades.map(t => t.broker_name).filter(Boolean))].sort(), [allTrades])
  useEffect(() => { if (distinctGroups.length > 0 && !selectedGroup) setSelectedGroup(distinctGroups[0]) }, [distinctGroups, selectedGroup])

  const filteredTrades = useMemo(() => {
    let list = allTrades
    if (selectedGroup) list = list.filter(t => t.group_name === selectedGroup)
    if (selectedBrokers.size) list = list.filter(t => selectedBrokers.has(t.broker_name))
    return list
  }, [allTrades, selectedGroup, selectedBrokers])

  const tabs = useMemo(() => buildTabs(filteredTrades), [filteredTrades])
  useEffect(() => { if (tabs.length > 0 && (activeTab === null || !tabs.find(t => t.key === activeTab))) setActiveTab(tabs[0]?.key ?? null) }, [tabs, activeTab])
  useEffect(() => { setTargetPct(0); setDeselected(new Set()); setClosedOff(new Set()); setOpenRowId(null); setChainOpen(false); setDrafts([]) }, [activeTab, selectedGroup])

  const currentTabTrades = useMemo(() => tabs.find(t => t.key === activeTab)?.trades ?? [], [tabs, activeTab])
  const openTrades = useMemo(() => currentTabTrades.filter(isOpen), [currentTabTrades])
  const closedTrades = useMemo(() => currentTabTrades.filter(t => !isOpen(t)), [currentTabTrades])

  const tradeLegs = useMemo((): TradeLeg[] => openTrades.map((trade, i) => ({
    id: String(trade.trade_id), trade, optionLeg: buildSingleOptionLeg(trade), color: LEG_COLORS[i % LEG_COLORS.length], parsed: parseOption(trade.symbol_name),
  })), [openTrades])

  const selectedLegs = useMemo(() => tradeLegs.filter(l => !deselected.has(l.id) && l.optionLeg !== null).map(l => l.optionLeg!), [tradeLegs, deselected])

  // Closed trades — same row shape (color + parsed); realized P&L feeds the payoff as a booked offset when selected.
  const closedLegs = useMemo((): TradeLeg[] => closedTrades.map((trade, i) => ({
    id: String(trade.trade_id), trade, optionLeg: null, color: LEG_COLORS[(openTrades.length + i) % LEG_COLORS.length], parsed: parseOption(trade.symbol_name),
  })), [closedTrades, openTrades.length])
  const bookedOffset = useMemo(() => closedLegs.reduce((s, l) => closedOff.has(l.id) ? s : s + l.trade.realized_pnl, 0), [closedLegs, closedOff])
  function toggleClosed(id: string) { setClosedOff(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }

  // Draft legs (from option chain) → OptionLeg, merged into the payoff live
  const draftOptionLegs = useMemo((): OptionLeg[] => drafts.map(d => ({
    optType: d.optType, strike: d.strike, qty: d.side === 'BUY' ? d.qty : -d.qty, entry: d.ltp, dte: parseDte(d.expiry), iv: 0.20,
  })), [drafts])
  const chartLegs = useMemo(() => [...selectedLegs, ...draftOptionLegs], [selectedLegs, draftOptionLegs])

  // Index for the option chain — from the current tab's option positions
  const chainIndex = useMemo(() => {
    for (const l of tradeLegs) if (l.parsed?.index) return l.parsed.index
    return 'NIFTY'
  }, [tradeLegs])

  // Running-position map for chain highlight: `${optType}-${strike}` → net qty
  const runningMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of tradeLegs) if (l.parsed) {
      const k = `${l.parsed.optType}-${l.parsed.strike}`
      m.set(k, (m.get(k) ?? 0) + l.trade.total_quantity)
    }
    return m
  }, [tradeLegs])

  const maxDte = useMemo(() => Math.max(0, ...chartLegs.map(l => l.dte), 1), [chartLegs])
  useEffect(() => { if (maxDte > 0) setDteDays(maxDte) }, [maxDte])
  const activeDte = dteDays ?? maxDte
  // Date labels: left = today, right = expiry. "elapsed" days = maxDte - activeDte.
  const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const todayLabel = fmtDate(new Date())
  const expiryLabel = fmtDate(new Date(Date.now() + maxDte * 86400000))
  const targetDateLabel = fmtDate(new Date(Date.now() + (maxDte - activeDte) * 86400000))

  const payoffBase = useMemo(() => computePayoffCurve(chartLegs, activeDte), [chartLegs, activeDte])
  // Add booked P&L from selected closed trades as a flat vertical offset to the curve.
  const payoffData = useMemo(() => bookedOffset === 0 ? payoffBase : payoffBase.map(p => ({ price: p.price, expiry: p.expiry + bookedOffset, today: p.today + bookedOffset })), [payoffBase, bookedOffset])
  const detectedSpot = useMemo(() => detectSpot(openTrades, quotes), [openTrades, quotes])
  const spot = detectedSpot || chainSpot

  const stats = useMemo(() => {
    if (!payoffData.length) return { maxProfit: 0, maxLoss: 0, breakevens: [] as number[], pop: 0 }
    const ex = payoffData.map(d => d.expiry)
    const maxP = Math.max(...ex), maxL = Math.min(...ex)
    const bes = findBreakevenPrices(payoffData)
    // Probability of Profit — lognormal-weighted over expiry price (not a naive grid fraction).
    // Weight each price by the risk-neutral lognormal density given spot, IV≈20%, T.
    let pop = 0
    if (spot > 0 && activeDte > 0) {
      const sigma = 0.20, T = Math.max(activeDte, 0.5) / 365
      const sd = sigma * Math.sqrt(T)
      let wSum = 0, wProfit = 0
      for (const d of payoffData) {
        if (d.price <= 0) continue
        const z = (Math.log(d.price / spot) + 0.5 * sd * sd) / sd
        const w = Math.exp(-0.5 * z * z)   // ∝ lognormal density
        wSum += w
        if (d.expiry >= 0) wProfit += w
      }
      pop = wSum > 0 ? Math.round((wProfit / wSum) * 100) : 0
    } else {
      pop = Math.round((ex.filter(v => v >= 0).length / ex.length) * 100)
    }
    return { maxProfit: maxP, maxLoss: maxL, breakevens: bes, pop }
  }, [payoffData, spot, activeDte])

  // ── Shape for the shared PayoffChart (same component as Trade → Strategy) ──
  const targetPrice = spot > 0 ? Math.round(spot * (1 + targetPct / 100)) : Math.round(spot)
  const payoffChartData = useMemo(() => payoffData.map(p => ({ price: p.price, expiry: p.expiry, projected: p.today })), [payoffData])
  const payoffBands = useMemo(() => {
    const sd = spot > 0 && activeDte > 0 ? spot * 0.20 * Math.sqrt(Math.max(activeDte, 1) / 365) : 0
    return sd > 0 ? [-2, -1, 1, 2].map(k => ({ price: Math.round(spot + k * sd), label: `${k > 0 ? '+' : ''}${k}SD` })) : []
  }, [spot, activeDte])
  const projAtTarget = useMemo(() => {
    if (!payoffData.length) return 0
    const i = payoffData.reduce((b, d, idx) => Math.abs(d.price - targetPrice) < Math.abs(payoffData[b].price - targetPrice) ? idx : b, 0)
    return payoffData[i]?.today ?? 0
  }, [payoffData, targetPrice])

  const openSymKey = useMemo(() => [...new Set(openTrades.map(t => t.symbol_name).filter(Boolean))].sort().join(','), [openTrades])
  useEffect(() => {
    if (!openSymKey) return
    realtime.start()
    const unsubs = openSymKey.split(',').map(s => realtime.subscribeSymbolTick(s, { prime: false }))
    return () => unsubs.forEach(u => u())
  }, [openSymKey])

  const grandReal = useMemo(() => currentTabTrades.reduce((s, t) => s + t.realized_pnl, 0), [currentTabTrades])
  const grandUnr = useMemo(() => openTrades.reduce((s, t) => s + liveUnrealized(t, ltpMap), 0), [openTrades, ltpMap])
  const bookedTotal = grandReal
  const unbookedTotal = grandUnr
  const grandPnl = grandReal + grandUnr
  const grandPos = grandPnl >= 0
  const hasContent = filteredTrades.length > 0
  const hasOptions = chartLegs.length > 0 || tradeLegs.some(l => l.optionLeg)

  function toggleLeg(id: string) { setDeselected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }

  async function exitLeg(leg: TradeLeg) {
    const p = leg.parsed
    if (!p) { toast.error('Cannot auto-exit this instrument'); return }
    try {
      await placeOrderApi({ txnType: leg.trade.total_quantity < 0 ? 'BUY' : 'SELL', quantity: Math.abs(leg.trade.total_quantity), priceType: 'MKT', price: 0, triggerPrice: 0, symbolName: leg.trade.symbol_name, lot: 1, brokerName: leg.trade.broker_name, indexName: p.index })
      toast.success('Exit order placed')
      void fetchAll()
    } catch { toast.error('Exit order failed') }
  }

  function toggleDraft(d: Omit<DraftLeg, 'qty'>) {
    setDrafts(prev => {
      const exists = prev.find(x => x.id === d.id)
      if (exists) return prev.filter(x => x.id !== d.id)
      return [...prev, { ...d, qty: chainQty }]
    })
  }

  // Roll a running leg by drag-drop in the chain: close old strike + open new strike (same side/qty).
  function rollViaDraft(optType: 'CE' | 'PE', fromStrike: number, runQty: number, toStrike: number, ltpOld: number, ltpNew: number, expiry: string) {
    if (fromStrike === toStrike || runQty === 0) return
    const absQ = Math.abs(runQty)
    const closeSide: 'BUY' | 'SELL' = runQty < 0 ? 'BUY' : 'SELL'   // opposite of holding → exits it
    const openSide: 'BUY' | 'SELL' = runQty < 0 ? 'SELL' : 'BUY'    // same as holding → new leg
    const closeLeg: DraftLeg = { id: `roll-close-${optType}-${fromStrike}`, optType, strike: fromStrike, side: closeSide, qty: absQ, ltp: ltpOld, expiry }
    const openLeg: DraftLeg = { id: `roll-open-${optType}-${toStrike}`, optType, strike: toStrike, side: openSide, qty: absQ, ltp: ltpNew, expiry }
    setDrafts(prev => [...prev.filter(x => x.id !== closeLeg.id && x.id !== openLeg.id), closeLeg, openLeg])
    toast.success(`Roll ${optType} ${fromStrike.toLocaleString('en-IN')} → ${toStrike.toLocaleString('en-IN')} — review & place`)
  }

  async function executeDrafts() {
    if (!drafts.length) return
    const broker = openTrades[0]?.broker_name ?? tradeLegs[0]?.trade.broker_name ?? ''
    setExecuting(true)
    try {
      for (const d of drafts) {
        await placeOrderApi({
          txnType: d.side, quantity: d.qty, priceType: 'MKT', price: 0, triggerPrice: 0,
          symbolName: buildSymbol(chainIndex, d.expiry || chainExpiry, d.optType, d.strike),
          lot: 1, brokerName: broker, indexName: chainIndex,
        })
      }
      toast.success(`Placed ${drafts.length} order${drafts.length > 1 ? 's' : ''}`)
      setDrafts([]); setChainOpen(false); void fetchAll()
    } catch { toast.error('Some orders failed') }
    finally { setExecuting(false) }
  }

  const draftNet = useMemo(() => drafts.reduce((s, d) => s + (d.side === 'BUY' ? -1 : 1) * d.ltp * d.qty, 0), [drafts])

  return (
    <div className="bg-white dark:bg-white/[0.025] rounded-2xl border border-slate-200/70 dark:border-white/[0.07] shadow-sm dark:shadow-none overflow-hidden">
      <div className="h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/[0.05] flex-wrap">
        <div className="mr-1">
          <h2 className="text-[14px] font-black text-slate-800 dark:text-white/85 leading-none">Strategy Deep Dive</h2>
          <p className="text-[10px] text-slate-400 dark:text-white/25 mt-1">{initialDone ? `${allTrades.length} trades · ${distinctGroups.length} strategies · ${distinctBrokers.length} brokers` : 'Loading…'}</p>
        </div>
        <GroupSelect value={selectedGroup} onChange={v => { setSelectedGroup(v); setActiveTab(null) }} groups={distinctGroups} disabled={!initialDone} />
        <BrokerMultiSelect brokers={distinctBrokers} selected={selectedBrokers} onChange={setSelectedBrokers} disabled={!initialDone} />

        {/* Tag tabs inline */}
        {tabs.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabs.map(tab => {
              const isActive = activeTab === tab.key
              const color = tab.color ?? tagFallbackColor(tab.label)
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all border whitespace-nowrap shrink-0', isActive ? 'shadow-sm' : 'border-transparent text-slate-500 dark:text-white/35 hover:bg-slate-50 dark:hover:bg-white/[0.04]')}
                  style={isActive ? { background: `${color}15`, borderColor: `${color}30`, color } : {}}>
                  {tab.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: isActive ? color : '#94a3b8' }} />}
                  {tab.label}
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={isActive ? { background: `${color}20`, color } : { background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{tab.trades.length}</span>
                </button>
              )
            })}
          </div>
        )}

        {hasContent && (
          <div className="ml-auto text-right shrink-0">
            <p className={clsx('text-[19px] font-black tabular-nums leading-none', grandPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{grandPos ? '+' : '−'}₹{inr(Math.abs(grandPnl))}</p>
            <p className="text-[9px] text-slate-400 dark:text-white/25 mt-0.5">{openTrades.length} open · {closedTrades.length} closed</p>
          </div>
        )}
      </div>

      {/* Content */}
      {loading && <div className="py-20 text-center text-[12px] text-slate-400 dark:text-white/25">Loading strategy…</div>}

      {!loading && !selectedGroup && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500/10 to-violet-500/10">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17l5-5 4 4 9-9" /><path d="M21 7h-4v4" /></svg>
          </div>
          <p className="text-[14px] font-bold text-slate-700 dark:text-white/60">Select a strategy to dive in</p>
        </div>
      )}

      {!loading && selectedGroup && !hasContent && (
        <div className="py-12 text-center text-[12px] text-slate-400 dark:text-white/25">No trades match the selected filters</div>
      )}

      {!loading && selectedGroup && hasContent && (
        <div ref={bodyRef} className="flex items-stretch" style={{ minHeight: 460 }}>

          {/* ── LEFT RAIL ── */}
          <div className="flex flex-col shrink-0 border-r border-slate-100 dark:border-white/[0.06]" style={{ width: railW }}>
            {/* Toolbar */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 dark:border-white/[0.05]">
              <button onClick={() => setChainOpen(true)}
                className="h-7 px-2.5 rounded-lg border border-indigo-400 bg-indigo-50 dark:bg-indigo-900/25 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold flex items-center gap-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                Add
              </button>
              <button onClick={() => { if (tradeLegs.length) { tradeLegs.forEach(l => l.parsed && void exitLeg(l)) } }}
                disabled={!tradeLegs.length}
                className={clsx('h-7 px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition-colors',
                  tradeLegs.length ? 'border-slate-200 dark:border-white/[0.1] text-slate-600 dark:text-white/50 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 hover:border-red-200' : 'border-slate-100 dark:border-white/[0.05] text-slate-300 dark:text-white/15 cursor-not-allowed')}>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                Exit all
              </button>
              <span className="ml-auto text-[10px] text-slate-400 dark:text-white/25">{selectedLegs.length}/{tradeLegs.filter(l => l.optionLeg).length} on chart</span>
            </div>

            {/* New positions (from option chain) */}
            {drafts.length > 0 && (
              <div className="border-b border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/40 dark:bg-indigo-900/10">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400">New positions · {drafts.length}</span>
                  <button onClick={() => setDrafts([])} className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors">Clear</button>
                </div>
                {drafts.map(d => (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-1.5">
                    <span className={clsx('h-4 w-4 shrink-0 rounded flex items-center justify-center text-[9px] font-black', d.side === 'BUY' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400')}>{d.side === 'BUY' ? 'B' : 'S'}</span>
                    <span className="text-[12px] font-bold text-slate-800 dark:text-white/85 tabular-nums">{d.strike.toLocaleString('en-IN')}</span>
                    <span className={clsx('text-[9px] font-black', d.optType === 'CE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{d.optType}</span>
                    {/* qty editor */}
                    <div className="flex items-center gap-0.5 ml-1">
                      <button onClick={() => setDrafts(prev => prev.map(x => x.id === d.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x))} className="h-5 w-5 rounded border border-slate-200 dark:border-white/[0.1] text-slate-500 dark:text-white/40 text-xs font-bold leading-none">−</button>
                      <span className="w-8 text-center text-[11px] font-bold tabular-nums text-slate-700 dark:text-white/70">{d.qty}</span>
                      <button onClick={() => setDrafts(prev => prev.map(x => x.id === d.id ? { ...x, qty: x.qty + 1 } : x))} className="h-5 w-5 rounded border border-slate-200 dark:border-white/[0.1] text-slate-500 dark:text-white/40 text-xs font-bold leading-none">+</button>
                    </div>
                    <span className="ml-auto text-[10px] text-slate-400 dark:text-white/25 tabular-nums">@ ₹{d.ltp.toFixed(1)}</span>
                    <button onClick={() => setDrafts(prev => prev.filter(x => x.id !== d.id))} className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-red-500 shrink-0">
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 px-3 py-2 border-t border-indigo-100 dark:border-indigo-900/30">
                  <span className={clsx('text-[11px] font-bold tabular-nums', draftNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                    {draftNet >= 0 ? '+' : '−'}₹{inr(Math.abs(draftNet))} {draftNet >= 0 ? 'credit' : 'debit'}
                  </span>
                  <button onClick={() => setChainOpen(true)} className="ml-auto h-7 px-2.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-[10px] font-bold text-slate-500 dark:text-white/40 hover:bg-white dark:hover:bg-white/[0.05]">+ More</button>
                  <button onClick={() => void executeDrafts()} disabled={executing}
                    className={clsx('h-7 px-3 rounded-lg text-[11px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 transition-colors', executing && 'opacity-60 cursor-not-allowed')}>
                    {executing ? 'Placing…' : 'Place order'}
                  </button>
                </div>
              </div>
            )}

            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 dark:border-white/[0.05] text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25">
              <span className="w-3.5" /><span className="flex-1">Running positions</span><span>P&L · qty</span>
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto">
              {tradeLegs.map(leg => (
                <PositionRow key={leg.id} leg={leg} ltpMap={ltpMap}
                  selected={!deselected.has(leg.id)} onToggle={() => toggleLeg(leg.id)}
                  onExit={() => exitLeg(leg)}
                  isRowOpen={openRowId === leg.id} onOpen={o => setOpenRowId(o ? leg.id : null)} />
              ))}
              {tradeLegs.length === 0 && <div className="py-10 text-center text-[12px] text-slate-300 dark:text-white/15">No open positions</div>}

              {/* Closed positions — same row design, greyed, checkable, booked P&L feeds payoff */}
              {closedLegs.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 border-t border-b border-slate-100 dark:border-white/[0.05] text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25">
                    <span className="w-3.5" /><span className="flex-1">Closed · {closedLegs.length}</span><span>booked</span>
                  </div>
                  {closedLegs.map(leg => (
                    <ClosedRow key={leg.id} leg={leg} selected={!closedOff.has(leg.id)} onToggle={() => toggleClosed(leg.id)} />
                  ))}
                </>
              )}
            </div>

            {/* Footer totals */}
            <div className="flex px-3 py-2.5 border-t border-slate-100 dark:border-white/[0.05] bg-slate-50/60 dark:bg-white/[0.015] text-[10px]">
              <div className="flex-1"><div className="text-slate-400 dark:text-white/30">Booked</div><div className={clsx('font-bold tabular-nums', bookedTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{bookedTotal >= 0 ? '+' : '−'}₹{inr(Math.abs(bookedTotal))}</div></div>
              <div className="flex-1"><div className="text-slate-400 dark:text-white/30">Unbooked</div><div className={clsx('font-bold tabular-nums', unbookedTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{unbookedTotal >= 0 ? '+' : '−'}₹{inr(Math.abs(unbookedTotal))}</div></div>
              <div className="flex-1 text-right"><div className="text-slate-400 dark:text-white/30">Net</div><div className={clsx('font-bold tabular-nums', grandPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{grandPos ? '+' : '−'}₹{inr(Math.abs(grandPnl))}</div></div>
            </div>
          </div>

          {/* ── DIVIDER ── */}
          <div onMouseDown={() => { dragging.current = true; document.body.style.cursor = 'col-resize' }}
            className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-indigo-400/40 active:bg-indigo-500/60 transition-colors" title="Drag to resize" />

          {/* ── RIGHT PANE (payoff — stays put) ── */}
          <div className="flex-1 min-w-0 flex flex-col">
            {hasOptions ? (
              <>
                {/* Stats strip */}
                <div className="flex items-center gap-5 px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.05] flex-wrap">
                  <div><div className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-white/25 font-black">Max profit</div><div className="text-[13px] font-black tabular-nums text-emerald-600 dark:text-emerald-400">+₹{inr(Math.abs(stats.maxProfit))}</div></div>
                  <div><div className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-white/25 font-black">Max loss</div><div className="text-[13px] font-black tabular-nums text-red-500 dark:text-red-400">−₹{inr(Math.abs(stats.maxLoss))}</div></div>
                  <div><div className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-white/25 font-black">POP</div><div className="text-[13px] font-black tabular-nums text-slate-700 dark:text-white/70">{stats.pop}%</div></div>
                  {stats.breakevens.length > 0 && (
                    <div><div className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-white/25 font-black">Breakeven{stats.breakevens.length > 1 ? 's' : ''}</div><div className="text-[13px] font-black tabular-nums text-indigo-600 dark:text-indigo-400">{stats.breakevens.map(b => b.toLocaleString('en-IN')).join(' · ')}</div></div>
                  )}
                  {drafts.length > 0 && (
                    <div><div className="text-[9px] uppercase tracking-widest text-indigo-400 dark:text-indigo-400/60 font-black">Preview</div><div className="text-[13px] font-black tabular-nums text-indigo-600 dark:text-indigo-400">+{drafts.length} new leg{drafts.length > 1 ? 's' : ''}</div></div>
                  )}
                  {bookedOffset !== 0 && (
                    <div><div className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-white/25 font-black">Booked incl.</div><div className={clsx('text-[13px] font-black tabular-nums', bookedOffset >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{bookedOffset >= 0 ? '+' : '−'}₹{inr(Math.abs(bookedOffset))}</div></div>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-white/30"><span className="w-4 h-[3px] rounded bg-emerald-500" />Expiry</span>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-white/30"><svg viewBox="0 0 20 4" style={{ width: 18, height: 4 }}><line x1="0" y1="2" x2="6" y2="2" stroke="#60A5FA" strokeWidth={2} /><line x1="10" y1="2" x2="16" y2="2" stroke="#60A5FA" strokeWidth={2} /></svg>Today</span>
                  </div>
                </div>

                {/* Chart — shared PayoffChart (same as Trade → Strategy section) */}
                <div className="flex-1 min-h-0 px-2 pt-2 relative">
                  <PayoffChart data={payoffChartData} spot={Math.round(spot)} breakevens={stats.breakevens} target={targetPrice} bands={payoffBands} />
                  {payoffChartData.length > 0 && (
                    <div className={clsx('absolute left-1/2 -translate-x-1/2 bottom-1 px-3 py-1 rounded-full text-[11px] font-bold shadow-lg', projAtTarget >= 0 ? 'bg-green-600 text-white' : 'bg-red-600 text-white')}>
                      Projected {projAtTarget >= 0 ? 'profit' : 'loss'}: {projAtTarget >= 0 ? '+' : '−'}₹{inr(Math.abs(projAtTarget))}
                    </div>
                  )}
                </div>

                {/* Controls — Target price & Days to expiry (Sensibull-style) */}
                {chartLegs.length > 0 && (
                  <div className="flex items-stretch gap-6 px-4 py-3 border-t border-slate-100 dark:border-white/[0.05] bg-slate-50/60 dark:bg-white/[0.015] flex-wrap">
                    {/* Target price */}
                    <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/35">{chainIndex} target</span>
                        <span className="text-[10px] font-bold tabular-nums text-slate-700 dark:text-white/60">{targetPct >= 0 ? '+' : ''}{targetPct.toFixed(1)}%</span>
                        <div className="ml-auto flex items-center gap-1">
                          <button onClick={() => setTargetPct(p => Math.max(-15, +(p - 0.1).toFixed(1)))} className="h-5 w-5 rounded border border-slate-200 dark:border-white/[0.1] text-slate-500 dark:text-white/40 text-xs font-bold leading-none">−</button>
                          <span className="text-[11px] font-bold tabular-nums text-slate-800 dark:text-white/75 w-[68px] text-center">{(spot > 0 ? Math.round(spot * (1 + targetPct / 100)) : 0).toLocaleString('en-IN')}</span>
                          <button onClick={() => setTargetPct(p => Math.min(15, +(p + 0.1).toFixed(1)))} className="h-5 w-5 rounded border border-slate-200 dark:border-white/[0.1] text-slate-500 dark:text-white/40 text-xs font-bold leading-none">+</button>
                          {targetPct !== 0 && <button onClick={() => setTargetPct(0)} className="ml-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-600">Reset</button>}
                        </div>
                      </div>
                      <input type="range" min={-10} max={10} step={0.1} value={targetPct} onChange={e => setTargetPct(Number(e.target.value))} className="w-full accent-indigo-500 cursor-pointer" style={{ height: 4 }} />
                    </div>

                    {/* Days to expiry — left = today, right = expiry */}
                    {maxDte > 0 && (
                      <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/35">Date · {activeDte}D to expiry</span>
                          <span className="text-[10px] font-bold tabular-nums text-slate-700 dark:text-white/60">{targetDateLabel}</span>
                          {activeDte !== maxDte && <button onClick={() => setDteDays(maxDte)} className="ml-auto text-[10px] font-bold text-indigo-500 hover:text-indigo-600">Reset</button>}
                        </div>
                        {/* value = elapsed days (0 today → maxDte expiry); activeDte = maxDte − elapsed */}
                        <input type="range" min={0} max={maxDte} step={1} value={maxDte - activeDte} onChange={e => setDteDays(maxDte - Number(e.target.value))} className="w-full accent-indigo-500 cursor-pointer" style={{ height: 4 }} />
                        <div className="flex items-center justify-between text-[9px] font-semibold text-slate-400 dark:text-white/25">
                          <span>{todayLabel} · today</span>
                          <span>{expiryLabel} · expiry</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <p className="text-[12px] text-slate-300 dark:text-white/15">No option legs to chart yet</p>
                <button onClick={() => setChainOpen(true)} className="h-8 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[12px] font-bold">+ Add positions</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Option chain modal (Add) ── */}
      {chainOpen && (
        <OptionChainModal
          index={chainIndex}
          expiry={chainExpiry}
          onExpiry={setChainExpiry}
          runningMap={runningMap}
          drafts={drafts}
          onToggleDraft={toggleDraft}
          onRoll={rollViaDraft}
          onSpot={setChainSpot}
          onClearAll={() => setDrafts([])}
          onClose={() => setChainOpen(false)}
        />
      )}
    </div>
  )
}
