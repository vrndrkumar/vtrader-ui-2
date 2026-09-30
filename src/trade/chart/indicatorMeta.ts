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
  // Smart Money Concepts [LuxAlgo] — custom overlay indicator; configured via its
  // own settings panel (no numeric calc params).
  SMC:  { name: 'SMC',  label: 'Smart Money Concepts', pane: 'main', params: [], defaults: [] },
  // Relative Strength (vs a comparative symbol) — sub-pane oscillator, configured
  // via its own settings panel.
  RS:   { name: 'RS',   label: 'Relative Strength',    pane: 'sub',  params: [], defaults: [] },
  // WaveTrend [LazyBear] — sub-pane oscillator, own settings panel.
  WT:   { name: 'WT',   label: 'WaveTrend',            pane: 'sub',  params: [], defaults: [] },
  // Buyside & Sellside Liquidity [LuxAlgo] — main-pane overlay, own settings panel.
  BSL:  { name: 'BSL',  label: 'Buyside & Sellside Liquidity', pane: 'main', params: [], defaults: [] },
}

export const INDICATOR_GROUPS: { group: string; items: string[] }[] = [
  { group: 'Overlays', items: ['MA', 'EMA', 'BOLL', 'SAR'] },
  { group: 'Oscillators', items: ['VOL', 'MACD', 'RSI', 'KDJ'] },
  { group: 'Smart Money', items: ['SMC'] },
  { group: 'Relative Strength', items: ['RS'] },
  { group: 'WaveTrend', items: ['WT'] },
  { group: 'Liquidity', items: ['BSL'] },
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

// ── Per-plot styling metadata ────────────────────────────────────────────────
// Each built-in indicator's drawable plots, in the SAME order klinecharts creates
// its figures (klinecharts maps figure→styles.lines[i]/circles[i] by type-order).
// Drives the Style tab (color + width per plot, like TradingView). Bars (volume /
// MACD histogram) keep klinecharts' up/down coloring and aren't user-colored here.
export interface PlotDef { label: string; kind: 'line' | 'bar' | 'circle' }

export const INDICATOR_PLOTS: Record<string, PlotDef[]> = {
  MA:   [{ label: 'MA 1', kind: 'line' }, { label: 'MA 2', kind: 'line' }, { label: 'MA 3', kind: 'line' }, { label: 'MA 4', kind: 'line' }],
  EMA:  [{ label: 'EMA 1', kind: 'line' }, { label: 'EMA 2', kind: 'line' }, { label: 'EMA 3', kind: 'line' }],
  BOLL: [{ label: 'Upper', kind: 'line' }, { label: 'Basis', kind: 'line' }, { label: 'Lower', kind: 'line' }],
  SAR:  [{ label: 'SAR', kind: 'circle' }],
  VOL:  [{ label: 'MA 1', kind: 'line' }, { label: 'MA 2', kind: 'line' }, { label: 'Volume', kind: 'bar' }],
  MACD: [{ label: 'DIF', kind: 'line' }, { label: 'DEA', kind: 'line' }, { label: 'Histogram', kind: 'bar' }],
  RSI:  [{ label: 'RSI', kind: 'line' }],
  KDJ:  [{ label: 'K', kind: 'line' }, { label: 'D', kind: 'line' }, { label: 'J', kind: 'line' }],
}

/** Default per-plot look, aligned to INDICATOR_PLOTS[name] order. */
export function defaultPlotStyles(name: string): { color: string; width: number }[] {
  const plots = INDICATOR_PLOTS[name] ?? []
  let lineIdx = 0
  return plots.map((p) => {
    if (p.kind === 'line') { const c = LINE_PALETTE[lineIdx % LINE_PALETTE.length]; lineIdx++; return { color: c, width: 1 } }
    if (p.kind === 'circle') return { color: '#26a69a', width: 2 }
    return { color: '#787b86', width: 1 } // bar (unused for coloring)
  })
}
