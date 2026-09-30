// ── Buyside & Sellside Liquidity [LuxAlgo] — types ───────────────────────────
// Faithful 1:1 port of the LuxAlgo Pine v5 indicator. Every user input is kept
// with the same name / semantics / default (see defaults.ts); compute.ts
// reproduces the Pine logic bar-by-bar without change. Only the drawing is
// translated to the chart engine.

export type BslMode = 'Present' | 'Historical'

/** Every input from the Pine script (same defaults, ranges, options). */
export interface BslInputs {
  // Liquidity Detection
  liqLen: number            // Detection Length (7, min 3, max 13)
  margin: number            // Margin (6.9, min 4, max 9, step 0.1) — internal liqMar = 10 / margin

  liqBuy: boolean           // Buyside Liquidity Zones (true)
  marBuy: number            // Buyside Margin (2.3, min 1.5, max 10, step .1)
  cLIQ_B: string            // Buyside color (#4caf50)

  liqSel: boolean           // Sellside Liquidity Zones (true)
  marSel: number            // Sellside Margin (2.3, min 1.5, max 10, step .1)
  cLIQ_S: string            // Sellside color (#f23645)

  lqVoid: boolean           // Liquidity Voids (false)
  cLQV_B: string            // Void Bullish color (#4caf50)
  cLQV_S: string            // Void Bearish color (#f23645)
  lqText: boolean           // Void Label (false)

  mode: BslMode             // 'Present' | 'Historical'  (Present)
  visLiq: number            // # Visible Levels (3, min 1, max 50)
}

// ── Render model ─────────────────────────────────────────────────────────────
// Geometry is emitted in Pine's native BAR-INDEX space (x = data index, may be
// fractional / beyond the last bar, e.g. i+10). draw() maps indices → pixels with
// the x-axis converter. Prices are raw values mapped with the y-axis converter.

export interface BslLine {
  x1: number; p1: number
  x2: number; p2: number
  color: string
  dotted: boolean
}

export interface BslBox {
  x1: number; p1: number     // left / top price
  x2: number; p2: number     // right / bottom price
  bg: string                 // fill (already rgba with baked transparency); no border
}

export interface BslLabel {
  x: number; p: number
  text: string
  color: string
  above: boolean             // true = text sits ABOVE the point (Pine valign bottom), false = below
}

export interface BslModel {
  lines: BslLine[]
  boxes: BslBox[]
  labels: BslLabel[]
}

export const EMPTY_BSL_MODEL: BslModel = { lines: [], boxes: [], labels: [] }
