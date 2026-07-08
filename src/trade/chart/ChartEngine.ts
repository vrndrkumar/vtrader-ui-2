// ── Engine-agnostic chart interface ──────────────────────────────────────────
// All chart code depends on THIS, never on klinecharts directly. Lets us swap
// to TradingView Lightweight Charts / another engine without touching features.

import type { Candle } from '../types/market'
import type { OrderLine } from './orderOverlays'

export interface ChartEngine {
  /** Reconcile the set of order/position lines on the chart. */
  syncOrderLines(lines: OrderLine[]): void

  setData(candles: Candle[]): void
  /** Update the last candle or append a new one (by timestamp). */
  updateLast(candle: Candle): void
  setTheme(dark: boolean): void

  /** Add the indicator if absent, remove it if present. */
  toggleIndicator(name: string): void
  hasIndicator(name: string): boolean
  activeIndicators(): string[]

  /** Enter draw mode for a drawing tool (e.g. 'segment', 'fibonacciLine'). */
  startDrawing(name: string): void
  clearDrawings(): void

  resize(): void
  dispose(): void
}
