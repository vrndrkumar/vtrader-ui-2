import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { resolveQty, useBrokerStore } from '@/store/brokerStore'
import { useOrderStore, type ExecStatus, type OrderType } from '@/store/orderStore'
import { submitOrder } from '@/services/orders/placeOrder'

const ORDER_TYPES: OrderType[] = ['MARKET', 'LIMIT', 'SL', 'SL-M']
const needsPrice = (t: OrderType) => t === 'LIMIT' || t === 'SL' || t === 'SL-M'

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

  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [product, setProduct] = useState<'Normal' | 'MIS'>('Normal')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState<Record<number, number>>({})

  // Initialise per-broker qty + price whenever a new order is opened.
  useEffect(() => {
    if (!open || !intent) return
    setOrderType(intent.orderType ?? 'MARKET')
    setPrice(intent.price != null ? String(intent.price) : intent.ltp != null ? String(intent.ltp) : '')
    setProduct(intent.product ?? 'Normal')
    setQty(Object.fromEntries(brokers.map((b) => [b.id, resolveQty(b, intent.underlying)])))
  }, [open, intent, brokers])

  if (!open || !intent) return null

  const placed = results.length > 0
  const isBuy = intent.side === 'BUY'
  const totalQty = brokers.reduce((s, b) => s + (qty[b.id] ?? 0), 0)
  const statusOf = (id: number) => results.find((r) => r.brokerId === id)?.status

  const place = () => {
    submitOrder(
      { ...intent, orderType, product, price: needsPrice(orderType) ? Number(price) || 0 : undefined },
      brokers.map((b) => ({ broker: b, qty: qty[b.id] ?? 0 })),
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in" onClick={close}>
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-card-dark shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={clsx('flex items-center justify-between px-4 py-3', isBuy ? 'bg-brand-600' : 'bg-red-600')}>
          <div className="text-white">
            <p className="text-[11px] opacity-80">{isBuy ? 'BUY' : 'SELL'} · {product}</p>
            <p className="font-semibold">{intent.instrument}</p>
          </div>
          <button onClick={close} className="text-white/80 hover:text-white"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Order type + product */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-white/5">
              {ORDER_TYPES.map((t) => (
                <button key={t} onClick={() => setOrderType(t)} className={clsx('px-2.5 py-1 rounded-md text-xs font-medium', orderType === t ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500')}>{t}</button>
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
              <label className="text-[11px] text-slate-400">Price</label>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="w-full h-9 px-3 rounded-lg bg-slate-100 dark:bg-white/5 text-sm outline-none tabular-nums" placeholder="0.00" />
            </div>
          )}

          {/* Per-broker legs */}
          <div>
            <p className="text-[11px] font-medium text-slate-400 mb-1.5">Brokers ({brokers.length})</p>
            <div className="space-y-1.5">
              {brokers.map((b) => {
                const st = statusOf(b.id)
                return (
                  <div key={b.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-white/5">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate flex-1">{b.displayName}</span>
                    {st ? (
                      <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded capitalize', statusStyle[st])}>{st}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setQty((q) => ({ ...q, [b.id]: Math.max(0, (q[b.id] ?? 0) - 1) }))} className="h-6 w-6 rounded bg-white dark:bg-slate-700 text-slate-500">−</button>
                        <input value={qty[b.id] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [b.id]: Math.max(0, Number(e.target.value) || 0) }))} className="w-12 h-6 text-center text-sm tabular-nums bg-white dark:bg-slate-700 rounded outline-none" />
                        <button onClick={() => setQty((q) => ({ ...q, [b.id]: (q[b.id] ?? 0) + 1 }))} className="h-6 w-6 rounded bg-white dark:bg-slate-700 text-slate-500">+</button>
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
          <div className="text-xs text-slate-500">Total qty <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{totalQty}</span></div>
          {placed ? (
            <button onClick={close} className="px-6 py-2 rounded-lg bg-slate-800 dark:bg-white/10 text-white text-sm font-semibold">Done</button>
          ) : (
            <button onClick={place} disabled={brokers.length === 0 || totalQty === 0} className={clsx('px-8 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40', isBuy ? 'bg-brand-600 hover:bg-brand-700' : 'bg-red-600 hover:bg-red-700')}>
              {isBuy ? 'Buy' : 'Sell'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
