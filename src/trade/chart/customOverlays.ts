// ── Custom KLineCharts overlays (Shapes, Text, Positions, Measurers) ─────────
// KLineCharts ships line + fib overlays only. Register the rest so the grouped
// drawing rail can offer a professional set.

import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts'
import { readFib } from './fibConfig'

const BLUE = '#3b82f6'
const GREEN_FILL = 'rgba(34,197,94,0.15)'
const RED_FILL = 'rgba(239,68,68,0.15)'
const labelStyle = (bg: string) => ({ color: '#ffffff', size: 11, weight: 'bold', backgroundColor: bg, paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2, borderRadius: 3 })

let pendingText = 'Text'
export function setPendingText(t: string) { pendingText = t }

type P = { x: number; y: number }
type Params = OverlayCreateFiguresCallbackParams

// Per-drawing style readers — let the floating editor restyle shapes/text via
// overrideOverlay({ styles }). Fall back to the defaults above when unset.
type OvStyles = {
  line?: { color?: string; size?: number; style?: string; dashedValue?: number[] }
  polygon?: { color?: string }
  circle?: { color?: string }
  rect?: { color?: string }
  text?: { color?: string; size?: number }
}
const st = (o: Params['overlay']): OvStyles => ((o?.styles ?? {}) as OvStyles)
const lineColor = (o: Params['overlay']) => st(o).line?.color ?? BLUE
const lineSize = (o: Params['overlay']) => st(o).line?.size ?? 1.5
const lineDash = (o: Params['overlay']): 'solid' | 'dashed' => (st(o).line?.style === 'dashed' ? 'dashed' : 'solid')
const fillColor = (o: Params['overlay'], fallback: string) => st(o).polygon?.color ?? st(o).circle?.color ?? st(o).rect?.color ?? fallback
const textColor = (o: Params['overlay']) => st(o).text?.color ?? BLUE
const textSize = (o: Params['overlay']) => st(o).text?.size ?? 13

function positionFigures(coords: P[], points: Params['overlay']['points']): OverlayFigure[] {
  if (coords.length < 2) return []
  const [entry, target, stop] = coords
  const right = Math.max(entry.x, target?.x ?? entry.x, stop?.x ?? entry.x) + 24
  const left = Math.min(entry.x, target?.x ?? entry.x, stop?.x ?? entry.x)
  const figs: OverlayFigure[] = []
  if (target) figs.push({ type: 'rect', attrs: { x: left, y: Math.min(entry.y, target.y), width: right - left, height: Math.abs(target.y - entry.y) }, styles: { style: 'fill', color: GREEN_FILL } })
  if (stop) figs.push({ type: 'rect', attrs: { x: left, y: Math.min(entry.y, stop.y), width: right - left, height: Math.abs(stop.y - entry.y) }, styles: { style: 'fill', color: RED_FILL } })
  figs.push({ type: 'line', attrs: { coordinates: [{ x: left, y: entry.y }, { x: right, y: entry.y }] }, styles: { color: '#334155', size: 1 } })
  const e = points[0]?.value, t = points[1]?.value, s = points[2]?.value
  if (e != null && t != null && s != null && s !== e) {
    const rr = Math.abs((t - e) / (s - e))
    figs.push({ type: 'text', attrs: { x: (left + right) / 2, y: entry.y - 2, text: `R:R ${rr.toFixed(2)}` }, styles: labelStyle('#334155') })
  }
  return figs
}

function boxMeasure(coords: P[], points: Params['overlay']['points'], mode: 'price' | 'date' | 'both'): OverlayFigure[] {
  if (coords.length < 2) return []
  const [a, b] = coords
  const dv = (points[1]?.value ?? 0) - (points[0]?.value ?? 0)
  const pct = points[0]?.value ? (dv / points[0].value) * 100 : 0
  const bars = (points[1]?.dataIndex ?? 0) - (points[0]?.dataIndex ?? 0)
  const up = dv >= 0
  const color = up ? '#16a34a' : '#dc2626'
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x) || 64, h = Math.abs(b.y - a.y) || 40
  const parts: string[] = []
  if (mode !== 'date') parts.push(`${up ? '+' : ''}${dv.toFixed(2)} (${pct.toFixed(2)}%)`)
  if (mode !== 'price') parts.push(`${Math.abs(bars)} bars`)
  return [
    { type: 'rect', attrs: { x, y, width: w, height: h }, styles: { style: 'fill', color: up ? GREEN_FILL : RED_FILL, borderColor: color, borderSize: 1, borderStyle: 'dashed' } },
    { type: 'text', attrs: { x: x + w / 2, y: y + h / 2, text: parts.join('  ·  ') }, styles: labelStyle(color) },
  ]
}

