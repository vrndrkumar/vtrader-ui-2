// ── Per-bar feature computation with strict no-look-ahead ────────────────────
// Every value at bar i uses ONLY bars ≤ i. Swing pivots count as confirmed
// `RIGHT` bars after they form. Rolling percentiles use trailing windows.
import {
  adx, atr, bollinger, closes, cmf, ema, macd, obv, rsi, sma,
} from '../src/indicators.js'
import { RESEARCH } from './config.js'

const RIGHT = 3
const LEFT = 3

function trailingSlope(values, i, period) {
  if (i + 1 < period) return null
  let num = 0
  let den = 0
  const xMean = (period - 1) / 2
  let yMean = 0
  for (let k = 0; k < period; k++) yMean += values[i - period + 1 + k]
  yMean /= period
  for (let k = 0; k < period; k++) {
    const y = values[i - period + 1 + k]
    num += (k - xMean) * (y - yMean)
    den += (k - xMean) ** 2
  }
  const m = den ? num / den : 0
  return yMean ? (m / yMean) * 100 : 0
}

/** Pivots (unconfirmed index = center bar; confirmed at center+RIGHT). */
function pivots(candles) {
  const out = []
  for (let i = LEFT; i < candles.length - RIGHT; i++) {
    let isH = true
    let isL = true
    for (let k = i - LEFT; k <= i + RIGHT; k++) {
      if (candles[k].high > candles[i].high) isH = false
      if (candles[k].low < candles[i].low) isL = false
    }
    if (isH) out.push({ i, type: 'H', price: candles[i].high })
    if (isL) out.push({ i, type: 'L', price: candles[i].low })
  }
  return out
}

