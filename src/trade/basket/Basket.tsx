// ── Order Basket ─────────────────────────────────────────────────────────────
// Basket mode (toggle) + the floating basket panel. In basket mode, tapping
// Buy/Sell on an option-chain strike ADDS to the basket instead of placing.
// The user edits/selects rows, then executes all selected in one go — BUY legs
// first, then SELL — across every selected broker (via submitStrategy).

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useBasketStore, type BasketOrder } from '../store/basketStore'
import { useBrokerStore } from '@/store/brokerStore'
import { lotSizeFor } from '@/services/orders/lotSize'
import { submitStrategy } from '@/services/orders/placeOrder'
import { useMarketStore } from '../store/marketStore'
import { useScheduledBasketStore } from '../store/scheduledBasketStore'
import type { ScheduledLeg } from '@/api/scheduledBaskets'

// Basket glyph (shared).
function BasketIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 11h14l-1.2 7.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 11z" />
      <path d="M9 11L12 4l3 7" /><path d="M9.5 15v2M14.5 15v2" />
    </svg>
  )
}

const money = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

// ── Compact mode toggle (sits in the panel title bar) ────────────────────────
export function BasketModeToggle() {
  const mode = useBasketStore((s) => s.mode)
  const toggleMode = useBasketStore((s) => s.toggleMode)
  const count = useBasketStore((s) => s.orders.length)
  const setOpen = useBasketStore((s) => s.setOpen)
  return (
    <div className="relative shrink-0">
      <button onClick={toggleMode} title={mode ? 'Basket mode ON — Buy/Sell adds to the basket' : 'Enable basket mode'}
        className={clsx('h-7 w-7 grid place-items-center rounded-lg border transition-all',
          mode ? 'border-transparent text-white bg-gradient-to-br from-indigo-600 to-violet-700 shadow-md shadow-indigo-900/20'
            : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-600')}>
        <BasketIcon className="h-4 w-4" />
      </button>
      {count > 0 && (
        <button onClick={(e) => { e.stopPropagation(); setOpen(true) }} title="Open basket"
          className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[9px] font-bold shadow ring-2 ring-white dark:ring-card-dark leading-none">
          {count}
        </button>
      )}
    </div>
  )
}

// Live LTP for premium/funds, falling back to the ltp captured when added.
function useLtp(sym: string, fallback: number) {
  const q = useMarketStore((s) => s.quotes[sym])
  return q?.ltp ?? fallback
}

function Row({ o }: { o: BasketOrder }) {
  const update = useBasketStore((s) => s.update)
  const remove = useBasketStore((s) => s.remove)
  const toggleSelect = useBasketStore((s) => s.toggleSelect)
  const ltp = useLtp(o.symbolName, o.ltp)
  const lotSize = lotSizeFor(o.indexName)
  const qty = o.lots * lotSize
  const buy = o.side === 'BUY'
  const setLots = (n: number) => update(o.id, { lots: Math.max(1, n) })
  return (
    <div className={clsx('flex items-center gap-2 px-2.5 py-2 border-b border-slate-100 dark:border-white/[0.05] transition-opacity', !o.selected && 'opacity-45')}>
      {/* select */}
      <button onClick={() => toggleSelect(o.id)} className={clsx('h-4 w-4 shrink-0 rounded border grid place-items-center', o.selected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600')}>
        {o.selected && <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="4"><path d="M5 12l5 5L20 6" /></svg>}
      </button>
      {/* B/S — click to flip */}
      <button onClick={() => update(o.id, { side: buy ? 'SELL' : 'BUY' })} title="Toggle Buy/Sell"
        className={clsx('h-6 w-6 shrink-0 rounded-md grid place-items-center text-[11px] font-extrabold text-white', buy ? 'bg-emerald-500' : 'bg-rose-500')}>
        {buy ? 'B' : 'S'}
      </button>
      {/* strike + type + expiry */}
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">
          {o.strike} <span className={clsx('ml-0.5 px-1 rounded text-[9px] font-bold align-middle', o.optType === 'CE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300')}>{o.optType}</span>
        </p>
        <p className="text-[10px] text-slate-400 truncate leading-tight">{o.indexName} · {o.expiry} · LTP {ltp.toFixed(2)}</p>
      </div>
      {/* lots stepper */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={() => setLots(o.lots - 1)} className="h-6 w-5 grid place-items-center rounded bg-slate-100 dark:bg-white/10 text-slate-500">−</button>
        <div className="w-10 text-center">
          <p className="text-[12px] font-bold tabular-nums leading-none">{qty}</p>
          <p className="text-[8px] text-slate-400 leading-none">{o.lots} lot</p>
        </div>
        <button onClick={() => setLots(o.lots + 1)} className="h-6 w-5 grid place-items-center rounded bg-slate-100 dark:bg-white/10 text-slate-500">+</button>
      </div>
      {/* MKT / LMT */}
      <button onClick={() => update(o.id, { priceType: o.priceType === 'MKT' ? 'LMT' : 'MKT', price: o.priceType === 'MKT' ? +ltp.toFixed(2) : 0 })}
        className={clsx('h-6 px-1.5 shrink-0 rounded text-[10px] font-bold', o.priceType === 'MKT' ? 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300')}>
        {o.priceType}
      </button>
      {o.priceType === 'LMT' && (
        <input value={o.price || ''} onChange={(e) => update(o.id, { price: Number(e.target.value) || 0 })} inputMode="decimal" placeholder="0.00"
          className="w-14 h-6 shrink-0 text-center text-[11px] tabular-nums rounded bg-slate-100 dark:bg-white/10 outline-none" />
      )}
      {/* remove */}
      <button onClick={() => remove(o.id)} title="Remove" className="h-6 w-6 shrink-0 grid place-items-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  )
}

export function BasketPanel() {
  const open = useBasketStore((s) => s.open)
  const setOpen = useBasketStore((s) => s.setOpen)
  const orders = useBasketStore((s) => s.orders)
  const selectAll = useBasketStore((s) => s.selectAll)
  const clear = useBasketStore((s) => s.clear)
  const remove = useBasketStore((s) => s.remove)
  const quotes = useMarketStore((s) => s.quotes)
  const brokerCount = useBrokerStore((s) => s.selectedIds.length)
  const [executing, setExecuting] = useState(false)

  // Draggable by header.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => { const d = drag.current; if (!d) return; setPos({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }) }
    const up = () => { drag.current = null }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])

  if (!open || orders.length === 0) return null

  const selected = orders.filter((o) => o.selected)
  const allSel = orders.length > 0 && selected.length === orders.length
  // Net premium of the selected legs: BUY = debit (−), SELL = credit (+).
  const net = selected.reduce((s, o) => {
    const ltp = quotes[o.symbolName]?.ltp ?? o.ltp
    return s + (o.side === 'BUY' ? -1 : 1) * o.lots * lotSizeFor(o.indexName) * ltp
  }, 0)
  const totalQty = selected.reduce((s, o) => s + o.lots * lotSizeFor(o.indexName), 0)

  const execute = async () => {
    if (!selected.length || executing) return
    const legs = selected.map((o) => ({
      side: o.side, symbolName: o.symbolName, indexName: o.indexName,
      priceType: o.priceType, price: o.price, qty: o.lots * lotSizeFor(o.indexName),
    }))
    setExecuting(true)
    const res = await submitStrategy(legs) // BUY-first, then SELL, across all selected brokers
    setExecuting(false)
    if (res.ok) selected.forEach((o) => remove(o.id)) // drop the executed legs
  }

  // Schedule the SELECTED legs: snapshot legs + the currently-selected brokers,
  // then open the schedule modal to attach entry/exit triggers.
  const openSchedule = () => {
    if (!selected.length) return
    const legs: ScheduledLeg[] = selected.map((o) => ({
      side: o.side, symbolName: o.symbolName, indexName: o.indexName,
      display: `${o.strike} ${o.optType}`, qty: o.lots * lotSizeFor(o.indexName),
      priceType: o.priceType, price: o.price,
    }))
    const bs = useBrokerStore.getState()
    // SHORT broker keys (user_broker) — what placeOrderInBroker / position calls expect.
    const brokers = bs.accounts.filter((a) => bs.selectedIds.includes(a.id)).map((a) => a.brokerName)
    // Reference index for index triggers = the most common index among the legs.
    const counts = legs.reduce<Record<string, number>>((m, l) => { m[l.indexName] = (m[l.indexName] || 0) + 1; return m }, {})
    const index = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    useScheduledBasketStore.getState().openCreate(legs, brokers, index)
  }

  return (
    <div className="fixed z-[60] bottom-4 right-4 w-[420px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-2xl overflow-hidden animate-fade-in"
      style={pos ? { transform: `translate(${pos.x}px, ${pos.y}px)` } : undefined}>
      {/* header — drag handle */}
      <div onPointerDown={(e) => { drag.current = { sx: e.clientX, sy: e.clientY, ox: pos?.x ?? 0, oy: pos?.y ?? 0 } }}
        className="flex items-center gap-2 px-3.5 py-2.5 cursor-move select-none touch-none bg-gradient-to-r from-indigo-600 to-violet-700 text-white">
        <BasketIcon className="h-4 w-4" />
        <span className="font-bold text-sm">Order Basket</span>
        <span className="px-1.5 py-0.5 rounded-full bg-white/25 text-[10px] font-bold">{orders.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => { clear(); setOpen(false) }} onPointerDown={(e) => e.stopPropagation()} title="Cancel basket — remove all orders"
            className="h-6 w-6 grid place-items-center rounded-lg hover:bg-white/20">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6" /></svg>
          </button>
          <button onClick={() => setOpen(false)} onPointerDown={(e) => e.stopPropagation()} title="Minimize" className="h-6 w-6 grid place-items-center rounded-lg hover:bg-white/20"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg></button>
        </div>
      </div>

      {/* select-all + clear */}
      <div className="flex items-center gap-2 px-3.5 py-1.5 border-b border-slate-100 dark:border-white/[0.06]">
        <button onClick={() => selectAll(!allSel)} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
          <span className={clsx('h-4 w-4 rounded border grid place-items-center', allSel ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600')}>
            {allSel && <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="4"><path d="M5 12l5 5L20 6" /></svg>}
          </span>
          {selected.length} of {orders.length} selected
        </button>
        <button onClick={clear} className="ml-auto text-[11px] font-semibold text-slate-400 hover:text-rose-500">Clear all</button>
      </div>

      {/* rows */}
      <div className="max-h-[46vh] overflow-y-auto">
        {orders.map((o) => <Row key={o.id} o={o} />)}
      </div>

      {/* footer */}
      <div className="px-3.5 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between text-[11px] mb-2">
          <span className="text-slate-500">Total qty <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{totalQty}</span></span>
          <span className="text-slate-500">Net premium <span className={clsx('font-bold tabular-nums', net >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{net >= 0 ? '+' : '−'}{money(net)} {net >= 0 ? 'CR' : 'DR'}</span></span>
        </div>
        <div className="flex gap-2">
          <button onClick={execute} disabled={!selected.length || brokerCount === 0 || executing}
            className="flex-1 h-10 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-indigo-600 to-violet-700 shadow-lg shadow-sm shadow-indigo-900/20 disabled:opacity-40 hover:brightness-105 active:scale-[0.99] transition">
            {executing ? 'Executing…' : brokerCount === 0 ? 'Select a broker' : `Execute ${selected.length} · ${brokerCount} broker${brokerCount !== 1 ? 's' : ''}`}
          </button>
          <button onClick={openSchedule} disabled={!selected.length || brokerCount === 0}
            title="Schedule this basket on an index / time trigger"
            className="h-10 px-3 shrink-0 rounded-xl font-bold text-sm inline-flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-40 active:scale-[0.98] transition">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            Schedule
          </button>
        </div>
        <p className="mt-1.5 text-[9.5px] text-center text-slate-400">Execute now, or Schedule on an index-price / time trigger.</p>
      </div>
    </div>
  )
}
