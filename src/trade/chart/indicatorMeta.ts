// ── Indicator registry ───────────────────────────────────────────────────────
// One source of truth for the supported indicators: display label, which pane
// they live in, and their configurable calc parameters (periods) with sensible
// professional defaults. Drives the toolbar menu, the settings dialog, and the
// params the engine passes to KLineCharts.

export type Pane = 'main' | 'sub'

export interface ParamSpec {
  label: string
  min?: number
  step?: number
  float?: boolean   // allow decimals (e.g. SAR / std-dev)
}

export interface IndicatorDef {
  name: string       // KLineCharts indicator id
  label: string
  pane: Pane
  params: ParamSpec[]
  defaults: number[]
}

export const INDICATORS: Record<string, IndicatorDef> = {
  MA:   { name: 'MA',   label: 'Moving Average',      pane: 'main', params: [{ label: 'Length 1' }, { label: 'Length 2' }, { label: 'Length 3' }, { label: 'Length 4' }], defaults: [5, 10, 20, 60] },
  EMA:  { name: 'EMA',  label: 'Exp. Moving Average', pane: 'main', params: [{ label: 'Length 1' }, { label: 'Length 2' }, { label: 'Length 3' }], defaults: [9, 21, 55] },
  BOLL: { name: 'BOLL', label: 'Bollinger Bands',     pane: 'main', params: [{ label: 'Length' }, { label: 'Std Dev', float: true, step: 0.5 }], defaults: [20, 2] },
  SAR:  { name: 'SAR',  label: 'Parabolic SAR',       pane: 'main', params: [{ label: 'Start', float: true, step: 0.01 }, { label: 'Increment', float: true, step: 0.01 }, { label: 'Max', float: true, step: 0.05 }], defaults: [0.02, 0.02, 0.2] },
  VOL:  { name: 'VOL',  label: 'Volume',              pane: 'sub',  params: [{ label: 'MA 1' }, { label: 'MA 2' }], defaults: [5, 10] },
  MACD: { name: 'MACD', label: 'MACD',                pane: 'sub',  params: [{ label: 'Fast' }, { label: 'Slow' }, { label: 'Signal' }], defaults: [12, 26, 9] },
  RSI:  { name: 'RSI',  label: 'RSI',                 pane: 'sub',  params: [{ label: 'Length' }], defaults: [14] },
  KDJ:  { name: 'KDJ',  label: 'Stochastic (KDJ)',    pane: 'sub',  params: [{ label: 'K' }, { label: 'D' }, { label: 'J' }], defaults: [9, 3, 3] },
}

export const INDICATOR_GROUPS: { group: string; items: string[] }[] = [
  { group: 'Overlays', items: ['MA', 'EMA', 'BOLL', 'SAR'] },
  { group: 'Oscillators', items: ['VOL', 'MACD', 'RSI', 'KDJ'] },
]

export function defaultsFor(name: string): number[] {
  return INDICATORS[name]?.defaults ?? []
}

export function isMainPane(name: string): boolean {
  return INDICATORS[name]?.pane === 'main'
}

// Professional line palette (TradingView-ish), applied to each indicator's line
// figures in order. Theme-agnostic so it reads on light and dark.
export const LINE_PALETTE = ['#2962ff', '#ff9800', '#26a69a', '#ab47bc', '#ef5350', '#42a5f5']
