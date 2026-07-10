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
import { clearStop, clearTarget, exitPosition, modifyStop, modifyStopQty, modifyTarget, modifyTargetQty } from '../data/trade/tradeAdapter'

type Leg = 'sl' | 'tp'
const money = (n: number) => `${n >= 0 ? '+' : '-'}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const px = (n: number) => n.toFixed(2)

const COLORS = { long: '#4f46e5', short: '#e11d48', sl: '#ef4444', tp: '#14b8a6' }

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

  const wrapRef = useRef<HTMLDivElement>(null)
  const elMap = useRef(new Map<string, HTMLDivElement>())
  const priceMap = useRef(new Map<string, number>())
  const draggingRef = useRef(false)
  const dragRef = useRef<{ id: string; leg: Leg } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)

  // Price lookup, rebuilt each render (prices change on drag / feed).
  priceMap.current = new Map()
  for (const p of rows) {
    priceMap.current.set(`${p.id}:pos`, p.avgPrice)
    if (p.stopLoss != null) priceMap.current.set(`${p.id}:sl`, p.stopLoss)
    if (p.target != null) priceMap.current.set(`${p.id}:tp`, p.target)
  }

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
      const cur = priceMap.current.get(`${d.id}:${d.leg}`) ?? 0
      const price = yToPriceVia(eng, e.clientY - rect.top, cur)
      if (price == null || price <= 0) return
      if (d.leg === 'sl') modifyStop(d.id, price); else modifyTarget(d.id, price)
    }
    const end = () => { if (dragRef.current) { dragRef.current = null; draggingRef.current = false; setDragging(null) } }
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
        exitPosition(p.id); toast(`Stop-loss hit · ${p.display}`, { icon: '🛑' })
      } else if (p.target != null && ((long && ltp >= p.target) || (!long && ltp <= p.target))) {
        exitPosition(p.id); toast.success(`Target hit · ${p.display}`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ltp])

  const refCb = (id: string) => (el: HTMLDivElement | null) => { if (el) elMap.current.set(id, el); else elMap.current.delete(id) }
  const addStop = (p: Position) => modifyStop(p.id, +(((ltp || p.avgPrice) * (p.netQty > 0 ? 0.97 : 1.03)).toFixed(2)))
  const addTarget = (p: Position) => modifyTarget(p.id, +(((ltp || p.avgPrice) * (p.netQty > 0 ? 1.05 : 0.95)).toFixed(2)))

  const legDrag = (p: Position, leg: Leg) => ({
    dragging: dragging === `${p.id}:${leg}`,
    onStart: () => { dragRef.current = { id: p.id, leg }; draggingRef.current = true; setDragging(`${p.id}:${leg}`) },
  })

  return (
    <div ref={wrapRef} className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
      {rows.map((p) => {
        const long = p.netQty > 0
        const qty = Math.abs(p.netQty)
        const pnl = ltp ? (ltp - p.avgPrice) * p.netQty : 0
        const open = sel === p.id
        return (
          <div key={p.id}>
            {/* ── Entry / position line ── */}
            <div ref={refCb(`${p.id}:pos`)} className="absolute left-0 right-0 top-0 opacity-0 will-change-transform transition-opacity">
              <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center">
                <div className="group flex items-center gap-1.5 pl-2 pointer-events-auto">
                  <button onClick={() => setSel(open ? null : p.id)} className={clsx('flex items-stretch h-6 rounded-lg overflow-hidden shadow-sm ring-1 transition-transform hover:scale-[1.02] active:scale-95', open ? 'ring-indigo-400' : 'ring-black/10 dark:ring-white/10')}>
                    <span className="flex items-center px-1.5 text-white text-[11px] font-extrabold tabular-nums" style={{ background: long ? COLORS.long : COLORS.short }}>{long ? '+' : '−'}{qty}</span>
                    <span className="flex items-center gap-1 px-1.5 bg-white dark:bg-slate-800">
                      <span className={clsx('text-[11px] font-bold tabular-nums', pnl >= 0 ? 'text-green-600' : 'text-red-600')}>{money(pnl)}</span>
                      <svg viewBox="0 0 24 24" className={clsx('h-3 w-3 text-slate-400 transition-transform', open && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
                    </span>
                  </button>

                  <div className={clsx('flex items-center gap-1 transition-all duration-200',
                    open ? 'opacity-100 translate-x-0 pointer-events-auto'
                      : 'opacity-0 -translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto')}>
                    {p.stopLoss == null && <Chip tone="sl" label="Set SL" onClick={() => addStop(p)} />}
                    {p.target == null && <Chip tone="tp" label="Set Target" onClick={() => addTarget(p)} />}
                    <IconChip title="Exit position" danger onClick={() => exitPosition(p.id)}><path d="M6 6l12 12M18 6L6 18" /></IconChip>
                  </div>
                </div>
                <div className="flex-1 ml-1 border-t border-dashed" style={{ borderColor: long ? COLORS.long : COLORS.short }} />
              </div>
            </div>

            {/* ── Stop-loss (editable qty) ── */}
            {p.stopLoss != null && (() => {
              const slQty = p.stopQty ?? qty
              return <LegTag refCb={refCb(`${p.id}:sl`)} color={COLORS.sl} label="SL" price={p.stopLoss} qty={slQty}
                pnl={(p.stopLoss - p.avgPrice) * (long ? 1 : -1) * slQty}
                onSetQty={(q) => modifyStopQty(p.id, q)} onRemove={() => clearStop(p.id)} {...legDrag(p, 'sl')} />
            })()}
            {/* ── Target (editable qty) ── */}
            {p.target != null && (() => {
              const tpQty = p.targetQty ?? qty
              return <LegTag refCb={refCb(`${p.id}:tp`)} color={COLORS.tp} label="Target" price={p.target} qty={tpQty}
                pnl={(p.target - p.avgPrice) * (long ? 1 : -1) * tpQty}
                onSetQty={(q) => modifyTargetQty(p.id, q)} onRemove={() => clearTarget(p.id)} {...legDrag(p, 'tp')} />
            })()}
          </div>
        )
      })}
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

function LegTag({ refCb, dragging, onStart, color, label, price, qty, pnl, onSetQty, onRemove }: {
  refCb: (el: HTMLDivElement | null) => void
  dragging: boolean; onStart: () => void
  color: string; label: string; price: number; qty: number; pnl: number
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
        {editing ? (
          <div className="ml-2 flex items-center gap-1 h-6 pl-1 pr-1 rounded-lg bg-white dark:bg-slate-800 shadow-lg pointer-events-auto ring-1" style={{ ['--tw-ring-color' as string]: color }}>
            <span className="text-[10px] font-bold px-1 text-white rounded" style={{ background: color }}>{label}</span>
            <button onClick={() => setVal(String(Math.max(1, (Number(val) || 1) - 1)))} className="h-5 w-5 grid place-items-center rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">−</button>
            <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }} className="w-10 h-5 text-center text-[11px] tabular-nums bg-transparent outline-none" />
            <button onClick={() => setVal(String((Number(val) || 0) + 1))} className="h-5 w-5 grid place-items-center rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">＋</button>
            <button onClick={commit} className="h-5 px-1.5 rounded text-white text-[10px] font-bold" style={{ background: color }}>Set</button>
          </div>
        ) : (
          <div
            onPointerDown={down}
            className={clsx('group flex items-stretch h-6 ml-2 rounded-lg overflow-hidden shadow-sm ring-1 ring-black/10 dark:ring-white/10 cursor-ns-resize select-none pointer-events-auto touch-none transition-transform',
              dragging ? 'scale-105 shadow-lg' : 'hover:scale-[1.03]')}
          >
            <span className="flex items-center gap-1 px-2 text-white text-[11px] font-bold" style={{ background: color }}>
              <svg viewBox="0 0 24 24" className="h-3 w-3 -ml-0.5 opacity-0 group-hover:opacity-90 transition-opacity" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
              {label} <span className="tabular-nums font-extrabold">{qty}</span>
            </span>
            <span className="flex items-center gap-1 px-1.5 bg-white dark:bg-slate-800">
              <span className={clsx('text-[11px] font-bold tabular-nums', pnl >= 0 ? 'text-green-600' : 'text-red-600')}>{dragging ? px(price) : money(pnl)}</span>
              <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[140px] group-hover:opacity-100 transition-all duration-200 flex items-center gap-1 whitespace-nowrap">
                <span className="text-[10px] text-slate-400 tabular-nums">@{px(price)}</span>
                <button title="Edit qty" onPointerDown={(e) => e.stopPropagation()} onClick={startEdit} className="h-4 w-4 grid place-items-center rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10">
                  <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
                </button>
                <button title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} className="h-4 w-4 grid place-items-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </span>
            </span>
          </div>
        )}
        <div className="flex-1 ml-1 border-t border-dashed transition-all" style={{ borderColor: color, borderTopWidth: dragging ? 2 : 1 }} />
      </div>
    </div>
  )
}
