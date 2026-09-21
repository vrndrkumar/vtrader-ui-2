// ── Smart Money Concepts [LuxAlgo] — faithful logic port ─────────────────────
// A 1:1 re-implementation of the Pine v5 script's execution: we simulate Pine's
// bar-by-bar evaluation over the candle array, keeping the same persistent (`var`)
// state and the same statement order, and emit a render model. The logic is not
// changed in any way — only the drawing primitives are translated to a model the
// klinecharts indicator paints. MTF (request.security) pieces are reproduced by
// resampling the loaded candles (per the chosen data source).

import type { Candle } from '../../types/market'
import type { SmcInputs, SmcModel, SmcLine, SmcBox, SmcLabel, LabelSize } from './types'
import { MONO_BULLISH, MONO_BEARISH, pineColor } from './defaults'

const BULLISH_LEG = 1
const BEARISH_LEG = 0
const BULLISH = 1
const BEARISH = -1
const HISTORICAL = 'Historical'
const PRESENT = 'Present'
const ALL = 'All'
const BOS = 'BOS'
const CHOCH = 'CHoCH'

interface Pivot { currentLevel: number; lastLevel: number; crossed: boolean; barTime: number; barIndex: number; prevLevel: number }
interface OrderBlock { barHigh: number; barLow: number; barTime: number; bias: number }
interface FVG { top: number; bottom: number; bias: number; boxes: SmcBox[] }

const newPivot = (): Pivot => ({ currentLevel: NaN, lastLevel: NaN, crossed: false, barTime: 0, barIndex: 0, prevLevel: NaN })

/** Rolling highest of `values[from..to]` inclusive (to = current index). */
function highestIn(values: number[], to: number, size: number): number {
  let m = -Infinity
  for (let k = Math.max(0, to - size + 1); k <= to; k++) if (values[k] > m) m = values[k]
  return m
}
function lowestIn(values: number[], to: number, size: number): number {
  let m = Infinity
  for (let k = Math.max(0, to - size + 1); k <= to; k++) if (values[k] < m) m = values[k]
  return m
}
function argmax(a: number[]): number { let bi = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i; return bi }
function argmin(a: number[]): number { let bi = 0; for (let i = 1; i < a.length; i++) if (a[i] < a[bi]) bi = i; return bi }

/** ta.atr(length) = RMA of true range. */
function atrSeries(high: number[], low: number[], close: number[], length: number): number[] {
  const n = high.length
  const tr = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    if (i === 0) tr[i] = high[i] - low[i]
    else tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]))
  }
  const out = new Array<number>(n).fill(NaN)
  const alpha = 1 / length
  let rma = NaN
  for (let i = 0; i < n; i++) {
    if (i < length - 1) { continue }
    if (i === length - 1) { let s = 0; for (let k = 0; k < length; k++) s += tr[k]; rma = s / length }
    else rma = alpha * tr[i] + (1 - alpha) * rma
    out[i] = rma
  }
  return out
}

interface SlotItem<T> { slot: string; item: T }

