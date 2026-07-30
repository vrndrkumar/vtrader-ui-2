import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useBrokerStore } from '@/store/brokerStore'
import { useOrderStore, type ExecStatus } from '@/store/orderStore'
import { submitOrder, defaultLotsFor } from '@/services/orders/placeOrder'
import { ensureLotSizes, lotSizeFor } from '@/services/orders/lotSize'
import type { PriceType } from '@/services/orders/types'

const PRICE_TYPES: { v: PriceType; l: string }[] = [
  { v: 'MKT', l: 'Market' }, { v: 'LMT', l: 'Limit' }, { v: 'SL-LMT', l: 'SL-Limit' },
]
const needsPrice = (t: PriceType) => t === 'LMT' || t === 'SL-LMT'
const priceLabel = (t: PriceType) => (t === 'SL-LMT' ? 'Trigger price' : 'Limit price')

const statusStyle: Record<ExecStatus, string> = {
  queued: 'bg-slate-100 text-slate-500 dark:bg-white/10',
  sent: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20',
  filled: 'bg-green-50 text-green-600 dark:bg-green-900/20',
  failed: 'bg-red-50 text-red-600 dark:bg-red-900/20',
}

export function OrderWindow() {
  const { open, intent, results, close } = useOrderStore()
  const accounts = useBrokerStore((s) => s.accounts)
  const selectedIds = useBrokerStore((s) => s.selectedIds)
  const brokers = useMemo(() => accounts.filter((a) => selectedIds.includes(a.id)), [accounts, selectedIds])

  const [orderType, setOrderType] = useState<PriceType>('MKT')
  const [product, setProduct] = useState<'Normal' | 'MIS'>('Normal')
  const [price, setPrice] = useState('')
  const [lots, setLots] = useState<Record<number, number>>({})
  const [lotSize, setLotSize] = useState(1)

  // ── Draggable window (by the header) ──
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  useEffect(() => { if (open) setPos({ x: 0, y: 0 }) }, [open, intent]) // recenter on each new order
  useEffect(() => {
    const move = (e: PointerEvent) => { const d = dragRef.current; if (!d) return; setPos({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }) }
    const up = () => { dragRef.current = null }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])
  const startDrag = (e: React.PointerEvent) => { dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y } }

  // Initialise per-broker lots + price whenever a new order is opened.
  useEffect(() => {
    if (!open || !intent) return
    setOrderType(intent.priceType ?? 'MKT')
    setPrice(intent.price != null ? String(intent.price) : intent.ltp != null ? String(intent.ltp) : '')
    setProduct(intent.product ?? 'Normal')
    void ensureLotSizes().then(() => {
      setLotSize(lotSizeFor(intent.indexName))
      setLots(Object.fromEntries(brokers.map((b) => [b.id, intent.lot ?? defaultLotsFor(b, intent.indexName)])))
    })
  }, [open, intent, brokers])

  if (!open || !intent) return null

  const placed = results.length > 0
  const isBuy = intent.side === 'BUY'
  const totalLots = brokers.reduce((s, b) => s + (lots[b.id] ?? 0), 0)
  const totalQty = totalLots * lotSize
  const resultOf = (id: number) => results.find((r) => r.brokerId === id)
  const statusOf = (id: number) => resultOf(id)?.status
  const priceMissing = needsPrice(orderType) && !(Number(price) > 0)

  const place = () => {
    void submitOrder(
      { ...intent, priceType: orderType, product, price: needsPrice(orderType) ? Number(price) || 0 : undefined },
      brokers.map((b) => ({ broker: b, lots: lots[b.id] ?? 0 })),
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in" onClick={close}>
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-card-dark shadow-2xl overflow-hidden"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} onClick={(e) => e.stopPropagation()}>
        {/* Header — drag handle */}
        <div onPointerDown={startDrag}
          className={clsx('flex items-center justify-between px-4 py-3 cursor-move select-none touch-none', isBuy ? 'bg-brand-600' : 'bg-red-600')}>
          <div className="text-white">
            <p className="text-[11px] opacity-80">{isBuy ? 'BUY' : 'SELL'} · {product}</p>
            <p className="font-semibold">{intent.display ?? intent.symbolName}</p>
          </div>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={close} className="text-white/80 hover:text-white"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Order type + product */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-white/5">
              {PRICE_TYPES.map((t) => (
                <button key={t.v} onClick={() => setOrderType(t.v)} className={clsx('px-2.5 py-1 rounded-md text-xs font-medium', orderType === t.v ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500')}>{t.l}</button>
              ))}
            </div>
            <div className="ml-auto flex gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-white/5">
              {(['Normal', 'MIS'] as const).map((p) => (
                <button key={p} onClick={() => setProduct(p)} className={clsx('px-2.5 py-1 rounded-md text-xs font-medium', product === p ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500')}>{p}</button>
              ))}
            </div>
          </div>

          {needsPrice(orderType) && (
            <div>
              <label className="text-[11px] text-slate-400">{priceLabel(orderType)}</label>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="w-full h-9 px-3 rounded-lg bg-slate-100 dark:bg-white/5 text-sm outline-none tabular-nums" placeholder="0.00" autoFocus />
              {orderType === 'SL-LMT' && <p className="mt-1 text-[10px] text-slate-400">Limit price is derived from the trigger automatically.</p>}
            </div>
          )}

          {/* Per-broker legs — input is QTY (in multiples of the lot size) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-medium text-slate-400">Brokers ({brokers.length}) · Qty</p>
              <p className="text-[11px] text-slate-400">Lot size <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{lotSize}</span></p>
            </div>
            <div className="space-y-1.5">
              {brokers.map((b) => {
                const st = statusOf(b.id)
                const res = resultOf(b.id)
                const l = lots[b.id] ?? 0
                const setQtyFor = (id: number, q: number) => setLots((m) => ({ ...m, [id]: Math.max(0, Math.round(q / lotSize)) }))
                return (
                  <div key={b.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-white/5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{b.displayName}</p>
                      {st === 'failed' && res?.message
                        ? <p className="text-[10px] text-red-600 leading-tight" title={res.message}>{res.message}</p>
                        : <p className="text-[10px] text-slate-400 tabular-nums">{l} lot{l !== 1 ? 's' : ''}</p>}
                    </div>
                    {st ? (
                      <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded capitalize', statusStyle[st])}>{st === 'failed' ? 'Rejected' : st}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setLots((q) => ({ ...q, [b.id]: Math.max(0, (q[b.id] ?? 0) - 1) }))} className="h-6 w-6 rounded bg-white dark:bg-slate-700 text-slate-500">−</button>
                        <input value={l * lotSize} onChange={(e) => setQtyFor(b.id, Number(e.target.value) || 0)} className="w-14 h-6 text-center text-sm tabular-nums bg-white dark:bg-slate-700 rounded outline-none" />
                        <button onClick={() => setLots((q) => ({ ...q, [b.id]: (q[b.id] ?? 0) + 1 }))} className="h-6 w-6 rounded bg-white dark:bg-slate-700 text-slate-500">+</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-500">Total qty <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{totalQty}</span> <span className="text-slate-400">· {totalLots} lot{totalLots !== 1 ? 's' : ''}</span></div>
          {placed ? (
            <button onClick={close} className="px-6 py-2 rounded-lg bg-slate-800 dark:bg-white/10 text-white text-sm font-semibold">Done</button>
          ) : (
            <button onClick={place} disabled={brokers.length === 0 || totalQty === 0 || priceMissing} className={clsx('px-8 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40', isBuy ? 'bg-brand-600 hover:bg-brand-700' : 'bg-red-600 hover:bg-red-700')}>
              {isBuy ? 'Buy' : 'Sell'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
