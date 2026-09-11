// ── Current-state feature snapshot from daily candles (trailing-only) ────────
// Production twin of the research feature extraction: same definitions that
// were validated in Phases 1-4, computed for the LATEST bar of a stock.
import {
  adx, atr, bollinger, closes, ema, last, obv, rsi, sma, slope,
} from './indicators.js'
import { findSwings } from './structure.js'

const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(d))

/** Weekly resample (Monday-keyed, completed + current week). */
export function toWeekly(daily) {
  const weeks = []
  let cur = null
  for (const c of daily) {
    const d = new Date(c.time * 1000)
    const day = (d.getUTCDay() + 6) % 7
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - day)
    const key = monday.toISOString().slice(0, 10)
    if (!cur || cur.key !== key) {
      if (cur) weeks.push(cur)
      cur = { key, time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
    } else {
      cur.high = Math.max(cur.high, c.high)
      cur.low = Math.min(cur.low, c.low)
      cur.close = c.close
      cur.volume += c.volume
    }
  }
  if (cur) weeks.push(cur)
  return weeks
}

/** Monthly resample (calendar-month keyed) — for chart display. */
export function toMonthly(daily) {
  const months = []
  let cur = null
  for (const c of daily) {
    const key = new Date(c.time * 1000).toISOString().slice(0, 7)
    if (!cur || cur.key !== key) {
      if (cur) months.push(cur)
      cur = { key, time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
    } else {
      cur.high = Math.max(cur.high, c.high)
      cur.low = Math.min(cur.low, c.low)
      cur.close = c.close
      cur.volume += c.volume
    }
  }
  if (cur) months.push(cur)
  return months
}

/** weeklyUp proxy validated in research: close > weekly EMA20 AND EMA20 rising. */
function weeklyUpAt(weekly, idx) {
  const wc = weekly.map((w) => w.close)
  const e = ema(wc, 20)
  if (idx < 1 || e[idx] == null || e[idx - 1] == null) return null
  return wc[idx] > e[idx] && e[idx] > e[idx - 1]
}

/**
 * BASE_FAST overlay: recompute the "base timeframe" features on 4H candles.
 * Only the daily-derived structure/momentum/volume/200-line features move to 4H.
 * Long-horizon features (prior advance, 52-week context, correction quality),
 * the WEEKLY turn, RS-vs-NIFTY and turnover stay exactly as CURRENT. Returns null
 * if 4H history is too short (caller then keeps the CURRENT daily features).
 */
function fastBlock(fourH) {
  if (!fourH || fourH.length < 210) return null
  const n = fourH.length
  const i = n - 1
  const c = closes(fourH)
  const px = c[i]
  const e20 = ema(c, 20)
  const e50 = ema(c, 50)
  const s200 = sma(c, 200)
  const r = rsi(c, 14)
  const ax = adx(fourH, 14)
  const atrArr = atr(fourH, 14)
  const bb = bollinger(c, 20, 2)
  const obvArr = obv(fourH)

  let bbPct = null
  if (bb.width[i] != null) {
    let cnt = 0; let tot = 0
    for (let k = Math.max(0, i - 119); k <= i; k++) { if (bb.width[k] == null) continue; tot++; if (bb.width[k] <= bb.width[i]) cnt++ }
    if (tot >= 60) bbPct = (cnt / tot) * 100
  }
  const sma20 = sma(c, 20)
  let baseLen = 0
  for (let k = i; k >= 20; k--) { if (sma20[k] && Math.abs(c[k] - sma20[k]) / sma20[k] < 0.08) baseLen++; else break }

  const vol = fourH.map((x) => x.volume)
  const avg = (arr, m) => { const t = arr.slice(-m); return t.length ? t.reduce((a, b) => a + b, 0) / t.length : null }
  const v10 = avg(vol, 10); const v20 = avg(vol, 20); const v50 = avg(vol, 50)
  const dryUpRatio = n >= 50 && v50 ? v10 / v50 : null
  const volRatio = v20 ? vol[i] / v20 : null
  const obvSlope = slope(obvArr.map((v) => v - obvArr[0] + 1e9), 20)

  const swings = findSwings(fourH, 3, 3).filter((s) => s.i + 3 <= i)
  const hs = swings.filter((s) => s.type === 'H')
  const ls = swings.filter((s) => s.type === 'L')
  let trend = 'RANGE'; let choch = false; let higherLow = null
  if (hs.length >= 2 && ls.length >= 2) {
    const hh = hs[hs.length - 1].price > hs[hs.length - 2].price
    const hl = ls[ls.length - 1].price > ls[ls.length - 2].price
    const lh = hs[hs.length - 1].price < hs[hs.length - 2].price
    const ll = ls[ls.length - 1].price < ls[ls.length - 2].price
    trend = hh && hl ? 'UPTREND' : lh && ll ? 'DOWNTREND' : 'RANGE'
    higherLow = hl
    if (trend === 'DOWNTREND' && px > hs[hs.length - 1].price) choch = true
  }
  const above200 = s200[i] != null ? px > s200[i] : null
  const above200Prev = s200[i - 20] != null ? c[i - 20] > s200[i - 20] : null
  const sma200Reclaim = above200 === true && above200Prev === false

  return {
    trend, choch, higherLow, above200, sma200Reclaim,
    bbPct: round(bbPct, 1), baseLen,
    dryUpRatio: round(dryUpRatio, 2), volRatio: round(volRatio, 2), obvSlope: round(obvSlope, 3),
    rsi: round(last(r), 1), adx: round(last(ax.adx), 1),
    atrPct: round(atrArr[i] != null ? (atrArr[i] / px) * 100 : null, 2),
    aboveEma20: e20[i] != null ? px > e20[i] : null,
    aboveEma50: e50[i] != null ? px > e50[i] : null,
  }
}

/**
 * Compute the full validated feature set for the last bar.
 * daily: >= ~450 bars recommended. nifty: daily candles for RS/regime.
 * opts.mode: 'CURRENT' (default) | 'BASE_FAST' (overlays 4H base features when
 * opts.fourH is supplied and long enough).
 */
export function featureSnapshot(daily, nifty, opts = {}) {
  // Graceful degradation: 30 bars is the true minimum (RSI-14, ATR, 20SMA/BB).
  // Everything longer-horizon (BB percentile, dry-up ratio, 200SMA, 52w
  // context, prior advance, weekly trend) is computed only when enough
  // history exists, and null otherwise.
  if (!daily || daily.length < 30) return null
  const n = daily.length
  const i = n - 1
  const c = closes(daily)
  const px = c[i]

  const e20 = ema(c, 20)
  const e50 = ema(c, 50)
  const s200 = sma(c, 200)
  const r = rsi(c, 14)
  const ax = adx(daily, 14)
  const atrArr = atr(daily, 14)
  const bb = bollinger(c, 20, 2)
  const obvArr = obv(daily)

  // BB width trailing percentile (120)
  let bbPct = null
  if (bb.width[i] != null) {
    let cnt = 0
    let tot = 0
    for (let k = Math.max(0, i - 119); k <= i; k++) {
      if (bb.width[k] == null) continue
      tot++
      if (bb.width[k] <= bb.width[i]) cnt++
    }
    if (tot >= 60) bbPct = (cnt / tot) * 100
  }

  // base length: consecutive bars within ±8% of 20SMA
  const sma20 = sma(c, 20)
  let baseLen = 0
  for (let k = i; k >= 20; k--) {
    if (sma20[k] && Math.abs(c[k] - sma20[k]) / sma20[k] < 0.08) baseLen++
    else break
  }

  // volume behaviour
  const vol = daily.map((x) => x.volume)
  const avg = (arr, m) => {
    const t = arr.slice(-m)
    return t.length ? t.reduce((a, b) => a + b, 0) / t.length : null
  }
  const v10 = avg(vol, 10)
  const v20 = avg(vol, 20)
  const v50 = avg(vol, 50)
  // dry-up is defined as 10d/50d — meaningless with fewer than 50 bars
  const dryUpRatio = n >= 50 && v50 ? v10 / v50 : null
  const volRatio = v20 ? vol[i] / v20 : null

  const obvSlope = slope(obvArr.map((v) => v - obvArr[0] + 1e9), 20)

  // structure: confirmed swings only (3-bar pivots)
  const swings = findSwings(daily, 3, 3).filter((s) => s.i + 3 <= i)
  const hs = swings.filter((s) => s.type === 'H')
  const ls = swings.filter((s) => s.type === 'L')
  let trend = 'RANGE'
  let choch = false
  let higherLow = null
  if (hs.length >= 2 && ls.length >= 2) {
    const hh = hs[hs.length - 1].price > hs[hs.length - 2].price
    const hl = ls[ls.length - 1].price > ls[ls.length - 2].price
    const lh = hs[hs.length - 1].price < hs[hs.length - 2].price
    const ll = ls[ls.length - 1].price < ls[ls.length - 2].price
    trend = hh && hl ? 'UPTREND' : lh && ll ? 'DOWNTREND' : 'RANGE'
    higherLow = hl
    if (trend === 'DOWNTREND' && px > hs[hs.length - 1].price) choch = true
  }

  // 52w context + decline duration (whatever window exists, capped at 250)
  const tail = daily.slice(-250)
  const fullYearWindow = tail.length >= 250
  let hi52 = -Infinity
  let lo52 = Infinity
  let hiIdx = 0
  tail.forEach((x, k) => {
    if (x.high > hi52) { hi52 = x.high; hiIdx = k }
    if (x.low < lo52) lo52 = x.low
  })
  const fromHighPct = ((px - hi52) / hi52) * 100
  const fromLowPct = ((px - lo52) / lo52) * 100
  const barsSinceHigh = tail.length - 1 - hiIdx

  // prior advance & rsi recovery & tightness
  const priorGain120 = n > 120 && c[i - 120] ? ((px / c[i - 120]) - 1) * 100 : null
  let minR30 = Infinity
  for (let k = Math.max(0, i - 30); k <= i; k++) if (r[k] != null && r[k] < minR30) minR30 = r[k]
  const rsiRecovery = r[i] != null && minR30 < 35 && r[i] > 50
  let hi20p = -Infinity
  let lo20p = Infinity
  for (let k = i - 19; k <= i; k++) {
    if (daily[k].high > hi20p) hi20p = daily[k].high
    if (daily[k].low < lo20p) lo20p = daily[k].low
  }
  const rangeTight20 = ((hi20p - lo20p) / px) * 100

  // ── Correction Quality grade (v2.1 — Phase-5b validated; cuts FROZEN) ──────
  // Computed only in the rest-after-run context (prior advance ≥30% + base ≥10).
  // Frozen dev-tercile cuts from research-report-phase5b.md:
  const Q_CUTS = {
    pathEfficiency: { good: 0.0694, bad: 0.1771 },
    volDownCorr: { good: -0.0326, bad: 0.1940 },
    retracement: { good: 0.3478, bad: 0.4985 },
  }
  let correctionQuality = null
  let correctionQualityDetail = null
  if (priorGain120 != null && priorGain120 >= 30 && baseLen >= 10) {
    const bStart = i - baseLen + 1
    let peak = Math.max(0, bStart - 60)
    for (let k = Math.max(0, bStart - 60); k <= bStart; k++) if (daily[k].high > daily[peak].high) peak = k
    if (i - peak >= 5) {
      let pathSum = 0
      let minLowC = Infinity
      const xs = []
      const ys = []
      for (let k = peak + 1; k <= i; k++) {
        pathSum += Math.abs(c[k] - c[k - 1])
        minLowC = Math.min(minLowC, daily[k].low)
        xs.push(vol[k])
        ys.push(Math.max(0, -(c[k] - c[k - 1])))
      }
      const pathEfficiency = pathSum > 0 ? Math.abs(c[i] - c[peak]) / pathSum : null
      let volDownCorr = null
      if (xs.length >= 5) {
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length
        const my = ys.reduce((a, b) => a + b, 0) / ys.length
        let num = 0, dx = 0, dy = 0
        for (let k = 0; k < xs.length; k++) { num += (xs[k] - mx) * (ys[k] - my); dx += (xs[k] - mx) ** 2; dy += (ys[k] - my) ** 2 }
        volDownCorr = dx && dy ? num / Math.sqrt(dx * dy) : null
      }
      const peakHigh = daily[peak].high
      const advStart = Math.max(0, peak - 120)
      const advRange = peakHigh - c[advStart]
      const retracement = advRange > 0 ? (peakHigh - minLowC) / advRange : null
      let score = 0
      for (const [dim, v] of [['pathEfficiency', pathEfficiency], ['volDownCorr', volDownCorr], ['retracement', retracement]]) {
        if (v == null || !Number.isFinite(v)) continue
        if (v <= Q_CUTS[dim].good) score++
        else if (v >= Q_CUTS[dim].bad) score--
      }
      correctionQuality = score >= 2 ? 'A' : score <= -2 ? 'C' : 'B'
      correctionQualityDetail = {
        pathEfficiency: round(pathEfficiency, 4),
        volDownCorr: round(volDownCorr, 4),
        retracement: round(retracement, 4),
      }
    }
  }

  // gap-up frequency — INSTRUMENTATION ONLY (CRI forward confirmation pending;
  // validated 1.24×/1.26× out-of-sample but may proxy small-cap volatility)
  let gaps20 = 0
  for (let k = Math.max(1, i - 19); k <= i; k++) if (daily[k].open >= c[k - 1] * 1.01) gaps20++
  const gapUpFreq20 = round(gaps20 / 20, 2)

  // weekly state + TURN (now vs ~4 completed weeks ago); null when <~21 weeks
  const weekly = toWeekly(daily)
  const wi = weekly.length - 1
  const weeklyUp = weeklyUpAt(weekly, wi)
  const weeklyUpPrev = wi >= 4 ? weeklyUpAt(weekly, wi - 4) : null
  const weeklyTurn = weeklyUp === true && weeklyUpPrev === false

  // 200SMA state + reclaim (now vs 20 bars ago)
  const above200 = s200[i] != null ? px > s200[i] : null
  const above200Prev = s200[i - 20] != null ? c[i - 20] > s200[i - 20] : null
  const sma200Reclaim = above200 === true && above200Prev === false

  // RS vs NIFTY (ratio slope on shared dates)
  let rs20 = null
  let rs60 = null
  let regimeUp = null
  if (nifty?.length) {
    const dateOf = (x) => new Date(x.time * 1000).toISOString().slice(0, 10)
    const byDay = new Map(nifty.map((x) => [dateOf(x), x.close]))
    const ratio = []
    for (const x of daily) {
      const b = byDay.get(dateOf(x))
      if (b) ratio.push(x.close / b)
    }
    if (ratio.length >= 60) {
      rs20 = slope(ratio, 20)
      rs60 = slope(ratio, 60)
    }
    const ns = sma(closes(nifty), 200)
    const lastN = ns[ns.length - 1]
    if (lastN != null) regimeUp = nifty[nifty.length - 1].close > lastN
  }

  const snap = {
    price: round(px),
    date: new Date(daily[i].time * 1000).toISOString().slice(0, 10),
    historyBars: n,
    historyComplete: n >= 260 && fullYearWindow,
    trend,
    choch,
    higherLow,
    weeklyUp,
    weeklyTurn,
    above200,
    sma200Reclaim,
    priorGain120: round(priorGain120, 1),
    bbPct: round(bbPct, 1),
    baseLen,
    correctionQuality,
    correctionQualityDetail,
    gapUpFreq20,
    rangeTight20: round(rangeTight20, 1),
    dryUpRatio: round(dryUpRatio, 2),
    volRatio: round(volRatio, 2),
    obvSlope: round(obvSlope, 3),
    rsi: round(last(r), 1),
    adx: round(last(ax.adx), 1),
    atrPct: round(atrArr[i] != null ? (atrArr[i] / px) * 100 : null, 2),
    fromHighPct: round(fromHighPct, 1),
    fromLowPct: round(fromLowPct, 1),
    barsSinceHigh,
    rsiRecovery,
    rs20: round(rs20, 3),
    rs60: round(rs60, 3),
    regimeUp,
    turnoverCr: round((px * (v20 ?? 0)) / 1e7, 2), // 20-day avg daily turnover, ₹ crore
    aboveEma20: e20[i] != null ? px > e20[i] : null,
    aboveEma50: e50[i] != null ? px > e50[i] : null,
    tfMode: 'CURRENT',
  }
  // BASE_FAST: overlay 4H base-timeframe features (weekly turn + long-horizon
  // features stay as CURRENT). Silently keeps CURRENT if 4H is too short.
  if (opts.mode === 'BASE_FAST') {
    const fb = fastBlock(opts.fourH)
    if (fb) { Object.assign(snap, fb); snap.tfMode = 'BASE_FAST' }
  }
  return snap
}
