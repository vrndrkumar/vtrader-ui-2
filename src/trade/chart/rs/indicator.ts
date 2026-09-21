// ── RS klinecharts sub-pane indicator ────────────────────────────────────────
// Registers "RS" (Relative Strength) as a sub-pane oscillator. The series (zero
// line, RS, MA, confirmation bubbles) are klinecharts figures with per-bar color
// via `styles` callbacks; the reference-date label is painted in a custom draw().
// The comparative symbol's close series is pushed from the engine (module state).

import { registerIndicator } from 'klinecharts'
import type { Candle } from '../../types/market'
import type { RsInputs, RsBar, RsRefLabel } from './types'
import { DEFAULT_RS_INPUTS, RS_MAROON, RS_BLUE, RS_GRAY } from './defaults'
import { computeRs } from './compute'

let rsInputs: RsInputs = DEFAULT_RS_INPUTS
let rsComp = new Map<number, number>()   // comparative symbol close, keyed by bar timestamp
let rsDark = true
let lastRef: RsRefLabel | null = null

export function setRsInputs(i: RsInputs) { rsInputs = i }
export function setRsComparative(map: Map<number, number>) { rsComp = map }
export function setRsTheme(dark: boolean) { rsDark = dark }
export function getRsInputs(): RsInputs { return rsInputs }

const FONT_SM = 10

type SC = { current: { indicatorData?: RsBar } }
function color(d: SC, key: keyof RsBar, fallback: string): string {
  const v = d.current.indicatorData?.[key]
  return typeof v === 'string' ? v : fallback
}

let registered = false
export function registerRsIndicator(): void {
  if (registered) return
  registered = true
  registerIndicator({
    name: 'RS',
    shortName: 'Relative Strength',
    calc: (dataList: Candle[]): RsBar[] => {
      const n = dataList.length
      if (!n) { lastRef = null; return [] }
      // align comparative close to the chart bars (forward-fill gaps)
      const comp: (number | undefined)[] = new Array(n)
      let last: number | undefined
      for (let i = 0; i < n; i++) { const c = rsComp.get(dataList[i].timestamp); if (c !== undefined) last = c; comp[i] = last }
      const { bars, ref } = computeRs(dataList, comp, rsInputs)
      lastRef = ref
      return bars
    },
    figures: [
      { key: 'zero', title: 'Zero: ', type: 'line', styles: (d: SC) => ({ color: color(d, 'zeroColor', RS_MAROON), size: rsInputs.zeroWidth }) },
      { key: 'res', title: 'RS: ', type: 'line', styles: (d: SC) => ({ color: color(d, 'resColor', RS_BLUE), size: rsInputs.rsWidth }) },
      { key: 'ma', title: 'MA: ', type: 'line', styles: (d: SC) => ({ color: color(d, 'maColor', RS_GRAY), size: rsInputs.maWidth }) },
      { key: 'bubble', title: 'Confirm: ', type: 'circle', styles: (d: SC) => ({ color: color(d, 'divColor', 'rgba(0,0,0,0)'), style: 'fill' }) },
    ],
    // reference-date label (custom); return false so the figures still render.
    draw: (params: unknown): boolean => {
      const p = params as {
        ctx: CanvasRenderingContext2D
        xAxis: { convertToPixel: (v: number) => number }
        yAxis: { convertToPixel: (v: number) => number }
        bounding: { width: number; height: number }
      }
      if (!lastRef || !rsInputs.showRefDateLbl) return false
      const { ctx, xAxis, yAxis, bounding } = p
      const x = xAxis.convertToPixel(lastRef.barIndex)
      const y = yAxis.convertToPixel(0)
      if (x < -20 || x > bounding.width + 20) return false
      ctx.save()
      ctx.font = `${FONT_SM}px -apple-system, system-ui, sans-serif`
      ctx.fillStyle = lastRef.color
      ctx.textAlign = 'left'
      ctx.textBaseline = lastRef.place === 'up' ? 'bottom' : 'top'
      ctx.fillText(lastRef.text, x + 4, lastRef.place === 'up' ? y - 4 : y + 4)
      ctx.restore()
      void rsDark
      return false
    },
  } as never)
}