export function computeSmc(candles: Candle[], I: SmcInputs, chartTfMinutes: number): SmcModel {
  const n = candles.length
  if (n < 3) return { lines: [], boxes: [], labels: [], candleColors: [], colorCandles: I.showTrend }

  const open = candles.map((c) => c.open)
  const high = candles.map((c) => c.high)
  const low = candles.map((c) => c.low)
  const close = candles.map((c) => c.close)
  const time = candles.map((c) => c.timestamp)
  const dtLast = Math.max(1, time[n - 1] - time[n - 2])
  const lastBarTime = time[n - 1]
  const lastBarIndex = n - 1
  const initialTime = time[0]

  // Derived colors (Pine `var` color assignments).
  const swingBullishColor = I.style === 'Monochrome' ? MONO_BULLISH : I.swingBullColor
  const swingBearishColor = I.style === 'Monochrome' ? MONO_BEARISH : I.swingBearColor
  const fvgBullColor = I.style === 'Monochrome' ? pineColor(MONO_BULLISH, 70) : I.fairValueGapsBullColor
  const fvgBearColor = I.style === 'Monochrome' ? pineColor(MONO_BEARISH, 70) : I.fairValueGapsBearColor
  const premiumZoneColor = I.style === 'Monochrome' ? MONO_BEARISH : I.premiumZoneColor
  const discountZoneColor = I.style === 'Monochrome' ? MONO_BULLISH : I.discountZoneColor

  // ATR(200) — volatility measure.
  const atr = atrSeries(high, low, close, 200)

  // Parsed high/low arrays (high-volatility bars invert to trap order blocks).
  const parsedHighs: number[] = []
  const parsedLows: number[] = []
  const cumTr: number[] = []
  { // cumulative true range for the RANGE order-block filter (ta.cum(ta.tr)/bar_index)
    let acc = 0
    for (let i = 0; i < n; i++) {
      const tr = i === 0 ? high[i] - low[i] : Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]))
      acc += tr; cumTr[i] = acc
    }
  }
  for (let i = 0; i < n; i++) {
    const vol = I.orderBlockFilter === 'Atr' ? atr[i] : cumTr[i] / i // bar_index == i
    const highVol = (high[i] - low[i]) >= 2 * vol
    parsedHighs[i] = highVol ? low[i] : high[i]
    parsedLows[i] = highVol ? high[i] : low[i]
  }

  // ── persistent state ──
  const swingHigh = newPivot(), swingLow = newPivot()
  const internalHigh = newPivot(), internalLow = newPivot()
  const equalHigh = newPivot(), equalLow = newPivot()
  let swingBias = 0, internalBias = 0
  const trailing = { top: NaN, bottom: NaN, barTime: 0, barIndex: 0, lastTopTime: 0, lastBottomTime: 0 }
  const swingOrderBlocks: OrderBlock[] = []
  const internalOrderBlocks: OrderBlock[] = []
  const fairValueGaps: FVG[] = []
  // per-size leg state (swing/internal/equal are distinct call stacks in Pine)
  const legState: Record<number, { leg: number; prev: number }> = {}
  const getLeg = (size: number, i: number): { leg: number; changed: number } => {
    const st = legState[size] ?? (legState[size] = { leg: 0, prev: 0 })
    st.prev = st.leg
    if (i >= size) {
      const newLegHigh = high[i - size] > highestIn(high, i, size)
      const newLegLow = low[i - size] < lowestIn(low, i, size)
      if (newLegHigh) st.leg = BEARISH_LEG
      else if (newLegLow) st.leg = BULLISH_LEG
    }
    return { leg: st.leg, changed: st.leg - st.prev }
  }

  // Render collections (structure/labels/equal get per-slot Present dedup).
  const structLines: SlotItem<SmcLine>[] = []
  const structLabels: SlotItem<SmcLabel>[] = []
  const swingLabels: SlotItem<SmcLabel>[] = []
  const eqLines: SlotItem<SmcLine>[] = []
  const eqLabels: SlotItem<SmcLabel>[] = []
  const candleColors: (string | null)[] = new Array(n).fill(null)

  // ── drawEqualHighLow ──
  const drawEqualHighLow = (p: Pivot, level: number, size: number, i: number, isHigh: boolean) => {
    const tag = isHigh ? 'EQH' : 'EQL'
    const eqColor = isHigh ? swingBearishColor : swingBullishColor
    const place: SmcLabel['place'] = isHigh ? 'down' : 'up'
    const slot = isHigh ? 'eqh' : 'eql'
    eqLines.push({ slot, item: { t1: p.barTime, p1: p.currentLevel, t2: time[i - size], p2: level, color: eqColor, style: 'dotted' } })
    const labelPos = Math.round(0.5 * (p.barIndex + (i - size)))
    eqLabels.push({ slot, item: { x: labelPos, byIndex: true, p: level, text: tag, color: eqColor, place, size: I.equalHighsLowsSize } })
  }

  // ── getCurrentStructure ──
  const getCurrentStructure = (size: number, i: number, equalHighLow = false, internal = false) => {
    const { changed } = getLeg(size, i)
    if (changed === 0) return
    const pivotLow = changed === +1
    if (pivotLow) {
      const p = equalHighLow ? equalLow : internal ? internalLow : swingLow
      if (equalHighLow && Number.isFinite(p.currentLevel) && Math.abs(p.currentLevel - low[i - size]) < I.equalHighsLowsThreshold * atr[i]) {
        drawEqualHighLow(p, low[i - size], size, i, false)
      }
      p.lastLevel = p.currentLevel
      p.currentLevel = low[i - size]
      p.crossed = false
      p.barTime = time[i - size]
      p.barIndex = i - size
      if (!equalHighLow && !internal) {
        trailing.bottom = p.currentLevel; trailing.barTime = p.barTime; trailing.barIndex = p.barIndex; trailing.lastBottomTime = p.barTime
      }
      if (I.showSwings && !internal && !equalHighLow) {
        swingLabels.push({ slot: 'swlow', item: { x: time[i - size], byIndex: false, p: p.currentLevel, text: p.currentLevel < p.lastLevel ? 'LL' : 'HL', color: swingBullishColor, place: 'up', size: 'tiny' } })
      }
    } else {
      const p = equalHighLow ? equalHigh : internal ? internalHigh : swingHigh
      if (equalHighLow && Number.isFinite(p.currentLevel) && Math.abs(p.currentLevel - high[i - size]) < I.equalHighsLowsThreshold * atr[i]) {
        drawEqualHighLow(p, high[i - size], size, i, true)
      }
      p.lastLevel = p.currentLevel
      p.currentLevel = high[i - size]
      p.crossed = false
      p.barTime = time[i - size]
      p.barIndex = i - size
      if (!equalHighLow && !internal) {
        trailing.top = p.currentLevel; trailing.barTime = p.barTime; trailing.barIndex = p.barIndex; trailing.lastTopTime = p.barTime
      }
      if (I.showSwings && !internal && !equalHighLow) {
        swingLabels.push({ slot: 'swhigh', item: { x: time[i - size], byIndex: false, p: p.currentLevel, text: p.currentLevel > p.lastLevel ? 'HH' : 'LH', color: swingBearishColor, place: 'down', size: 'tiny' } })
      }
    }
  }

  // ── drawStructure ──
  const drawStructure = (p: Pivot, tag: string, color: string, style: SmcLine['style'], place: SmcLabel['place'], size: LabelSize, i: number, slot: string) => {
    structLines.push({ slot, item: { t1: p.barTime, p1: p.currentLevel, t2: time[i], p2: p.currentLevel, color, style } })
    structLabels.push({ slot, item: { x: Math.round(0.5 * (p.barIndex + i)), byIndex: true, p: p.currentLevel, text: tag, color, place, size } })
  }

  // ── storeOrderBlock ──
  const storeOrderBlock = (p: Pivot, internal: boolean, bias: number, i: number) => {
    if (!((!internal && I.showSwingOrderBlocks) || (internal && I.showInternalOrderBlocks))) return
    let parsedIndex: number
    if (bias === BEARISH) {
      const arr = parsedHighs.slice(p.barIndex, i)
      if (!arr.length) return
      parsedIndex = p.barIndex + argmax(arr)
    } else {
      const arr = parsedLows.slice(p.barIndex, i)
      if (!arr.length) return
      parsedIndex = p.barIndex + argmin(arr)
    }
    const ob: OrderBlock = { barHigh: parsedHighs[parsedIndex], barLow: parsedLows[parsedIndex], barTime: time[parsedIndex], bias }
    const list = internal ? internalOrderBlocks : swingOrderBlocks
    if (list.length >= 100) list.pop()
    list.unshift(ob)
  }

  // ── deleteOrderBlocks (mitigation) ──
  const deleteOrderBlocks = (internal: boolean, i: number) => {
    const list = internal ? internalOrderBlocks : swingOrderBlocks
    const bearSrc = I.orderBlockMitigation === 'Close' ? close[i] : high[i]
    const bullSrc = I.orderBlockMitigation === 'Close' ? close[i] : low[i]
    for (let idx = 0; idx < list.length; idx++) {
      const ob = list[idx]
      if ((bearSrc > ob.barHigh && ob.bias === BEARISH) || (bullSrc < ob.barLow && ob.bias === BULLISH)) {
        list.splice(idx, 1); idx--
      }
    }
  }

  // ── displayStructure ──
  const displayStructure = (internal: boolean, i: number) => {
    let bullishBar = true, bearishBar = true
    if (I.internalFilterConfluence) {
      // upper wick vs lower wick (LuxAlgo original)
      bullishBar = (high[i] - Math.max(close[i], open[i])) > (Math.min(close[i], open[i]) - low[i])
      bearishBar = (high[i] - Math.max(close[i], open[i])) < (Math.min(close[i], open[i]) - low[i])
    }
    // ── bullish (crossover of a swing/internal HIGH) ──
    let p = internal ? internalHigh : swingHigh
    const style: SmcLine['style'] = internal ? 'dashed' : 'solid'
    const labelSize = internal ? I.internalStructureSize : I.swingStructureSize
    let extra = internal ? (internalHigh.currentLevel !== swingHigh.currentLevel && bullishBar) : true
    const bullishColor = I.style === 'Monochrome' ? MONO_BULLISH : internal ? I.internalBullColor : I.swingBullColor
    const crossedOver = Number.isFinite(p.currentLevel) && Number.isFinite(p.prevLevel) && close[i] > p.currentLevel && close[i - 1] <= p.prevLevel
    if (crossedOver && !p.crossed && extra) {
      const bias = internal ? internalBias : swingBias
      const tag = bias === BEARISH ? CHOCH : BOS
      p.crossed = true
      if (internal) internalBias = BULLISH; else swingBias = BULLISH
      const mode = internal ? I.showInternalBull : I.showSwingBull
      const displayCond = internal
        ? I.showInternals && (mode === ALL || (mode === BOS && tag !== CHOCH) || (mode === CHOCH && tag === CHOCH))
        : I.showStructure && (mode === ALL || (mode === BOS && tag !== CHOCH) || (mode === CHOCH && tag === CHOCH))
      if (displayCond) drawStructure(p, tag, bullishColor, style, 'down', labelSize, i, internal ? 'int-bull' : 'sw-bull')
      if ((internal && I.showInternalOrderBlocks) || (!internal && I.showSwingOrderBlocks)) storeOrderBlock(p, internal, BULLISH, i)
    }
    // ── bearish (crossunder of a swing/internal LOW) ──
    p = internal ? internalLow : swingLow
    extra = internal ? (internalLow.currentLevel !== swingLow.currentLevel && bearishBar) : true
    const bearishColor = I.style === 'Monochrome' ? MONO_BEARISH : internal ? I.internalBearColor : I.swingBearColor
    const crossedUnder = Number.isFinite(p.currentLevel) && Number.isFinite(p.prevLevel) && close[i] < p.currentLevel && close[i - 1] >= p.prevLevel
    if (crossedUnder && !p.crossed && extra) {
      const bias = internal ? internalBias : swingBias
      const tag = bias === BULLISH ? CHOCH : BOS
      p.crossed = true
      if (internal) internalBias = BEARISH; else swingBias = BEARISH
      const mode = internal ? I.showInternalBear : I.showSwingBear
      const displayCond = internal
        ? I.showInternals && (mode === ALL || (mode === BOS && tag !== CHOCH) || (mode === CHOCH && tag === CHOCH))
        : I.showStructure && (mode === ALL || (mode === BOS && tag !== CHOCH) || (mode === CHOCH && tag === CHOCH))
      if (displayCond) drawStructure(p, tag, bearishColor, style, 'up', labelSize, i, internal ? 'int-bear' : 'sw-bear')
      if ((internal && I.showInternalOrderBlocks) || (!internal && I.showSwingOrderBlocks)) storeOrderBlock(p, internal, BEARISH, i)
    }
  }

  // ── Fair Value Gaps (chart timeframe or resampled HTF) ──
  const fvgTfMin = tfToMinutes(I.fairValueGapsTimeframe, chartTfMinutes)
  // Build the series the Pine request.security(...) exposes, per bar i (chart) or per HTF bar.
  const drawFvgChart = (i: number, cumAbsDelta: { v: number }) => {
    if (i < 2) return
    const lastClose = close[i - 1], lastOpen = open[i - 1], lastTime = time[i - 1]
    const currentHigh = high[i], currentLow = low[i], currentTime = time[i]
    const last2High = high[i - 2], last2Low = low[i - 2]
    const barDeltaPercent = (lastClose - lastOpen) / (lastOpen * 100)
    const newTf = true // timeframe.change('') is true each bar
    cumAbsDelta.v += Math.abs(newTf ? barDeltaPercent : 0)
    const threshold = I.fairValueGapsThreshold ? (cumAbsDelta.v / i) * 2 : 0
    const dt = i > 0 ? time[i] - time[i - 1] : dtLast
    const right = currentTime + I.fairValueGapsExtend * dt
    if (currentLow > last2High && lastClose > last2High && barDeltaPercent > threshold && newTf) {
      const mid = (currentLow + last2High) / 2
      const boxes: SmcBox[] = [
        { t1: lastTime, p1: currentLow, t2: right, p2: mid, bg: fvgBullColor, border: fvgBullColor },
        { t1: lastTime, p1: mid, t2: right, p2: last2High, bg: fvgBullColor, border: fvgBullColor },
      ]
      fairValueGaps.unshift({ top: currentLow, bottom: last2High, bias: BULLISH, boxes })
    }
    if (currentHigh < last2Low && lastClose < last2Low && -barDeltaPercent > threshold && newTf) {
      const mid = (currentHigh + last2Low) / 2
      const boxes: SmcBox[] = [
        { t1: lastTime, p1: currentHigh, t2: right, p2: mid, bg: fvgBearColor, border: fvgBearColor },
        { t1: lastTime, p1: mid, t2: right, p2: last2Low, bg: fvgBearColor, border: fvgBearColor },
      ]
      fairValueGaps.unshift({ top: currentHigh, bottom: last2Low, bias: BEARISH, boxes })
    }
  }
  const deleteFvg = (i: number) => {
    for (let idx = 0; idx < fairValueGaps.length; idx++) {
      const g = fairValueGaps[idx]
      if ((low[i] < g.bottom && g.bias === BULLISH) || (high[i] > g.top && g.bias === BEARISH)) { fairValueGaps.splice(idx, 1); idx-- }
    }
  }

  // ── MTF FVG via resampled HTF candles (only when a non-chart timeframe is set) ──
  const htfFvgBoxes: SmcBox[] = []
  if (I.showFairValueGaps && fvgTfMin > chartTfMinutes) {
    resampleFvg(candles, fvgTfMin, I, fvgBullColor, fvgBearColor).forEach((b) => htfFvgBoxes.push(b))
  }

  // ── main bar loop (mirrors Pine's per-bar execution order) ──
  const cumAbsDelta = { v: 0 }
  for (let i = 0; i < n; i++) {
    // plotcandle color (uses internalBias as-of start of this bar)
    if (I.showTrend) candleColors[i] = internalBias === BULLISH ? swingBullishColor : swingBearishColor

    // trailing extremes update (Pine updateTrailingExtremes)
    if (I.showHighLowSwings || I.showPremiumDiscountZones) {
      trailing.top = Math.max(high[i], Number.isFinite(trailing.top) ? trailing.top : -Infinity)
      trailing.lastTopTime = trailing.top === high[i] ? time[i] : trailing.lastTopTime
      trailing.bottom = Math.min(low[i], Number.isFinite(trailing.bottom) ? trailing.bottom : Infinity)
      trailing.lastBottomTime = trailing.bottom === low[i] ? time[i] : trailing.lastBottomTime
    }

    if (I.showFairValueGaps) deleteFvg(i)

    getCurrentStructure(I.swingsLength, i, false, false)
    getCurrentStructure(5, i, false, true)
    if (I.showEqualHighsLows) getCurrentStructure(I.equalHighsLowsLength, i, true, false)

    if (I.showInternals || I.showInternalOrderBlocks || I.showTrend) displayStructure(true, i)
    if (I.showStructure || I.showSwingOrderBlocks || I.showHighLowSwings) displayStructure(false, i)

    if (I.showInternalOrderBlocks) deleteOrderBlocks(true, i)
    if (I.showSwingOrderBlocks) deleteOrderBlocks(false, i)

    if (I.showFairValueGaps && fvgTfMin <= chartTfMinutes) drawFvgChart(i, cumAbsDelta)

    // snapshot prevLevel for next bar's crossover/crossunder detection
    swingHigh.prevLevel = swingHigh.currentLevel; swingLow.prevLevel = swingLow.currentLevel
    internalHigh.prevLevel = internalHigh.currentLevel; internalLow.prevLevel = internalLow.currentLevel
  }

  // ── assemble render model ──
  const present = I.mode === PRESENT
  const dedup = <T,>(items: SlotItem<T>[]): T[] => {
    if (!present) return items.map((s) => s.item)
    const bySlot = new Map<string, T>()
    for (const s of items) bySlot.set(s.slot, s.item) // keep last per slot
    return [...bySlot.values()]
  }

  const lines: SmcLine[] = [...dedup(structLines), ...dedup(eqLines)]
  const labels: SmcLabel[] = [...dedup(structLabels), ...dedup(swingLabels), ...dedup(eqLabels)]
  const boxes: SmcBox[] = []

  // Order blocks (final list state, top N).
  const emitOB = (internal: boolean) => {
    const list = internal ? internalOrderBlocks : swingOrderBlocks
    const maxN = internal ? I.internalOrderBlocksSize : I.swingOrderBlocksSize
    const parsed = list.slice(0, Math.min(maxN, list.length))
    for (const ob of parsed) {
      const color = I.style === 'Monochrome'
        ? (ob.bias === BEARISH ? pineColor(MONO_BEARISH, 80) : pineColor(MONO_BULLISH, 80))
        : internal
          ? (ob.bias === BEARISH ? I.internalBearishOrderBlockColor : I.internalBullishOrderBlockColor)
          : (ob.bias === BEARISH ? I.swingBearishOrderBlockColor : I.swingBullishOrderBlockColor)
      boxes.push({ t1: ob.barTime, p1: ob.barHigh, t2: lastBarTime, p2: ob.barLow, bg: color, border: internal ? '' : color })
    }
  }
  if (I.showInternalOrderBlocks) emitOB(true)
  if (I.showSwingOrderBlocks) emitOB(false)

  // Fair value gaps (surviving).
  if (I.showFairValueGaps) {
    if (fvgTfMin <= chartTfMinutes) for (const g of fairValueGaps) boxes.push(...g.boxes)
    else boxes.push(...htfFvgBoxes)
  }

  // Premium / Discount zones (final trailing state).
  if (I.showPremiumDiscountZones && Number.isFinite(trailing.top) && Number.isFinite(trailing.bottom)) {
    const t = trailing.top, b = trailing.bottom
    // Premium
    boxes.push({ t1: trailing.barTime, p1: t, t2: lastBarTime, p2: 0.95 * t + 0.05 * b, bg: pineColor(hexOf(premiumZoneColor), 80), border: '' })
    labels.push({ x: Math.round(0.5 * (trailing.barIndex + lastBarIndex)), byIndex: true, p: t, text: 'Premium', color: premiumZoneColor, place: 'down', size: 'small' })
    // Equilibrium
    const eq = (t + b) / 2
    boxes.push({ t1: trailing.barTime, p1: 0.525 * t + 0.475 * b, t2: lastBarTime, p2: 0.525 * b + 0.475 * t, bg: pineColor(hexOf(I.equilibriumZoneColor), 80), border: '' })
    labels.push({ x: lastBarIndex, byIndex: true, p: eq, text: 'Equilibrium', color: I.equilibriumZoneColor, place: 'left', size: 'small' })
    // Discount
    boxes.push({ t1: trailing.barTime, p1: 0.95 * b + 0.05 * t, t2: lastBarTime, p2: b, bg: pineColor(hexOf(discountZoneColor), 80), border: '' })
    labels.push({ x: Math.round(0.5 * (trailing.barIndex + lastBarIndex)), byIndex: true, p: b, text: 'Discount', color: discountZoneColor, place: 'up', size: 'small' })
  }

  // Strong/Weak High & Low (trailing).
  if (I.showHighLowSwings && Number.isFinite(trailing.top) && Number.isFinite(trailing.bottom)) {
    const rightTime = lastBarTime + 20 * dtLast
    lines.push({ t1: trailing.lastTopTime, p1: trailing.top, t2: rightTime, p2: trailing.top, color: swingBearishColor, style: 'solid' })
    labels.push({ x: rightTime, byIndex: false, p: trailing.top, text: swingBias === BEARISH ? 'Strong High' : 'Weak High', color: swingBearishColor, place: 'down', size: 'tiny' })
    lines.push({ t1: trailing.lastBottomTime, p1: trailing.bottom, t2: rightTime, p2: trailing.bottom, color: swingBullishColor, style: 'solid' })
    labels.push({ x: rightTime, byIndex: false, p: trailing.bottom, text: swingBias === BULLISH ? 'Strong Low' : 'Weak Low', color: swingBullishColor, place: 'up', size: 'tiny' })
  }

  // MTF levels (Daily / Weekly / Monthly) via resample.
  const addLevels = (tfMin: number, label: 'D' | 'W' | 'M', style: SmcLine['style'], color: string) => {
    if (chartTfMinutes > tfMin) return // higherTimeframe guard
    const lv = resampleLevels(candles, tfMin, chartTfMinutes)
    if (!lv) return
    const rightTime = lastBarTime + 20 * dtLast
    lines.push({ t1: lv.topTime, p1: lv.top, t2: rightTime, p2: lv.top, color, style })
    lines.push({ t1: lv.bottomTime, p1: lv.bottom, t2: rightTime, p2: lv.bottom, color, style })
    labels.push({ x: rightTime, byIndex: false, p: lv.top, text: `P${label}H`, color, place: 'left', size: 'small' })
    labels.push({ x: rightTime, byIndex: false, p: lv.bottom, text: `P${label}L`, color, place: 'left', size: 'small' })
  }
  if (I.showDailyLevels) addLevels(1440, 'D', I.dailyLevelsStyle, I.dailyLevelsColor)
  if (I.showWeeklyLevels) addLevels(10080, 'W', I.weeklyLevelsStyle, I.weeklyLevelsColor)
  if (I.showMonthlyLevels) addLevels(43200, 'M', I.monthlyLevelsStyle, I.monthlyLevelsColor)

  void initialTime; void HISTORICAL
  return { lines, boxes, labels, candleColors, colorCandles: I.showTrend }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function hexOf(c: string): string { return c.startsWith('#') ? c : '#878b94' } // zone inputs are plain hex

