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
  id?: string                                         // stable identity — survives reload,
                                                      // timeframe & symbol changes; the
                                                      // persistence/update/delete key.
  type: string                                        // overlay/tool name
  points: { timestamp?: number; value?: number }[]    // time + price anchors
  styles?: unknown                                    // optional per-drawing style overrides
  locked?: boolean                                    // ignores pointer events when true
  visible?: boolean                                   // hidden when false
}

/** A drawing the user has selected on the chart — drives the floating editor. */
export interface DrawingSelection {
  id: string
  type: string
  styles?: unknown
  locked: boolean
  visible: boolean
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

  /** Enter draw mode for a drawing tool (e.g. 'segment', 'fibonacciLine').
   *  `styles` seeds the new drawing with the tool's saved default look. */
  startDrawing(name: string, styles?: unknown): void
  clearDrawings(): void

  // ── Single-drawing editing (drives the floating TradingView-style toolbar) ──
  /** Notified when a drawing is selected (with its current style/lock/visible),
   *  or null when deselected. */
  setSelectionHandler(cb: (sel: DrawingSelection | null) => void): void
  /** Top-anchor pixel of a drawing (for positioning the floating toolbar), or
   *  null if off-screen / unavailable. Cheap — safe to poll each frame. */
  overlayScreenAnchor(id: string): { x: number; y: number } | null
  /** Merge style overrides into one drawing (color/width/line-style/fill/…) and
   *  persist. */
  styleDrawing(id: string, styles: Record<string, unknown>): void
  /** Lock (ignore pointer events) / unlock a single drawing; persisted. */
  lockDrawing(id: string, locked: boolean): void
  /** Show / hide a single drawing; persisted. */
  showDrawing(id: string, visible: boolean): void
  /** Delete exactly one drawing (persisted removal). */
  removeDrawing(id: string): void

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
  /** X pixel for a timestamp (continuous), null if unavailable. */
  xForTime(ts: number): number | null
  /** Visible x-axis ticks for a custom axis: date-boundary labels flagged so the
   *  UI can highlight them apart from times, spread across the whole visible range. */
  xAxisTicks(width: number): { x: number; label: string; isDate: boolean }[]

  resize(): void
  dispose(): void
}
