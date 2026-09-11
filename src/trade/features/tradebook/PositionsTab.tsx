import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { useTradebookStore } from './tradebookStore'
import { netQty, dayPnl, totalPnl, type Position } from './types'
import { inr, pnlCls, px } from './format'
import { Stepper, ManageButton } from './Act'
import { lotSizeFor } from '@/services/orders/lotSize'
import { useGroupMonitorStore } from '@/trade/store/groupMonitorStore'
import type { GroupLeg } from '@/api/groupMonitors'

export function PositionsTab({ rows }: { rows: Position[] }) {
  const [selId, setSelId] = useState<string | null>(null)
  const sel = rows.find((p) => p.id === selId && p.status === 'OPEN') ?? null

  // Multi-select for combined "group protect" (single index at a time).
  const gm = useGroupMonitorStore()
  const selectable = (p: Position) => p.status === 'OPEN' && netQty(p) !== 0
  const selectedRows = rows.filter((p) => gm.selectedIds.includes(p.id))
  // Running P&L exactly as shown in the table (realized + live unrealized). The
  // monitor triggers on the CHANGE from this value at arm time.
  const selPnl = selectedRows.reduce((a, p) => a + totalPnl(p), 0)
  const openProtect = () => {
    const legs: GroupLeg[] = selectedRows.map((p) => ({
      brokerName: p.brokerName, brokerLabel: p.brokerLabel, symbolName: p.symbol, display: p.display, product: p.product,
      lockedQty: netQty(p), lockedAvg: p.avgPrice, valueFactor: p.valueFactor,
      armPrice: p.ltp, // live premium at arm — the P&L reference
    }))
    gm.openCreate(legs, gm.selIndex ?? selectedRows[0]?.indexName ?? '', selPnl)
  }

  const totals = useMemo(() => rows.reduce((a, p) => ({ day: a.day + dayPnl(p), net: a.net + totalPnl(p) }), { day: 0, net: 0 }), [rows])

  if (rows.length === 0) return <Empty label="No open positions" />

  return (
    <div className="h-full flex min-h-0">
      {/* Table (shrinks when drawer open) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-white/[0.03] text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-9 px-2 py-2" aria-hidden />
                <th className="text-left font-medium px-3 py-2">Instrument</th>
                <th className="text-left font-medium px-3 py-2">Product</th>
                <th className="text-right font-medium px-3 py-2">Qty</th>
                <th className="text-right font-medium px-3 py-2">Avg</th>
                <th className="text-right font-medium px-3 py-2">LTP</th>
                <th className="text-right font-medium px-3 py-2">Day P&L</th>
                <th className="text-right font-medium px-3 py-2">Net P&L</th>
                <th className="w-12 p-0" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const n = netQty(p)
                const net = totalPnl(p)
                const closed = p.status === 'CLOSED'
                const active = selId === p.id
                return (
                  <tr key={p.id} onClick={() => !closed && setSelId(active ? null : p.id)}
                    className={clsx('group border-t border-slate-100 dark:border-slate-800/60', !closed && 'cursor-pointer', active ? 'bg-brand-50/60 dark:bg-brand-900/15' : 'hover:bg-slate-50 dark:hover:bg-white/5', closed && 'opacity-50')}>
                    <td className="w-9 px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const checked = gm.isSelected(p.id)
                        const blocked = !checked && gm.selIndex != null && p.indexName !== gm.selIndex
                        const disabled = !selectable(p) || blocked
                        return (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => gm.toggleSelect({ id: p.id, indexName: p.indexName })}
                            title={blocked ? `Group protects one index — clear ${gm.selIndex} first` : checked ? 'Remove from protect' : 'Select for combined protect'}
                            className={clsx('h-4 w-4 grid place-items-center rounded-[5px] border transition active:scale-90',
                              checked ? 'bg-violet-500 border-violet-500 text-white shadow-sm shadow-indigo-900/20'
                                : disabled ? 'border-slate-200 dark:border-slate-700 opacity-40 cursor-not-allowed'
                                  : 'border-slate-300 dark:border-slate-600 hover:border-violet-400')}>
                            {checked && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
                          </button>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-bold', n >= 0 ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30' : 'bg-red-50 text-red-600 dark:bg-red-900/30')}>{n >= 0 ? 'LONG' : 'SHORT'}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-100 leading-tight truncate">{p.display}</p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {p.brokerLabel}
                            {p.stop ? <span className="text-amber-500"> · SL {px(p.stop)}</span> : ''}
                            {p.target ? <span className="text-green-500"> · T {px(p.target)}</span> : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-white/10">{p.product}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums" title={`Buy ${p.buyQty} · Sell ${p.sellQty}`}>{closed ? 0 : n}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{px(p.avgPrice)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{px(p.ltp)}</td>
                    <td className={clsx('px-3 py-2 text-right tabular-nums', pnlCls(dayPnl(p)))}>{inr(dayPnl(p), true)}</td>
                    <td className={clsx('px-3 py-2 text-right tabular-nums font-bold', pnlCls(net))}>{inr(net, true)}</td>
                    <td className="p-0 w-12 pr-2">
                      {closed ? <span className="text-[9px] text-slate-400 float-right">Closed</span> : (
                        <div className="grid place-items-center"><ManageButton active={active} onClick={() => setSelId(active ? null : p.id)} /></div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Combined-protect action bar (appears while positions are selected) */}
        {selectedRows.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-t border-violet-200 dark:border-violet-900/40 bg-gradient-to-r from-slate-50 to-violet-50/60 dark:from-white/[0.03] dark:to-violet-950/20 animate-slide-up">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-300">
              <span className="grid place-items-center h-5 min-w-5 px-1.5 rounded-full bg-violet-500 text-white text-[10px]">{selectedRows.length}</span>
              {gm.selIndex} selected
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Running P&L <b className={clsx('tabular-nums', pnlCls(selPnl))}>{inr(selPnl, true)}</b></span>
            <div className="flex-1" />
            <button onClick={gm.clearSelection} className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:bg-white/60 dark:hover:bg-white/5 transition active:scale-95">Clear</button>
            <button onClick={openProtect}
              className="h-8 px-4 rounded-lg text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 transition active:scale-95 inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" /></svg>
              Protect
            </button>
          </div>
        )}

        {/* Totals footer */}
        <div className="flex items-center justify-end gap-6 px-4 py-2 border-t border-slate-200 dark:border-slate-800 text-xs">
          <span className="text-slate-500">Day P&L <span className={clsx('font-bold tabular-nums', pnlCls(totals.day))}>{inr(totals.day, true)}</span></span>
          <span className="text-slate-500">Net P&L <span className={clsx('font-bold tabular-nums', pnlCls(totals.net))}>{inr(totals.net, true)}</span></span>
        </div>
      </div>

      {/* Drawer: width animates so the table shrinks gracefully; content is
          clipped at a fixed width so nothing reflows mid-transition. */}
      <div
        className={clsx('shrink-0 overflow-hidden transition-[width] duration-300 ease-out', sel && 'border-l border-slate-200 dark:border-slate-800')}
        style={{ width: sel ? 320 : 0 }}
      >
        {sel && <PositionDrawer key={sel.id} pos={sel} onClose={() => setSelId(null)} />}
      </div>
    </div>
  )
}

