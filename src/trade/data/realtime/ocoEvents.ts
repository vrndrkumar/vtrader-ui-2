// ── OCO monitor events ───────────────────────────────────────────────────────
// The server watches SL/Target triggers and places the real exit order when
// price crosses. When a leg fires (or is rejected), it pushes an OCO frame on
// the user's socket channel. Here we react in real time:
//  - EXECUTED → the OCO is done: clear both SL/Target lines and reload the
//    tradebook so the chart reflects the real broker state.
//  - REJECTED → the exit didn't go through AND the server stopped watching this
//    leg (the monitor row is no longer ACTIVE), so remove its line — there is no
//    active server-side stop for it anymore — and warn the user.
//  - CANCELLED → the leg/monitor was cancelled: remove the line(s).

import toast from 'react-hot-toast'
import type { OcoEventPayload } from '../ws/messages'
import { useTradeStore } from '../../store/tradeStore'
import { useTradebookStore } from '../../features/tradebook/tradebookStore'
import { useIndexBracketStore } from '../../store/indexBracketStore'
import { clearStop, clearTarget } from '../trade/tradeAdapter'

const legLabel = (leg: OcoEventPayload['leg']) =>
  leg === 'SL' ? 'Stop-loss' : leg === 'TGT' ? 'Target' : leg === 'ENTRY' ? 'Entry' : 'Bracket'

// An OCO leg firing PLACES the exit order — the position only closes once the
// broker FILLS it, a moment later. A single reload at the event catches the
// order but not yet the closed position (so the old position tag lingers until a
// manual reload). Reload a few times over the next several seconds to pick up
// the fill automatically. Also reload the OCO/index-bracket store each time.
let burstTimers: ReturnType<typeof setTimeout>[] = []
function reloadBurst(indexName?: string) {
  burstTimers.forEach(clearTimeout)
  burstTimers = [];
  [0, 1200, 3000, 6000].forEach((ms) => {
    burstTimers.push(setTimeout(() => {
      void useTradebookStore.getState().reload()
      void useIndexBracketStore.getState().reload(indexName)
    }, ms))
  })
}

// INDEX brackets are their own overlay — just refresh the list for that index and
// toast the transition; the chart layer re-renders from the reloaded state.
function handleIndexEvent(e: OcoEventPayload) {
  reloadBurst(e.indexName) // catch the broker fill (position close), not just the placed order
  if (e.event === 'ENTRY_FILLED') toast.success(`Entry filled · ${e.symbolName}`)
  else if (e.event === 'EXECUTED') toast.success(`${legLabel(e.leg)} hit · ${e.symbolName}`)
  else if (e.event === 'REJECTED') toast.error(`${legLabel(e.leg)} rejected${e.message ? `: ${e.message}` : ''}`)
}

/** Clear both on-chart SL/Target lines mirrored for this symbol. */
function clearLinesForSymbol(symbolName: string) {
  const { positions } = useTradeStore.getState()
  for (const [id, p] of Object.entries(positions)) {
    if (p.symbolKey === symbolName) { clearStop(id); clearTarget(id) }
  }
}

/** Clear just one leg's line for this symbol. */
function clearLegForSymbol(symbolName: string, leg: 'SL' | 'TGT') {
  const { positions } = useTradeStore.getState()
  for (const [id, p] of Object.entries(positions)) {
    if (p.symbolKey !== symbolName) continue
    if (leg === 'SL') clearStop(id)
    else clearTarget(id)
  }
}

export function handleOcoEvent(payload: unknown) {
  // TEMP DEBUG: print every OCO frame to the browser console so the raw event
  // (leg / event / status / symbol) is visible even though WS frames don't show
  // as network calls. Open DevTools → Console and copy the "[OCO WS]" lines.
  try { console.log('[OCO WS]', JSON.stringify(payload)) } catch { console.log('[OCO WS]', payload) }

  const e = payload as OcoEventPayload
  if (!e || typeof e !== 'object' || !e.symbolName || !e.event) return

  // Index brackets have their own overlay + store.
  if (e.monitorType === 'INDEX' || e.leg === 'ENTRY' || e.leg === 'BRACKET') { handleIndexEvent(e); return }

  // Monitor no longer ACTIVE → nothing is being watched, so both lines go.
  const monitorInactive = e.status === 'CANCELLED' || e.status === 'COMPLETED'

  if (e.event === 'EXECUTED') {
    clearLinesForSymbol(e.symbolName)
    toast.success(`${legLabel(e.leg)} hit — exit order placed`)
    reloadBurst() // position closes when the broker FILLS the exit, a moment later
    return
  }

  if (e.event === 'REJECTED') {
    if (monitorInactive) clearLinesForSymbol(e.symbolName)
    else clearLegForSymbol(e.symbolName, e.leg)
    toast.error(`${legLabel(e.leg)} order rejected${e.message ? `: ${e.message}` : ''} — removed; position unprotected`)
    reloadBurst()
    return
  }

  if (e.event === 'CANCELLED') {
    if (monitorInactive) clearLinesForSymbol(e.symbolName)
    else clearLegForSymbol(e.symbolName, e.leg)
    reloadBurst()
  }
}
