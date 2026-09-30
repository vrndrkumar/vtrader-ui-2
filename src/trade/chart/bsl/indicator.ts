// ── Buyside & Sellside Liquidity klinecharts custom indicator ────────────────
// Registers a main-pane overlay "BSL" whose draw() computes the whole model
// (compute.ts) and paints it via canvas. All geometry is in bar-index space, so
// x-coordinates map with the x-axis converter directly (fractional / future
// indices such as i+10 are extrapolated by klinecharts). Inputs are pushed from
// the engine; recompute is cached and only re-runs on data / input change.

import { registerIndicator } from 'klinecharts'
import type { Candle } from '../../types/market'
import type { BslInputs, BslModel } from './types'
import { DEFAULT_BSL_INPUTS } from './defaults'
import { EMPTY_BSL_MODEL } from './types'
import { computeBsl } from './compute'

let bslInputs: BslInputs = DEFAULT_BSL_INPUTS
let inputsRev = 0
export function setBslInputs(i: BslInputs) { bslInputs = i; inputsRev++ }
export function getBslInputs(): BslInputs { return bslInputs }

let cacheKey = ''
let cacheModel: BslModel = EMPTY_BSL_MODEL

let registered = false
export function registerBslIndicator(): void {
  if (registered) return
  registered = true
  registerIndicator({
    name: 'BSL',
    shortName: 'Buyside & Sellside Liquidity',
    figures: [],
    calc: (dataList: unknown[]) => dataList.map(() => ({})),
    draw: (params: unknown): boolean => {
      const p = params as {
        ctx: CanvasRenderingContext2D
        kLineDataList: Candle[]
        xAxis: { convertToPixel: (v: number) => number }
        yAxis: { convertToPixel: (v: number) => number }
        bounding: { width: number; height: number }
      }
      const { ctx, kLineDataList: data, xAxis, yAxis, bounding } = p
      const n = data.length
      if (n < 3) return false

      // (re)compute only when the data length / last bar / inputs change (not on pan)
      const key = `${n}|${data[n - 1].timestamp}|${inputsRev}`
      if (key !== cacheKey) {
        cacheModel = computeBsl(data, bslInputs)
        cacheKey = key
      }
      const model = cacheModel
      const X = (idx: number) => xAxis.convertToPixel(idx)
      const Y = (price: number) => yAxis.convertToPixel(price)

      ctx.save()

      // ── zones + liquidity-void boxes ──
      for (const b of model.boxes) {
        const x1 = X(b.x1), x2 = X(b.x2)
        const y1 = Y(b.p1), y2 = Y(b.p2)
        const left = Math.min(x1, x2), top = Math.min(y1, y2)
        const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1)
        if (left + w < 0 || left > bounding.width) continue
        ctx.fillStyle = b.bg
        ctx.fillRect(left, top, w, Math.max(h, 0.5))
      }

      // ── level lines (solid) + projected lines (dotted) ──
      for (const l of model.lines) {
        const x1 = X(l.x1), x2 = X(l.x2), y1 = Y(l.p1), y2 = Y(l.p2)
        if (Math.max(x1, x2) < 0 || Math.min(x1, x2) > bounding.width) continue
        ctx.strokeStyle = l.color
        ctx.lineWidth = 1
        ctx.setLineDash(l.dotted ? [1, 3] : [])
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      }
      ctx.setLineDash([])

      // ── labels (Buyside/Sellside liquidity, Liquidity Void) ──
      ctx.font = '9px -apple-system, system-ui, sans-serif'
      ctx.textAlign = 'left'
      for (const lb of model.labels) {
        const x = X(lb.x), y = Y(lb.p)
        if (x < -80 || x > bounding.width + 20) continue
        ctx.fillStyle = lb.color
        ctx.textBaseline = lb.above ? 'bottom' : 'top'
        ctx.fillText(lb.text, x + 2, lb.above ? y - 2 : y + 2)
      }

      ctx.restore()
      return false
    },
  } as never)
}
