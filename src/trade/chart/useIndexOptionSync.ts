// ── Load option panels' ATM strike when the INDEX is switched ────────────────
// When "Sync options with index" is on and the index panel's *symbol* changes
// (e.g. NIFTY → BANKNIFTY), each option panel reloads that index's current ATM
// of the SAME side it already shows — ONCE.
//
// SAFETY (this handles real orders):
//   • A Call panel stays a Call; a Put panel stays a Put. The side is read from
//     the panel's own symbol key and never guessed — so sync can NEVER convert a
//     Put chart into a Call chart (or vice-versa).
//   • Only panels that already hold an OPTION are touched. Index / empty panels
//     are left alone (sync never turns a non-option panel into an option).
//   • It does NOT re-swap as the spot moves and the ATM drifts — only on an
//     actual index switch — so a chart never changes under an active trader.

import { useEffect, useRef } from 'react'
import { useChartLayoutStore, PANEL_IDS } from '../store/chartLayoutStore'
import { layoutPanelCount } from './layouts'
import { useAtmStrikeSymbol } from './useAtmStrikeSymbol'

const sideOf = (key: string): 'CE' | 'PE' | null => (/_PE_/.test(key) ? 'PE' : /_CE_/.test(key) ? 'CE' : null)

export function useIndexOptionSync() {
  const enabled = useChartLayoutStore((s) => s.syncOptions)
  const layoutId = useChartLayoutStore((s) => s.layoutId)
  const panels = useChartLayoutStore((s) => s.panels)

  const visible = PANEL_IDS.slice(0, layoutPanelCount(layoutId))
  const indexPanelId = visible.find((id) => panels[id]?.symbol?.kind === 'INDEX')
  const index = indexPanelId ? (panels[indexPanelId]?.symbol?.key ?? '') : ''

  const atmCE = useAtmStrikeSymbol(index, 'CE')
  const atmPE = useAtmStrikeSymbol(index, 'PE')

  // The last index we've already loaded strikes for. We only reload when this
  // changes — spot ticks (which move atmCE/atmPE) must not re-swap charts.
  const syncedFor = useRef('')

  useEffect(() => {
    if (!enabled) { syncedFor.current = ''; return }
    if (!index || index === syncedFor.current) return
    if (!atmCE && !atmPE) return // ATM not resolved yet for the new index — wait.

    const st = useChartLayoutStore.getState()
    visible.forEach((id) => {
      if (id === indexPanelId) return
      const cur = st.panels[id]?.symbol
      if (!cur || cur.kind !== 'OPTION') return       // never convert a non-option panel
      const side = sideOf(cur.key)
      if (!side) return                                // side unreadable → never guess, leave it
      const target = side === 'PE' ? atmPE : atmCE     // Put→Put ATM, Call→Call ATM (side preserved)
      if (target && target.key !== cur.key) st.assignSymbol(id, target)
    })
    syncedFor.current = index
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, index, indexPanelId, atmCE?.key, atmPE?.key])
}
