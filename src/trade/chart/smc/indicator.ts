// ── SMC klinecharts custom indicator ─────────────────────────────────────────
// Registers a main-pane overlay indicator "SMC" whose draw() computes the whole
// Smart Money Concepts model (compute.ts) and paints it via canvas, mapping
// market coordinates (timestamp/price/bar-index) to pixels with klinecharts'
// axis converters. Inputs / theme / timeframe are pushed from the engine.

import { registerIndicator } from 'klinecharts'
import type { Candle } from '../../types/market'
import type { SmcInputs, SmcModel, LabelSize } from './types'
import { DEFAULT_SMC_INPUTS } from './defaults'
import { computeSmc } from './compute'
import { EMPTY_MODEL } from './types'

// ── module state (pushed by the engine) ──
let smcInputs: SmcInputs = DEFAULT_SMC_INPUTS
let smcDark = true
let smcTfMinutes = 1
let inputsRev = 0

export function setSmcInputs(i: SmcInputs) { smcInputs = i; inputsRev++ }
export function setSmcTheme(dark: boolean) { smcDark = dark }
export function setSmcTimeframe(min: number) { smcTfMinutes = Math.max(1, min || 1) }
export function getSmcInputs(): SmcInputs { return smcInputs }

// ── compute cache (recompute only when data/inputs/tf change, not on pan) ──
let cacheKey = ''
let cacheModel: SmcModel = EMPTY_MODEL

const FONT: Record<LabelSize, number> = { tiny: 9, small: 10, normal: 12 }

/** timestamp → (fractional) dataIndex, extrapolating beyond the last bar. */
function tsToIndex(times: number[], t: number, dt: number): number {
  const n = times.length
  if (n === 0) return 0
  if (t <= times[0]) return 0 + (t - times[0]) / dt
  if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / dt
  let lo = 0, hi = n - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid }
  const span = times[hi] - times[lo] || dt
  return lo + (t - times[lo]) / span
}

