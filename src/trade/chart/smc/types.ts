// ── Smart Money Concepts [LuxAlgo] — types ───────────────────────────────────
// Faithful 1:1 port of the LuxAlgo Pine v5 indicator. Every user input from the
// original is preserved here with the same name/semantics/default; the compute
// engine (compute.ts) reproduces the Pine logic bar-by-bar without change.

export type StructMode = 'All' | 'BOS' | 'CHoCH'        // ALL | BOS | CHoCH
export type LabelSize = 'tiny' | 'small' | 'normal'     // size.tiny/small/normal
export type LineStyle = 'solid' | 'dashed' | 'dotted'
export type Mode = 'Historical' | 'Present'
export type Style = 'Colored' | 'Monochrome'
export type OrderBlockFilter = 'Atr' | 'Cumulative Mean Range'
export type OrderBlockMitigation = 'Close' | 'High/Low'

/** Every input from the Pine script, same defaults (see defaults.ts). */
export interface SmcInputs {
  // Smart Money Concepts
  mode: Mode
  style: Style
  showTrend: boolean                       // "Color Candles"

  // Real Time Internal Structure
  showInternals: boolean
  showInternalBull: StructMode
  internalBullColor: string
  showInternalBear: StructMode
  internalBearColor: string
  internalFilterConfluence: boolean
  internalStructureSize: LabelSize

  // Real Time Swing Structure
  showStructure: boolean
  showSwingBull: StructMode
  swingBullColor: string
  showSwingBear: StructMode
  swingBearColor: string
  swingStructureSize: LabelSize
  showSwings: boolean
  swingsLength: number
  showHighLowSwings: boolean

  // Order Blocks
  showInternalOrderBlocks: boolean
  internalOrderBlocksSize: number
  showSwingOrderBlocks: boolean
  swingOrderBlocksSize: number
  orderBlockFilter: OrderBlockFilter
  orderBlockMitigation: OrderBlockMitigation
  internalBullishOrderBlockColor: string   // rgba (transparency baked in, like color.new)
  internalBearishOrderBlockColor: string
  swingBullishOrderBlockColor: string
  swingBearishOrderBlockColor: string

  // EQH/EQL
  showEqualHighsLows: boolean
  equalHighsLowsLength: number
  equalHighsLowsThreshold: number
  equalHighsLowsSize: LabelSize

  // Fair Value Gaps
  showFairValueGaps: boolean
  fairValueGapsThreshold: boolean          // "Auto Threshold"
  fairValueGapsTimeframe: string           // '' = chart timeframe
  fairValueGapsBullColor: string           // rgba
  fairValueGapsBearColor: string           // rgba
  fairValueGapsExtend: number

  // Highs & Lows MTF
  showDailyLevels: boolean
  dailyLevelsStyle: LineStyle
  dailyLevelsColor: string
  showWeeklyLevels: boolean
  weeklyLevelsStyle: LineStyle
  weeklyLevelsColor: string
  showMonthlyLevels: boolean
  monthlyLevelsStyle: LineStyle
  monthlyLevelsColor: string

  // Premium & Discount Zones
  showPremiumDiscountZones: boolean
  premiumZoneColor: string
  equilibriumZoneColor: string
  discountZoneColor: string
}

// ── Render model ─────────────────────────────────────────────────────────────
// The compute step emits geometry in MARKET coordinates (timestamp + price, or a
// bar index for label positions Pine placed via xloc.bar_index). The indicator's
// draw() converts these to pixels with klinecharts' axis converters.

export interface SmcLine {
  t1: number; p1: number                   // start (ms timestamp, price)
  t2: number; p2: number                   // end
  color: string
  style: LineStyle
  width?: number
}

export interface SmcBox {
  t1: number; p1: number                   // top-left (timestamp, price-top)
  t2: number; p2: number                   // bottom-right (timestamp, price-bottom)
  bg: string
  border: string                           // '' = no border
}

/** A text label. Pine placed some at a bar time and some at a (fractional) bar
 *  index midpoint; `byIndex` picks which coordinate `x` means. `place` mirrors
 *  the Pine label style anchor. */
export interface SmcLabel {
  x: number                                // ms timestamp when byIndex=false, else bar index (may be fractional)
  byIndex: boolean
  p: number                                // price
  text: string
  color: string
  place: 'up' | 'down' | 'left'            // label.style_label_up / _down / _left
  size: LabelSize
}

export interface SmcModel {
  lines: SmcLine[]
  boxes: SmcBox[]
  labels: SmcLabel[]
  candleColors: (string | null)[]          // per-bar candle color for "Color Candles" (null = leave default)
  colorCandles: boolean
}

export const EMPTY_MODEL: SmcModel = { lines: [], boxes: [], labels: [], candleColors: [], colorCandles: false }
