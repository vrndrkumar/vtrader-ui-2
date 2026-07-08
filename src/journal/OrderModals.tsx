import { useState } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { syncOrder, updateOrder } from '@/api/reports'
import type { Trade, TradeOrder } from '@/types/reports'
import { StrategySelect } from './StrategySelect'

// Backend rejects a blank groupName; send the literal selection (e.g. "MANUAL").
const apiGroup = (g: string) => g || 'MANUAL'

const ORDER_TYPES = ['MKT', 'LMT', 'SL', 'SL-M']

// datetime-local "2025-09-26T12:55" → "2025-09-26 12:55:00"
const toApiTime = (local: string): string => (local ? `${local.replace('T', ' ')}:00` : '')
const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-medium text-slate-500">{label}</span>{children}</label>
}
const inputCls = 'w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-brand-400'

function SideToggle({ side, onChange }: { side: 'BUY' | 'SELL'; onChange: (s: 'BUY' | 'SELL') => void }) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-white/5">
      {(['BUY', 'SELL'] as const).map((s) => (
        <button key={s} onClick={() => onChange(s)} className={clsx('flex-1 py-1.5 rounded-md text-xs font-bold', side === s ? (s === 'BUY' ? 'bg-brand-600 text-white' : 'bg-red-600 text-white') : 'text-slate-500')}>{s}</button>
      ))}
    </div>
  )
}

function Shell({ title, onClose, children, onSubmit, submitLabel, busy }: { title: string; onClose: () => void; children: React.ReactNode; onSubmit: () => void; submitLabel: string; busy: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-card-dark shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <span className="font-semibold text-slate-800 dark:text-slate-100">{title}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">{children}</div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5">Cancel</button>
          <button onClick={onSubmit} disabled={busy} className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </div>
    </div>
  )
}

export function AddOrderModal({ trade, onClose, onSaved }: { trade: Trade; onClose: () => void; onSaved: () => void }) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY')
  const [qty, setQty] = useState(String(trade.total_quantity || ''))
  const [price, setPrice] = useState('')
  const [orderType, setOrderType] = useState('MKT')
  const [time, setTime] = useState(nowLocal())
  const [symbol, setSymbol] = useState(trade.symbol_name)
  const [group, setGroup] = useState(trade.group_name || 'MANUAL')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      await syncOrder({ price: Number(price) || 0, brokerName: trade.broker_name, txnType: side, quantity: Number(qty) || 0, placedTime: toApiTime(time), symbolName: symbol, orderStatus: 'COMPLETE', groupName: apiGroup(group), orderType })
      toast.success('Order added'); onSaved(); onClose()
    } catch { toast.error('Failed to add order') } finally { setBusy(false) }
  }

  return (
    <Shell title="Add order" onClose={onClose} onSubmit={submit} submitLabel="Add order" busy={busy}>
      <div className="col-span-2"><SideToggle side={side} onChange={setSide} /></div>
      <Field label="Quantity"><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className={inputCls} /></Field>
      <Field label="Price"><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inputCls} /></Field>
      <Field label="Order type"><select value={orderType} onChange={(e) => setOrderType(e.target.value)} className={inputCls}>{ORDER_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
      <Field label="Time"><input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>
      <div className="col-span-2"><Field label="Symbol"><input value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputCls} /></Field></div>
      <div className="col-span-2"><Field label="Strategy / group"><StrategySelect value={group} onChange={setGroup} className={inputCls} /></Field></div>
    </Shell>
  )
}

export function EditOrderModal({ order, onClose, onSaved }: { order: TradeOrder; onClose: () => void; onSaved: () => void }) {
  const [side, setSide] = useState<'BUY' | 'SELL'>(order.txnType)
  const [qty, setQty] = useState(String(order.quantity))
  const [price, setPrice] = useState(String(order.price))
  const [orderType, setOrderType] = useState(order.orderType || 'LMT')
  const [group, setGroup] = useState(order.groupName || 'MANUAL')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      await updateOrder(order.id, {
        price: Number(price) || 0, id: order.id, userId: order.userId, brokerName: order.brokerName,
        indexName: order.indexName, symbolName: order.symbolName, orderId: order.orderId,
        quantity: Number(qty) || 0, orderStatus: order.orderStatus, txnType: side, orderType,
        placedTime: order.placedTime, groupName: apiGroup(group),
      })
      toast.success('Order updated'); onSaved(); onClose()
    } catch { toast.error('Failed to update order') } finally { setBusy(false) }
  }

  return (
    <Shell title="Edit order" onClose={onClose} onSubmit={submit} submitLabel="Save changes" busy={busy}>
      <div className="col-span-2"><SideToggle side={side} onChange={setSide} /></div>
      <Field label="Quantity"><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className={inputCls} /></Field>
      <Field label="Price"><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inputCls} /></Field>
      <Field label="Order type"><select value={orderType} onChange={(e) => setOrderType(e.target.value)} className={inputCls}>{ORDER_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
      <Field label="Strategy / group"><StrategySelect value={group} onChange={setGroup} className={inputCls} /></Field>
      <div className="col-span-2"><p className="text-[11px] text-slate-400 truncate">{order.symbolName} · #{order.id}</p></div>
    </Shell>
  )
}
