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

// INDEX brackets are their own overlay — just refresh the list for that index and
// toast the transition; the chart layer re-renders from the reloaded state.
function handleIndexEvent(e: OcoEventPayload) {
  if (e.indexName) void useIndexBracketStore.getState().reload(e.indexName)
  void useTradebookStore.getState().reload() // entry/exit changes real positions too
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
  const e = payload as OcoEventPayload
  if (!e || typeof e !== 'object' || !e.symbolName || !e.event) return

  // Index brackets have their own overlay + store.
  if (e.monitorType === 'INDEX' || e.leg === 'ENTRY' || e.leg === 'BRACKET') { handleIndexEvent(e); return }

  // Monitor no longer ACTIVE → nothing is being watched, so both lines go.
  const monitorInactive = e.status === 'CANCELLED' || e.status === 'COMPLETED'

  if (e.event === 'EXECUTED') {
    clearLinesForSymbol(e.symbolName)
    toast.success(`${legLabel(e.leg)} hit — exit order placed`)
    void useTradebookStore.getState().reload()
    return
  }

  if (e.event === 'REJECTED') {
    if (monitorInactive) clearLinesForSymbol(e.symbolName)
    else clearLegForSymbol(e.symbolName, e.leg)
    toast.error(`${legLabel(e.leg)} order rejected${e.message ? `: ${e.message}` : ''} — removed; position unprotected`)
    void useTradebookStore.getState().reload()
    return
  }

  if (e.event === 'CANCELLED') {
    if (monitorInactive) clearLinesForSymbol(e.symbolName)
    else clearLegForSymbol(e.symbolName, e.leg)
    void useTradebookStore.getState().reload()
  }
}
