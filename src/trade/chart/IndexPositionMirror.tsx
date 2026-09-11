// ── Strike positions managed from the INDEX chart ───────────────────────────
// When "Sync options with index" is on, every open strike position for this
// index appears in a compact, collapsible "Positions" panel (top-left). Each row
// can set SL / Target at INDEX (spot) levels — those drop a draggable line on the
// chart; the exit still fires on the strike (MKT). Backend model: a no-entry
// INDEX-type OCO monitor (symbolName = strike). One-place rule (index OR premium,
// not both) is enforced by the backend and surfaced as a toast.

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import type { ChartEngine } from './ChartEngine'
import { useTradebookStore } from '../features/tradebook/tradebookStore'
import { netQty, type Position } from '../features/tradebook/types'
import { useIndexBracketStore } from '../store/indexBracketStore'
import { useMarketStore } from '../store/marketStore'
import { useBrokerStore } from '@/store/brokerStore'
import { submitOrder } from '@/services/orders/placeOrder'
import { lotSizeFor } from '@/services/orders/lotSize'
import { saveIndexPositionOco, cancelIndexBracket } from '@/api/trade'
import { CARD, TYPE, PRICE, AT, COLORS, money } from './tagStyles'

const EMPTY_POS: Position[] = []
const optType = (s: string) => (/_CE_/.test(s) ? 'CE' : /_PE_/.test(s) ? 'PE' : '')
const strikeLabel = (s: string) => s.split('_').slice(-2).join(' ')

