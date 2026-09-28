// ── WaveTrend [LazyBear] — types ─────────────────────────────────────────────
// Faithful port of the Pine v3 script. Every input preserved; the compute step
// reproduces the logic exactly. Style colors/widths are editable (like TV's Style
// tab) with defaults matching the original — drawing only, never the logic.

export interface WtInputs {
  // Pine inputs
  n1: number                 // Channel Length (10)
  n2: number                 // Average Length (21)
  obLevel1: number           // Over Bought 1 (60)
  obLevel2: number           // Over Bought 2 (53)
  osLevel1: number           // Over Sold 1 (-60)
  osLevel2: number           // Over Sold 2 (-53)

  // Style (editable)
  zeroColor: string          // gray
  ob1Color: string           // red
  os1Color: string           // green
  ob2Color: string           // red (style 3 = dotted)
  os2Color: string           // green (style 3 = dotted)
  wt1Color: string           // green
  wt2Color: string           // red (style 3 = dotted)
  areaColor: string          // blue, transp 80 (rgba)
  wt1Width: number           // 1
  wt2Width: number           // 1
  levelWidth: number         // 1

  // Visibility (per plot)
  showZero: boolean
  showOb1: boolean
  showOs1: boolean
  showOb2: boolean
  showOs2: boolean
  showWt1: boolean
  showWt2: boolean
  showArea: boolean

  // ── Divergence (added feature — drawn ON the WT pane only) ──────────────────
  showDivergence: boolean
  divPivotLookback: number   // pivot confirmation bars each side (default 5)
  divColor: string           // '' = theme-based (auto)
  divWidth: number           // line width (default 1)
}

/** A divergence line between two WT pivots (bear = at the tops, bull = at the bottoms). */
export interface WtDiv { i1: number; w1: number; i2: number; w2: number; bear: boolean }

/** Per-bar computed values the figures / area draw consume. */
export interface WtBar {
  zero?: number
  ob1?: number
  os1?: number
  ob2?: number
  os2?: number
  wt1?: number
  wt2?: number
  diff?: number   // wt1 − wt2 (for the filled area)
}
