import { useState } from 'react'
import { clsx } from 'clsx'
import { useTradebookStore, type OrderStatusFilter } from './tradebookStore'
import { ORDER_STATUS_META, isLiveStatus, type Order, type OrderStatus } from './types'
import { px, timeShort } from './format'
import { Stepper, ManageButton } from './Act'

const STATUS_TABS: { v: OrderStatusFilter; l: string }[] = [
  { v: 'ALL', l: 'All' }, { v: 'OPEN', l: 'Open' }, { v: 'PENDING', l: 'Pending' },
  { v: 'COMPLETE', l: 'Completed' }, { v: 'CANCELLED', l: 'Cancelled' }, { v: 'REJECTED', l: 'Rejected' },
]

export function OrdersTab({ rows, counts }: { rows: Order[]; counts: Record<string, number> }) {
  const store = useTradebookStore()
  const [selId, setSelId] = useState<string | null>(null)
  const sel = rows.find((o) => o.id === selId) ?? null

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Status filter */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 overflow-x-auto shrink-0">
        {STATUS_TABS.map((t) => (
          <button key={t.v} onClick={() => store.setOrderStatus(t.v)}
            className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap',
              store.orderStatus === t.v ? 'bg-slate-800 dark:bg-white/10 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5')}>
            {t.l}<span className={clsx('text-[10px]', store.orderStatus === t.v ? 'text-white/70' : 'text-slate-400')}>{counts[t.v] ?? 0}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-400">
          <svg viewBox="0 0 24 24" className="h-8 w-8 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          <p className="text-sm font-medium">No orders</p>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Table */}
          <div className="flex-1 min-w-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-white/[0.03] text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Time</th>
                  <th className="text-left font-medium px-3 py-2">Instrument</th>
                  <th className="text-left font-medium px-3 py-2">Side</th>
                  <th className="text-right font-medium px-3 py-2">Qty</th>
                  <th className="text-left font-medium px-3 py-2">Type</th>
                  <th className="text-right font-medium px-3 py-2">Price</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                  <th className="w-12 p-0" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const meta = ORDER_STATUS_META[o.status]
                  const active = selId === o.id
                  return (
                    <tr key={o.id} onClick={() => setSelId(active ? null : o.id)}
                      className={clsx('group border-t border-slate-100 dark:border-slate-800/60 cursor-pointer', active ? 'bg-brand-50/60 dark:bg-brand-900/15' : 'hover:bg-slate-50 dark:hover:bg-white/5')}>
                      <td className="px-3 py-2 text-[11px] text-slate-400 whitespace-nowrap">{timeShort(o.time)}</td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 leading-tight truncate">{o.display}</p>
                        <p className="text-[10px] text-slate-400 truncate">{o.brokerLabel}{o.message ? ` · ${o.message}` : ''}</p>
                      </td>
                      <td className="px-3 py-2"><span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold', o.side === 'BUY' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30' : 'bg-red-50 text-red-600 dark:bg-red-900/30')}>{o.side}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{o.filledQty}/{o.qty}</td>
                      <td className="px-3 py-2 text-[11px] text-slate-500">{o.priceType}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{o.priceType === 'MKT' ? 'MKT' : px(o.price)}{o.triggerPrice ? <span className="text-[10px] text-slate-400"> / {px(o.triggerPrice)}</span> : ''}</td>
                      <td className="px-3 py-2"><span className={clsx('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded', meta.cls)}><span className={clsx('h-1.5 w-1.5 rounded-full', meta.dot)} />{meta.label}</span></td>
                      <td className="p-0 w-12 pr-2">
                        <div className="grid place-items-center"><ManageButton active={active} onClick={() => setSelId(active ? null : o.id)} /></div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div
            className={clsx('shrink-0 overflow-hidden transition-[width] duration-300 ease-out', sel && 'border-l border-slate-200 dark:border-slate-800')}
            style={{ width: sel ? 320 : 0 }}
          >
            {sel && <OrderDrawer key={sel.id} order={sel} onClose={() => setSelId(null)} />}
          </div>
        </div>
      )}
    </div>
  )
}

const drawerBtn = 'h-10 px-3 rounded-2xl text-xs font-bold whitespace-nowrap transition-all active:scale-[0.97] flex items-center justify-center gap-1.5'