function tfToMinutes(tf: string, chartTfMinutes: number): number {
  if (!tf || !tf.trim()) return chartTfMinutes
  const s = tf.trim().toUpperCase()
  if (s === 'D' || s === '1D') return 1440
  if (s === 'W' || s === '1W') return 10080
  if (s === 'M' || s === '1M') return 43200
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n > 0 ? n : chartTfMinutes
}

/** Prior-period High/Low + the bar time where each occurred (for level anchoring). */
function resampleLevels(candles: Candle[], tfMin: number, chartTfMin: number): { top: number; bottom: number; topTime: number; bottomTime: number } | null {
  const n = candles.length
  if (!n) return null
  const same = tfMin === chartTfMin
  if (same) {
    const last = candles[n - 1]
    return { top: last.high, bottom: last.low, topTime: last.timestamp, bottomTime: last.timestamp }
  }
  const bucket = (t: number) => bucketKey(t, tfMin)
  const curBucket = bucket(candles[n - 1].timestamp)
  // find the previous full period
  let prev = curBucket
  for (let i = n - 1; i >= 0; i--) { const b = bucket(candles[i].timestamp); if (b !== curBucket) { prev = b; break } }
  if (prev === curBucket) return null
  let top = -Infinity, bottom = Infinity, topTime = candles[0].timestamp, bottomTime = candles[0].timestamp
  for (const c of candles) {
    if (bucket(c.timestamp) !== prev) continue
    if (c.high > top) { top = c.high; topTime = c.timestamp }
    if (c.low < bottom) { bottom = c.low; bottomTime = c.timestamp }
  }
  if (!Number.isFinite(top)) return null
  return { top, bottom, topTime, bottomTime }
}