/** Weekly resample from daily (completed weeks only, keyed by ISO week start). */
function toWeekly(daily) {
  const weeks = []
  let cur = null
  for (const c of daily) {
    const d = new Date(c.time * 1000)
    // Monday-based week key
    const day = (d.getUTCDay() + 6) % 7
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - day)
    const key = monday.toISOString().slice(0, 10)
    if (!cur || cur.key !== key) {
      if (cur) weeks.push(cur)
      cur = { key, time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, lastDailyIdx: 0 }
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

/**
 * Precompute all rolling series for one stock, then extract observations.
 * benchmark: Map(dateStr -> {close, aboveSma200}) for NIFTY.
 * sectorIdx: Map(dateStr -> close) or null.
 * niftyByDate: Map(dateStr -> close).
 */
export function extractObservations(symbol, meta, daily, niftyByDate, niftyRegimeByDate, sectorByDate) {
  const n = daily.length
  const c = closes(daily)
  const dateOf = (i) => new Date(daily[i].time * 1000).toISOString().slice(0, 10)

  const e20 = ema(c, 20)
  const e50 = ema(c, 50)
  const s200 = sma(c, 200)
  const r = rsi(c, 14)
  const m = macd(c)
  const ax = adx(daily, 14)
  const atrArr = atr(daily, 14)
  const bb = bollinger(c, 20, 2)
  const cmfArr = cmf(daily, 20)
  const obvArr = obv(daily)
  const volSma20 = sma(daily.map((x) => x.volume), 20)
  const volSma5 = sma(daily.map((x) => x.volume), 5)
  const volSma10 = sma(daily.map((x) => x.volume), 10)
  const volSma50 = sma(daily.map((x) => x.volume), 50)

  // rolling base length (consecutive bars within ±8% of 20SMA)
  const baseLen = new Array(n).fill(0)
  const sma20 = sma(c, 20)
  for (let i = 20; i < n; i++) {
    baseLen[i] = sma20[i] && Math.abs(c[i] - sma20[i]) / sma20[i] < 0.08 ? baseLen[i - 1] + 1 : 0
  }

  // trailing BB width percentile (window 120)
  const bbPct = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (bb.width[i] == null) continue
    let cnt = 0
    let tot = 0
    for (let k = Math.max(0, i - 119); k <= i; k++) {
      if (bb.width[k] == null) continue
      tot++
      if (bb.width[k] <= bb.width[i]) cnt++
    }
    if (tot >= 60) bbPct[i] = (cnt / tot) * 100
  }

  // structure state per bar from confirmed pivots
  const pv = pivots(daily)
  const trendArr = new Array(n).fill('RANGE')
  const bosArr = new Array(n).fill(false)
  const chochArr = new Array(n).fill(false)
  const higherLowArr = new Array(n).fill(null) // last confirmed swing low > previous
  {
    let p = 0
    const hs = []
    const ls = []
    for (let i = 0; i < n; i++) {
      while (p < pv.length && pv[p].i + RIGHT <= i) {
        if (pv[p].type === 'H') hs.push(pv[p])
        else ls.push(pv[p])
        p++
      }
      if (ls.length >= 2) higherLowArr[i] = ls[ls.length - 1].price > ls[ls.length - 2].price
      if (hs.length >= 2 && ls.length >= 2) {
        const hh = hs[hs.length - 1].price > hs[hs.length - 2].price
        const hl = ls[ls.length - 1].price > ls[ls.length - 2].price
        const lh = hs[hs.length - 1].price < hs[hs.length - 2].price
        const ll = ls[ls.length - 1].price < ls[ls.length - 2].price
        const trend = hh && hl ? 'UPTREND' : lh && ll ? 'DOWNTREND' : 'RANGE'
        trendArr[i] = trend
        const lastH = hs[hs.length - 1].price
        const lastL = ls[ls.length - 1].price
        bosArr[i] = (trend === 'UPTREND' && c[i] > lastH) || (trend === 'DOWNTREND' && c[i] < lastL) || (trend === 'RANGE' && c[i] > lastH)
        chochArr[i] = (trend === 'DOWNTREND' && c[i] > lastH) || (trend === 'UPTREND' && c[i] < lastL)
      }
    }
  }

  // weekly uptrend proxy per daily bar: last completed week close > weekly EMA20 (rising)
  const weekly = toWeekly(daily)
  const wc = weekly.map((w) => w.close)
  const wEma20 = ema(wc, 20)
  const weeklyUpByTime = [] // [{time, up}]
  for (let i = 1; i < weekly.length; i++) {
    const up = wEma20[i] != null && wEma20[i - 1] != null && wc[i] > wEma20[i] && wEma20[i] > wEma20[i - 1]
    weeklyUpByTime.push({ time: weekly[i].time, up })
  }
  const weeklyUpAt = (t) => {
    let up = false
    for (const w of weeklyUpByTime) {
      if (w.time <= t) up = w.up
      else break
    }
    return up
  }

  // RS ratio vs NIFTY on shared dates
  const ratio = []
  const ratioIdxByBar = new Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    const b = niftyByDate.get(dateOf(i))
    if (b) {
      ratio.push(c[i] / b)
      ratioIdxByBar[i] = ratio.length - 1
    } else {
      ratioIdxByBar[i] = ratio.length - 1
    }
  }
  // sector ratio vs NIFTY
  const secRatio = []
  const secIdxByBar = new Array(n).fill(-1)
  if (sectorByDate) {
    for (let i = 0; i < n; i++) {
      const d = dateOf(i)
      const s = sectorByDate.get(d)
      const b = niftyByDate.get(d)
      if (s && b) {
        secRatio.push(s / b)
        secIdxByBar[i] = secRatio.length - 1
      } else {
        secIdxByBar[i] = secRatio.length - 1
      }
    }
  }

  // 52w trailing extremes (+ bars since that high — decline duration)
  const fromLow = new Array(n).fill(null)
  const fromHigh = new Array(n).fill(null)
  const barsSinceHigh = new Array(n).fill(null)
  for (let i = 250; i < n; i++) {
    let hi = -Infinity
    let lo = Infinity
    let hiIdx = i
    for (let k = i - 249; k <= i; k++) {
      if (daily[k].high > hi) { hi = daily[k].high; hiIdx = k }
      if (daily[k].low < lo) lo = daily[k].low
    }
    fromLow[i] = ((c[i] - lo) / lo) * 100
    fromHigh[i] = ((c[i] - hi) / hi) * 100
    barsSinceHigh[i] = i - hiIdx
  }

  const obs = []
  const start = RESEARCH.warmupBars
  const end = n - RESEARCH.forwardBars - 1
  for (let i = start; i <= end; i += RESEARCH.stride) {
    // labels
    let maxHigh = -Infinity
    let minLow = Infinity
    let peakK = 0
    for (let k = i + 1; k <= i + RESEARCH.forwardBars; k++) {
      if (daily[k].high > maxHigh) { maxHigh = daily[k].high; peakK = k - i }
      if (daily[k].low < minLow) minLow = daily[k].low
    }
    const fwdGain = ((maxHigh - c[i]) / c[i]) * 100
    const fwdDD = ((minLow - c[i]) / c[i]) * 100

    const ri = ratioIdxByBar[i]
    const rs20 = ri >= 19 ? trailingSlope(ratio, ri, 20) : null
    const rs60 = ri >= 59 ? trailingSlope(ratio, ri, 60) : null
    const si = secIdxByBar[i]
    const sec20 = sectorByDate && si >= 19 ? trailingSlope(secRatio, si, 20) : null

    const dryUp = volSma50[i] ? (volSma10[i] ?? 0) / volSma50[i] : null
    const obvSlope20 = trailingSlope(obvArr.map((v) => v - obvArr[0] + 1e9), i, 20)

    // Phase-3 signals (all trailing-only)
    // RSI recovery: dipped below 35 within the last 30 bars AND now back above 50
    let rsiRecovery = null
    if (r[i] != null) {
      let minR = Infinity
      for (let k = Math.max(0, i - 30); k <= i; k++) if (r[k] != null && r[k] < minR) minR = r[k]
      rsiRecovery = minR < 35 && r[i] > 50
    }
    // Prior advance (VCP precondition): % gain over the 120 bars before today
    const priorGain120 = i >= 120 && c[i - 120] ? +(((c[i] / c[i - 120]) - 1) * 100).toFixed(1) : null
    // Range tightness: 20-bar high-low span as % of price
    let hi20 = -Infinity
    let lo20 = Infinity
    for (let k = i - 19; k <= i; k++) {
      if (daily[k].high > hi20) hi20 = daily[k].high
      if (daily[k].low < lo20) lo20 = daily[k].low
    }
    const rangeTight20 = c[i] ? +(((hi20 - lo20) / c[i]) * 100).toFixed(1) : null

    obs.push({
      symbol,
      sector: meta?.sector ?? null,
      date: dateOf(i),
      barIndex: i, // enables phase-2 multi-window forward analysis
      price: c[i],
      // raw features (for threshold sweeps)
      bbPct: bbPct[i],
      rsi: r[i],
      adx: ax.adx[i],
      atrPct: atrArr[i] != null ? (atrArr[i] / c[i]) * 100 : null,
      volRatio: volSma20[i] ? daily[i].volume / volSma20[i] : null,
      relVolAccel: volSma20[i] && volSma5[i] != null ? volSma5[i] / volSma20[i] : null,
      dryUpRatio: dryUp,
      baseLen: baseLen[i],
      cmf: cmfArr[i],
      obvSlope: obvSlope20,
      rs20,
      rs60,
      sectorRs20: sec20,
      fromLowPct: fromLow[i],
      fromHighPct: fromHigh[i],
      barsSinceHigh: barsSinceHigh[i],
      macdHist: m.hist[i],
      turnoverCr: (c[i] * daily[i].volume) / 1e7,
      rsiRecovery,
      higherLow: higherLowArr[i],
      priorGain120,
      rangeTight20,
      // state features
      trend: trendArr[i],
      bos: bosArr[i],
      choch: chochArr[i],
      weeklyUp: weeklyUpAt(daily[i].time),
      aboveSma200: s200[i] != null ? c[i] > s200[i] : null,
      aboveEma20: e20[i] != null ? c[i] > e20[i] : null,
      aboveEma50: e50[i] != null ? c[i] > e50[i] : null,
      regimeUp: niftyRegimeByDate.get(dateOf(i)) ?? null,
      // labels
      fwdGain: +fwdGain.toFixed(2),
      fwdDD: +fwdDD.toFixed(2),
      peakBars: peakK,
    })
  }
  return obs
}

