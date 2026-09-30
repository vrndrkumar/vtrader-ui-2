// ── Per-plot style descriptors for the built-in indicators ───────────────────
// Maps each visible plot of a conventional indicator (MA, EMA, BOLL, MACD, RSI,
// KDJ, VOL, SAR) to its klinecharts figure slot (styles.lines[i] / bars[i] /
// circles[i]) plus a sensible default look. Drives the Style tab in the settings
// dialog and the styles pushed to the chart. Line count for MA/EMA/RSI/VOL-MA is
// dynamic (one per length parameter), matching klinecharts' figure generation.

export type PlotKind = 'line' | 'bar' | 'circle'
export type PlotLineStyle = 'solid' | 'dashed' | 'dotted'

// Combine a hex/rgba color with an opacity (0..100) into an rgba string.
export function withOpacity(color: string, opacity = 100): string {
  const a = Math.max(0, Math.min(1, opacity / 100))
  if (color.startsWith('#')) {
    const h = color.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r || 0}, ${g || 0}, ${b || 0}, ${a})`
  }
  const m = color.match(/rgba?\(([^)]+)\)/)
  if (m) { const [r, g, b] = m[1].split(',').map((s) => parseInt(s.trim(), 10)); return `rgba(${r || 0}, ${g || 0}, ${b || 0}, ${a})` }
  return color
}

export interface PlotDefault { color?: string; opacity?: number; width?: number; lineStyle?: PlotLineStyle; upColor?: string; upOpacity?: number; downColor?: string; downOpacity?: number }
export interface PlotDesc { key: string; label: string; kind: PlotKind; idx: number; def: PlotDefault }

// TradingView-ish line palette, applied to line plots in order.
const PALETTE = ['#2962ff', '#ff9800', '#26a69a', '#ab47bc', '#ef5350', '#42a5f5', '#66bb6a', '#ec407a']
const UP = '#26a69a'
const DOWN = '#ef5350'

const line = (key: string, label: string, idx: number, color: string): PlotDesc => ({ key, label, kind: 'line', idx, def: { color, width: 1, lineStyle: 'solid' } })

const STYLED = new Set(['MA', 'EMA', 'BOLL', 'RSI', 'KDJ', 'SAR', 'VOL', 'MACD'])
export function hasStylePlots(name: string): boolean { return STYLED.has(name) }

/** Plot descriptors for `name` given its current calc params (lengths). */
export function plotsFor(name: string, params: number[]): PlotDesc[] {
  switch (name) {
    case 'MA': return params.map((L, i) => line(`ma${i}`, `MA ${L}`, i, PALETTE[i % PALETTE.length]))
    case 'EMA': return params.map((L, i) => line(`ema${i}`, `EMA ${L}`, i, PALETTE[i % PALETTE.length]))
    case 'BOLL': return [line('up', 'Upper', 0, '#2962ff'), line('mid', 'Basis', 1, '#ff9800'), line('dn', 'Lower', 2, '#2962ff')]
    case 'RSI': return params.map((L, i) => line(`rsi${i}`, params.length > 1 ? `RSI ${L}` : 'RSI', i, PALETTE[i % PALETTE.length]))
    case 'KDJ': return [line('k', 'K', 0, '#2962ff'), line('d', 'D', 1, '#ff9800'), line('j', 'J', 2, '#ab47bc')]
    case 'SAR': return [{ key: 'sar', label: 'SAR', kind: 'circle', idx: 0, def: { upColor: UP, downColor: DOWN } }]
    case 'VOL': return [
      { key: 'vol', label: 'Volume', kind: 'bar', idx: 0, def: { upColor: '#26a69a', downColor: '#ef5350', upOpacity: 55, downOpacity: 55 } },
      ...params.map((L, i) => line(`volma${i}`, `MA ${L}`, i, PALETTE[i % PALETTE.length])),
    ]
    case 'MACD': return [
      line('dif', 'DIF', 0, '#2962ff'), line('dea', 'DEA', 1, '#ff9800'),
      { key: 'macd', label: 'Histogram', kind: 'bar', idx: 0, def: { upColor: UP, downColor: DOWN } },
    ]
    default: return []
  }
}

// A viewer's per-plot overrides (all optional; missing = the descriptor default).
export interface PlotStyle { show?: boolean; color?: string; opacity?: number; width?: number; lineStyle?: PlotLineStyle; upColor?: string; upOpacity?: number; downColor?: string; downOpacity?: number }

const TRANSPARENT = 'rgba(0,0,0,0)'
const dashArray = (s: PlotLineStyle): number[] => (s === 'dashed' ? [4, 4] : s === 'dotted' ? [1, 3] : [])

/** Effective style for a plot = stored override merged over the descriptor default. */
export function effectivePlot(p: PlotDesc, s?: PlotStyle): Required<Pick<PlotStyle, 'show'>> & PlotStyle {
  return {
    show: s?.show ?? true,
    color: s?.color ?? p.def.color,
    opacity: s?.opacity ?? p.def.opacity ?? 100,
    width: s?.width ?? p.def.width ?? 1,
    lineStyle: s?.lineStyle ?? p.def.lineStyle ?? 'solid',
    upColor: s?.upColor ?? p.def.upColor,
    upOpacity: s?.upOpacity ?? p.def.upOpacity ?? 100,
    downColor: s?.downColor ?? p.def.downColor,
    downOpacity: s?.downOpacity ?? p.def.downOpacity ?? 100,
  }
}

/** Build the klinecharts `styles` object (lines/bars/circles arrays) for `name`. */
export function buildIndicatorStyles(name: string, params: number[], storeMap: Record<string, PlotStyle>): Record<string, unknown> {
  const plots = plotsFor(name, params)
  const lines: unknown[] = []
  const bars: unknown[] = []
  const circles: unknown[] = []
  for (const p of plots) {
    const st = effectivePlot(p, storeMap[p.key])
    if (p.kind === 'line') {
      lines[p.idx] = {
        color: st.show ? withOpacity(st.color ?? '#2962ff', st.opacity) : TRANSPARENT,
        size: Math.max(1, st.width ?? 1),
        style: st.lineStyle === 'solid' ? 'solid' : 'dashed',
        dashedValue: dashArray(st.lineStyle ?? 'solid'),
        smooth: false,
      }
    } else {
      const up = st.show ? withOpacity(st.upColor ?? UP, st.upOpacity) : TRANSPARENT
      const dn = st.show ? withOpacity(st.downColor ?? DOWN, st.downOpacity) : TRANSPARENT
      const entry = { upColor: up, downColor: dn, noChangeColor: up }
      if (p.kind === 'bar') bars[p.idx] = entry
      else circles[p.idx] = entry
    }
  }
  const styles: Record<string, unknown> = {}
  if (lines.length) styles.lines = lines
  if (bars.length) styles.bars = bars
  if (circles.length) styles.circles = circles
  return styles
}
