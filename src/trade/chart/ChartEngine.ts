// ── Engine-agnostic chart interface ──────────────────────────────────────────
// All chart code depends on THIS, never on klinecharts directly. Lets us swap
// to TradingView Lightweight Charts / another engine without touching features.

import type { Candle } from '../types/market'
import type { OrderLine } from './orderOverlays'

/**
 * A drawing serialized to MARKET coordinates (time + price), not pixels. This is
 * the persistence/restore unit — a drawing is always rebuilt from this truth, so
 * it survives reload and stays anchored across timeframe/zoom/pan changes.
 */
export interface DrawingDef {
  type: string                                        // overlay/tool name
  points: { timestamp?: number; value?: number }[]    // time + price anchors
  styles?: unknown                                    // optional per-drawing style overrides
}

export interface ChartEngine {
  /** Reconcile the set of order/position lines on the chart. */
  syncOrderLines(lines: OrderLine[]): void

  setData(candles: Candle[]): void
  /** Update the last candle or append a new one (by timestamp). */
  updateLast(candle: Candle): void
  setTheme(dark: boolean): void

  /** Add the indicator if absent, remove it if present. Optional calc params. */
  toggleIndicator(name: string, calcParams?: number[]): void
  /** Live-update an already-added indicator's calc parameters. */
  configureIndicator(name: string, calcParams: number[]): void
  hasIndicator(name: string): boolean
  activeIndicators(): string[]

  /** Enter draw mode for a drawing tool (e.g. 'segment', 'fibonacciLine'). */
  startDrawing(name: string): void
  clearDrawings(): void

  /** Called whenever the set of user drawings changes (create / move / remove),
   *  with the full list serialized to time+price for persistence. */
  setDrawingChangeHandler(cb: (drawings: DrawingDef[]) => void): void
  /** Rebuild all user drawings from persisted time+price defs (call after load
   *  and after every data change so anchors re-map to the current bars). */
  restoreDrawings(drawings: DrawingDef[]): void

  /** Follow the crosshair — emits the hovered candle, or null when not hovering. */
  subscribeCrosshair(cb: (c: Candle | null) => void): () => void

  /** Convert a price to a y pixel within the price pane (null if unavailable). */
  priceToY(price: number): number | null
  /** Convert a y pixel back to a price within the price pane. */
  yToPrice(y: number): number | null

  resize(): void
  dispose(): void
}