/** V1 Explosion score reconstructed per observation (backtestable subset). */
export function v1Score(o) {
  let s = 0
  const compressed = o.bbPct != null && o.bbPct <= 30 && o.baseLen >= 10
  if (compressed) s += 18
  else if (o.bbPct != null && o.bbPct <= 40) s += 8
  if (o.cmf != null && o.cmf > 0.05) s += 8
  if (o.obvSlope != null && o.obvSlope > 0) s += 6
  if (o.volRatio != null && o.volRatio >= 1.4) s += 6
  else if (o.volRatio != null && o.volRatio < 0.7 && compressed) s += 4
  if (o.rs20 != null && o.rs60 != null) {
    if (o.rs20 > o.rs60 && o.rs20 > 0) s += 15
    else if (o.rs20 > 0) s += 9
    else if (o.rs20 > o.rs60) s += 6
  }
  if (o.choch && o.trend === 'DOWNTREND') s += 12
  else if (o.bos && o.trend !== 'DOWNTREND') s += 10
  else if (o.trend === 'RANGE' && o.weeklyUp) s += 7
  const aligned = [o.trend === 'UPTREND', o.weeklyUp, o.aboveEma50, o.aboveSma200].filter(Boolean).length
  if (aligned >= 3) s += 10
  else if (aligned === 2) s += 5
  if (o.fromLowPct != null && o.fromLowPct > 80 && o.rsi != null && o.rsi > 72) s -= 12
  return Math.max(0, Math.min(100, s))
}
