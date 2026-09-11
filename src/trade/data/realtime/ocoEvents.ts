// ── OCO order events → reconcile from broker truth ───────────────────────────
// The server places the real order (entry / SL / target), polls its status until
// COMPLETE (0.5s × 5), then pushes ONE frame on the user's OCO channel. The frame
// is the raw broker order-status object (see OrderStatusPayload) — a "poke", not
// a description of state. We never try to mutate chart lines from the frame's
// fields; instead we RECONCILE: reload the tradebook (positions + order book) and
// the OCO monitor store, and let the render layers redraw from the true state.
//
// Why reconcile-from-truth (and not hand-clear lines):
//   • Chart position strips mirror tradebookStore.positions (ChartOrderLayer) and
//     the SL/Target lines come from indexBracketStore. Reloading both makes the
//     chart reflect exactly what the broker holds — closed positions drop, filled
//     entries appear, partial fills resize, rejects/cancels clear. No guessing.
//   • The frame is emitted only AFTER the broker returns COMPLETE, so a single
//     reload is usually accurate. One short safety re-reload covers the brief lag
//     between an exit order filling and the position API showing netqty 0.
//
// Scenarios all handled by the same reconcile:
//   SL/Target hit → exit filled → position closes → strip + both lines drop.
//   Entry (INDEX/SYMBOL bracket) filled → position appears → bracket overlay
//     stops drawing the pending entry, position strip renders.
//   Entry LMT still OPEN → no position yet; a later fill pushes another frame
//     that reconciles it (user manually fills from broker → WS → reconcile).
//   Leg REJECTED → position stays (unprotected); the rejected leg's line drops.
//   User/other cancel (legacy CANCELLED frame) → monitor gone → lines drop.
//   External/manual close from the broker → position gone → strip drops.
//   Partial booking → position API shows reduced net qty → strip resizes.

import toast from 'react-hot-toast'
import { isOrderStatusPayload, type OcoEventPayload, type OrderStatusPayload } from '../ws/messages'
import { useTradebookStore } from '../../features/tradebook/tradebookStore'
import { netQty } from '../../features/tradebook/types'
import { useIndexBracketStore } from '../../store/indexBracketStore'
import { cancelIndexBracket } from '@/api/trade'

// Cancel any POSITION-BACKED OCO monitor (SL/Target with no pending entry) whose
// position no longer exists — e.g. the user closed it from the broker terminal.
// Otherwise the monitor lingers ACTIVE (ghost strip on the chart + it could still
// fire). Positions API is the source of truth. Only runs once the book has loaded
// (never acts on an unloaded/failed book).
async function cleanupStaleOcoMonitors() {
  const tb = useTradebookStore.getState()
  if (!tb.loadedAt) return
  const openKeys = new Set(
    tb.positions.filter((p) => p.status === 'OPEN' && netQty(p) !== 0).map((p) => `${p.brokerName}|${p.symbol}`),
  )
  const all = useIndexBracketStore.getState().all
  // No-entry (classic SL/Target on a position) or a FILLED bracket → position-backed.
  const posBacked = (r: Record<string, unknown>) => r.entryStatus == null || r.entryStatus === 'FILLED'
  const stale = all.filter((r) => posBacked(r) && !openKeys.has(`${String(r.brokerName ?? '')}|${String(r.symbolName ?? '')}`))
  try { console.log('[OCO CLEANUP] openPositions=', [...openKeys], 'stale=', stale.map((m) => ({ id: m.id, broker: m.brokerName, sym: m.symbolName }))) } catch { /* noop */ }
  if (!stale.length) return
  await Promise.all(stale.map((m) => cancelIndexBracket(m.id as number | string).catch(() => { /* ignore */ })))
  await useIndexBracketStore.getState().reload()
}

// Coalesce reconcile calls (several frames can land together on a bracket
// completing) and add ONE delayed pass to catch the position-close reflection
// lag. This is NOT a poll — it's the initial pass plus a single confirmation.
let reconcileTimers: ReturnType<typeof setTimeout>[] = []
function reconcileFromApi() {
  reconcileTimers.forEach(clearTimeout)
  reconcileTimers = [];
  // 0 / 1.5 / 4s: the broker's Positions API often still shows a just-closed
  // position for a second or two, so re-confirm before deciding a monitor is
  // stale. Not a poll — a few confirmations after a WS event.
  [0, 1500, 4000].forEach((ms) => {
    reconcileTimers.push(setTimeout(async () => {
      await useTradebookStore.getState().reload()      // positions + order book (broker truth)
      await useIndexBracketStore.getState().reload()   // OCO monitors (entry / SL / target state)
      await cleanupStaleOcoMonitors()                  // drop monitors whose position is gone
    }, ms))
  })
}

// ── Toasts ───────────────────────────────────────────────────────────────────
// Purely informational; state comes from the reconcile above. Derive a message
// from whichever frame shape arrived.
function toastForStatus(e: OrderStatusPayload) {
  const sym = e.tradingSymbol
  const st = e.status.toUpperCase()
  if (st === 'COMPLETE' || st === 'COMPLETED' || st === 'FILLED') toast.success(`Order executed · ${sym}`)
  else if (st === 'REJECTED') toast.error(`Order rejected · ${sym}${e.rejectionRegion?.trim() ? `: ${e.rejectionRegion.trim()}` : ''}`)
  else if (st === 'CANCELLED' || st === 'CANCELED') toast(`Order cancelled · ${sym}`)
  // OPEN / PENDING / TRIGGER_PENDING → resting order; no toast (reconcile shows it).
}

function toastForLegacy(e: OcoEventPayload) {
  const leg = e.leg === 'SL' ? 'Stop-loss' : e.leg === 'TGT' ? 'Target' : e.leg === 'ENTRY' ? 'Entry' : 'Bracket'
  const sym = e.symbolName
  if (e.event === 'ENTRY_FILLED') toast.success(`Entry filled · ${sym}`)
  else if (e.event === 'EXECUTED') toast.success(`${leg} hit · ${sym}`)
  else if (e.event === 'REJECTED') toast.error(`${leg} rejected${e.message ? `: ${e.message}` : ''} · ${sym}`)
  // CANCELLED → silent; the line simply disappears on reconcile.
}

export function handleOcoEvent(payload: unknown) {
  // TEMP DEBUG: every OCO frame to the console (WS frames don't show as network
  // calls). Open DevTools → Console and copy the "[OCO WS]" lines.
  try { console.log('[OCO WS]', JSON.stringify(payload)) } catch { console.log('[OCO WS]', payload) }

  if (!payload || typeof payload !== 'object') return

  // New status frame (raw broker order-status). Reconcile + status toast.
  if (isOrderStatusPayload(payload)) {
    // WS-driven fill: if this frame reports a COMPLETE order, mark the matching
    // bracket entry FILLED immediately (by entry order id) — don't wait for the DB
    // row to flip or for the positions API to catch up.
    const st = payload.status.toUpperCase()
    if ((st === 'COMPLETE' || st === 'COMPLETED' || st === 'FILLED') && payload.orderId) {
      useIndexBracketStore.getState().markFilledByOrderId(payload.orderId)
    }
    reconcileFromApi()
    toastForStatus(payload)
    return
  }

  // Legacy OcoEventPayload (still emitted by the service on user-cancel, and as a
  // fallback until the backend fully switches to status frames). Same reconcile.
  const e = payload as OcoEventPayload
  if (!e.event || !e.symbolName) return
  reconcileFromApi()
  toastForLegacy(e)
}