// Stable per-broker accent colour + short label, so each broker's rows/lines are
// instantly distinguishable when the same strike is held on multiple brokers.
const BROKER_COLORS = ['#6366f1', '#0891b2', '#ca8a04', '#dc2626', '#7c3aed', '#059669', '#db2777', '#ea580c']
const brokerColor = (b: string) => BROKER_COLORS[Math.abs([...(b || '?')].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % BROKER_COLORS.length]
const brokerShort = (b: string) => (b || '').replace(/\[.*\]/, '').trim().slice(0, 8).toUpperCase()

function BrokerChip({ name }: { name: string }) {
  const c = brokerColor(name)
  return (
    <span className="shrink-0 px-1 py-px rounded text-[9px] font-bold tracking-wide whitespace-nowrap" title={name}
      style={{ color: c, background: `${c}1f`, border: `1px solid ${c}55` }}>{brokerShort(name)}</span>
  )
}
// Index bias of the option position: bullish (LONG) for BUY-CE / SELL-PE.
const biasOf = (p: Position): 'LONG' | 'SHORT' => {
  const t = optType(p.symbol); const long = netQty(p) > 0
  return (t === 'CE' && long) || (t === 'PE' && !long) ? 'LONG' : 'SHORT'
}
const errMsg = (e: unknown): string =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save'

type Leg = 'sl' | 'tgt'

export function IndexPositionMirror({ engineRef, index, ltp }: {
  engineRef: React.MutableRefObject<ChartEngine | null>
  index: string
  ltp: number
}) {
  const tbPositions = useTradebookStore((s) => s.positions) ?? EMPTY_POS
  const ocoAll = useIndexBracketStore((s) => s.all)
  const reload = useIndexBracketStore((s) => s.reload)
  const quotes = useMarketStore((s) => s.quotes)
  useEffect(() => { void reload() }, [reload])

  const positions = tbPositions.filter((p) => p.status === 'OPEN' && p.indexName === index && netQty(p) !== 0 && !!optType(p.symbol))
  // Unique key per (broker, strike): two brokers can hold the SAME strike, each
  // with its OWN index SL/Target monitor. Keying by symbol alone conflated them —
  // the line/icon showed on both rows and cancel hit the wrong monitor.
  const pkey = (p: Position) => `${p.brokerId}:${p.symbol}`
  const monitorFor = (p: Position) => ocoAll.find((r) => r.monitorType === 'INDEX' && r.entryStatus == null && r.symbolName === p.symbol && String(r.brokerName ?? '') === p.brokerName)

  const wrapRef = useRef<HTMLDivElement>(null)
  const elMap = useRef(new Map<string, HTMLDivElement>())
  const priceMap = useRef(new Map<string, number>())
  const ovRef = useRef<Record<string, number>>({})
  const dragRef = useRef<{ pk: string; leg: Leg } | null>(null)
  const [, setTick] = useState(0)
  const rerender = () => setTick((t) => t + 1)
  const [dragging, setDragging] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(true) // start minimized (header only)

  const num = (v: unknown) => (v == null ? null : Number(v))
  const legLevel = (p: Position, leg: Leg): number | null => {
    const k = `${pkey(p)}:${leg}`
    if (k in ovRef.current) return ovRef.current[k]
    const m = monitorFor(p)
    if (!m) return null
    const v = leg === 'sl' ? num(m.slTriggerPrice) : num(m.tgtTriggerPrice)
    const status = leg === 'sl' ? m.slStatus : m.tgtStatus
    return status === 'PENDING' ? v : null
  }
  const pnlOf = (p: Position) => {
    const live = quotes[p.symbol]?.ltp ?? p.ltp
    return p.realized + (live - p.avgPrice) * netQty(p)
  }
  const defLevel = (bias: 'LONG' | 'SHORT', leg: Leg) => {
    const long = bias === 'LONG'
    const f = leg === 'sl' ? (long ? 0.997 : 1.003) : (long ? 1.003 : 0.997)
    return +(ltp * f).toFixed(2)
  }

  const persist = (p: Position, sl: number | null, tgt: number | null) => {
    const q = Math.abs(netQty(p))
    saveIndexPositionOco({
      brokerName: p.brokerName, indexName: index, symbolName: p.symbol,
      direction: biasOf(p), side: netQty(p) > 0 ? 'SELL' : 'BUY', quantity: q, product: 'MARGIN',
      stopLoss: sl != null ? { triggerPrice: +sl.toFixed(2), quantity: q } : undefined,
      target: tgt != null ? { triggerPrice: +tgt.toFixed(2), quantity: q } : undefined,
    }).then(() => reload()).catch((e) => toast.error(errMsg(e)))
  }
  // Panel "SL"/"Target" → create the leg at a sensible index level; the resulting
  // line is then draggable on the chart to fine-tune.
  const addLeg = (p: Position, leg: Leg) => {
    persist(p, leg === 'sl' ? defLevel(biasOf(p), 'sl') : legLevel(p, 'sl'), leg === 'tgt' ? defLevel(biasOf(p), 'tgt') : legLevel(p, 'tgt'))
  }
  const removeLeg = (p: Position, leg: Leg) => {
    persist(p, leg === 'sl' ? null : legLevel(p, 'sl'), leg === 'tgt' ? null : legLevel(p, 'tgt'))
  }
  const cancelAll = (p: Position) => {
    const m = monitorFor(p)
    if (!m) return
    cancelIndexBracket(m.id as number | string).then(() => reload()).catch((e) => toast.error(errMsg(e)))
  }
  const exit = (p: Position) => {
    cancelAll(p)
    const broker = useBrokerStore.getState().accounts.find((a) => a.id === p.brokerId)
    const q = Math.abs(netQty(p))
    if (broker && q > 0) {
      const idxName = p.symbol.split('_')[0]
      const side: 'BUY' | 'SELL' = netQty(p) > 0 ? 'SELL' : 'BUY'
      const lots = Math.max(1, Math.round(q / lotSizeFor(idxName)))
      void submitOrder({ symbolName: p.symbol, indexName: idxName, side, priceType: 'MKT', display: strikeLabel(p.symbol) }, [{ broker, lots }])
        .then(() => useTradebookStore.getState().reload())
    }
  }

  // Only SL/Target lines live on the price scale.
  priceMap.current = new Map()
  for (const p of positions) {
    const sl = legLevel(p, 'sl'); if (sl != null) priceMap.current.set(`${pkey(p)}:sl`, sl)
    const tg = legLevel(p, 'tgt'); if (tg != null) priceMap.current.set(`${pkey(p)}:tgt`, tg)
  }

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const eng = engineRef.current
      if (eng) {
        priceMap.current.forEach((price, id) => {
          const el = elMap.current.get(id); if (!el) return
          const y = eng.priceToY(price)
          const h = wrapRef.current?.clientHeight ?? 0
          if (y == null || y < -20 || y > h + 20) { el.style.opacity = '0'; el.style.pointerEvents = 'none' }
          else { el.style.transform = `translateY(${y}px)`; el.style.opacity = '1'; el.style.pointerEvents = '' }
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engineRef])

  // The window drag listeners are attached once; capture the LATEST positions /
  // legLevel / persist in a ref so drag-end reads fresh state. Without this the
  // listener used a stale snapshot from before the second leg was added, so
  // releasing a drag sent "no other leg" → the backend cleared the sibling.
  const latest = useRef({ positions, legLevel, persist })
  latest.current = { positions, legLevel, persist }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current; const eng = engineRef.current; const rect = wrapRef.current?.getBoundingClientRect()
      if (!d || !eng || !rect) return
      const price = eng.yToPrice(e.clientY - rect.top)
      if (price == null || price <= 0) return
      ovRef.current[`${d.pk}:${d.leg}`] = +price.toFixed(2)
      rerender()
    }
    const end = () => {
      const d = dragRef.current; dragRef.current = null; setDragging(null)
      if (!d) return
      const s = latest.current
      const p = s.positions.find((x) => pkey(x) === d.pk)
      if (p) s.persist(p, s.legLevel(p, 'sl'), s.legLevel(p, 'tgt'))
      delete ovRef.current[`${d.pk}:${d.leg}`]
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end) }
  }, [engineRef])

  const refCb = (id: string) => (el: HTMLDivElement | null) => { if (el) elMap.current.set(id, el); else elMap.current.delete(id) }
  const startDrag = (pk: string, leg: Leg) => (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); dragRef.current = { pk, leg }; setDragging(`${pk}:${leg}`) }

  if (!positions.length) return null
  const totalPnl = positions.reduce((a, p) => a + pnlOf(p), 0)

  return (
    <div ref={wrapRef} className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
      {/* Docked, collapsible Positions panel */}
      <div className="absolute left-1.5 top-[62px] pointer-events-auto w-[352px] max-w-[calc(100%-16px)] rounded-xl bg-white/92 dark:bg-surface-dark/92 backdrop-blur-sm border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
        <button onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 w-full px-2.5 py-1.5 bg-slate-50/80 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-200">Positions</span>
          <span className="text-[10px] font-bold px-1.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-300">{positions.length}</span>
          <span className={clsx('ml-auto text-[11px] font-bold tabular-nums', totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{money(totalPnl)}</span>
          <svg viewBox="0 0 24 24" className={clsx('h-4 w-4 text-slate-400 transition-transform', collapsed && '-rotate-90')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {!collapsed && positions.map((p) => {
          const long = netQty(p) > 0; const kind = long ? 'long' : 'short'
          const sl = legLevel(p, 'sl'); const tg = legLevel(p, 'tgt')
          const pnl = pnlOf(p); const hasOco = sl != null || tg != null
          return (
            <div key={pkey(p)} className="flex items-center gap-1.5 px-2 py-1.5 border-t border-slate-100 dark:border-slate-800">
              <span title={long ? 'Long' : 'Short'} className={clsx('shrink-0 px-1.5 py-px rounded border text-[10px] font-bold tabular-nums whitespace-nowrap text-center', TYPE[kind].badge)}>{long ? 'B' : 'S'} {Math.abs(netQty(p))}</span>
              <BrokerChip name={p.brokerName} />
              <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-300 whitespace-nowrap">{strikeLabel(p.symbol)}</span>
              <span className={clsx('shrink-0 min-w-[50px] text-right text-[11px] font-bold tabular-nums whitespace-nowrap', pnl >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{money(pnl)}</span>
              <span className="ml-auto flex items-center gap-1 shrink-0">
                {sl == null && <MiniBtn tone="sl" onClick={() => addLeg(p, 'sl')} />}
                {tg == null && <MiniBtn tone="tp" onClick={() => addLeg(p, 'tgt')} />}
                {hasOco && (
                  <button title="Cancel index SL/Target" onClick={() => cancelAll(p)} className="h-[22px] w-[22px] grid place-items-center rounded-md text-slate-400 hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/10">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                )}
                <button title="Exit at market" onClick={() => exit(p)} className="h-[22px] px-2 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold">Exit</button>
              </span>
            </div>
          )
        })}
      </div>

      {/* SL / Target lines at INDEX levels (draggable) */}
      {positions.map((p) => {
        const sl = legLevel(p, 'sl'); const tg = legLevel(p, 'tgt')
        const pk = pkey(p)
        return (
          <div key={`lines:${pk}`}>
            {sl != null && (
              <div ref={refCb(`${pk}:sl`)} className="absolute left-0 right-0 top-0 opacity-0 will-change-transform">
                <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center">
                  <div className="absolute inset-x-0 border-t border-dashed pointer-events-none" style={{ borderColor: COLORS.sl, opacity: 0.9 }} />
                  <LineTag kind="sl" label="SL" value={sl} sub={strikeLabel(p.symbol)} broker={p.brokerName} dragging={dragging === `${pk}:sl`} onDown={startDrag(pk, 'sl')} onRemove={() => removeLeg(p, 'sl')} />
                </div>
              </div>
            )}
            {tg != null && (
              <div ref={refCb(`${pk}:tgt`)} className="absolute left-0 right-0 top-0 opacity-0 will-change-transform">
                <div className="absolute left-0 right-0 -translate-y-1/2 flex items-center">
                  <div className="absolute inset-x-0 border-t border-dashed pointer-events-none" style={{ borderColor: COLORS.tp, opacity: 0.9 }} />
                  <LineTag kind="tp" label="Target" value={tg} sub={strikeLabel(p.symbol)} broker={p.brokerName} dragging={dragging === `${pk}:tgt`} onDown={startDrag(pk, 'tgt')} onRemove={() => removeLeg(p, 'tgt')} />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Icon buttons (shield = SL, target = Target) to keep the row on one line.
function MiniBtn({ tone, onClick }: { tone: 'sl' | 'tp'; onClick: () => void }) {
  const path = tone === 'sl' ? 'M12 3l7 3v5c0 4.2-3 7.4-7 8.4-4-1-7-4.2-7-8.4V6z' : 'M12 3v3M12 18v3M3 12h3M18 12h3'
  return (
    <button onClick={onClick} title={tone === 'sl' ? 'Set stop-loss on the index' : 'Set target on the index'}
      className={clsx('h-[22px] w-[22px] grid place-items-center rounded-md border transition-colors',
        tone === 'sl' ? 'text-red-600 border-red-300 bg-red-50 hover:bg-red-100 dark:text-red-300 dark:border-red-500/50 dark:bg-red-500/15' : 'text-teal-600 border-teal-300 bg-teal-50 hover:bg-teal-100 dark:text-teal-300 dark:border-teal-500/40 dark:bg-teal-500/15')}>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {tone === 'tp' && <circle cx="12" cy="12" r="7" />}
        {tone === 'tp' && <circle cx="12" cy="12" r="2.5" />}
        <path d={path} />
      </svg>
    </button>
  )
}

function LineTag({ kind, label, value, sub, broker, dragging, onDown, onRemove }: {
  kind: 'sl' | 'tp'; label: string; value: number; sub: string; broker?: string
  dragging: boolean; onDown: (e: React.PointerEvent) => void; onRemove: () => void
}) {
  const color = kind === 'sl' ? COLORS.sl : COLORS.tp
  return (
    <div onPointerDown={onDown} className={clsx('relative group ml-2 flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-lg cursor-ns-resize select-none pointer-events-auto touch-none transition-transform', CARD, dragging && 'scale-105 shadow-xl')}>
      <span className={clsx('px-1.5 py-px rounded border text-[10px] font-bold', TYPE[kind].badge)}>{label}</span>
      <span className={clsx('text-[10px]', AT)}>idx</span>
      <span className={clsx('text-[12px] font-extrabold tabular-nums', PRICE)}>{value.toFixed(2)}</span>
      {broker && <BrokerChip name={broker} />}
      <span className={clsx('text-[9px]', AT)}>{sub}</span>
      <button title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} className={clsx('h-5 w-5 grid place-items-center rounded-md hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/10', AT)} style={{ color }}>
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  )
}
