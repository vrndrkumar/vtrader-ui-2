// ── Relative Strength [bharatTrader] — inputs (1:1 with the Pine v6 script) ────
// Every input preserved with the same name/default. The compute step reproduces
// the Pine logic exactly; only the drawing is translated to the chart engine.

export interface RsInputs {
  // Source is always `close` in the script; kept as a note, not user-editable here.
  comparativeSymbol: string   // input.symbol default 'NSE:NIFTY' (we fetch its candles)
  length: number              // 123
  showZeroLine: boolean       // true
  showRefDateLbl: boolean     // true
  toggleRSColor: boolean      // true — RS green/red on 0-cross, else blue

  showRSTrend: boolean        // false  (RS Trend group)
  base: number                // 5

  showMA: boolean             // false  (RS Mean group)
  lengthRSMA: number          // 50
  showMAColor: boolean        // true

  showBubbles: boolean        // true   (Price Confirmation group)
  lengthPriceSMA: number      // 50
  bullishColor: string        // color.new(color.green, 85)
  bearishColor: string        // color.new(color.red, 85)

  // ── Style (editable plot colors / widths, like TradingView's Style tab) ─────
  // Defaults match the exact Pine colors, so leaving them unchanged reproduces
  // the original; only the drawing is affected, never the logic.
  showRS: boolean             // RS line visibility (Pine always plots it)
  zeroColorUp: string         // Zero/RS-Trend Color 0 (green)
  zeroColorDown: string       // Zero/RS-Trend Color 1 (maroon)
  rsColorPos: string          // RS Color 0 (green, res>0)
  rsColorNeg: string          // RS Color 1 (red, res<0)
  rsColorFlat: string         // RS Color 2 (blue, toggle off)
  maColorUp: string           // MA Color 0 (green rising)
  maColorDown: string         // MA Color 1 (red falling)
  maColorFlat: string         // MA Color 2 (gray)
  zeroWidth: number           // 2
  rsWidth: number             // 3
  maWidth: number             // 2
}

/** Per-bar computed value + colors the figures/draw consume. */
export interface RsBar {
  res?: number
  zero?: number
  ma?: number
  bubble?: number
  resColor?: string
  zeroColor?: string
  maColor?: string
  divColor?: string
}

/** Reference-date label placed at (bar_index − length, 0) on the last bar. */
export interface RsRefLabel {
  barIndex: number            // absolute bar index (bar_index − length)
  text: string
  color: string
  place: 'up' | 'down'        // label.style_label_up / _down
}
