// ── KLineCharts implementation of ChartEngine ────────────────────────────────

import { init, dispose, type KLineData } from 'klinecharts'
import type { ChartEngine } from './ChartEngine'
import type { Candle } from '../types/market'

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
      // Push the OHLC legend below our own symbol overlay (avoids overlap).
      tooltip: { offsetLeft: 8, offsetTop: 26, offsetRight: 8, text: { color: text, size: 11 }, rect: { color: 'transparent' } },
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

  resize(): void {
    this.chart?.resize()
  }

  dispose(): void {
    dispose(this.el)
    this.chart = null
    this.indicators.clear()
  }
}
