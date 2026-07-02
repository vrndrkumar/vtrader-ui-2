import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { getTradeOrders } from '@/api/reports'
import type { Trade, TradeOrder } from '@/types/reports'
import { formatPnl, formatDateTime } from '@/utils/tradeStats'

interface Props {
  trade: Trade | null
  onClose: () => void
}

export function OrdersDrawer({ trade, onClose }: Props) {
  const [orders, setOrders]   = useState<TradeOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!trade) return
    setOrders([])
    setError('')
    setLoading(true)
    getTradeOrders(trade.trade_id)
      .then(setOrders)
      .catch(() => setError('Failed to load orders'))
      .finally(() => setLoading(false))
  }, [trade])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const open = !!trade
  const pnlPos = (trade?.realized_pnl ?? 0) >= 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={clsx(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      />

      {/* Drawer */}
      <div
        className={clsx(
          'fixed top-0 right-0 h-full z-50 w-full max-w-[520px] bg-white dark:bg-slate-900',
          'shadow-2xl flex flex-col transform transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">Order Details</h2>
              {trade && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-[240px]">
                  {trade.trade_id}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Trade summary */}
        {trade && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-100 dark:border-slate-800 shrink-0">
            {/* Symbol header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-bold text-slate-900 dark:text-white text-base">{trade.symbol_name.split('_')[0]}</p>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[200px]">{trade.symbol_name}</p>
              </div>
              <div className="text-right">
                <p className={clsx('text-xl font-bold tabular-nums', trade.status === 'OPEN' ? 'text-slate-400' : pnlPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                  {trade.status === 'OPEN' ? '—' : formatPnl(trade.realized_pnl)}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Realized P&L</p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <TradeStat label="Broker" value={trade.broker_name} />
              <TradeStat label="Group" value={trade.group_name || '—'} />
              <TradeStat label="Quantity" value={trade.total_quantity.toLocaleString()} />
              <TradeStat label="Avg Entry" value={`₹${trade.avg_entry_price?.toFixed(2) ?? '—'}`} />
              <TradeStat label="Avg Exit" value={trade.avg_exit_price ? `₹${trade.avg_exit_price.toFixed(2)}` : '—'} />
              <TradeStat
                label="Status"
                value={trade.status}
                valueClass={trade.status === 'OPEN' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}
              />
            </div>

            {trade.status === 'OPEN' && trade.unrealized_pnl !== 0 && (
              <div className={clsx('mt-3 flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl',
                trade.unrealized_pnl >= 0
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
              )}>
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                Unrealized P&L: {formatPnl(trade.unrealized_pnl)}
              </div>
            )}
          </div>
        )}

        {/* Orders timeline */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse bg-slate-50 dark:bg-white/5 rounded-xl p-4">
                  <div className="flex justify-between mb-3">
                    <div className="h-4 w-12 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map((j) => (
                      <div key={j}>
                        <div className="h-2 w-10 rounded bg-slate-200 dark:bg-slate-700 mb-1.5" />
                        <div className="h-3 w-14 rounded bg-slate-200 dark:bg-slate-700" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">No orders found</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">This trade has no order records</p>
            </div>
          )}

          {!loading && orders.length > 0 && (
            <div className="space-y-0">
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                {orders.length} order{orders.length !== 1 ? 's' : ''} · Timeline
              </p>

              {/* Timeline */}
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-3.5 top-4 bottom-4 w-px bg-slate-200 dark:bg-slate-800" />

                <div className="space-y-4">
                  {orders.map((order, idx) => (
                    <div key={order.id} className="relative flex gap-4">
                      {/* Timeline dot */}
                      <div className={clsx(
                        'h-7 w-7 rounded-full shrink-0 flex items-center justify-center z-10 text-[10px] font-bold border-2',
                        order.txnType === 'BUY'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                          : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
                      )}>
                        {order.txnType === 'BUY' ? 'B' : 'S'}
                      </div>

                      {/* Card */}
                      <div className="flex-1 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-100 dark:border-slate-800 p-4 mb-1">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={clsx(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full',
                              order.txnType === 'BUY'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
                            )}>
                              {order.txnType}
                            </span>
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{order.symbolName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono"># {idx + 1}</span>
                            <OrderStatusBadge status={order.orderStatus} />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <OrderStat label="Price" value={`₹${order.price?.toFixed(2)}`} mono />
                          <OrderStat label="Qty" value={order.quantity.toString()} />
                          <OrderStat label="Type" value={order.orderType} />
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {formatDateTime(order.placedTime)}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate ml-4 max-w-[140px]">
                            ID: {order.orderId}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function TradeStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5 font-medium">{label}</p>
      <p className={clsx('text-xs font-bold text-slate-800 dark:text-slate-200 break-all', valueClass)}>{value}</p>
    </div>
  )
}

function OrderStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={clsx('text-xs font-bold text-slate-800 dark:text-slate-200', mono && 'font-mono')}>{value}</p>
    </div>
  )
}

function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETE:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
    PENDING:   'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
    REJECTED:  'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    CANCELLED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  }
  const cls = map[status.toUpperCase()] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${cls}`}>
      {status}
    </span>
  )
}
