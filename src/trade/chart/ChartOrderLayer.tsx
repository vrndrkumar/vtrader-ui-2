// ── Premium on-chart order layer (HTML over the canvas) ──────────────────────
// Positions render as a single elegant order line. Stop-loss / target are NOT
// created automatically — the trader reveals "Set SL / Set Target" on hover or
// selection and adds them explicitly. Each level is then independently drag-to-
// move (pointer-capture based, so drags never get stolen by the chart canvas).
// A hit SL/Target closes the position (one-cancels-the-other).

import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { ChartEngine } from './ChartEngine'
import { useTradeStore, type Position } from '../store/tradeStore'
import { useTradebookStore } from '../features/tradebook/tradebookStore'
import { isLiveStatus } from '../features/tradebook/types'
import { clearStop, clearTarget, exitPosition, modifyStop, modifyStopQty, modifyTarget, modifyTargetQty } from '../data/trade/tradeAdapter'

type Leg = 'sl' | 'tp'
type DragTarget =
  | { kind: 'leg'; id: string; leg: Leg }
  | { kind: 'order'; id: string; field: 'price' | 'triggerPrice'; last: number }
const money = (n: number) => `${n >= 0 ? '+' : '-'}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const px = (n: number) => n.toFixed(2)

const COLORS = { long: '#4f46e5', short: '#7c3aed', sl: '#ef4444', tp: '#14b8a6' }

type Kind = 'long' | 'short' | 'sl' | 'tp' | 'buy' | 'sell'

// Card, separator and text tokens (light ↔ soft-matte-charcoal dark).
const CARD = 'border bg-[#F8F7FC] border-[#E2E0EE] shadow-md dark:bg-[#2d2d33] dark:border-[#2A2A32] dark:shadow-xl'
const SEP = 'bg-[#2073e0] dark:bg-[#8888e6]'
const AT = 'text-[#94A3B8] dark:text-[#71717A]'
const PRICE = 'text-[#0F172A] dark:text-[#F4F4F5]'

// Accent strip + bordered type badge per kind.
const TYPE: Record<Kind, { accent: string; badge: string }> = {
  long:  { accent: 'bg-indigo-600 dark:bg-indigo-400', badge: 'text-indigo-700 border-indigo-300 bg-indigo-50 dark:text-indigo-200 dark:border-indigo-500/50 dark:bg-indigo-500/15' },
  short: { accent: 'bg-[#7C3AED] dark:bg-[#BB86FC]', badge: 'text-[#6B21A8] border-[#C084FC] bg-[#F3E8FF] dark:text-[#E1BEE7] dark:border-[#5E4B8A] dark:bg-[#2D253D]' },
  sl:    { accent: 'bg-red-500 dark:bg-red-400', badge: 'text-red-700 border-red-300 bg-red-50 dark:text-red-300 dark:border-red-500/50 dark:bg-red-500/15' },
  tp:    { accent: 'bg-teal-500 dark:bg-teal-400', badge: 'text-teal-700 border-teal-300 bg-teal-50 dark:text-teal-300 dark:border-teal-500/40 dark:bg-teal-500/15' },
  buy:   { accent: 'bg-blue-600 dark:bg-blue-400', badge: 'text-blue-700 border-blue-300 bg-blue-50 dark:text-blue-200 dark:border-blue-500/50 dark:bg-blue-500/15' },
  sell:  { accent: 'bg-rose-500 dark:bg-rose-400', badge: 'text-rose-700 border-rose-300 bg-rose-50 dark:text-rose-300 dark:border-rose-500/50 dark:bg-rose-500/15' },
}
const ORDER_LINE: Record<'buy' | 'sell', string> = { buy: '#2563eb', sell: '#f43f5e' }

const pnlBadge = (n: number) => n >= 0
  ? 'text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-[#34D399] dark:border-[#1D6F7A] dark:bg-[#162E30]'
  : 'text-rose-700 border-rose-200 bg-rose-50 dark:text-[#F87171] dark:border-[#7F1D1D] dark:bg-[#2E1616]'

/** Invert the chart's price→y mapping (robust even without convertFromPixel). */
function yToPriceVia(eng: ChartEngine, y: number, ref: number): number | null {
  const p0 = ref > 0 ? ref : 100
  const p1 = p0 * 1.01
  const y0 = eng.priceToY(p0)
  const y1 = eng.priceToY(p1)
  if (y0 != null && y1 != null && y1 !== y0) {
    const slope = (y1 - y0) / (p1 - p0)
    return +(p0 + (y - y0) / slope).toFixed(2)
  }
  return eng.yToPrice(y)
}

export function ChartOrderLayer({ engineRef, symbolKey, ltp }: {
  engineRef: React.MutableRefObject<ChartEngine | null>
  symbolKey: string
  ltp: number
}) {
  const positions = useTradeStore((s) => s.positions)
  const rows = useMemo(() => Object.values(positions).filter((p) => p.symbolKey === symbolKey), [positions, symbolKey])

  // Pending (not-yet-executed) orders for THIS strike — shown as draggable lines.
  const tbOrders = useTradebookStore((s) => s.orders)
  const pending = useMemo(() => tbOrders.filter((o) => o.symbol === symbolKey && isLiveStatus(o.status)), [tbOrders, symbolKey])
  const orderLinePrice = (o: (typeof pending)[number]) => (o.priceType === 'SL-LMT' ? o.triggerPrice : o.price)

  // Mirror real running positions (from /trade/positions) for THIS strike into
  // the chart store so they render with the same line UI. SL/Target set here are
  // chart-local annotations; exiting a mirrored position squares off for real.
  const tbPositions = useTradebookStore((s) => s.positions)
  useEffect(() => {
    const st = useTradeStore.getState()
    const want = new Set<string>()
    for (const p of tbPositions) {
      if (p.symbol !== symbolKey || p.status !== 'OPEN') continue
      const id = `tb:${p.id}`
      want.add(id)
      const net = p.buyQty - p.sellQty
      const ex = st.positions[id]
      if (!ex) st.upsertPosition({ id, brokerId: p.brokerId, symbolKey, display: p.display, netQty: net, avgPrice: p.avgPrice })
      else if (ex.netQty !== net || ex.avgPrice !== p.avgPrice) st.updatePosition(id, { netQty: net, avgPrice: p.avgPrice })
    }
    for (const id of Object.keys(st.positions)) {
      if (id.startsWith('tb:') && st.positions[id].symbolKey === symbolKey && !want.has(id)) st.removePosition(id)
    }
  }, [tbPositions, symbolKey])

  const onExit = (p: Position) => {
    if (p.id.startsWith('tb:')) useTradebookStore.getState().squareOff(p.id.slice(3))
    else exitPosition(p.id)
  }

  const wrapRef = useRef<HTMLDivElement>(null)
  const elMap = useRef(new Map<string, HTMLDivElement>())
  const priceMap = useRef(new Map<string, number>())
  const draggingRef = useRef(false)
  const dragRef = useRef<DragTarget | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)

  // Price lookup, rebuilt each render (prices change on drag / feed).
  priceMap.current = new Map()
  for (const p of rows) {
    priceMap.current.set(`${p.id}:pos`, p.avgPrice)
    if (p.stopLoss != null) priceMap.current.set(`${p.id}:sl`, p.stopLoss)
    if (p.target != null) priceMap.current.set(`${p.id}:tp`, p.target)
  }
  for (const o of pending) priceMap.current.set(`ord:${o.id}`, orderLinePrice(o))

  // RAF: glue every tag to its price (imperative — no re-render per frame).
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const eng = engineRef.current
      if (eng) {
        priceMap.current.forEach((price, id) => {
          const el = elMap.current.get(id)
          if (!el) return
          const y = eng.priceToY(price)
          const h = wrapRef.current?.clientHeight ?? 0
          if (y == null || y < -20 || y > h + 20) { el.style.opacity = '0'; el.style.pointerEvents = 'none' }
          else { el.style.transform = `translateY(${y}px)`; el.style.opacity = '1'; el.style.pointerEvents = '' }
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engineRef])

  // Drag moves handled at the window level so the very first press drags
  // immediately (no priming click) and the chart canvas can't steal the move.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current; const eng = engineRef.current; const rect = wrapRef.current?.getBoundingClientRect()
      if (!d || !eng || !rect) return
      const y = e.clientY - rect.top
      if (d.kind === 'leg') {
        const price = yToPriceVia(eng, y, priceMap.current.get(`${d.id}:${d.leg}`) ?? 0)
        if (price == null || price <= 0) return
        if (d.leg === 'sl') modifyStop(d.id, price); else modifyTarget(d.id, price)
      } else {
        const price = yToPriceVia(eng, y, priceMap.current.get(`ord:${d.id}`) ?? d.last)
        if (price == null || price <= 0) return
        d.last = price
        priceMap.current.set(`ord:${d.id}`, price) // preview only — committed on release
      }
    }
    const end = () => {
      const d = dragRef.current
      // Pending order price/trigger is committed once, on release (single modify call).
      if (d?.kind === 'order') useTradebookStore.getState().modifyOrder(d.id, d.field === 'price' ? { price: d.last } : { triggerPrice: d.last })
      if (d) { dragRef.current = null; draggingRef.current = false; setDragging(null) }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end) }
  }, [engineRef])

  // One-cancels-other: a hit SL/Target closes the position (skipped mid-drag).
  useEffect(() => {
    if (!ltp || draggingRef.current) return
    for (const p of rows) {
      const long = p.netQty > 0
      if (p.stopLoss != null && ((long && ltp <= p.stopLoss) || (!long && ltp >= p.stopLoss))) {
        onExit(p); toast(`Stop-loss hit · ${p.display}`, { icon: '🛑' })
      } else if (p.target != null && ((long && ltp >= p.target) || (!long && ltp <= p.target))) {
        onExit(p); toast.success(`Target hit · ${p.display}`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ltp])

  const refCb = (id: string) => (el: HTMLDivElement | null) => { if (el) elMap.current.set(id, el); else elMap.current.delete(id) }
  const addStop = (p: Position) => modifyStop(p.id, +(((ltp || p.avgPrice) * (p.netQty > 0 ? 0.97 : 1.03)).toFixed(2)))
  const addTarget = (p: Position) => modifyTarget(p.id, +(((ltp || p.avgPrice) * (p.netQty > 0 ? 1.05 : 0.95)).toFixed(2)))

  const legDrag = (p: Position, leg: Leg) => ({
    dragging: dragging === `${p.id}:${leg}`,
    onStart: () => { dragRef.current = { kind: 'leg', id: p.id, leg }; draggingRef.current = true; setDragging(`${p.id}:${leg}`) },
  })
  const store = useTradebookStore.getState
  const startOrderDrag = (o: (typeof pending)[number]) => {
    dragRef.current = { kind: 'order', id: o.id, field: o.priceType === 'SL-LMT' ? 'triggerPrice' : 'price', last: orderLinePrice(o) }
    draggingRef.current = true; setDragging(`ord:${o.id}`)
  }

  return (
    <div ref={wrapRef} className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
      {rows.map((p) => {
        const long = p.netQty > 0
        const qty = Math.abs(p.netQty)
        const pnl = ltp ? (ltp - p.avgPrice) * p.netQty : 0
        const open = sel === p.id
        return (
          <div key={p.id}>
            {/* ── Entry / position line (full-width line + tag on top) ── */}
            <div ref={refCb(`${p.id}:pos`)} className="absolute left-0 right-0 top-0 opacity-0 will-change-transform transition-opacity">
              <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center">
                <div className="absolute inset-x-0 border-t border-dashed pointer-events-none" style={{ borderColor: long ? COLORS.long : COLORS.short }} />
                <div className="relative group flex items-center gap-1.5 pl-2 pointer-events-auto">
                  <button onClick={() => setSel(open ? null : p.id)} className={clsx('relative flex items-center gap-2 h-8 pl-3 pr-2 rounded-r-xl rounded-l-md transition-transform hover:scale-[1.02] active:scale-95', CARD, open && '!border-indigo-400 ring-2 ring-indigo-400/40')}>
                    <span className={clsx('absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r', TYPE[long ? 'long' : 'short'].accent)} />
                    <span className={clsx('px-2 py-0.5 rounded-md border text-[11px] font-bold tracking-wider tabular-nums', TYPE[long ? 'long' : 'short'].badge)}>{long ? 'LONG' : 'SHORT'} {qty}</span>
                    <span className={clsx('text-[11px]', AT)}>@</span>
                    <span className={clsx('text-[13px] font-extrabold tracking-tight tabular-nums', PRICE)}>{p.avgPrice.toFixed(2)}</span>
                    <span className={clsx('mx-0.5 h-4 w-px', SEP)} />
                    <span className={clsx('px-2 py-0.5 rounded-md border text-[11px] font-bold tracking-wide tabular-nums', pnlBadge(pnl))}>{money(pnl)}</span>
                    <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5 transition-transform', AT, open && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7" /></svg>
                  </button>

                  <div className={clsx('flex items-center gap-1 transition-all duration-200',
                    open ? 'opacity-100 translate-x-0 pointer-events-auto'
                      : 'opacity-0 -translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto')}>
                    {p.stopLoss == null && <Chip tone="sl" label="Set SL" onClick={() => addStop(p)} />}
                    {p.target == null && <Chip tone="tp" label="Set Target" onClick={() => addTarget(p)} />}
                    <IconChip title="Exit position" danger onClick={() => onExit(p)}><path d="M6 6l12 12M18 6L6 18" /></IconChip>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Stop-loss (editable qty) ── */}
            {p.stopLoss != null && (() => {
              const slQty = p.stopQty ?? qty
              return <LegTag refCb={refCb(`${p.id}:sl`)} kind="sl" color={COLORS.sl} label="SL" price={p.stopLoss} qty={slQty}
                pnl={(p.stopLoss - p.avgPrice) * (long ? 1 : -1) * slQty}
                onSetQty={(q) => modifyStopQty(p.id, q)} onRemove={() => clearStop(p.id)} {...legDrag(p, 'sl')} />
            })()}
            {/* ── Target (editable qty) ── */}
            {p.target != null && (() => {
              const tpQty = p.targetQty ?? qty
              return <LegTag refCb={refCb(`${p.id}:tp`)} kind="tp" color={COLORS.tp} label="Target" price={p.target} qty={tpQty}
                pnl={(p.target - p.avgPrice) * (long ? 1 : -1) * tpQty}
                onSetQty={(q) => modifyTargetQty(p.id, q)} onRemove={() => clearTarget(p.id)} {...legDrag(p, 'tp')} />
            })()}
          </div>
        )
      })}

      {/* ── Pending orders (limit / SL) — draggable, cancel, edit qty ── */}
      {pending.map((o) => (
        <OrderTag key={`ord:${o.id}`} refCb={refCb(`ord:${o.id}`)} side={o.side} qty={o.qty}
          price={orderLinePrice(o)} priceType={o.priceType} dragging={dragging === `ord:${o.id}`}
          onStart={() => startOrderDrag(o)}
          onSetQty={(q) => store().modifyOrder(o.id, { qty: q })}
          onCancel={() => store().cancelOrder(o.id)} />
      ))}
    </div>
  )
}

function OrderTag({ refCb, dragging, onStart, side, qty, price, priceType, onSetQty, onCancel }: {
  refCb: (el: HTMLDivElement | null) => void
  dragging: boolean; onStart: () => void
  side: 'BUY' | 'SELL'; qty: number; price: number; priceType: 'MKT' | 'LMT' | 'SL-LMT'
  onSetQty: (qty: number) => void; onCancel: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(qty))
  const kind: 'buy' | 'sell' = side === 'BUY' ? 'buy' : 'sell'
  const color = ORDER_LINE[kind]
  const commit = () => { onSetQty(Number(val) || 1); setEditing(false) }
  const down = (e: React.PointerEvent) => {
    if (editing) return
    e.preventDefault(); e.stopPropagation()
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* window listeners cover it */ }
    onStart()
  }
  return (
    <div ref={refCb} className="absolute left-0 right-0 top-0 opacity-0 will-change-transform transition-opacity">
      <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center">
        <div className="absolute inset-x-0 border-t border-dotted pointer-events-none" style={{ borderColor: color, borderTopWidth: dragging ? 2 : 1 }} />
        {editing ? (
          <div className={clsx('relative ml-2 flex items-center gap-1 h-8 pl-2 pr-1 rounded-r-xl rounded-l-md pointer-events-auto', CARD)}>
            <span className={clsx('px-1.5 py-0.5 rounded-md border text-[10px] font-bold', TYPE[kind].badge)}>{side}</span>
            <button onClick={() => setVal(String(Math.max(1, (Number(val) || 1) - 1)))} className={clsx('h-5 w-5 grid place-items-center rounded hover:bg-black/5 dark:hover:bg-white/10', AT)}>−</button>
            <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }} className={clsx('w-10 h-5 text-center text-[11px] font-bold tabular-nums bg-transparent outline-none', PRICE)} />
            <button onClick={() => setVal(String((Number(val) || 0) + 1))} className={clsx('h-5 w-5 grid place-items-center rounded hover:bg-black/5 dark:hover:bg-white/10', AT)}>＋</button>
            <button onClick={commit} className="h-5 px-2 rounded-md text-white text-[10px] font-bold" style={{ background: color }}>Set</button>
          </div>
        ) : (
          <div onPointerDown={down}
            className={clsx('relative group flex items-center gap-2 h-8 ml-2 pl-3 pr-2 rounded-r-xl rounded-l-md cursor-ns-resize select-none pointer-events-auto touch-none transition-transform', CARD,
              dragging ? 'scale-105 shadow-xl' : 'hover:scale-[1.03]')}>
            <span className={clsx('absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r', TYPE[kind].accent)} />
            <span className={clsx('px-2 py-0.5 rounded-md border text-[11px] font-bold tracking-wider', TYPE[kind].badge)}>{side} <span className="tabular-nums font-extrabold">{qty}</span></span>
            <span className={clsx('text-[11px]', AT)}>@</span>
            <span className={clsx('text-[13px] font-extrabold tabular-nums', PRICE)}>{px(price)}</span>
            <span className={clsx('mx-0.5 h-4 w-px', SEP)} />
            <span className="px-1.5 py-0.5 rounded-md border text-[10px] font-bold tracking-wide text-slate-500 border-slate-300 bg-slate-50 dark:text-slate-300 dark:border-slate-600 dark:bg-white/5">{priceType === 'SL-LMT' ? 'SL' : priceType}</span>
            <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[56px] group-hover:opacity-100 transition-all duration-200 flex items-center gap-0.5 whitespace-nowrap">
              <button title="Edit qty" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setVal(String(qty)); setEditing(true) }} className={clsx('h-5 w-5 grid place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10', AT)}>
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
              </button>
              <button title="Cancel order" onPointerDown={(e) => e.stopPropagation()} onClick={onCancel} className={clsx('h-5 w-5 grid place-items-center rounded-md hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/10', AT)}>
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function Chip({ tone, label, onClick }: { tone: 'sl' | 'tp'; label: string; onClick: () => void }) {
  return (
    <button onPointerDown={(e) => e.stopPropagation()} onClick={onClick}
      className={clsx('h-6 px-2 rounded-lg text-white text-[10px] font-bold shadow-sm transition-all active:scale-95 whitespace-nowrap',
        tone === 'sl' ? 'bg-red-500 hover:bg-red-600' : 'bg-teal-500 hover:bg-teal-600')}>
      {label}
    </button>
  )
}

function IconChip({ title, danger, onClick, children }: { title: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onPointerDown={(e) => e.stopPropagation()} onClick={onClick}
      className={clsx('h-6 w-6 grid place-items-center rounded-lg bg-white/95 dark:bg-slate-800/95 shadow-sm ring-1 ring-black/5 dark:ring-white/10 transition-all active:scale-90',
        danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10')}>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  )
}

function LegTag({ refCb, dragging, onStart, kind, color, label, price, qty, pnl, onSetQty, onRemove }: {
  refCb: (el: HTMLDivElement | null) => void
  dragging: boolean; onStart: () => void
  kind: 'sl' | 'tp'; color: string; label: string; price: number; qty: number; pnl: number
  onSetQty: (qty: number) => void; onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(qty))
  const down = (e: React.PointerEvent) => {
    if (editing) return
    e.preventDefault(); e.stopPropagation()
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* window listeners cover it */ }
    onStart()
  }
  const commit = () => { onSetQty(Number(val) || 1); setEditing(false) }
  const startEdit = (e: React.MouseEvent) => { e.stopPropagation(); setVal(String(qty)); setEditing(true) }

  return (
    <div ref={refCb} className="absolute left-0 right-0 top-0 opacity-0 will-change-transform transition-opacity">
      <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center">
        {/* Full-width dashed line (behind the tag) */}
        <div className="absolute inset-x-0 border-t border-dashed pointer-events-none transition-all" style={{ borderColor: color, borderTopWidth: dragging ? 2 : 1 }} />
        {editing ? (
          <div className={clsx('relative ml-2 flex items-center gap-1 h-8 pl-2 pr-1 rounded-r-xl rounded-l-md pointer-events-auto', CARD)}>
            <span className={clsx('px-1.5 py-0.5 rounded-md border text-[10px] font-bold', TYPE[kind].badge)}>{label}</span>
            <button onClick={() => setVal(String(Math.max(1, (Number(val) || 1) - 1)))} className={clsx('h-5 w-5 grid place-items-center rounded hover:bg-black/5 dark:hover:bg-white/10', AT)}>−</button>
            <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }} className={clsx('w-10 h-5 text-center text-[11px] font-bold tabular-nums bg-transparent outline-none', PRICE)} />
            <button onClick={() => setVal(String((Number(val) || 0) + 1))} className={clsx('h-5 w-5 grid place-items-center rounded hover:bg-black/5 dark:hover:bg-white/10', AT)}>＋</button>
            <button onClick={commit} className="h-5 px-2 rounded-md text-white text-[10px] font-bold" style={{ background: color }}>Set</button>
          </div>
        ) : (
          <div
            onPointerDown={down}
            className={clsx('relative group flex items-center gap-2 h-8 ml-2 pl-3 pr-2 rounded-r-xl rounded-l-md cursor-ns-resize select-none pointer-events-auto touch-none transition-transform', CARD,
              dragging ? 'scale-105 shadow-xl' : 'hover:scale-[1.03]')}
          >
            <span className={clsx('absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r transition-all', TYPE[kind].accent, dragging && 'top-[8%] bottom-[8%]')} />
            <span className={clsx('px-2 py-0.5 rounded-md border text-[11px] font-bold tracking-wider', TYPE[kind].badge)}>{label} <span className="tabular-nums font-extrabold">{qty}</span></span>
            <span className={clsx('text-[11px]', AT)}>@</span>
            <span className={clsx('text-[13px] font-extrabold tracking-tight tabular-nums', PRICE)}>{px(price)}</span>
            <span className={clsx('mx-0.5 h-4 w-px', SEP)} />
            <span className={clsx('px-2 py-0.5 rounded-md border text-[11px] font-bold tracking-wide tabular-nums', pnlBadge(pnl))}>{money(pnl)}</span>
            <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[56px] group-hover:opacity-100 transition-all duration-200 flex items-center gap-0.5 whitespace-nowrap">
              <button title="Edit qty" onPointerDown={(e) => e.stopPropagation()} onClick={startEdit} className={clsx('h-5 w-5 grid place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10', AT)}>
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
              </button>
              <button title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} className={clsx('h-5 w-5 grid place-items-center rounded-md hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/10', AT)}>
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
