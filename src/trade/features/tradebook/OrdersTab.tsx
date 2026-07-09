import { useState } from 'react'
import { clsx } from 'clsx'
import { useTradebookStore, type OrderStatusFilter } from './tradebookStore'
import { ORDER_STATUS_META, isLiveStatus, type Order, type OrderStatus } from './types'
import { px, timeShort } from './format'
import { RowMenu } from './RowMenu'
import { MiniModal } from './MiniModal'

const STATUS_TABS: { v: OrderStatusFilter; l: string }[] = [
  { v: 'ALL', l: 'All' }, { v: 'OPEN', l: 'Open' }, { v: 'PENDING', l: 'Pending' },
  { v: 'COMPLETE', l: 'Completed' }, { v: 'CANCELLED', l: 'Cancelled' }, { v: 'REJECTED', l: 'Rejected' },
]

export function OrdersTab({ rows, counts }: { rows: Order[]; counts: Record<string, number> }) {
  const store = useTradebookStore()
  const [modify, setModify] = useState<Order | null>(null)

  return (
    <div className="h-full flex flex-col">
      {/* Status filter */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
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
        <div className="flex-1 overflow-auto">
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
                <th className="text-right font-medium px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const meta = ORDER_STATUS_META[o.status]
                const live = isLiveStatus(o.status)
                return (
                  <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-white/5">
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
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {live && <button onClick={() => setModify(o)} className="h-6 px-2 rounded-md bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-[11px] font-semibold hover:bg-slate-200">Modify</button>}
                        <RowMenu items={live ? [
                          { label: 'Modify order', onClick: () => setModify(o) },
                          { label: 'Cancel order', onClick: () => store.cancelOrder(o.id), danger: true },
                          { label: 'Clone / reorder', onClick: () => store.cloneOrder(o.id) },
                        ] : [
                          { label: 'Clone / reorder', onClick: () => store.cloneOrder(o.id) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modify && (
        <MiniModal
          title="Modify order" subtitle={`${modify.side} ${modify.display}`}
          fields={[
            { key: 'qty', label: 'Quantity', value: modify.qty },
            ...(modify.priceType !== 'MKT' ? [{ key: 'price', label: 'Price', value: modify.price }] : []),
            ...(modify.priceType === 'SL-LMT' ? [{ key: 'triggerPrice', label: 'Trigger price', value: modify.triggerPrice }] : []),
          ]}
          confirmLabel="Save changes"
          onConfirm={(vals) => {
            store.modifyOrder(modify.id, {
              qty: vals.qty || modify.qty,
              ...(modify.priceType !== 'MKT' ? { price: vals.price } : {}),
              ...(modify.priceType === 'SL-LMT' ? { triggerPrice: vals.triggerPrice } : {}),
            })
            setModify(null)
          }}
          onClose={() => setModify(null)}
        />
      )}
    </div>
  )
}

export const orderStatusCounts = (orders: Order[]): Record<string, number> => {
  const c: Record<string, number> = { ALL: orders.length }
  const keys: OrderStatus[] = ['PENDING', 'OPEN', 'COMPLETE', 'CANCELLED', 'REJECTED']
  keys.forEach((k) => { c[k] = orders.filter((o) => o.status === k).length })
  return c
}