/** Bucket a ms-timestamp into a period key for D/W/M (or minute buckets). */
function bucketKey(ms: number, tfMin: number): number {
  const d = new Date(ms)
  if (tfMin === 1440) return Math.floor(ms / 86400000)
  if (tfMin === 10080) { const day = Math.floor(ms / 86400000); return Math.floor((day + 4) / 7) } // ISO-ish week
  if (tfMin === 43200) return d.getUTCFullYear() * 12 + d.getUTCMonth()
  return Math.floor(ms / (tfMin * 60000))
}

/** Resample candles into HTF buckets, then run the FVG detection on the HTF series. */
function resampleFvg(candles: Candle[], tfMin: number, I: SmcInputs, bull: string, bear: string): SmcBox[] {
  const htf: Candle[] = []
  let cur: Candle | null = null
  let curKey = NaN
  for (const c of candles) {
    const k = bucketKey(c.timestamp, tfMin)
    if (k !== curKey) { if (cur) htf.push(cur); cur = { ...c }; curKey = k }
    else if (cur) { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close }
  }
  if (cur) htf.push(cur)
  const boxes: SmcBox[] = []
  const gaps: FVG[] = []
  let cumAbs = 0
  const dtLast = htf.length > 1 ? htf[htf.length - 1].timestamp - htf[htf.length - 2].timestamp : 86400000
  for (let i = 0; i < htf.length; i++) {
    for (let idx = 0; idx < gaps.length; idx++) {
      const g = gaps[idx]
      if ((htf[i].low < g.bottom && g.bias === BULLISH) || (htf[i].high > g.top && g.bias === BEARISH)) { gaps.splice(idx, 1); idx-- }
    }
    if (i < 2) continue
    const lastClose = htf[i - 1].close, lastOpen = htf[i - 1].open, lastTime = htf[i - 1].timestamp
    const currentHigh = htf[i].high, currentLow = htf[i].low, currentTime = htf[i].timestamp
    const last2High = htf[i - 2].high, last2Low = htf[i - 2].low
    const barDeltaPercent = (lastClose - lastOpen) / (lastOpen * 100)
    cumAbs += Math.abs(barDeltaPercent)
    const threshold = I.fairValueGapsThreshold ? (cumAbs / i) * 2 : 0
    const dt = i > 0 ? htf[i].timestamp - htf[i - 1].timestamp : dtLast
    const right = currentTime + I.fairValueGapsExtend * dt
    if (currentLow > last2High && lastClose > last2High && barDeltaPercent > threshold) {
      const mid = (currentLow + last2High) / 2
      gaps.unshift({ top: currentLow, bottom: last2High, bias: BULLISH, boxes: [{ t1: lastTime, p1: currentLow, t2: right, p2: mid, bg: bull, border: bull }, { t1: lastTime, p1: mid, t2: right, p2: last2High, bg: bull, border: bull }] })
    }
    if (currentHigh < last2Low && lastClose < last2Low && -barDeltaPercent > threshold) {
      const mid = (currentHigh + last2Low) / 2
      gaps.unshift({ top: currentHigh, bottom: last2Low, bias: BEARISH, boxes: [{ t1: lastTime, p1: currentHigh, t2: right, p2: mid, bg: bear, border: bear }, { t1: lastTime, p1: mid, t2: right, p2: last2Low, bg: bear, border: bear }] })
    }
  }
  for (const g of gaps) boxes.push(...g.boxes)
  return boxes
}
