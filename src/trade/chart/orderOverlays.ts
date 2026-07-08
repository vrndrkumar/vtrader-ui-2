// ── Draggable order-line overlays (KLineCharts) ──────────────────────────────
// Horizontal price line + right-anchored tag, one per Entry/SL/Target/Position.
// Editable lines are draggable; on release we dispatch a modify via the handler.

import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayEvent, type OverlayFigure } from 'klinecharts'

export type OrderLineKind = 'position' | 'sl' | 'target' | 'entry' | 'pending'

export interface OrderLineData {
  lineId: string
  kind: OrderLineKind
  color: string
  label: string
  positionId?: string
}

/** Engine-facing description of a line to render. */
export interface OrderLine {
  lineId: string
  price: number
  editable: boolean
  data: OrderLineData
}

let dragEnd: (d: OrderLineData, price: number) => void = () => {}
export function setOrderLineDragEnd(fn: (d: OrderLineData, price: number) => void) { dragEnd = fn }

registerOverlay({
  name: 'orderLine',
  totalStep: 2,
  needDefaultPointFigure: false,
  createPointFigures: ({ coordinates, bounding, overlay }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
    if (!coordinates.length) return []
    const y = coordinates[0].y
    const d = overlay.extendData as OrderLineData | undefined
    const color = d?.color ?? '#3b82f6'
    return [
      { type: 'line', attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] }, styles: { color, size: 1, style: 'dashed', dashedValue: [4, 3] } },
      { type: 'text', attrs: { x: bounding.width - 6, y, text: d?.label ?? '', align: 'right', baseline: 'middle' }, styles: { color: '#ffffff', backgroundColor: color, size: 11, weight: 'bold', paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2, borderRadius: 3 } },
    ]
  },
  onPressedMoveEnd: (e: OverlayEvent): boolean => {
    const d = e.overlay.extendData as OrderLineData | undefined
    const v = e.overlay.points?.[0]?.value
    if (d && v != null) dragEnd(d, v)
    return false
  },
} as never)
