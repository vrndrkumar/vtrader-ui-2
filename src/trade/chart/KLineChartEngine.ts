// ── KLineCharts implementation of ChartEngine ────────────────────────────────

import { init, dispose, type KLineData } from 'klinecharts'
import type { ChartEngine } from './ChartEngine'
import type { Candle } from '../types/market'
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

  toggleIndicator(name: string): void {
    if (!this.chart) return
    const existing = this.indicators.get(name)
    if (existing) {
      this.chart.removeIndicator(existing, name)
      this.indicators.delete(name)
      return
    }
    const onMain = MAIN_PANE.has(name)
    const paneId = onMain ? 'candle_pane' : `${name.toLowerCase()}_pane`
    this.chart.createIndicator(name, onMain, { id: paneId })
    this.indicators.set(name, paneId)
  }

  hasIndicator(name: string): boolean {
    return this.indicators.has(name)
  }

  activeIndicators(): string[] {
    return [...this.indicators.keys()]
  }

  startDrawing(name: string): void {
    this.chart?.createOverlay(name)
  }

  clearDrawings(): void {
    this.chart?.removeOverlay()
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
  }
}