// TradingView-style Fibonacci retracement: per-level enable + color, price/ratio
// labels, extend / reverse, optional trend line. Config comes from styles.fib
// (see fibConfig.ts); the two endpoints are draggable (needDefaultPointFigure).
function fibFigures({ coordinates, bounding, overlay, precision }: Params): OverlayFigure[] {
  if (coordinates.length < 2) return []
  const pts = overlay.points
  const v0 = pts[0]?.value, v1 = pts[1]?.value
  if (typeof v0 !== 'number' || typeof v1 !== 'number') return []
  const cfg = readFib(overlay.styles)
  const c0 = coordinates[0], c1 = coordinates[1]
  const yDif = c0.y - c1.y
  const vDif = v0 - v1
  const minX = Math.min(c0.x, c1.x), maxX = Math.max(c0.x, c1.x)
  const startX = (cfg.extend === 'both' || cfg.extend === 'left') ? 0 : minX
  const endX = (cfg.extend === 'right' || cfg.extend === 'both') ? bounding.width : maxX
  const prec = (precision as { price?: number })?.price ?? 2
  const figs: OverlayFigure[] = []
  // Lines are event-responsive so clicking anywhere on the fib SELECTS it (opens
  // the edit toolbar) — same as TradingView. Only the text labels ignore events.
  if (cfg.trend.on) figs.push({ type: 'line', attrs: { coordinates: [{ x: c0.x, y: c0.y }, { x: c1.x, y: c1.y }] }, styles: { color: cfg.trend.color, style: 'dashed', size: 1 } })
  for (const lv of cfg.levels) {
    if (!lv.on) continue
    const rr = cfg.reverse ? 1 - lv.r : lv.r
    const y = c1.y + yDif * rr
    const price = v1 + vDif * rr
    figs.push({ type: 'line', attrs: { coordinates: [{ x: startX, y }, { x: endX, y }] }, styles: { color: lv.color, size: 1 } })
    const parts: string[] = []
    if (cfg.showRatio) parts.push(String(lv.r))
    if (cfg.showPrice) parts.push(`(${price.toFixed(prec)})`)
    const text = parts.join(' ')
    // TradingView-style label: clean text (NO background box — klinecharts'
    // default overlay text style paints a blue box, so we force it transparent),
    // per-level colour, right-aligned at the line end, sitting just above the line.
    if (text) figs.push({
      type: 'text', ignoreEvent: true,
      attrs: { x: endX - 4, y: y - 2, text, align: 'right', baseline: 'bottom' },
      styles: { color: lv.color, size: 11, family: 'inherit', weight: 'normal', backgroundColor: 'transparent', borderColor: 'transparent', borderSize: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 },
    })
  }
  return figs
}

const OVERLAYS = [
  { name: 'fibRetracement', totalStep: 3, createPointFigures: fibFigures },
  { name: 'shapeRect', totalStep: 3, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => coordinates.length < 2 ? [] : [{ type: 'rect', attrs: { x: Math.min(coordinates[0].x, coordinates[1].x), y: Math.min(coordinates[0].y, coordinates[1].y), width: Math.abs(coordinates[1].x - coordinates[0].x), height: Math.abs(coordinates[1].y - coordinates[0].y) }, styles: st(overlay).polygon?.color || st(overlay).rect?.color ? { style: 'stroke_fill', color: fillColor(overlay, 'rgba(59,130,246,0.12)'), borderColor: lineColor(overlay), borderSize: lineSize(overlay), borderStyle: lineDash(overlay) } : { style: 'stroke', borderColor: lineColor(overlay), borderSize: lineSize(overlay), borderStyle: lineDash(overlay) } }] },
  { name: 'shapeCircle', totalStep: 3, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => coordinates.length < 2 ? [] : [{ type: 'circle', attrs: { x: coordinates[0].x, y: coordinates[0].y, r: Math.hypot(coordinates[1].x - coordinates[0].x, coordinates[1].y - coordinates[0].y) }, styles: st(overlay).circle?.color ? { style: 'stroke_fill', color: fillColor(overlay, 'rgba(59,130,246,0.12)'), borderColor: lineColor(overlay), borderSize: lineSize(overlay), borderStyle: lineDash(overlay) } : { style: 'stroke', borderColor: lineColor(overlay), borderSize: lineSize(overlay), borderStyle: lineDash(overlay) } }] },
  { name: 'shapeText', totalStep: 2, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => !coordinates.length ? [] : [{ type: 'text', attrs: { x: coordinates[0].x, y: coordinates[0].y, text: (overlay?.extendData as string) || pendingText }, styles: { color: textColor(overlay), size: textSize(overlay), weight: 'bold' } }] },
  { name: 'shapeLong', totalStep: 4, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => positionFigures(coordinates, overlay.points) },
  { name: 'shapeShort', totalStep: 4, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => positionFigures(coordinates, overlay.points) },
  { name: 'measurePrice', totalStep: 3, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => boxMeasure(coordinates, overlay.points, 'price') },
  { name: 'measureDate', totalStep: 3, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => boxMeasure(coordinates, overlay.points, 'date') },
  { name: 'measureBoth', totalStep: 3, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => boxMeasure(coordinates, overlay.points, 'both') },
]

// needDefaultPointFigure: true → klinecharts renders draggable anchor points on
// each overlay, so custom shapes/text/measures can be MOVED and RESIZED after
// drawing (klinecharts defaults this to false, which left them static).
OVERLAYS.forEach((o) => registerOverlay({ needDefaultPointFigure: true, ...o } as never))
