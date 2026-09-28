// ── WaveTrend — Pine colors + default inputs (exact) ─────────────────────────
import type { WtInputs } from './types'

// Pine v3 named color constants used by the script.
export const WT_GRAY = '#808080'   // gray
export const WT_RED = '#ff0000'    // red
export const WT_GREEN = '#008000'  // green
export const WT_BLUE = '#0000ff'   // blue

export function pineColor(hex: string, transp: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  const a = Math.max(0, Math.min(1, (100 - transp) / 100))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export const DEFAULT_WT_INPUTS: WtInputs = {
  n1: 10,
  n2: 21,
  obLevel1: 60,
  obLevel2: 53,
  osLevel1: -60,
  osLevel2: -53,

  zeroColor: WT_GRAY,
  ob1Color: WT_RED,
  os1Color: WT_GREEN,
  ob2Color: WT_RED,
  os2Color: WT_GREEN,
  wt1Color: WT_GREEN,
  wt2Color: WT_RED,
  areaColor: pineColor(WT_BLUE, 80),
  wt1Width: 1,
  wt2Width: 1,
  levelWidth: 1,

  showZero: true,
  showOb1: true,
  showOs1: true,
  showOb2: true,
  showOs2: true,
  showWt1: true,
  showWt2: true,
  showArea: true,

  showDivergence: true,
  divPivotLookback: 5,
  divColor: '',   // '' = theme-based default
  divWidth: 1,
}
