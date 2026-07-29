// ── Index-bracket lines on the index chart (drag + qty edit) ─────────────────
// Same look & feel as the strike order layer (shared tag tokens). Entry / SL /
// target render at their INDEX levels; the entry tag carries "SL"/"Target" chips
// (press-drag onto the chart to place); lines drag to move; each tag edits its
// quantity; × removes a leg / cancels the bracket. Legs stay dashed/dim until the
// entry fills — then the entry tag becomes a POSITION tag (LONG/SHORT @ avg with
// live P&L), matching the strike chart. All edits persist via the update API.

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import type { ChartEngine } from './ChartEngine'
import { lotSizeFor } from '@/services/orders/lotSize'
import { useIndexBracketStore, type IndexBracket } from '../store/indexBracketStore'
import { useTradebookStore } from '../features/tradebook/tradebookStore'
import { netQty, type Position } from '../features/tradebook/types'
import { realtime } from '../data/realtime/realtimeService'
import { useMarketStore } from '../store/marketStore'
import { CARD, SEP, AT, PRICE, COLORS, TYPE, pnlBadge, money, px, type Kind } from './tagStyles'
import { cancelIndexBracket, updateIndexBracket, type IndexBracketPatch } from '@/api/trade'

type Leg = 'entry' | 'sl' | 'tgt'

const EMPTY: IndexBracket[] = []
const EMPTY_POS: Position[] = []
const strikeLabel = (sym: string) => sym.split('_').slice(-2).join(' ')
const colorOf = (k: Kind) => (COLORS as Record<string, string>)[k] ?? '#6366f1'

function yToPrice(eng: ChartEngine, y: number, ref: number): number | null {
  const p0 = ref > 0 ? ref : 100
  const p1 = p0 * 1.01
  const y0 = eng.priceToY(p0); const y1 = eng.priceToY(p1)
  if (y0 != null && y1 != null && y1 !== y0) return +(p0 + (y - y0) / ((y1 - y0) / (p1 - p0))).toFixed(2)
  return eng.yToPrice(y)
}

