import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { useTradebookStore } from './tradebookStore'
import { netQty, dayPnl, totalPnl, type Position } from './types'
import { inr, pnlCls, px } from './format'
import { RowMenu } from './RowMenu'
import { MiniModal } from './MiniModal'

type Modal =
  | { kind: 'sl' | 'target' | 'add' | 'partial'; pos: Position }
  | null

function DirBadge({ p }: { p: Position }) {
  const n = netQty(p)
  const long = n >= 0
  return <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-bold', long ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30' : 'bg-red-50 text-red-600 dark:bg-red-900/30')}>{long ? 'LONG' : 'SHORT'}</span>
}

export function PositionsTab({ rows }: { rows: Position[] }) {
  const store = useTradebookStore()
  const [modal, setModal] = useState<Modal>(null)

  const totals = useMemo(() => rows.reduce((a, p) => ({
    day: a.day + dayPnl(p), net: a.net + totalPnl(p),
  }), { day: 0, net: 0 }), [rows])

  if (rows.length === 0) return <Empty label="No open positions" />

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-white/[0.03] text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="text-left font-medium px-3 py-2">Instrument</th>
              <th className="text-left font-medium px-3 py-2">Product</th>
              <th className="text-right font-medium px-3 py-2">Qty</th>
              <th className="text-right font-medium px-3 py-2">Avg</th>
              <th className="text-right font-medium px-3 py-2">LTP</th>
              <th className="text-right font-medium px-3 py-2">Day P&L</th>
              <th className="text-right font-medium px-3 py-2">Net P&L</th>
              <th className="text-right font-medium px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const n = netQty(p)
              const net = totalPnl(p)
              const closed = p.status === 'CLOSED'
              return (
                <tr key={p.id} className={clsx('border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-white/5', closed && 'opacity-50')}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <DirBadge p={p} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 leading-tight truncate">{p.display}</p>
                        <p className="text-[10px] text-slate-400 truncate">{p.brokerLabel}{p.stop ? ` · SL ${px(p.stop)}` : ''}{p.target ? ` · T ${px(p.target)}` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-white/10">{p.product}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums" title={`Buy ${p.buyQty} · Sell ${p.sellQty}`}>{closed ? 0 : n}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{px(p.avgPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{px(p.ltp)}</td>
                  <td className={clsx('px-3 py-2 text-right tabular-nums', pnlCls(dayPnl(p)))}>{inr(dayPnl(p), true)}</td>
                  <td className={clsx('px-3 py-2 text-right tabular-nums font-bold', pnlCls(net))}>{inr(net, true)}</td>
                  <td className="px-3 py-2">
                    {closed ? <span className="text-[10px] text-slate-400 float-right">Closed</span> : (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => store.exitPosition(p.id)} className="h-6 px-2 rounded-md bg-red-50 text-red-600 dark:bg-red-900/30 text-[11px] font-semibold hover:bg-red-100">Exit</button>
                        <RowMenu items={[
                          { label: 'Square off', onClick: () => store.squareOff(p.id) },
                          { label: 'Partial exit', onClick: () => setModal({ kind: 'partial', pos: p }) },
                          { label: 'Add quantity', onClick: () => setModal({ kind: 'add', pos: p }) },
                          { label: 'Reverse', onClick: () => store.reversePosition(p.id) },
                          { label: p.stop ? 'Modify stop loss' : 'Set stop loss', onClick: () => setModal({ kind: 'sl', pos: p }) },
                          { label: p.target ? 'Modify target' : 'Set target', onClick: () => setModal({ kind: 'target', pos: p }) },
                        ]} />
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Totals footer */}
      <div className="flex items-center justify-end gap-6 px-4 py-2 border-t border-slate-200 dark:border-slate-800 text-xs">
        <span className="text-slate-500">Day P&L <span className={clsx('font-bold tabular-nums', pnlCls(totals.day))}>{inr(totals.day, true)}</span></span>
        <span className="text-slate-500">Net P&L <span className={clsx('font-bold tabular-nums', pnlCls(totals.net))}>{inr(totals.net, true)}</span></span>
      </div>

      {modal && <PositionModal modal={modal} onClose={() => setModal(null)} />}
    </div>
  )
}

function PositionModal({ modal, onClose }: { modal: NonNullable<Modal>; onClose: () => void }) {
  const store = useTradebookStore()
  const { pos } = modal
  const cfg = {
    sl:      { title: 'Stop loss',    field: 'price', label: 'Trigger price', val: pos.stop ?? pos.ltp, cta: 'Set SL', run: (v: number) => store.setStop(pos.id, v) },
    target:  { title: 'Target',       field: 'price', label: 'Target price',  val: pos.target ?? pos.ltp, cta: 'Set target', run: (v: number) => store.setTarget(pos.id, v) },
    add:     { title: 'Add quantity', field: 'qty',   label: 'Quantity',      val: 0, cta: 'Add', run: (v: number) => store.addQty(pos.id, v) },
    partial: { title: 'Partial exit', field: 'qty',   label: 'Quantity to exit', val: 0, cta: 'Exit', run: (v: number) => store.partialExit(pos.id, v) },
  }[modal.kind]
  return (
    <MiniModal
      title={cfg.title} subtitle={pos.display}
      fields={[{ key: cfg.field, label: cfg.label, value: cfg.val }]}
      confirmLabel={cfg.cta} tone={modal.kind === 'partial' ? 'red' : 'brand'}
      onConfirm={(vals) => { cfg.run(vals[cfg.field]); onClose() }}
      onClose={onClose}
    />
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-1 text-slate-400">
      <svg viewBox="0 0 24 24" className="h-8 w-8 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18M7 14l4-4 3 3 5-6" /></svg>
      <p className="text-sm font-medium">{label}</p>
    </div>
  )
}
