// ── Load option panels' ATM strike when the INDEX is switched ────────────────
// When "Sync options with index" is on and the selected index changes (via the
// index strip, option chain, or the chart's own index picker — all of which set
// chartStore.symbolCode), each option panel reloads that index's current ATM of
// the SAME side it already shows — ONCE.
//
// SAFETY (this handles real orders):
//   • A Call panel stays a Call; a Put stays a Put — the side is read from the
//     panel's own symbol and never guessed.
//   • Only panels that already hold an OPTION are touched (index/empty untouched).
//   • It does NOT re-swap as the spot drifts — only on an actual index switch.

import { useEffect, useRef } from 'react'
import { useChartLayoutStore, PANEL_IDS } from '../store/chartLayoutStore'
import { useChartStore } from '../store/chartStore'
import { realtime } from '../data/realtime/realtimeService'
import { layoutPanelCount } from './layouts'
import { useAtmStrikeSymbol } from './useAtmStrikeSymbol'
import type { ChartSymbol } from '../types/market'

// Read CE/PE from either the symbol key (NIFTY_..._CE_...) or its display.
const sideOf = (s: ChartSymbol): 'CE' | 'PE' | null =>
  /_PE_|PE$|\bPE\b/.test(s.key) || /\bPE\b/.test(s.display) ? 'PE'
    : /_CE_|CE$|\bCE\b/.test(s.key) || /\bCE\b/.test(s.display) ? 'CE'
      : null

export function useIndexOptionSync() {
  const enabled = useChartLayoutStore((s) => s.syncOptions)
  const layoutId = useChartLayoutStore((s) => s.layoutId)
  const index = useChartStore((s) => s.symbolCode) // the globally-selected index

  // Keep the selected index's option chain live so its ATM strike resolves.
  useEffect(() => {
    if (!enabled || !index) return
    realtime.start()
    return realtime.subscribeOptionChain(index)
  }, [enabled, index])

  const atmCE = useAtmStrikeSymbol(index, 'CE')
  const atmPE = useAtmStrikeSymbol(index, 'PE')

  // Only re-sync when the index actually changes (not on every spot tick).
  const syncedFor = useRef('')
  useEffect(() => {
    if (!enabled) { syncedFor.current = ''; return }
    if (!index || index === syncedFor.current) return
    if (!atmCE && !atmPE) return // ATM not resolved yet for the new index — wait.

    const st = useChartLayoutStore.getState()
    const visible = PANEL_IDS.slice(0, layoutPanelCount(layoutId))
    let changed = false
    visible.forEach((id) => {
      const cur = st.panels[id]?.symbol
      if (!cur || cur.kind !== 'OPTION') return // never convert a non-option panel
      const side = sideOf(cur)
      if (!side) return                          // side unreadable → never guess
      const target = side === 'PE' ? atmPE : atmCE
      if (target && target.key !== cur.key) { st.assignSymbol(id, target); changed = true }
    })
    if (changed || (atmCE || atmPE)) syncedFor.current = index
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, index, atmCE?.key, atmPE?.key, layoutId])
}
