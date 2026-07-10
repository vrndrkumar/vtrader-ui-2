// ── Trade adapter (single swap point for order/position APIs) ────────────────
// Mock today: places create/adjust a local position with client-side P&L, and
// drags on SL/Target modify it. Real REST/WS endpoints map in here later with
// no change to the store or chart.

import { useTradeStore, type Side } from '../../store/tradeStore'
import { useMarketStore } from '../../store/marketStore'
import { setOrderLineDragEnd } from '../../chart/orderOverlays'

export function placeMarket(
  symbolKey: string, display: string, side: Side, qty: number, brokerId: number,
  opts?: { slPct?: number; tgtPct?: number },
): void {
  const ltp = useMarketStore.getState().quotes[symbolKey]?.ltp ?? 0
  if (!ltp) return
  const id = `${symbolKey}#${brokerId}`
  const st = useTradeStore.getState()
  const existing = st.positions[id]
  const signed = (side === 'BUY' ? 1 : -1) * qty
  const netQty = (existing?.netQty ?? 0) + signed
  if (netQty === 0) { st.removePosition(id); return }

  const avg = existing
    ? +(((existing.avgPrice * existing.netQty) + (ltp * signed)) / netQty).toFixed(2)
    : +ltp.toFixed(2)
  const dir = netQty > 0 ? 1 : -1
  const sl = existing?.stopLoss ?? (opts?.slPct ? +(avg * (1 - dir * opts.slPct)).toFixed(2) : undefined)
  const tgt = existing?.target ?? (opts?.tgtPct ? +(avg * (1 + dir * opts.tgtPct)).toFixed(2) : undefined)
  st.upsertPosition({ id, brokerId, symbolKey, display, netQty, avgPrice: avg, stopLoss: sl, target: tgt })
}

export function modifyStop(id: string, price: number) { useTradeStore.getState().updatePosition(id, { stopLoss: +price.toFixed(2) }) }
export function modifyTarget(id: string, price: number) { useTradeStore.getState().updatePosition(id, { target: +price.toFixed(2) }) }
export function modifyStopQty(id: string, qty: number) { useTradeStore.getState().updatePosition(id, { stopQty: Math.max(1, Math.round(qty)) }) }
export function modifyTargetQty(id: string, qty: number) { useTradeStore.getState().updatePosition(id, { targetQty: Math.max(1, Math.round(qty)) }) }
export function clearStop(id: string) { useTradeStore.getState().updatePosition(id, { stopLoss: undefined, stopQty: undefined }) }
export function clearTarget(id: string) { useTradeStore.getState().updatePosition(id, { target: undefined, targetQty: undefined }) }
export function exitPosition(id: string) { useTradeStore.getState().removePosition(id) }

/** Change a position's quantity magnitude (sign preserved). 0 closes it. */
export function modifyQty(id: string, magnitude: number) {
  const st = useTradeStore.getState()
  const p = st.positions[id]
  if (!p) return
  if (magnitude <= 0) { st.removePosition(id); return }
  const sign = p.netQty >= 0 ? 1 : -1
  st.updatePosition(id, { netQty: sign * Math.round(magnitude) })
}

// Draggable SL/Target lines → modify (mock; real modify API maps here).
setOrderLineDragEnd((d, price) => {
  if (!d.positionId) return
  if (d.kind === 'sl') modifyStop(d.positionId, price)
  else if (d.kind === 'target') modifyTarget(d.positionId, price)
})
