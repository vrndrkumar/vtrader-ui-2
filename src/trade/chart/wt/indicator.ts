// ── WaveTrend klinecharts sub-pane indicator ─────────────────────────────────
// Registers "WT" (WaveTrend). Level lines + wt1/wt2 are klinecharts figures
// (wt2 & the level-2 dotted plots use circles = Pine style 3); the wt1−wt2 filled
// area is painted in a custom draw. Colors/widths come from the (editable) inputs.

import { registerIndicator } from 'klinecharts'
import type { Candle } from '../../types/market'
import type { WtInputs, WtBar, WtDiv } from './types'
import { DEFAULT_WT_INPUTS } from './defaults'
import { computeWt } from './compute'

let wtInputs: WtInputs = DEFAULT_WT_INPUTS
let wtDark = true
let lastDivs: WtDiv[] = []
export function setWtInputs(i: WtInputs) { wtInputs = i }
export function setWtTheme(dark: boolean) { wtDark = dark }
export function getWtInputs(): WtInputs { return wtInputs }

let registered = false
export function registerWtIndicator(): void {
  if (registered) return
  registered = true
  registerIndicator({
    name: 'WT',
    shortName: 'WaveTrend',
    calc: (dataList: Candle[]): WtBar[] => { const { bars, divs } = computeWt(dataList, wtInputs); lastDivs = divs; return bars },
    figures: [
      { key: 'zero', title: '0: ', type: 'line', styles: () => ({ color: wtInputs.zeroColor, size: wtInputs.levelWidth }) },
      { key: 'ob1', title: 'OB1: ', type: 'line', styles: () => ({ color: wtInputs.ob1Color, size: wtInputs.levelWidth }) },
      { key: 'os1', title: 'OS1: ', type: 'line', styles: () => ({ color: wtInputs.os1Color, size: wtInputs.levelWidth }) },
      { key: 'ob2', title: 'OB2: ', type: 'circle', styles: () => ({ color: wtInputs.ob2Color, style: 'fill' }) },
      { key: 'os2', title: 'OS2: ', type: 'circle', styles: () => ({ color: wtInputs.os2Color, style: 'fill' }) },
      { key: 'wt1', title: 'WT1: ', type: 'line', styles: () => ({ color: wtInputs.wt1Color, size: wtInputs.wt1Width }) },
      { key: 'wt2', title: 'WT2: ', type: 'circle', styles: () => ({ color: wtInputs.wt2Color, style: 'fill' }) },
    ],
    // wt1 − wt2 filled area (Pine style=area). Drawn from each diff value to the 0
    // baseline; return false so the figures still render on top.
    draw: (params: unknown): boolean => {
      const p = params as {
        ctx: CanvasRenderingContext2D
        indicator: { result?: WtBar[] }
        visibleRange: { from: number; to: number }
        xAxis: { convertToPixel: (v: number) => number }
        yAxis: { convertToPixel: (v: number) => number }
      }
      const bars = p.indicator?.result ?? []
      const { ctx, xAxis, yAxis, visibleRange } = p
      const y0 = yAxis.convertToPixel(0)
      ctx.save()

      // wt1 − wt2 filled area (Pine style=area)
      if (wtInputs.showArea) {
        const from = Math.max(0, visibleRange.from - 1)
        const to = Math.min(bars.length - 1, visibleRange.to + 1)
        ctx.fillStyle = wtInputs.areaColor
        let run: { x: number; y: number }[] = []
        const flush = () => {
          if (run.length < 1) { run = []; return }
          ctx.beginPath()
          ctx.moveTo(run[0].x, y0)
          for (const pt of run) ctx.lineTo(pt.x, pt.y)
          ctx.lineTo(run[run.length - 1].x, y0)
          ctx.closePath()
          ctx.fill()
          run = []
        }
        for (let i = from; i <= to; i++) {
          const d = bars[i]?.diff
          if (d === undefined || !Number.isFinite(d)) { flush(); continue }
          run.push({ x: xAxis.convertToPixel(i), y: yAxis.convertToPixel(d) })
        }
        flush()
      }

      // Divergence lines (drawn on the WT pane only). Theme-based default color.
      if (wtInputs.showDivergence && lastDivs.length) {
        const dc = wtInputs.divColor || (wtDark ? '#e5e7eb' : '#334155')
        ctx.lineWidth = Math.max(1, wtInputs.divWidth)
        ctx.setLineDash([])
        for (const d of lastDivs) {
          ctx.strokeStyle = dc
          ctx.beginPath()
          ctx.moveTo(xAxis.convertToPixel(d.i1), yAxis.convertToPixel(d.w1))
          ctx.lineTo(xAxis.convertToPixel(d.i2), yAxis.convertToPixel(d.w2))
          ctx.stroke()
        }
      }

      ctx.restore()
      return false
    },
  } as never)
}
