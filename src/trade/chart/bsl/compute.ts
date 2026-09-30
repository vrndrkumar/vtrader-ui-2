// ── Buyside & Sellside Liquidity [LuxAlgo] — faithful logic port ─────────────
// Bar-by-bar reproduction of the Pine v5 script. Nothing in the detection logic
// is changed — only the drawing is translated. Pine works in bar_index space, so
// this port keeps all geometry in local data-index space (0..n-1); the indicator
// draw() maps those indices to pixels.
//
// Pipeline per bar:
//   • ta.pivothigh(liqLen, 1) / ta.pivotlow(liqLen, 1) feed a rolling ZZ stack of
//     the last 50 pivots (direction / index / price).
//   • When ≥3 pivots sit inside an ATR-scaled margin band → a Buyside/Sellside
//     liquidity level (equal highs/lows cluster) with a projected dotted line.
//   • Breach handling paints a reaction "zone" box once price takes the level.
//   • Optional Liquidity Voids: stacked translucent boxes over large gaps, pruned
//     once price trades back through them.

import type { Candle } from '../../types/market'
import type { BslInputs, BslModel, BslLine, BslBox, BslLabel } from './types'
import { pineColor } from './defaults'

const MAX_SIZE = 50

/** ta.atr(length) = RMA of true range (Wilder), seeded with the SMA of the first `length` TRs. */
function atrSeries(high: number[], low: number[], close: number[], length: number): number[] {
  const n = high.length
  const tr = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    tr[i] = i === 0 ? high[i] - low[i] : Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]))
  }
  const out = new Array<number>(n).fill(NaN)
  const alpha = 1 / length
  let rma = NaN
  for (let i = 0; i < n; i++) {
    if (i < length - 1) continue
    if (i === length - 1) { let s = 0; for (let k = 0; k < length; k++) s += tr[k]; rma = s / length }
    else rma = alpha * tr[i] + (1 - alpha) * rma
    out[i] = rma
  }
  return out
}

/** ta.pivothigh(left, right) evaluated at bar `i`: candidate is the bar `right` back;
 *  a pivot when it is strictly greater than `left` bars before and `right` bars after. */
function pivotHigh(high: number[], i: number, left: number, right: number): number | undefined {
  const c = i - right
  if (c - left < 0 || c + right > i) return undefined
  const v = high[c]
  for (let k = 1; k <= left; k++) if (!(v > high[c - k])) return undefined
  for (let k = 1; k <= right; k++) if (!(v > high[c + k])) return undefined
  return v
}
function pivotLow(low: number[], i: number, left: number, right: number): number | undefined {
  const c = i - right
  if (c - left < 0 || c + right > i) return undefined
  const v = low[c]
  for (let k = 1; k <= left; k++) if (!(v < low[c - k])) return undefined
  for (let k = 1; k <= right; k++) if (!(v < low[c + k])) return undefined
  return v
}

const nz = (v: number): number => (Number.isFinite(v) ? v : 0)
const avg = (a: number, b: number): number => (a + b) / 2

// A single liquidity level (Pine `liq` object). `bx` is the invisible logical
// level bound (used for breach tests); `bxz` is the drawn reaction zone; `ln` the
// solid level segment; `lne` the projected dotted line.
interface Liq {
  bxLeft: number; bxTop: number; bxRight: number; bxBottom: number
  bxzLeft: number; bxzTop: number; bxzRight: number; bxzBottom: number; bxzBg: string; bxzOn: boolean
  txtX: number; txtP: number; txtText: string; txtColor: string
  brZ: boolean; brL: boolean
  lnX1: number; lnY1: number; lnX2: number; lnY2: number
  lneX2: number
  color: string
}

// A liquidity-void box (Pine box in `b_liq_V`), pruned when price trades through it.
interface Void { left: number; top: number; right: number; bottom: number; bg: string; text?: string; textColor: string }

