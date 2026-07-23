import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { getTradeOrders, assignOrderGroup } from '@/api/reports'
import type { Trade, TradeOrder } from '@/types/reports'
import { fmtPnl, fmtDate, fmtTime, fmtDuration, parseInstrument, INSTRUMENT_META, isManual } from './utils'
import { useJournalEntry } from './journalStore'
import { StrategySelect } from './StrategySelect'
import { useStrategyLabel } from './useStrategies'
import { useHasRegisteredBrokers } from '@/hooks/useHasRegisteredBrokers'
import { AddOrderModal, EditOrderModal } from './OrderModals'
import { JournalMeta } from './JournalMeta'

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={clsx('text-sm font-bold tabular-nums', tone === 'green' ? 'text-green-600' : tone === 'red' ? 'text-red-600' : 'text-slate-800 dark:text-slate-100')}>{value}</p>
    </div>
  )
}

function FutureTile({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-3 text-slate-400">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d={icon} /></svg>
      <span className="text-[10px] font-medium">{label}</span>
      <span className="text-[8px] uppercase tracking-wide">Soon</span>
    </div>
  )
}

export function TradeReviewDrawer({ trade, onClose, onChanged }: { trade: Trade; onClose: () => void; onChanged: () => void }) {
  const [orders, setOrders] = useState<TradeOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<TradeOrder | null>(null)
  const [group, setGroup] = useState(trade.group_name || 'MANUAL')
  const [assigning, setAssigning] = useState(false)
  const entry = useJournalEntry(trade.trade_id)
  const strategyLabel = useStrategyLabel()
  const hasRegisteredBrokers = useHasRegisteredBrokers()

  const load = useCallback(() => {
    setLoading(true)
    getTradeOrders(trade.trade_id).then(setOrders).catch(() => setOrders([])).finally(() => setLoading(false))
  }, [trade.trade_id])
  useEffect(() => { load() }, [load])

  const refresh = () => { load(); onChanged() }
  const pnl = (trade.realized_pnl ?? 0) + (trade.unrealized_pnl ?? 0)
  const win = pnl >= 0
  const ins = parseInstrument(trade.symbol_name)
  const im = INSTRUMENT_META[ins.kind]

  const summary = useMemo(() => {
    const buys = orders.filter((o) => o.txnType === 'BUY')
    const sells = orders.filter((o) => o.txnType === 'SELL')
    const wq = buys.reduce((a, o) => a + o.quantity, 0)
    const sq = sells.reduce((a, o) => a + o.quantity, 0)
    const avg = (arr: TradeOrder[]) => { const q = arr.reduce((a, o) => a + o.quantity, 0); return q ? arr.reduce((a, o) => a + o.price * o.quantity, 0) / q : 0 }
    return { avgEntry: avg(buys), avgExit: avg(sells), direction: wq === sq ? 'Flat' : wq > sq ? 'Long' : 'Short', orders: orders.length }
  }, [orders])

  const timeline = useMemo(() => [...orders].sort((a, b) => new Date(a.placedTime).getTime() - new Date(b.placedTime).getTime()), [orders])

  const applyStrategy = async () => {
    if (!orders.length) return
    setAssigning(true)
    try { await assignOrderGroup({ orderIds: orders.map((o) => o.id), groupName: group || 'MANUAL' }); toast.success('Strategy updated'); refresh() }
    catch { toast.error('Failed to assign strategy') } finally { setAssigning(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-full bg-white dark:bg-surface-dark shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className={clsx('px-2 py-1 rounded-lg text-xs font-bold', im.cls)}>{im.label}</span>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 dark:text-white truncate">{ins.underlying}{ins.strike ? ` ${ins.strike}` : ''}</p>
              <p className="text-[11px] text-slate-400 truncate">{trade.symbol_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded', trade.status !== 'CLOSED' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20' : 'bg-slate-100 text-slate-500 dark:bg-white/10')}>{trade.status}</span>
            <div className="text-right">
              <p className={clsx('text-xl font-bold tabular-nums', win ? 'text-green-600' : 'text-red-600')}>{fmtPnl(pnl)}</p>
              {entry.rating > 0 && <p className="text-[10px] text-amber-400">{'★'.repeat(entry.rating)}</p>}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
        </div>

        {/* Body — two columns */}
        <div className="flex-1 flex min-h-0">
          {/* Left: trade */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              <Metric label="P&L" value={fmtPnl(pnl)} tone={win ? 'green' : 'red'} />
              <Metric label="Direction" value={summary.direction} />
              <Metric label="Qty" value={String(trade.total_quantity)} />
              <Metric label="Avg Entry" value={summary.avgEntry ? summary.avgEntry.toFixed(2) : '—'} />
              <Metric label="Avg Exit" value={summary.avgExit ? summary.avgExit.toFixed(2) : '—'} />
              <Metric label="Duration" value={fmtDuration(trade.first_placed_time, trade.last_updated_time)} />
            </div>

            {/* Orders */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Orders <span className="text-slate-400 font-normal">({summary.orders})</span></h3>
                <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>Add order</button>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-white/5 text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="text-left font-medium px-3 py-2">Side</th><th className="text-right font-medium px-3 py-2">Qty</th><th className="text-right font-medium px-3 py-2">Price</th><th className="text-left font-medium px-3 py-2">Type</th><th className="text-left font-medium px-3 py-2">Time</th><th /></tr></thead>
                  <tbody>
                    {loading ? <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">Loading…</td></tr>
                      : orders.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">No orders. Add one to build this trade.</td></tr>
                        : orders.map((o) => (
                          <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="px-3 py-2"><span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold', o.txnType === 'BUY' ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30' : 'bg-red-50 text-red-600 dark:bg-red-900/30')}>{o.txnType}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums">{o.quantity}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{o.price?.toFixed(2)}</td>
                            <td className="px-3 py-2 text-slate-500">{o.orderType}</td>
                            <td className="px-3 py-2 text-[11px] text-slate-500">{fmtDate(o.placedTime)}</td>
                            <td className="px-3 py-2 text-right"><button onClick={() => setEditing(o)} className="text-slate-400 hover:text-brand-600" title="Edit"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg></button></td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Timeline */}
            {timeline.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Timeline</h3>
                <div className="relative pl-5">
                  <span className="absolute left-1.5 top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
                  {timeline.map((o) => (
                    <div key={o.id} className="relative pb-4 last:pb-0">
                      <span className={clsx('absolute -left-[13px] top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-surface-dark', o.txnType === 'BUY' ? 'bg-brand-500' : 'bg-red-500')} />
                      <p className="text-sm"><span className={clsx('font-semibold', o.txnType === 'BUY' ? 'text-brand-600' : 'text-red-600')}>{o.txnType}</span> <span className="tabular-nums">{o.quantity}</span> @ <span className="tabular-nums font-medium">{o.price?.toFixed(2)}</span></p>
                      <p className="text-[11px] text-slate-400">{fmtDate(o.placedTime)} · {fmtTime(o.placedTime)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right: journal */}
          <div className="w-[340px] shrink-0 border-l border-slate-200 dark:border-slate-800 overflow-y-auto p-5 bg-slate-50/50 dark:bg-white/[0.02]">
            {/* Strategy */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Strategy</p>
              <div className="flex items-center gap-2">
                <StrategySelect value={group} onChange={setGroup} disabled={!hasRegisteredBrokers} className="flex-1 h-9 px-2.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 text-sm outline-none" />
                <button onClick={applyStrategy} disabled={assigning} className="h-9 px-3 rounded-lg bg-slate-800 dark:bg-white/10 text-white text-xs font-semibold disabled:opacity-50">Apply</button>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Current: {strategyLabel(trade.group_name)}{isManual(trade.group_name) ? ' (manual)' : ''}</p>
            </div>

            <JournalMeta tradeId={trade.trade_id} />

            {/* Future features */}
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">More (coming soon)</p>
              <div className="grid grid-cols-3 gap-2">
                <FutureTile icon="M4 5h16v14H4zM4 15l4-4 3 3 5-6 4 4" label="Screenshots" />
                <FutureTile icon="M12 3a9 9 0 100 18 9 9 0 000-18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" label="Emotions" />
                <FutureTile icon="M9 11l3 3 8-8M4 6h6M4 12h4M4 18h8" label="Checklist" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {adding && <AddOrderModal trade={trade} onClose={() => setAdding(false)} onSaved={refresh} />}
      {editing && <EditOrderModal order={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  )
}
