// ── Buyside & Sellside Liquidity — Pine colors + default inputs (exact) ──────
import type { BslInputs } from './types'

// Pine color constants used by the script.
export const BSL_GREEN = '#4caf50'
export const BSL_RED = '#f23645'

/** Pine `color.new(hex, transp)` → rgba string. transp 0..100 (higher = more transparent). */
export function pineColor(hex: string, transp: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const a = Math.max(0, Math.min(1, (100 - transp) / 100))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Every default matches the Pine `input(...)` defaults exactly. */
export const DEFAULT_BSL_INPUTS: BslInputs = {
  liqLen: 7,
  margin: 6.9,

  liqBuy: true,
  marBuy: 2.3,
  cLIQ_B: BSL_GREEN,

  liqSel: true,
  marSel: 2.3,
  cLIQ_S: BSL_RED,

  lqVoid: false,
  cLQV_B: BSL_GREEN,
  cLQV_S: BSL_RED,
  lqText: false,

  mode: 'Present',
  visLiq: 3,
}
