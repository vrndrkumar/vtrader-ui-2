// ── Trade-from-price "+" menu (TradingView / Fyers style) ────────────────────
// A plus button rides the price axis at the cursor. Clicking it opens a context
// menu whose order types adapt to whether the price is above or below the LTP:
//   price ABOVE ltp → Buy stop / Sell limit
//   price BELOW ltp → Buy limit / Sell stop
// Placing routes through the global order service (quickPlace) and refreshes the
// positions/orders feed.

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import type { ChartEngine } from './ChartEngine'
import type { ChartSymbol } from '../types/market'
import toast from 'react-hot-toast'
import { saveSymbolBracket } from '@/api/trade'
import { useBrokerStore } from '@/store/brokerStore'
import { useTradebookStore } from '../features/tradebook/tradebookStore'
import { useIndexBracketStore } from '../store/indexBracketStore'

const AXIS_W = 54 // approx price-axis width — keep the pill clear of it so the axis can be scale-dragged

export function ChartPlusOrder({ engineRef, containerRef, symbol, ltp, qty }: {
  engineRef: React.MutableRefObject<ChartEngine | null>
  containerRef: React.RefObject<HTMLDivElement>
  symbol: ChartSymbol
  ltp: number
  qty: number
}) {
  const [cursorY, setCursorY] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ y: number; price: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const move = (e: MouseEvent) => {
      if (menu) return
      const r = el.getBoundingClientRect()
      // Over the price axis → hide the pill so the axis can be scale-dragged.
      if (e.clientX - r.left > r.width - AXIS_W) { setCursorY(null); return }
      setCursorY(e.clientY - r.top)
    }
    const leave = () => { if (!menu) setCursorY(null) }
    el.addEventListener('mousemove', move)
    el.addEventListener('mouseleave', leave)
    return () => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', leave) }
  }, [containerRef, menu])

  const priceFromY = (y: number): number | null => {
    const eng = engineRef.current
    if (!eng) return null
    // Use the chart's real y→price mapping (same as the axis label). Only fall
    // back to a linear approximation around the LTP if that's unavailable — the
    // approximation drifts far from the LTP (that was the wrong "+" price).
    const exact = eng.yToPrice(y)
    if (exact != null && exact > 0) return +exact.toFixed(2)
    const base = ltp > 0 ? ltp : 100
    const y0 = eng.priceToY(base); const y1 = eng.priceToY(base * 1.01)
    if (y0 != null && y1 != null && y1 !== y0) return +(base + (y - y0) / ((y1 - y0) / (base * 0.01))).toFixed(2)
    return null
  }

  const openMenu = () => {
    if (cursorY == null) return
    const price = priceFromY(cursorY)
    if (price != null && price > 0) setMenu({ y: cursorY, price })
  }

  const index = symbol.key.split('_')[0]
  const place = (side: 'BUY' | 'SELL', _stop: boolean, price: number) => {
    const bs = useBrokerStore.getState()
    const brokers = bs.accounts.filter((a) => bs.selectedIds.includes(a.id))
    if (!brokers.length) { toast.error('Select a broker first'); setMenu(null); setCursorY(null); return }
    // Triggered strike entry → one OCO SYMBOL bracket PER selected broker (the
    // monitor watches the option premium and places on hit — uniform with index).
    void Promise.all(brokers.map((b) =>
      saveSymbolBracket({ brokerName: b.brokerName, indexName: index, symbolName: symbol.candleSymbol, entrySide: side, entryQuantity: qty, entryTriggerPrice: price }),
    ))
      .then(() => { void useIndexBracketStore.getState().reload(); void useTradebookStore.getState().reload() })
      .catch(() => toast.error('Failed to place entry'))
    setMenu(null); setCursorY(null)
  }

  const h = containerRef.current?.clientHeight ?? 0
  const menuY = menu ? Math.min(Math.max(6, menu.y - 10), Math.max(6, h - 128)) : 0
  const above = menu ? menu.price >= ltp : false

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* Price pill + guide line following the cursor (sits on the price axis) */}
      {cursorY != null && !menu && (() => {
        const price = priceFromY(cursorY)
        return (
          <>
            <div className="absolute left-0 right-0 border-t border-dashed border-brand-400/40 pointer-events-none" style={{ top: cursorY }} />
            <button onClick={openMenu} style={{ top: cursorY, right: AXIS_W }}
              className="absolute -translate-y-1/2 flex items-center gap-1 h-6 pl-1 pr-2 rounded-md bg-slate-900 text-white shadow-lg pointer-events-auto ring-1 ring-white/10 transition-transform hover:scale-[1.03] active:scale-95">
              <span className="grid place-items-center h-4 w-4 rounded-full bg-brand-600">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </span>
              <span className="text-[11px] font-bold tabular-nums">{price != null ? price.toFixed(2) : '—'}</span>
            </button>
          </>
        )
      })()}

      {/* Context menu */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40 pointer-events-auto" onClick={() => { setMenu(null); setCursorY(null) }} />
          <div className="absolute right-2 z-50 w-64 pointer-events-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-2xl py-1 animate-fade-in text-sm" style={{ top: menuY }}>
            <div className="px-3 py-1.5 text-[11px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{menu.price.toFixed(2)}</span> · {symbol.display}
            </div>
            <Item color="brand" onClick={() => place('BUY', above, menu.price)}
              label={<>Buy <b>{qty}</b> @ <span className="tabular-nums">{menu.price.toFixed(2)}</span> <span className="text-slate-400">{above ? 'stop' : 'limit'}</span></>} icon="M12 19V5M5 12l7-7 7 7" />
            <Item color="red" onClick={() => place('SELL', !above, menu.price)}
              label={<>Sell <b>{qty}</b> @ <span className="tabular-nums">{menu.price.toFixed(2)}</span> <span className="text-slate-400">{above ? 'limit' : 'stop'}</span></>} icon="M12 5v14M5 12l7 7 7-7" />
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            <Item onClick={() => { try { engineRef.current?.startDrawing('priceLine') } catch { /* */ } setMenu(null); setCursorY(null) }}
              label={<>Draw line at <span className="tabular-nums">{menu.price.toFixed(2)}</span></>} icon="M4 12h16" muted />
          </div>
        </>
      )}
    </div>
  )
}

function Item({ label, icon, color, muted, onClick }: { label: React.ReactNode; icon: string; color?: 'brand' | 'red'; muted?: boolean; onClick: () => void }) {
  const c = color === 'brand' ? 'text-brand-600' : color === 'red' ? 'text-red-600' : 'text-slate-400'
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <svg viewBox="0 0 24 24" className={clsx('h-4 w-4 shrink-0', c)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      <span className={clsx('text-[13px]', muted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200')}>{label}</span>
    </button>
  )
}
