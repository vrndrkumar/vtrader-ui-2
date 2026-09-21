// ── Relative Strength — faithful logic port ──────────────────────────────────
// Reproduces the bharatTrader Pine v6 script exactly. `comp` is the comparative
// symbol's close aligned to the chart bars (same index), resolved by the caller
// from request.security-equivalent data. Nothing in the math is changed.

import type { Candle } from '../../types/market'
import type { RsInputs, RsBar, RsRefLabel } from './types'
import { RS_BLUE } from './defaults'

const TRANSPARENT = 'rgba(0,0,0,0)'

/** ta.sma(source, length) — na until `length` values are available. */
function sma(src: (number | undefined)[], length: number): (number | undefined)[] {
  const out = new Array<number | undefined>(src.length).fill(undefined)
  let sum = 0, count = 0
  const q: number[] = []
  for (let i = 0; i < src.length; i++) {
    const v = src[i]
    if (v === undefined || !Number.isFinite(v)) { // reset the window on a gap (matches na propagation)
      q.length = 0; sum = 0; count = 0; continue
    }
    q.push(v); sum += v; count++
    if (q.length > length) { sum -= q.shift() as number; count-- }
    if (q.length === length) out[i] = sum / length
  }
  return out
}

/** ta.rising(src, len): strictly increasing over the last `len` steps. */
function rising(src: (number | undefined)[], i: number, len: number): boolean {
  for (let k = 1; k <= len; k++) {
    const a = src[i - k + 1], b = src[i - k]
    if (a === undefined || b === undefined || !(a > b)) return false
  }
  return true
}
function falling(src: (number | undefined)[], i: number, len: number): boolean {
  for (let k = 1; k <= len; k++) {
    const a = src[i - k + 1], b = src[i - k]
    if (a === undefined || b === undefined || !(a < b)) return false
  }
  return true
}

export interface RsResult { bars: RsBar[]; ref: RsRefLabel | null }

export function computeRs(candles: Candle[], comp: (number | undefined)[], I: RsInputs): RsResult {
  const n = candles.length
  const base = candles.map((c) => c.close)               // source = close
  const res: (number | undefined)[] = new Array(n).fill(undefined)

  for (let i = 0; i < n; i++) {
    if (i < I.length) continue
    const b0 = base[i], bL = base[i - I.length]
    const c0 = comp[i], cL = comp[i - I.length]
    if (b0 === undefined || bL === undefined || c0 === undefined || cL === undefined || bL === 0 || cL === 0 || c0 === 0) continue
    res[i] = (b0 / bL) / (c0 / cL) - 1
  }

  const smaRes = sma(res, I.lengthRSMA)
  const smaSymb = sma(base, I.lengthPriceSMA)

  const bars: RsBar[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const r = res[i]
    // resColor (toggle → green/red on 0-cross, else blue); hidden when showRS off
    const resColorBase = I.toggleRSColor ? (r !== undefined && r > 0 ? I.rsColorPos : I.rsColorNeg) : I.rsColorFlat
    const resColor = I.showRS ? resColorBase : TRANSPARENT
    // zero-line color: showRSTrend ? (angle0 > 0 ? up : down) : down
    let zeroColor = I.zeroColorDown
    if (I.showRSTrend) {
      const rb = res[i - I.base]
      const y0 = (r !== undefined && rb !== undefined) ? r - rb : undefined
      const angle0 = y0 !== undefined ? Math.atan(y0 / I.base) : undefined
      zeroColor = angle0 !== undefined && angle0 > 0 ? I.zeroColorUp : I.zeroColorDown
    }
    // MA color: showMAColor && rising ? up : showMAColor && falling ? down : flat
    const maR = rising(smaRes, i, 3), maF = falling(smaRes, i, 3)
    const maColor = I.showMAColor && maR ? I.maColorUp : I.showMAColor && maF ? I.maColorDown : I.maColorFlat
    // price confirmation divergence
    const bSma = smaSymb[i]
    const posDiv = rising(smaSymb, i, 3) && bSma !== undefined && base[i] >= bSma
    const negDiv = falling(smaSymb, i, 3) && bSma !== undefined && base[i] < bSma
    const divStarted = posDiv || negDiv
    const divColor = divStarted ? (posDiv ? I.bullishColor : I.bearishColor) : undefined

    bars[i] = {
      res: r,
      zero: I.showZeroLine ? 0 : undefined,
      ma: I.showMA ? smaRes[i] : undefined,
      bubble: I.showBubbles && divStarted && r !== undefined ? r : undefined,
      resColor, zeroColor, maColor, divColor,
    }
  }

  // Reference date label at (bar_index − length, 0) on the last bar.
  let ref: RsRefLabel | null = null
  if (I.showRefDateLbl && n > I.length) {
    const refIdx = (n - 1) - I.length
    const d = new Date(candles[refIdx].timestamp)
    const rAtLen = res[(n - 1) - I.length] // res[length] on the last bar
    ref = {
      barIndex: (n - 1) - I.length,
      text: `RS-${I.length} reference, ${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`,
      color: RS_BLUE,
      place: rAtLen !== undefined && rAtLen > 0 ? 'up' : 'down',
    }
  }

  return { bars, ref }
}
