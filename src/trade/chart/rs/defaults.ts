// ── RS — Pine colors + default inputs (exact) ────────────────────────────────
import type { RsInputs } from './types'

// Pine standard palette used by the script.
export const RS_GREEN = '#4caf50'   // color.green
export const RS_RED = '#f23645'     // color.red
export const RS_BLUE = '#2962ff'    // color.blue
export const RS_MAROON = '#800000'  // color.maroon
export const RS_GRAY = '#787b86'    // color.gray

/** color.new(hex, transp) → rgba. transp 0..100 (higher = more transparent). */
export function pineColor(hex: string, transp: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  const a = Math.max(0, Math.min(1, (100 - transp) / 100))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export const DEFAULT_RS_INPUTS: RsInputs = {
  comparativeSymbol: 'NSE:NIFTY',
  length: 123,
  showZeroLine: true,
  showRefDateLbl: true,
  toggleRSColor: true,

  showRSTrend: false,
  base: 5,

  showMA: false,
  lengthRSMA: 50,
  showMAColor: true,

  showBubbles: true,
  lengthPriceSMA: 50,
  bullishColor: pineColor(RS_GREEN, 85),
  bearishColor: pineColor(RS_RED, 85),

  // Style (defaults = exact Pine colors / widths)
  showRS: true,
  zeroColorUp: RS_GREEN,
  zeroColorDown: RS_MAROON,
  rsColorPos: RS_GREEN,
  rsColorNeg: RS_RED,
  rsColorFlat: RS_BLUE,
  maColorUp: RS_GREEN,
  maColorDown: RS_RED,
  maColorFlat: RS_GRAY,
  zeroWidth: 2,
  rsWidth: 3,
  maWidth: 2,
}