type Mode = 'sl' | 'target' | 'add' | 'reduce'

const ACCENT: Record<Mode, { icon: string; ring: string; btn: string; chip: string }> = {
  sl:     { icon: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30', ring: 'border-amber-300 bg-amber-50/70 dark:border-amber-700/50 dark:bg-amber-900/15', btn: 'bg-amber-500 hover:bg-amber-600', chip: 'border-amber-300 bg-amber-100/70 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  target: { icon: 'bg-green-100 text-green-600 dark:bg-green-900/30', ring: 'border-green-300 bg-green-50/70 dark:border-green-700/50 dark:bg-green-900/15', btn: 'bg-green-600 hover:bg-green-700', chip: 'border-green-300 bg-green-100/70 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  add:    { icon: 'bg-brand-100 text-brand-600 dark:bg-brand-900/30', ring: 'border-brand-300 bg-brand-50/70 dark:border-brand-700/50 dark:bg-brand-900/15', btn: 'bg-brand-600 hover:bg-brand-700', chip: 'border-brand-300 bg-brand-100/70 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' },
  reduce: { icon: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30', ring: 'border-rose-300 bg-rose-50/70 dark:border-rose-700/50 dark:bg-rose-900/15', btn: 'bg-rose-600 hover:bg-rose-700', chip: 'border-rose-300 bg-rose-100/70 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
}
const TILE_ICON: Record<Mode, React.ReactNode> = {
  sl: <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  add: <path d="M12 5v14M5 12h14" />,
  reduce: <path d="M5 12h14" />,
}
const TITLE: Record<Mode, string> = { sl: 'Set stop-loss', target: 'Set target', add: 'Add quantity', reduce: 'Reduce position' }
const CTA: Record<Mode, string> = { sl: 'Set SL', target: 'Set target', add: 'Add', reduce: 'Exit qty' }

function Tile({ mode, label, sub, active, onClick }: { mode: Mode; label: string; sub: string; active: boolean; onClick: () => void }) {
  const a = ACCENT[mode]
  return (
    <button onClick={onClick} className={clsx('group flex flex-col items-start gap-1.5 rounded-2xl border p-2.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]', active ? a.ring : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600')}>
      <span className={clsx('h-7 w-7 grid place-items-center rounded-xl transition-transform group-hover:scale-110', a.icon)}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{TILE_ICON[mode]}</svg>
      </span>
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>
      <span className="text-[10px] text-slate-400 truncate max-w-full">{sub}</span>
    </button>
  )
}

function PositionDrawer({ pos, onClose }: { pos: Position; onClose: () => void }) {
  const store = useTradebookStore()
  const n = netQty(pos)
  const net = totalPnl(pos)
  const day = dayPnl(pos)
  const q = Math.abs(n)
  const dir = n >= 0 ? 1 : -1
  const [mode, setMode] = useState<Mode | null>(null)
  const [val, setVal] = useState('')
  const [armed, setArmed] = useState(false)

  const openMode = (m: Mode) => {
    setMode((cur) => (cur === m ? null : m))
    setVal(
      m === 'sl' ? String(pos.stop ?? +(pos.ltp * (1 - dir * 0.1)).toFixed(2))
        : m === 'target' ? String(pos.target ?? +(pos.ltp * (1 + dir * 0.1)).toFixed(2))
          : m === 'reduce' ? String(q) : '',
    )
  }
  const confirm = () => {
    if (!mode) return
    const v = Number(val) || 0
    if (mode === 'sl') store.setStop(pos.id, v)
    else if (mode === 'target') store.setTarget(pos.id, v)
    else if (mode === 'add') store.addQty(pos.id, v)
    else store.partialExit(pos.id, v)
    setMode(null)
  }
  const lot = lotSizeFor(pos.indexName) // qty steps/chips are lot-size multiples
  const chips = mode === 'sl' ? [0.05, 0.1, 0.15].map((p) => ({ l: `${p * 100}%`, v: +(pos.ltp * (1 - dir * p)).toFixed(2) }))
    : mode === 'target' ? [0.05, 0.1, 0.15].map((p) => ({ l: `${p * 100}%`, v: +(pos.ltp * (1 + dir * p)).toFixed(2) }))
      : [0.25, 0.5, 1].map((p) => ({ l: `${p * 100}%`, v: Math.max(lot, Math.round((q * p) / lot) * lot) }))

  return (
    <div className="w-80 h-full flex flex-col bg-white dark:bg-card-dark animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between px-3.5 pt-3 pb-1.5 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-bold', n >= 0 ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30' : 'bg-red-50 text-red-600 dark:bg-red-900/30')}>{n >= 0 ? 'LONG' : 'SHORT'}</span>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">{pos.display}</p>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 truncate">{pos.brokerLabel} · {pos.product} · {n} qty</p>
        </div>
        <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </div>

      {/* Live P&L hero */}
      <div className="mx-3.5 mb-3 rounded-2xl px-3.5 py-2.5 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-white/[0.06] dark:to-white/[0.02] border border-slate-200 dark:border-slate-800">
        <p className="text-[9px] uppercase tracking-widest text-slate-400">Net P&L</p>
        <p className={clsx('text-2xl font-extrabold tabular-nums flex items-center gap-1 leading-tight', pnlCls(net))}>
          <svg viewBox="0 0 24 24" className={clsx('h-5 w-5', net < 0 && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          {inr(net, true)}
        </p>
        <div className="flex gap-4 mt-1 text-[11px] text-slate-400">
          <span>LTP <b className="text-slate-700 dark:text-slate-200 tabular-nums">{px(pos.ltp)}</b></span>
          <span>Avg <b className="text-slate-700 dark:text-slate-200 tabular-nums">{px(pos.avgPrice)}</b></span>
          <span>Day <b className={clsx('tabular-nums', pnlCls(day))}>{inr(day, true)}</b></span>
        </div>
      </div>

      {/* Action deck */}
      <div className="flex-1 overflow-auto px-3.5 pb-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <Tile mode="sl" label="Stop-loss" sub={pos.stop ? `@ ${px(pos.stop)}` : 'Protect downside'} active={mode === 'sl'} onClick={() => openMode('sl')} />
          <Tile mode="target" label="Target" sub={pos.target ? `@ ${px(pos.target)}` : 'Book profit'} active={mode === 'target'} onClick={() => openMode('target')} />
          <Tile mode="add" label="Add" sub="Increase size" active={mode === 'add'} onClick={() => openMode('add')} />
          <Tile mode="reduce" label="Reduce" sub="Partial exit" active={mode === 'reduce'} onClick={() => openMode('reduce')} />
        </div>

        {/* Contextual editor */}
        {mode && (
          <div className={clsx('rounded-2xl border p-3 animate-slide-up', ACCENT[mode].ring)}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{TITLE[mode]}</span>
              <span className="text-[10px] text-slate-400 tabular-nums">LTP {px(pos.ltp)}</span>
            </div>
            <div className="flex gap-1.5 mb-2.5">
              {chips.map((c) => (
                <button key={c.l} onClick={() => setVal(String(c.v))}
                  className={clsx('flex-1 h-7 rounded-lg text-[11px] font-bold border transition active:scale-95',
                    String(c.v) === val ? ACCENT[mode].chip : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5')}>
                  {c.l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Stepper autoFocus value={val} step={mode === 'sl' || mode === 'target' ? 0.05 : lot} onChange={setVal} />
              <button onClick={confirm} className={clsx('flex-1 h-8 rounded-lg text-white text-xs font-bold transition-all active:scale-95', ACCENT[mode].btn)}>{CTA[mode]}</button>
            </div>
          </div>
        )}

        {/* Reverse + Exit */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button onClick={() => store.reversePosition(pos.id)} className="flex items-center justify-center gap-1.5 h-10 rounded-2xl border border-violet-200 dark:border-violet-900/40 text-violet-600 dark:text-violet-400 text-xs font-bold hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all active:scale-[0.97]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
            Reverse
          </button>
          <button
            onMouseLeave={() => setArmed(false)}
            onClick={() => { if (armed) { store.exitPosition(pos.id); onClose() } else setArmed(true) }}
            className={clsx('flex items-center justify-center gap-1.5 h-10 rounded-2xl text-xs font-bold transition-all active:scale-[0.97]',
              armed ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 ring-2 ring-red-300 dark:ring-red-800' : 'border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20')}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v8" /><path d="M6.3 6.3a8 8 0 1011.4 0" /></svg>
            {armed ? 'Confirm exit' : 'Exit'}
          </button>
        </div>
      </div>
    </div>
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