function OrderDrawer({ order, onClose }: { order: Order; onClose: () => void }) {
  const store = useTradebookStore()
  const live = isLiveStatus(order.status)
  const meta = ORDER_STATUS_META[order.status]
  const buy = order.side === 'BUY'
  const [qty, setQty] = useState(String(order.qty))
  const [price, setPrice] = useState(String(order.price))
  const [trigger, setTrigger] = useState(String(order.triggerPrice))
  const [confirmCancel, setConfirmCancel] = useState(false)
  const fillPct = order.qty ? Math.round((order.filledQty / order.qty) * 100) : 0

  const save = () => store.modifyOrder(order.id, { qty: Number(qty) || 0, price: Number(price) || 0, triggerPrice: Number(trigger) || 0 })

  return (
    <div className="w-80 h-full flex flex-col bg-white dark:bg-card-dark animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between px-3.5 pt-3 pb-1.5 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold', buy ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30' : 'bg-red-50 text-red-600 dark:bg-red-900/30')}>{order.side}</span>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">{order.display}</p>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 truncate">{order.brokerLabel} · {order.priceType} · {timeShort(order.time)}</p>
        </div>
        <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </div>

      {/* Status + fill hero */}
      <div className="mx-3.5 mb-3 rounded-2xl px-3.5 py-2.5 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-white/[0.06] dark:to-white/[0.02] border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <span className={clsx('inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full', meta.cls)}><span className={clsx('h-1.5 w-1.5 rounded-full', meta.dot)} />{meta.label}</span>
          <span className="text-[11px] text-slate-400">{order.priceType === 'MKT' ? 'Market' : `₹${px(order.price)}`}{order.triggerPrice ? ` · trg ${px(order.triggerPrice)}` : ''}</span>
        </div>
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span>Filled</span><span className="tabular-nums font-semibold text-slate-600 dark:text-slate-300">{order.filledQty}/{order.qty} · {fillPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
            <div className={clsx('h-full rounded-full transition-all duration-500', buy ? 'bg-brand-500' : 'bg-red-500')} style={{ width: `${fillPct}%` }} />
          </div>
        </div>
        {order.message && <p className="mt-2 text-[10px] text-red-500 truncate">{order.message}</p>}
      </div>

      {/* Modify */}
      <div className="flex-1 overflow-auto px-3.5 pb-3">
        {live ? (
          <div className="rounded-2xl border border-brand-300 bg-brand-50/60 dark:border-brand-700/50 dark:bg-brand-900/15 p-3 animate-slide-up">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">Modify order</p>
            <div className="space-y-2">
              <label className="flex items-center justify-between gap-2"><span className="text-[11px] text-slate-500">Quantity</span><Stepper value={qty} step={1} onChange={setQty} /></label>
              {order.priceType !== 'MKT' && <label className="flex items-center justify-between gap-2"><span className="text-[11px] text-slate-500">Price</span><Stepper value={price} step={0.05} onChange={setPrice} /></label>}
              {order.priceType === 'SL-LMT' && <label className="flex items-center justify-between gap-2"><span className="text-[11px] text-slate-500">Trigger</span><Stepper value={trigger} step={0.05} onChange={setTrigger} /></label>}
              <button onClick={save} className="w-full h-9 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-all active:scale-[0.98]">Save changes</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 py-6 text-center text-slate-400">
            <svg viewBox="0 0 24 24" className="h-7 w-7 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-xs">This order is {meta.label.toLowerCase()} — clone it to place a fresh order.</p>
          </div>
        )}
      </div>

      {/* Sticky actions */}
      <div className="flex items-center gap-2 p-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <button onClick={() => store.cloneOrder(order.id)} className={clsx(drawerBtn, 'flex-1 border border-violet-200 dark:border-violet-900/40 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20')}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
          Clone
        </button>
        {live && (
          <button
            onMouseLeave={() => setConfirmCancel(false)}
            onClick={() => { if (confirmCancel) { store.cancelOrder(order.id); onClose() } else setConfirmCancel(true) }}
            className={clsx(drawerBtn, 'flex-1', confirmCancel ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 ring-2 ring-red-300 dark:ring-red-800' : 'border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20')}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            {confirmCancel ? 'Confirm' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  )
}

export const orderStatusCounts = (orders: Order[]): Record<string, number> => {
  const c: Record<string, number> = { ALL: orders.length }
  const keys: OrderStatus[] = ['PENDING', 'OPEN', 'COMPLETE', 'CANCELLED', 'REJECTED']
  keys.forEach((k) => { c[k] = orders.filter((o) => o.status === k).length })
  return c
}
