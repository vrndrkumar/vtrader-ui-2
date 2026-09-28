// ── WaveTrend [LazyBear] — faithful logic port ───────────────────────────────
//   ap  = hlc3
//   esa = ema(ap, n1)
//   d   = ema(abs(ap - esa), n1)
//   ci  = (ap - esa) / (0.015 * d)
//   tci = ema(ci, n2)
//   wt1 = tci ; wt2 = sma(wt1, 4)
// Nothing changed from the script; only the plotting is translated.

import type { Candle } from '../../types/market'
import type { WtInputs, WtBar, WtDiv } from './types'

/** ta.ema: alpha = 2/(n+1), seeded at the first finite value; na inputs carry. */
function ema(src: number[], n: number): number[] {
  const a = 2 / (n + 1)
  const out = new Array<number>(src.length).fill(NaN)
  let prev = NaN
  for (let i = 0; i < src.length; i++) {
    const v = src[i]
    if (!Number.isFinite(v)) { out[i] = prev; continue }
    prev = Number.isFinite(prev) ? a * v + (1 - a) * prev : v
    out[i] = prev
  }
  return out
}

/** ta.sma(src, len): na until `len` finite values; resets on a gap. */
function sma(src: number[], len: number): number[] {
  const out = new Array<number>(src.length).fill(NaN)
  const q: number[] = []
  let sum = 0
  for (let i = 0; i < src.length; i++) {
    const v = src[i]
    if (!Number.isFinite(v)) { q.length = 0; sum = 0; continue }
    q.push(v); sum += v
    if (q.length > len) sum -= q.shift() as number
    if (q.length === len) out[i] = sum / len
  }
  return out
}

export interface WtResult { bars: WtBar[]; divs: WtDiv[] }

/** Regular divergences on WT1, drawn only when ≥1 endpoint is beyond OB/OS. */
function divergences(candles: Candle[], wt1: number[], I: WtInputs): WtDiv[] {
  if (!I.showDivergence) return []
  const n = wt1.length
  const L = Math.max(1, I.divPivotLookback)
  const ob = I.obLevel1, os = I.osLevel1
  const highs: number[] = []
  const lows: number[] = []
  for (let i = L; i < n - L; i++) {
    const v = wt1[i]
    if (!Number.isFinite(v)) continue
    let isHigh = true, isLow = true
    for (let k = 1; k <= L; k++) {
      const a = wt1[i - k], b = wt1[i + k]
      if (!(Number.isFinite(a) && Number.isFinite(b))) { isHigh = isLow = false; break }
      if (!(v > a && v > b)) isHigh = false
      if (!(v < a && v < b)) isLow = false
    }
    if (isHigh) highs.push(i)
    if (isLow) lows.push(i)
  }
  const divs: WtDiv[] = []
  // Bearish: consecutive WT pivot highs — price higher-high, WT lower-high, ≥1 above OB.
  for (let j = 1; j < highs.length; j++) {
    const p1 = highs[j - 1], p2 = highs[j]
    if (wt1[p2] < wt1[p1] && candles[p2].high > candles[p1].high && (wt1[p1] >= ob || wt1[p2] >= ob)) {
      divs.push({ i1: p1, w1: wt1[p1], i2: p2, w2: wt1[p2], bear: true })
    }
  }
  // Bullish: consecutive WT pivot lows — price lower-low, WT higher-low, ≥1 below OS.
  for (let j = 1; j < lows.length; j++) {
    const p1 = lows[j - 1], p2 = lows[j]
    if (wt1[p2] > wt1[p1] && candles[p2].low < candles[p1].low && (wt1[p1] <= os || wt1[p2] <= os)) {
      divs.push({ i1: p1, w1: wt1[p1], i2: p2, w2: wt1[p2], bear: false })
    }
  }
  return divs
}

export function computeWt(candles: Candle[], I: WtInputs): WtResult {
  const n = candles.length
  const ap = candles.map((c) => (c.high + c.low + c.close) / 3)   // hlc3
  const esa = ema(ap, I.n1)
  const absDev = ap.map((v, i) => Math.abs(v - esa[i]))
  const d = ema(absDev, I.n1)
  const ci = ap.map((v, i) => {
    const den = 0.015 * d[i]
    return Number.isFinite(esa[i]) && Number.isFinite(d[i]) && den !== 0 ? (v - esa[i]) / den : NaN
  })
  const tci = ema(ci, I.n2)
  const wt1 = tci
  const wt2 = sma(wt1, 4)

  const bars: WtBar[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const w1 = Number.isFinite(wt1[i]) ? wt1[i] : undefined
    const w2 = Number.isFinite(wt2[i]) ? wt2[i] : undefined
    bars[i] = {
      zero: I.showZero ? 0 : undefined,
      ob1: I.showOb1 ? I.obLevel1 : undefined,
      os1: I.showOs1 ? I.osLevel1 : undefined,
      ob2: I.showOb2 ? I.obLevel2 : undefined,
      os2: I.showOs2 ? I.osLevel2 : undefined,
      wt1: I.showWt1 ? w1 : undefined,
      wt2: I.showWt2 ? w2 : undefined,
      diff: I.showArea && w1 !== undefined && w2 !== undefined ? w1 - w2 : undefined,
    }
  }
  return { bars, divs: divergences(candles, wt1, I) }
}