export function IndexBracketLayer({ engineRef, index, ltp }: {
  engineRef: React.MutableRefObject<ChartEngine | null>
  index: string
  ltp: number
}) {
  const brackets = useIndexBracketStore((s) => s.byIndex[index]) ?? EMPTY
  const reload = useIndexBracketStore((s) => s.reload)
  const tbPositions = useTradebookStore((s) => s.positions) ?? EMPTY_POS
  const quotes = useMarketStore((s) => s.quotes)
  useEffect(() => { void reload(index) }, [index, reload])

  const posFor = (sym: string) => tbPositions.find((p) => p.symbol === sym && p.status === 'OPEN')

  // Subscribe to filled brackets' option ticks so unrealised P&L updates live
  // (realized comes from the positions API; unrealized is computed off the tick).
  const filledKey = brackets.filter((b) => b.entryStatus === 'FILLED').map((b) => b.symbolName).sort().join(',')
  useEffect(() => {
    if (!filledKey) return
    const unsubs = filledKey.split(',').map((sym) => realtime.subscribeSymbolTick(sym, { prime: false }))
    return () => unsubs.forEach((u) => u())
  }, [filledKey])

  // Position P&L = realized (API) + unrealized (live tick × open net qty).
  const positionPnl = (pos: Position, sym: string) => {
    const live = quotes[sym]?.ltp ?? pos.ltp
    return pos.realized + (live - pos.avgPrice) * netQty(pos)
  }

  const step = lotSizeFor(index)
  const wrapRef = useRef<HTMLDivElement>(null)
  const elMap = useRef(new Map<string, HTMLDivElement>())
  const priceMap = useRef(new Map<string, number>())
  const ovRef = useRef<Record<string, number>>({})
  const dragRef = useRef<{ id: string | number; leg: Leg } | null>(null)
  const [, setTick] = useState(0)
  const rerender = () => setTick((t) => t + 1)
  const [dragging, setDragging] = useState<string | null>(null)

  const eff = (b: IndexBracket, leg: Leg): number | null => {
    const k = `${b.id}:${leg}`
    if (k in ovRef.current) return ovRef.current[k]
    return leg === 'entry' ? b.entryTriggerPrice : leg === 'sl' ? b.slTriggerPrice : b.tgtTriggerPrice
  }

  priceMap.current = new Map()
  for (const b of brackets) {
    priceMap.current.set(`${b.id}:entry`, eff(b, 'entry') ?? b.entryTriggerPrice)
    const sl = eff(b, 'sl'); if (sl != null) priceMap.current.set(`${b.id}:sl`, sl)
    const tg = eff(b, 'tgt'); if (tg != null) priceMap.current.set(`${b.id}:tgt`, tg)
  }

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

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current; const eng = engineRef.current; const rect = wrapRef.current?.getBoundingClientRect()
      if (!d || !eng || !rect) return
      const y = e.clientY - rect.top
      const price = yToPrice(eng, y, ltp || priceMap.current.get(`${d.id}:${d.leg}`) || 0)
      if (price == null || price <= 0) return
      ovRef.current[`${d.id}:${d.leg}`] = price
      rerender()
    }
    const end = () => {
      const d = dragRef.current
      dragRef.current = null; setDragging(null)
      if (!d) return
      const key = `${d.id}:${d.leg}`
      const price = ovRef.current[key]
      if (price == null) return
      const patch: IndexBracketPatch =
        d.leg === 'entry' ? { entryTriggerPrice: +price.toFixed(2) }
          : d.leg === 'sl' ? { stopLoss: { triggerPrice: +price.toFixed(2) } }
            : { target: { triggerPrice: +price.toFixed(2) } }
      updateIndexBracket(d.id, patch).then(() => reload(index)).catch(() => toast.error('Update failed'))
        .finally(() => { delete ovRef.current[key]; rerender() })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end) }
  }, [engineRef, ltp, index, reload])

  const refCb = (id: string) => (el: HTMLDivElement | null) => { if (el) elMap.current.set(id, el); else elMap.current.delete(id) }

  const startDrag = (id: string | number, leg: Leg) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragRef.current = { id, leg }; setDragging(`${id}:${leg}`)
  }
  const startChip = (b: IndexBracket, leg: 'sl' | 'tgt') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const long = b.direction === 'LONG'
    const base = b.entryTriggerPrice
    const def = leg === 'sl' ? base * (long ? 0.995 : 1.005) : base * (long ? 1.005 : 0.995)
    ovRef.current[`${b.id}:${leg}`] = +def.toFixed(2)
    dragRef.current = { id: b.id, leg }; setDragging(`${b.id}:${leg}`)
    rerender()
  }
  const removeLeg = (id: string | number, leg: 'sl' | 'tgt') => {
    updateIndexBracket(id, leg === 'sl' ? { stopLoss: null } : { target: null }).then(() => reload(index)).catch(() => toast.error('Failed'))
  }
  const cancel = (id: string | number) => {
    cancelIndexBracket(id).then(() => { toast.success('Bracket cancelled'); void reload(index) }).catch(() => toast.error('Cancel failed'))
  }
  const setQty = (b: IndexBracket, leg: Leg, qty: number) => {
    let patch: IndexBracketPatch
    if (leg === 'entry') patch = { entryQuantity: qty }
    else if (leg === 'sl') patch = { stopLoss: { triggerPrice: Number(eff(b, 'sl')), quantity: qty } }
    else patch = { target: { triggerPrice: Number(eff(b, 'tgt')), quantity: qty } }
    updateIndexBracket(b.id, patch).then(() => reload(index)).catch(() => toast.error('Failed'))
  }

  return (
    <div ref={wrapRef} className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
      {brackets.map((b) => {
        const armed = b.entryStatus === 'FILLED'
        const pos = armed ? posFor(b.symbolName) : undefined
        const long = pos ? netQty(pos) > 0 : b.direction === 'LONG'
        const sl = eff(b, 'sl'); const tg = eff(b, 'tgt')
        const entryColor = long ? COLORS.long : COLORS.short

        return (
          <div key={b.id}>
            {/* Entry: position tag (filled) or pending, strike-styled */}
            <div ref={refCb(`${b.id}:entry`)} className="absolute left-0 right-0 top-0 opacity-0 will-change-transform">
              <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center">
                <div className="absolute inset-x-0 border-t pointer-events-none" style={{ borderColor: entryColor, borderTopStyle: armed ? 'solid' : 'dashed', opacity: armed ? 0.9 : 0.5 }} />
                <Tag kind={long ? 'long' : 'short'}
                  lead={armed ? (long ? 'LONG' : 'SHORT') : `ENTRY ${b.entryDir === 'ABOVE' ? '↑' : '↓'}`}
                  qty={pos ? Math.abs(netQty(pos)) : b.entryQuantity} step={step}
                  atLabel={armed ? '@' : 'idx'} value={armed && pos ? px(pos.avgPrice) : Number(eff(b, 'entry')).toFixed(2)}
                  sub={`${b.entrySide} ${strikeLabel(b.symbolName)}`}
                  pnl={armed && pos ? positionPnl(pos, b.symbolName) : undefined}
                  dim={!armed} dragging={dragging === `${b.id}:entry`}
                  onDown={armed ? undefined : startDrag(b.id, 'entry')}
                  onSetQty={armed ? undefined : (q) => setQty(b, 'entry', q)}
                  onRemove={() => cancel(b.id)} removeTitle="Cancel bracket"
                  chips={<>
                    {sl == null && <Chip color={COLORS.sl} label="SL" onDown={startChip(b, 'sl')} />}
                    {tg == null && <Chip color={COLORS.tp} label="Target" onDown={startChip(b, 'tgt')} />}
                  </>}
                />
              </div>
            </div>

            {sl != null && (
              <div ref={refCb(`${b.id}:sl`)} className="absolute left-0 right-0 top-0 opacity-0 will-change-transform">
                <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center">
                  <div className="absolute inset-x-0 border-t pointer-events-none" style={{ borderColor: COLORS.sl, borderTopStyle: armed ? 'solid' : 'dashed', opacity: armed ? 0.9 : 0.5 }} />
                  <Tag kind="sl" lead="SL" qty={b.slQuantity ?? b.entryQuantity} step={step} atLabel="idx" value={sl.toFixed(2)}
                    dim={!armed} dragging={dragging === `${b.id}:sl`} onDown={startDrag(b.id, 'sl')}
                    onSetQty={(q) => setQty(b, 'sl', q)} onRemove={() => removeLeg(b.id, 'sl')} removeTitle="Remove SL" />
                </div>
              </div>
            )}
            {tg != null && (
              <div ref={refCb(`${b.id}:tgt`)} className="absolute left-0 right-0 top-0 opacity-0 will-change-transform">
                <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center">
                  <div className="absolute inset-x-0 border-t pointer-events-none" style={{ borderColor: COLORS.tp, borderTopStyle: armed ? 'solid' : 'dashed', opacity: armed ? 0.9 : 0.5 }} />
                  <Tag kind="tp" lead="Target" qty={b.tgtQuantity ?? b.entryQuantity} step={step} atLabel="idx" value={tg.toFixed(2)}
                    dim={!armed} dragging={dragging === `${b.id}:tgt`} onDown={startDrag(b.id, 'tgt')}
                    onSetQty={(q) => setQty(b, 'tgt', q)} onRemove={() => removeLeg(b.id, 'tgt')} removeTitle="Remove Target" />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Chip({ color, label, onDown }: { color: string; label: string; onDown: (e: React.PointerEvent) => void }) {
  return (
    <button onPointerDown={onDown} title="Press and drag onto the chart"
      className="h-6 px-2 rounded-lg text-white text-[10px] font-bold shadow-sm active:scale-95 whitespace-nowrap cursor-ns-resize select-none touch-none"
      style={{ background: color }}>{label}</button>
  )
}

// Strike-styled CARD tag: badge (lead + qty), @/idx value, optional P&L badge,
// inline lot-stepped qty editor, drag handle, hover chips, remove button.
function Tag({ kind, lead, qty, step, atLabel, value, sub, pnl, dim, dragging, onDown, onSetQty, onRemove, removeTitle, chips }: {
  kind: Kind; lead: string; qty: number; step: number
  atLabel: string; value: string; sub?: string; pnl?: number
  dim?: boolean; dragging: boolean
  onDown?: (e: React.PointerEvent) => void
  onSetQty?: (qty: number) => void
  onRemove: () => void; removeTitle: string
  chips?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(qty))
  const dec = () => setVal(String(Math.max(step, (Number(val) || step) - step)))
  const inc = () => setVal(String((Number(val) || 0) + step))
  const commit = () => { onSetQty?.(Math.max(step, Number(val) || step)); setEditing(false) }

  return (
    <div className="relative group ml-2 flex items-center gap-1.5 pointer-events-auto">
      {editing ? (
        <div className={clsx('flex items-center gap-1 h-8 pl-2 pr-1 rounded-r-xl rounded-l-md', CARD)} onPointerDown={(e) => e.stopPropagation()}>
          <span className={clsx('px-1.5 py-0.5 rounded-md border text-[10px] font-bold', TYPE[kind].badge)}>{lead}</span>
          <button onClick={dec} className={clsx('h-5 w-5 grid place-items-center rounded hover:bg-black/5 dark:hover:bg-white/10', AT)}>−</button>
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }} className={clsx('w-12 h-5 text-center text-[11px] font-bold tabular-nums bg-transparent outline-none', PRICE)} />
          <button onClick={inc} className={clsx('h-5 w-5 grid place-items-center rounded hover:bg-black/5 dark:hover:bg-white/10', AT)}>＋</button>
          <button onClick={commit} className="h-5 px-2 rounded-md text-white text-[10px] font-bold" style={{ background: colorOf(kind) }}>Set</button>
        </div>
      ) : (
        <div onPointerDown={onDown}
          className={clsx('relative flex items-center gap-2 h-8 pl-3 pr-2 rounded-r-xl rounded-l-md transition-transform select-none', CARD,
            onDown && 'cursor-ns-resize touch-none', dragging && 'scale-105 shadow-xl')}>
          <span className={clsx('absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r', TYPE[kind].accent)} />
          <span className={clsx('px-2 py-0.5 rounded-md border text-[11px] font-bold tracking-wider tabular-nums', TYPE[kind].badge)}>{lead} {qty}</span>
          <span className={clsx('text-[11px]', AT)}>{atLabel}</span>
          <span className={clsx('text-[13px] font-extrabold tracking-tight tabular-nums', PRICE)}>{value}</span>
          {sub && <span className={clsx('text-[10px]', AT)}>{sub}</span>}
          {pnl != null && (<><span className={clsx('mx-0.5 h-4 w-px', SEP)} /><span className={clsx('px-2 py-0.5 rounded-md border text-[11px] font-bold tabular-nums', pnlBadge(pnl))}>{money(pnl)}</span></>)}
          {dim && <span className="ml-0.5 px-1 rounded bg-black/10 dark:bg-white/10 text-[9px] font-semibold text-slate-500 dark:text-slate-300">PENDING</span>}
          <span className="flex items-center gap-0.5">
            {onSetQty && (
              <button title="Edit qty" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setVal(String(qty)); setEditing(true) }} className={clsx('h-5 w-5 grid place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10', AT)}>
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
              </button>
            )}
            <button title={removeTitle} onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} className={clsx('h-5 w-5 grid place-items-center rounded-md hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/10', AT)}>
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        </div>
      )}
      {chips && (
        <div className="flex items-center gap-1 transition-all duration-200 opacity-0 -translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto">
          {chips}
        </div>
      )}
    </div>
  )
}
