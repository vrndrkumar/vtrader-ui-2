// ── Custom KLineCharts overlays (Shapes, Text, Positions, Measurers) ─────────
// KLineCharts ships line + fib overlays only. Register the rest so the grouped
// drawing rail can offer a professional set.

import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts'

const BLUE = '#3b82f6'
const STROKE = { style: 'stroke', borderColor: BLUE, borderSize: 1.5 }
const GREEN_FILL = 'rgba(34,197,94,0.15)'
const RED_FILL = 'rgba(239,68,68,0.15)'
const labelStyle = (bg: string) => ({ color: '#ffffff', size: 11, weight: 'bold', backgroundColor: bg, paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2, borderRadius: 3 })

let pendingText = 'Text'
export function setPendingText(t: string) { pendingText = t }

type P = { x: number; y: number }
type Params = OverlayCreateFiguresCallbackParams

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

const OVERLAYS = [
  { name: 'shapeRect', totalStep: 3, createPointFigures: ({ coordinates }: Params): OverlayFigure[] => coordinates.length < 2 ? [] : [{ type: 'rect', attrs: { x: Math.min(coordinates[0].x, coordinates[1].x), y: Math.min(coordinates[0].y, coordinates[1].y), width: Math.abs(coordinates[1].x - coordinates[0].x), height: Math.abs(coordinates[1].y - coordinates[0].y) }, styles: STROKE }] },
  { name: 'shapeCircle', totalStep: 3, createPointFigures: ({ coordinates }: Params): OverlayFigure[] => coordinates.length < 2 ? [] : [{ type: 'circle', attrs: { x: coordinates[0].x, y: coordinates[0].y, r: Math.hypot(coordinates[1].x - coordinates[0].x, coordinates[1].y - coordinates[0].y) }, styles: STROKE }] },
  { name: 'shapeText', totalStep: 2, createPointFigures: ({ coordinates }: Params): OverlayFigure[] => !coordinates.length ? [] : [{ type: 'text', attrs: { x: coordinates[0].x, y: coordinates[0].y, text: pendingText }, styles: { color: BLUE, size: 13, weight: 'bold' } }] },
  { name: 'shapeLong', totalStep: 4, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => positionFigures(coordinates, overlay.points) },
  { name: 'shapeShort', totalStep: 4, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => positionFigures(coordinates, overlay.points) },
  { name: 'measurePrice', totalStep: 3, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => boxMeasure(coordinates, overlay.points, 'price') },
  { name: 'measureDate', totalStep: 3, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => boxMeasure(coordinates, overlay.points, 'date') },
  { name: 'measureBoth', totalStep: 3, createPointFigures: ({ coordinates, overlay }: Params): OverlayFigure[] => boxMeasure(coordinates, overlay.points, 'both') },
]

OVERLAYS.forEach((o) => registerOverlay(o as never))
