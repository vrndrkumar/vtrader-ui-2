// ── Trade adapter (single swap point for order/position APIs) ────────────────
// Mock today: places create/adjust a local position with client-side P&L, and
// drags on SL/Target modify it. Real REST/WS endpoints map in here later with
// no change to the store or chart.

import toast from 'react-hot-toast'
import { useTradeStore, type Side } from '../../store/tradeStore'
import { useMarketStore } from '../../store/marketStore'
import { useBrokerStore } from '@/store/brokerStore'
import { saveOcoMonitor } from '@/api/trade'
import { roundTick } from '@/services/orders/tick'
import { setOrderLineDragEnd } from '../../chart/orderOverlays'
import { useIndexBracketStore } from '../../store/indexBracketStore'

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

/**
 * Persist a position's SL/Target as a server-side OCO monitor.
 * Sends the FULL current bracket (SL and/or Target — either optional); the
 * backend upserts by (user, broker, symbol) and clears any leg that's absent.
 * Call on set / drag-end / qty-edit / REMOVE. When both legs are cleared we must
 * still sync IF a monitor exists (so the removed leg is cleared server-side and
 * can't fire) — only skip entirely when there's nothing to save and nothing to
 * clear.
 */
export function syncOcoMonitor(positionId: string) {
  const p = useTradeStore.getState().positions[positionId]
  if (!p) return
  const brokerName = useBrokerStore.getState().accounts.find((a) => a.id === p.brokerId)?.brokerName
  if (!brokerName) return
  const hasLeg = p.stopLoss != null || p.target != null
  // Broker-aware: two brokers can hold the same strike, each with its OWN monitor.
  const monitorExists = useIndexBracketStore.getState().all.some(
    (r) => r.monitorType !== 'INDEX' && r.symbolName === p.symbolKey && String(r.brokerName ?? '') === brokerName
      && (r.entryStatus == null || r.entryStatus === 'FILLED'),
  )
  if (!hasLeg && !monitorExists) return // nothing to save, nothing to clear
  const long = p.netQty >= 0
  const posQty = Math.abs(p.netQty)
  void saveOcoMonitor({
    brokerName,
    indexName: p.symbolKey.split('_')[0],
    symbolName: p.symbolKey,
    product: 'MARGIN',
    direction: long ? 'LONG' : 'SHORT',
    side: long ? 'SELL' : 'BUY',
    quantity: posQty,
    stopLoss: p.stopLoss != null ? { limitPrice: +p.stopLoss.toFixed(2), quantity: p.stopQty ?? posQty } : undefined,
    target: p.target != null ? { limitPrice: +p.target.toFixed(2), quantity: p.targetQty ?? posQty } : undefined,
  }).then(() => {
    toast.success('OCO monitor saved')
    void useIndexBracketStore.getState().reload() // reflect the cleared/updated legs
  }).catch((e) => {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    // One-place-only rule: SL/Target already on the index for this position. The
    // strike side was NOT saved, so REVERT the optimistic line(s) we just drew —
    // it must not linger on the chart. Warn clearly (longer, so it's readable).
    if (msg && /already set/i.test(msg)) {
      clearStop(positionId); clearTarget(positionId)
      void useIndexBracketStore.getState().reload()
      toast.error(msg, { duration: 6000, icon: '⛔' })
    } else {
      toast.error(msg || 'Failed to save OCO monitor')
    }
  })
}

export function modifyStop(id: string, price: number) { useTradeStore.getState().updatePosition(id, { stopLoss: roundTick(price) }) }
export function modifyTarget(id: string, price: number) { useTradeStore.getState().updatePosition(id, { target: roundTick(price) }) }
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
