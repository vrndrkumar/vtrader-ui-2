// ── KLineCharts implementation of ChartEngine ────────────────────────────────

import { init, dispose, type KLineData } from 'klinecharts'
import type { ChartEngine, DrawingDef } from './ChartEngine'
import type { Candle } from '../types/market'
import { INDICATORS } from './indicatorMeta'
import './customOverlays' // register Shapes + Text overlays before any chart init
import './orderOverlays'  // register the draggable order-line overlay
import type { OrderLine } from './orderOverlays'

type Chart = NonNullable<ReturnType<typeof init>>

const UP = '#16a34a'
const DOWN = '#dc2626'

// Indicators that overlay the price pane vs. those that get their own sub-pane.
const MAIN_PANE = new Set(['MA', 'EMA', 'BOLL', 'SAR', 'BBI'])

function styles(dark: boolean) {
  const grid = dark ? '#1b2231' : '#f0f2f7'
  const text = dark ? '#8b93a7' : '#64748b'
  const axis = dark ? '#2d3748' : '#e6eaf1'
  const cross = dark ? '#3b82f6' : '#2563eb'
  return {
    grid: { horizontal: { color: grid }, vertical: { color: grid } },
    candle: {
      bar: {
        upColor: UP, downColor: DOWN, noChangeColor: text,
        upBorderColor: UP, downBorderColor: DOWN,
        upWickColor: UP, downWickColor: DOWN,
      },
      priceMark: {
        high: { color: text }, low: { color: text },
        last: { line: { style: 'dashed' }, text: { color: '#ffffff' } },
      },
      // Built-in OHLC legend disabled — we render our own compact strip beside
      // the symbol (short labels, no time) and follow the crosshair ourselves.
      tooltip: { showRule: 'none', offsetLeft: 8, offsetTop: 26, offsetRight: 8, text: { color: text, size: 11 }, rect: { color: 'transparent' } },
    },
    indicator: { tooltip: { offsetLeft: 8, offsetTop: 26, text: { color: text, size: 11 } } },
    xAxis: { axisLine: { color: axis }, tickText: { color: text }, tickLine: { color: axis } },
    yAxis: { axisLine: { color: axis }, tickText: { color: text }, tickLine: { color: axis } },
    crosshair: {
      horizontal: { line: { color: cross }, text: { backgroundColor: cross } },
      vertical: { line: { color: cross }, text: { backgroundColor: cross } },
    },
    separator: { color: axis },
  }
}

export class KLineChartEngine implements ChartEngine {
  private chart: Chart | null
  private readonly el: HTMLElement
  private readonly indicators = new Map<string, string>() // name -> paneId
  private readonly orderLines = new Map<string, string>() // lineId -> overlayId
  private readonly drawingIds = new Set<string>()          // user-drawing overlay ids
  private readonly drawingById = new Map<string, DrawingDef>() // id -> serialized def
  private onDrawings?: (list: DrawingDef[]) => void

  constructor(el: HTMLElement, dark: boolean) {
    this.el = el
    this.chart = init(el)
    // No default indicators — the trader adds what they want, and can remove it.
    if (this.chart) this.chart.setStyles(styles(dark) as never)
  }

  setData(candles: Candle[]): void {
    this.chart?.applyNewData(candles as KLineData[])
  }

  updateLast(candle: Candle): void {
    this.chart?.updateData(candle as KLineData)
  }

  setTheme(dark: boolean): void {
    this.chart?.setStyles(styles(dark) as never)
  }

  toggleIndicator(name: string, calcParams?: number[]): void {
    if (!this.chart) return
    const existing = this.indicators.get(name)
    if (existing) {
      this.chart.removeIndicator(existing, name)
      this.indicators.delete(name)
      return
    }
    const onMain = MAIN_PANE.has(name)
    const paneId = onMain ? 'candle_pane' : `${name.toLowerCase()}_pane`
    // Create with the exact original call (known good), then apply params via a
    // guarded override so a bad param can never break the chart's rendering.
    this.chart.createIndicator(name, onMain, { id: paneId })
    this.indicators.set(name, paneId)
    const params = calcParams ?? INDICATORS[name]?.defaults
    if (params && params.length) this.configureIndicator(name, params)
  }

  configureIndicator(name: string, calcParams: number[]): void {
    const paneId = this.indicators.get(name)
    if (!this.chart || !paneId) return
    try { this.chart.overrideIndicator({ name, calcParams } as never, paneId) } catch { /* keep chart alive */ }
  }

  hasIndicator(name: string): boolean {
    return this.indicators.has(name)
  }

  activeIndicators(): string[] {
    return [...this.indicators.keys()]
  }

  // ── Drawings (persisted as time+price, never pixels) ───────────────────────

  setDrawingChangeHandler(cb: (list: DrawingDef[]) => void): void {
    this.onDrawings = cb
  }

  private serialize(overlay: { name?: string; points?: { timestamp?: number; dataIndex?: number; value?: number }[]; styles?: unknown }): DrawingDef {
    // Anchor by TIME. KLineCharts points at draw-end may only carry dataIndex, so
    // resolve the real bar timestamp. For a point drawn beyond the last bar (the
    // empty "future" area), the dataIndex is out of range — extrapolate the
    // timestamp from the bar interval so it still anchors by time on reload.
    const data = (this.chart as unknown as { getDataList?: () => { timestamp?: number }[] } | null)?.getDataList?.() ?? []
    const lastIdx = data.length - 1
    const interval = data.length >= 2 ? Number(data[lastIdx]?.timestamp) - Number(data[lastIdx - 1]?.timestamp) : 60_000
    const tsFor = (di?: number): number | undefined => {
      if (di == null || !data.length) return undefined
      if (di >= 0 && di <= lastIdx) return data[di]?.timestamp
      const base = Number(data[di < 0 ? 0 : lastIdx]?.timestamp)
      return Number.isFinite(base) ? base + (di - (di < 0 ? 0 : lastIdx)) * interval : undefined
    }
    const def: DrawingDef = {
      type: String(overlay?.name ?? ''),
      points: (overlay?.points ?? []).map((p) => ({ timestamp: p?.timestamp ?? tsFor(p?.dataIndex), value: p?.value })),
      styles: overlay?.styles,
    }
    try { console.info('[VT-DRAW] save', def.type, JSON.stringify(def.points)) } catch { /* noop */ }
    return def
  }