let registered = false
export function registerSmcIndicator(): void {
  if (registered) return
  registered = true
  registerIndicator({
    name: 'SMC',
    shortName: 'SMC',
    // We draw everything ourselves; no series figures.
    figures: [],
    calc: (dataList: unknown[]) => dataList.map(() => ({})),
    draw: (params: unknown): boolean => {
      const p = params as {
        ctx: CanvasRenderingContext2D
        kLineDataList: Candle[]
        xAxis: { convertToPixel: (v: number) => number }
        yAxis: { convertToPixel: (v: number) => number }
        bounding: { width: number; height: number }
        barSpace?: { bar?: number; halfGapBar?: number }
      }
      const { ctx, kLineDataList: data, xAxis, yAxis, bounding } = p
      const n = data.length
      if (n < 3) return false

      const times = data.map((c) => c.timestamp)
      const dt = Math.max(1, times[n - 1] - times[n - 2])

      // (re)compute the model on data/inputs/tf change only
      const key = `${n}|${times[n - 1]}|${inputsRev}|${smcTfMinutes}|${smcDark ? 'd' : 'l'}`
      if (key !== cacheKey) {
        cacheModel = computeSmc(data, smcInputs, smcTfMinutes)
        cacheKey = key
      }
      const model = cacheModel
      const X = (t: number) => xAxis.convertToPixel(tsToIndex(times, t, dt))
      const Xi = (idx: number) => xAxis.convertToPixel(idx)
      const Y = (price: number) => yAxis.convertToPixel(price)

      ctx.save()

      // ── colored candles (Pine plotcandle) ──
      if (model.colorCandles) {
        const bw = Math.max(1, (p.barSpace?.bar ?? 6) - 2)
        for (let i = 0; i < n; i++) {
          const col = model.candleColors[i]
          if (!col) continue
          const c = data[i]
          const x = Xi(i)
          if (x < -bw || x > bounding.width + bw) continue
          const yO = Y(c.open), yC = Y(c.close), yH = Y(c.high), yL = Y(c.low)
          ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, yH); ctx.lineTo(Math.round(x) + 0.5, yL); ctx.stroke()
          const top = Math.min(yO, yC), h = Math.max(1, Math.abs(yC - yO))
          ctx.fillRect(Math.round(x - bw / 2), Math.round(top), Math.round(bw), Math.round(h))
        }
      }

      // ── boxes (order blocks / FVG / zones) ──
      for (const b of model.boxes) {
        const x1 = X(b.t1), x2 = X(b.t2)
        const y1 = Y(b.p1), y2 = Y(b.p2)
        const left = Math.min(x1, x2), top = Math.min(y1, y2)
        const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1)
        if (left + w < 0 || left > bounding.width) continue
        ctx.fillStyle = b.bg
        ctx.fillRect(left, top, w, h)
        if (b.border) { ctx.strokeStyle = b.border; ctx.lineWidth = 1; ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1) }
      }

      // ── lines (structure / equal / high-low / levels) ──
      for (const l of model.lines) {
        const x1 = X(l.t1), x2 = X(l.t2), y1 = Y(l.p1), y2 = Y(l.p2)
        ctx.strokeStyle = l.color
        ctx.lineWidth = l.width ?? 1
        ctx.setLineDash(l.style === 'dashed' ? [5, 4] : l.style === 'dotted' ? [1, 3] : [])
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      }
      ctx.setLineDash([])

      // ── labels ──
      // Anchor-point labels (MTF levels + strong/weak high-low) all sit at the same
      // far-right point, so a level line and a strong/weak line at a similar price
      // would overlap. Fix (render-only, no value/logic change): draw the MTF LEVEL
      // labels ABOVE their line and the STRONG/WEAK labels BELOW their line — the
      // line always sits between them, so they can never collide. Within each side,
      // labels sharing an x are de-collided vertically.
      type L = { lb: typeof model.labels[number]; x: number; y: number }
      const isLevel = (t: string) => /^P[DWM][HL]$/.test(t)                                   // PDH/PDL/PWH/PWL/PMH/PML
      const isStrongWeak = (t: string) => t === 'Strong High' || t === 'Weak High' || t === 'Strong Low' || t === 'Weak Low'
      const above: L[] = [], below: L[] = [], normal: L[] = []
      for (const lb of model.labels) {
        const x = lb.byIndex ? Xi(lb.x) : X(lb.x)
        const y = Y(lb.p)
        if (x < -40 || x > bounding.width + 60) continue
        if (isLevel(lb.text)) above.push({ lb, x, y })
        else if (isStrongWeak(lb.text)) below.push({ lb, x, y })
        else normal.push({ lb, x, y })
      }

      // normal (mid-chart) labels keep their original placement
      ctx.textBaseline = 'middle'
      for (const { lb, x, y } of normal) {
        ctx.fillStyle = lb.color
        ctx.font = `${FONT[lb.size]}px -apple-system, system-ui, sans-serif`
        if (lb.place === 'left') { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(lb.text, x - 4, y) }
        else if (lb.place === 'down') { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(lb.text, x, y - 3) }
        else { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(lb.text, x, y + 3) }
      }

      // one side (levels above / strong-weak below), right-aligned, de-collided per x-cluster
      const GAP = 12
      const drawSide = (group: L[], side: 'above' | 'below') => {
        group.sort((a, b) => (Math.abs(a.x - b.x) > 6 ? a.x - b.x : a.y - b.y))
        let i0 = 0
        ctx.textAlign = 'right'
        ctx.textBaseline = side === 'above' ? 'bottom' : 'top'
        while (i0 < group.length) {
          let i1 = i0 + 1
          while (i1 < group.length && Math.abs(group[i1].x - group[i0].x) <= 40) i1++
          const cl = group.slice(i0, i1)
          cl.sort((a, b) => a.y - b.y)
          if (side === 'above') { // grow upward from the topmost
            for (let k = cl.length - 2; k >= 0; k--) if (cl[k].y > cl[k + 1].y - GAP) cl[k].y = cl[k + 1].y - GAP
          } else { // grow downward from the bottommost
            for (let k = 1; k < cl.length; k++) if (cl[k].y < cl[k - 1].y + GAP) cl[k].y = cl[k - 1].y + GAP
          }
          for (const { lb, x, y } of cl) {
            ctx.fillStyle = lb.color
            ctx.font = `${FONT[lb.size]}px -apple-system, system-ui, sans-serif`
            ctx.fillText(lb.text, Math.min(x, bounding.width - 2), side === 'above' ? y - 3 : y + 3)
          }
          i0 = i1
        }
      }
      drawSide(above, 'above')
      drawSide(below, 'below')

      ctx.restore()
      return false
    },
  } as never)
}