const emptyLiq = (): Liq => ({
  bxLeft: NaN, bxTop: NaN, bxRight: NaN, bxBottom: NaN,
  bxzLeft: NaN, bxzTop: NaN, bxzRight: NaN, bxzBottom: NaN, bxzBg: 'rgba(0,0,0,0)', bxzOn: false,
  txtX: NaN, txtP: NaN, txtText: '', txtColor: 'rgba(0,0,0,0)',
  brZ: false, brL: false,
  lnX1: NaN, lnY1: NaN, lnX2: NaN, lnY2: NaN, lneX2: NaN, color: 'rgba(0,0,0,0)',
})

export function computeBsl(candles: Candle[], I: BslInputs): BslModel {
  const n = candles.length
  if (n < 3) return { lines: [], boxes: [], labels: [] }

  const high = candles.map((c) => c.high)
  const low = candles.map((c) => c.low)
  const close = candles.map((c) => c.close)

  const liqLen = Math.max(3, Math.min(13, Math.round(I.liqLen)))
  const liqMar = 10 / I.margin
  const atr = atrSeries(high, low, close, 10)
  const atr200 = atrSeries(high, low, close, 200)
  const lastBarIndex = n - 1

  // ── ZZ pivot stack (Pine `aZZ`, size 50) ──
  const d = new Array<number>(MAX_SIZE).fill(0)
  const zx = new Array<number>(MAX_SIZE).fill(0)
  const zy = new Array<number>(MAX_SIZE).fill(NaN)
  const inOut = (dd: number, xx: number, yy: number) => { d.unshift(dd); zx.unshift(xx); zy.unshift(yy); d.pop(); zx.pop(); zy.pop() }

  // Pine initialises each array with one empty liq element.
  const bLiqB: Liq[] = [emptyLiq()]
  const bLiqS: Liq[] = [emptyLiq()]
  const bLiqV: Void[] = []

  let prevBull = false
  let prevBear = false

  for (let i = 0; i < n; i++) {
    const per = I.mode === 'Present' ? lastBarIndex - i <= 500 : true
    const x2 = i - 1
    const ph = pivotHigh(high, i, liqLen, 1)
    const pl = pivotLow(low, i, liqLen, 1)

    // ── Buyside pivot / cluster ──
    if (ph !== undefined) {
      const dir = d[0], y1 = zy[0]
      const y2 = nz(high[i - 1])
      if (dir < 1) inOut(1, x2, y2)
      else if (dir === 1 && ph > y1) { zx[0] = x2; zy[0] = y2 }

      if (per) {
        let count = 0, stP = 0, stB = 0, minP = 0, maxP = 10e6
        for (let j = 0; j < MAX_SIZE; j++) {
          if (d[j] === 1) {
            if (zy[j] > ph + atr[i] / liqMar) break
            else if (zy[j] > ph - atr[i] / liqMar && zy[j] < ph + atr[i] / liqMar) {
              count += 1; stB = zx[j]; stP = zy[j]
              if (zy[j] > minP) minP = zy[j]
              if (zy[j] < maxP) maxP = zy[j]
            }
          }
        }
        if (count > 2) {
          const getB = bLiqB[0]
          if (stB === getB.bxLeft) {
            getB.bxTop = avg(minP, maxP) + atr[i] / liqMar
            getB.bxRight = i + 10
            getB.bxBottom = avg(minP, maxP) - atr[i] / liqMar
          } else {
            const q = emptyLiq()
            q.bxLeft = stB; q.bxTop = avg(minP, maxP) + atr[i] / liqMar; q.bxRight = i + 10; q.bxBottom = avg(minP, maxP) - atr[i] / liqMar
            q.txtX = stB; q.txtP = stP; q.txtText = 'Buyside liquidity'; q.txtColor = pineColor(I.cLIQ_B, 25)
            q.lnX1 = stB; q.lnY1 = stP; q.lnX2 = i - 1; q.lnY2 = stP
            q.lneX2 = i - 1
            q.color = I.cLIQ_B
            bLiqB.unshift(q)
          }
          if (bLiqB.length > I.visLiq) bLiqB.pop()
        }
      }
    }

    // ── Sellside pivot / cluster ──
    if (pl !== undefined) {
      const dir = d[0], y1 = zy[0]
      const y2 = nz(low[i - 1])
      if (dir > -1) inOut(-1, x2, y2)
      else if (dir === -1 && pl < y1) { zx[0] = x2; zy[0] = y2 }

      if (per) {
        let count = 0, stP = 0, stB = 0, minP = 0, maxP = 10e6
        for (let j = 0; j < MAX_SIZE; j++) {
          if (d[j] === -1) {
            if (zy[j] < pl - atr[i] / liqMar) break
            else if (zy[j] > pl - atr[i] / liqMar && zy[j] < pl + atr[i] / liqMar) {
              count += 1; stB = zx[j]; stP = zy[j]
              if (zy[j] > minP) minP = zy[j]
              if (zy[j] < maxP) maxP = zy[j]
            }
          }
        }
        if (count > 2) {
          const getB = bLiqS[0]
          if (stB === getB.bxLeft) {
            getB.bxTop = avg(minP, maxP) + atr[i] / liqMar
            getB.bxRight = i + 10
            getB.bxBottom = avg(minP, maxP) - atr[i] / liqMar
          } else {
            const q = emptyLiq()
            q.bxLeft = stB; q.bxTop = avg(minP, maxP) + atr[i] / liqMar; q.bxRight = i + 10; q.bxBottom = avg(minP, maxP) - atr[i] / liqMar
            q.txtX = stB; q.txtP = stP; q.txtText = 'Sellside liquidity'; q.txtColor = pineColor(I.cLIQ_S, 25)
            q.lnX1 = stB; q.lnY1 = stP; q.lnX2 = i - 1; q.lnY2 = stP
            q.lneX2 = i - 1
            q.color = I.cLIQ_S
            bLiqS.unshift(q)
          }
          if (bLiqS.length > I.visLiq) bLiqS.pop()
        }
      }
    }

    // ── Buyside breach handling ──
    for (const x of bLiqB) {
      if (!Number.isFinite(x.lnY1)) continue // skip the empty init element
      if (!x.brL) {
        x.lneX2 = i
        if (high[i] > x.bxTop) {
          x.brL = true; x.brZ = true
          x.bxzLeft = i - 1; x.bxzTop = Math.min(x.lnY1 + I.marBuy * atr[i], high[i])
          x.bxzRight = i + 1; x.bxzBottom = x.lnY1
          x.bxzBg = pineColor(I.cLIQ_B, I.liqBuy ? 73 : 100)
          x.bxzOn = true
        }
      } else if (x.brZ) {
        if (low[i] > x.lnY1 - I.marBuy * atr[i] && high[i] < x.lnY1 + I.marBuy * atr[i]) {
          x.bxzRight = i + 1
          x.bxzTop = Math.max(high[i], x.bxzTop)
          if (I.liqBuy) x.lneX2 = i + 1
        } else x.brZ = false
      }
    }

    // ── Sellside breach handling ──
    for (const x of bLiqS) {
      if (!Number.isFinite(x.lnY1)) continue
      if (!x.brL) {
        x.lneX2 = i
        if (low[i] < x.bxBottom) {
          x.brL = true; x.brZ = true
          x.bxzLeft = i - 1; x.bxzTop = x.lnY1
          x.bxzRight = i + 1; x.bxzBottom = Math.max(x.lnY1 - I.marSel * atr[i], low[i])
          x.bxzBg = pineColor(I.cLIQ_S, I.liqSel ? 73 : 100)
          x.bxzOn = true
        }
      } else if (x.brZ) {
        if (low[i] > x.lnY1 - I.marSel * atr[i] && high[i] < x.lnY1 + I.marSel * atr[i]) {
          x.bxzRight = i + 1
          x.bxzBottom = Math.min(low[i], x.bxzBottom)
          if (I.liqSel) x.lneX2 = i + 1
        } else x.brZ = false
      }
    }

    // ── Liquidity Voids ──
    let bull = false, bear = false
    if (I.lqVoid && per && i >= 2) {
      bull = low[i] - high[i - 2] > atr200[i] && low[i] > high[i - 2] && close[i - 1] > high[i - 2]
      bear = low[i - 2] - high[i] > atr200[i] && high[i] < low[i - 2] && close[i - 1] < low[i - 2]
      const L = 13
      if (bull) {
        if (prevBull) {
          const st = Math.abs(low[i] - low[i - 1]) / L
          for (let k = 0; k < L; k++) bLiqV.push({ left: i - 2, top: low[i - 1] + (k + 1) * st, right: i, bottom: low[i - 1] + k * st, bg: pineColor(I.cLQV_B, 90), textColor: 'rgba(0,0,0,0)' })
        } else {
          const st = Math.abs(low[i] - high[i - 2]) / L
          for (let k = 0; k < L; k++) {
            const b: Void = { left: i - 2, top: high[i - 2] + (k + 1) * st, right: i, bottom: high[i - 2] + k * st, bg: pineColor(I.cLQV_B, 90), textColor: 'rgba(0,0,0,0)' }
            if (I.lqText && k === 0) b.text = 'Liquidity Void   '
            bLiqV.push(b)
          }
        }
      }
      if (bear) {
        if (prevBear) {
          const st = Math.abs(high[i - 1] - high[i]) / L
          for (let k = 0; k < L; k++) bLiqV.push({ left: i - 2, top: high[i] + (k + 1) * st, right: i, bottom: high[i] + k * st, bg: pineColor(I.cLQV_S, 90), textColor: 'rgba(0,0,0,0)' })
        } else {
          const st = Math.abs(low[i - 2] - high[i]) / L
          for (let k = 0; k < L; k++) {
            const b: Void = { left: i - 2, top: high[i] + (k + 1) * st, right: i, bottom: high[i] + k * st, bg: pineColor(I.cLQV_S, 90), textColor: 'rgba(0,0,0,0)' }
            if (I.lqText && k === L - 1) b.text = 'Liquidity Void   '
            bLiqV.push(b)
          }
        }
      }
    }
    prevBull = bull
    prevBear = bear

    // ── Void pruning (price traded through → remove; else extend right) ──
    if (bLiqV.length > 0) {
      const qt = bLiqV.length
      for (let bn = qt - 1; bn >= 0; bn--) {
        if (bn < bLiqV.length) {
          const cb = bLiqV[bn]
          const ba = avg(cb.bottom, cb.top)
          const s0 = Math.sign(close[i - 1] - ba)
          if (s0 !== Math.sign(close[i] - ba) || s0 !== Math.sign(low[i] - ba) || s0 !== Math.sign(high[i] - ba)) {
            bLiqV.splice(bn, 1)
          } else {
            cb.right = i + 1
            if (i - cb.left > 21) cb.textColor = 'rgba(120, 123, 134, 0.75)' // color.new(color.gray, 25)
          }
        }
      }
    }
  }

  // ── Emit render model ──
  const lines: BslLine[] = []
  const boxes: BslBox[] = []
  const labels: BslLabel[] = []

  const emit = (list: Liq[], above: boolean) => {
    for (const x of list) {
      if (!Number.isFinite(x.lnY1)) continue
      // solid level segment
      lines.push({ x1: x.lnX1, p1: x.lnY1, x2: x.lnX2, p2: x.lnY2, color: pineColor(x.color, 0), dotted: false })
      // projected dotted line
      if (Number.isFinite(x.lneX2) && x.lneX2 > x.lnX2) lines.push({ x1: x.lnX2, p1: x.lnY1, x2: x.lneX2, p2: x.lnY1, color: pineColor(x.color, 0), dotted: true })
      // reaction zone (only after breach)
      if (x.bxzOn && Number.isFinite(x.bxzLeft)) boxes.push({ x1: x.bxzLeft, p1: x.bxzTop, x2: x.bxzRight, p2: x.bxzBottom, bg: x.bxzBg })
      // level label
      if (x.txtText) labels.push({ x: x.txtX, p: x.txtP, text: x.txtText, color: x.txtColor, above })
    }
  }
  emit(bLiqB, true)   // buyside label sits above the line (Pine valign bottom)
  emit(bLiqS, false)  // sellside label sits below the line (Pine valign top)

  for (const v of bLiqV) {
    boxes.push({ x1: v.left, p1: v.top, x2: v.right, p2: v.bottom, bg: v.bg })
    if (v.text && v.textColor !== 'rgba(0,0,0,0)') labels.push({ x: v.right, p: avg(v.top, v.bottom), text: v.text.trim(), color: v.textColor, above: false })
  }

  return { lines, boxes, labels }
}