  private emitDrawings(): void {
    this.onDrawings?.([...this.drawingById.values()])
  }

  // Callbacks attached to every user drawing so create / move / remove keep the
  // serialized store in sync. Order lines ('orderLine') are excluded.
  private drawingCallbacks() {
    const upd = (data: { overlay?: { id?: string; name?: string; points?: { timestamp?: number; dataIndex?: number; value?: number }[]; styles?: unknown } }) => {
      const o = data?.overlay
      if (!o || o.name === 'orderLine' || !o.id) return false
      this.drawingIds.add(o.id)
      this.drawingById.set(o.id, this.serialize(o))
      this.emitDrawings()
      return false
    }
    return {
      onDrawEnd: upd,
      onPressedMoveEnd: upd,
      onRemoved: (data: { overlay?: { id?: string } }) => {
        const id = data?.overlay?.id
        if (id) { this.drawingIds.delete(id); this.drawingById.delete(id) }
        this.emitDrawings()
        return false
      },
    }
  }

  startDrawing(name: string): void {
    this.chart?.createOverlay({ name, ...this.drawingCallbacks() } as never)
  }

  clearDrawings(): void {
    for (const id of this.drawingIds) { try { this.chart?.removeOverlay(id) } catch { /* noop */ } }
    this.drawingIds.clear()
    this.drawingById.clear()
    this.emitDrawings()
  }

  restoreDrawings(list: DrawingDef[]): void {
    if (!this.chart) return
    // Remove only our drawing overlays (leave order lines alone), then rebuild
    // from the time+price defs so anchors re-map to the CURRENT bars.
    for (const id of this.drawingIds) { try { this.chart.removeOverlay(id) } catch { /* noop */ } }
    this.drawingIds.clear()
    this.drawingById.clear()
    try { console.info('[VT-DRAW] restore', list.length, JSON.stringify(list.map((d) => ({ t: d.type, p: d.points })))) } catch { /* noop */ }
    for (const d of list) {
      if (!d?.type) continue
      const created = this.chart.createOverlay({ name: d.type, points: d.points, styles: d.styles, ...this.drawingCallbacks() } as never)
      const id = Array.isArray(created) ? created[0] : created
      if (typeof id === 'string') { this.drawingIds.add(id); this.drawingById.set(id, d) }
    }
  }

  syncOrderLines(lines: OrderLine[]): void {
    if (!this.chart) return
    const seen = new Set<string>()
    for (const l of lines) {
      seen.add(l.lineId)
      const existing = this.orderLines.get(l.lineId)
      if (existing) {
        this.chart.overrideOverlay({ id: existing, points: [{ value: l.price }], extendData: l.data, lock: !l.editable } as never)
      } else {
        const id = this.chart.createOverlay({ name: 'orderLine', points: [{ value: l.price }], extendData: l.data, lock: !l.editable } as never)
        if (typeof id === 'string') this.orderLines.set(l.lineId, id)
      }
    }
    for (const [lineId, ovId] of [...this.orderLines]) {
      if (!seen.has(lineId)) { this.chart.removeOverlay(ovId); this.orderLines.delete(lineId) }
    }
  }

  priceToY(price: number): number | null {
    if (!this.chart) return null
    try {
      const r = (this.chart as unknown as { convertToPixel: (v: unknown, o: unknown) => unknown })
        .convertToPixel({ value: price }, { paneId: 'candle_pane' })
      const y = Array.isArray(r) ? (r[0] as { y?: number })?.y : (r as { y?: number })?.y
      return typeof y === 'number' && Number.isFinite(y) ? y : null
    } catch { return null }
  }

  yToPrice(y: number): number | null {
    if (!this.chart) return null
    try {
      const r = (this.chart as unknown as { convertFromPixel: (v: unknown, o: unknown) => unknown })
        .convertFromPixel({ y }, { paneId: 'candle_pane' })
      const v = Array.isArray(r) ? (r[0] as { value?: number })?.value : (r as { value?: number })?.value
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    } catch { return null }
  }

  subscribeCrosshair(cb: (c: Candle | null) => void): () => void {
    const chart = this.chart
    if (!chart) return () => {}
    const handler = (data: unknown) => {
      const k = (data as { kLineData?: KLineData } | undefined)?.kLineData
      cb(k ? { timestamp: Number(k.timestamp), open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume } : null)
    }
    try {
      (chart as unknown as { subscribeAction: (a: string, h: (d: unknown) => void) => void }).subscribeAction('onCrosshairChange', handler)
      return () => { try { (chart as unknown as { unsubscribeAction: (a: string, h: (d: unknown) => void) => void }).unsubscribeAction('onCrosshairChange', handler) } catch { /* */ } }
    } catch { return () => {} }
  }

  resize(): void {
    this.chart?.resize()
  }

  dispose(): void {
    dispose(this.el)
    this.chart = null
    this.indicators.clear()
    this.drawingIds.clear()
    this.drawingById.clear()
    this.onDrawings = undefined
  }
}
