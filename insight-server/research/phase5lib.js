// ── Phase-5: Pattern Evolution — series builder, motif detectors, quality ────
// Implements ONLY the pre-registered definitions in docs/INSIGHT_PHASE5_PROTOCOL.md.
// Definitions are FROZEN; changes require a pre-registered amendment.
import { bollinger, closes, ema, obv, sma } from '../src/indicators.js'
import { forwardStats } from './phase2lib.js'

const RIGHT = 3
const LEFT = 3

function trailingSlope(values, i, period) {
  if (i + 1 < period) return null
  let num = 0, den = 0, yMean = 0
  const xMean = (period - 1) / 2
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

function confirmedPivots(daily) {
  const out = []
  for (let i = LEFT; i < daily.length - RIGHT; i++) {
    let isH = true, isL = true
    for (let k = i - LEFT; k <= i + RIGHT; k++) {
      if (daily[k].high > daily[i].high) isH = false
      if (daily[k].low < daily[i].low) isL = false
    }
    if (isH) out.push({ i, type: 'H', price: daily[i].high, confirmedAt: i + RIGHT })
    if (isL) out.push({ i, type: 'L', price: daily[i].low, confirmedAt: i + RIGHT })
  }
  return out
}

/** Weekly state per bar using COMPLETED weeks only (turn detection needs this). */
function weeklyStateByBar(daily) {
  // resample to weeks (Monday-keyed)
  const weeks = []
  let cur = null
  for (let i = 0; i < daily.length; i++) {
    const d = new Date(daily[i].time * 1000)
    const day = (d.getUTCDay() + 6) % 7
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - day)
    const key = monday.toISOString().slice(0, 10)
    if (!cur || cur.key !== key) {
      if (cur) weeks.push(cur)
      cur = { key, close: daily[i].close, endBar: i }
    } else {
      cur.close = daily[i].close
      cur.endBar = i
    }
  }
  if (cur) weeks.push(cur)
  const wc = weeks.map((w) => w.close)
  const e20 = ema(wc, 20)
  const state = weeks.map((w, wi) =>
    e20[wi] != null && e20[wi - 1] != null ? wc[wi] > e20[wi] && e20[wi] > e20[wi - 1] : null)
  // bar → state of last COMPLETED week; also weekly-turn bars (first bar after a F→T flip)
  const stateByBar = new Array(daily.length).fill(null)
  const turnBars = []
  let wi = 0
  for (let i = 0; i < daily.length; i++) {
    while (wi < weeks.length && weeks[wi].endBar < i) wi++
    const lastCompleted = wi - 1
    stateByBar[i] = lastCompleted >= 0 ? state[lastCompleted] : null
    if (lastCompleted >= 1 && weeks[lastCompleted].endBar === i - 1 &&
        state[lastCompleted] === true && state[lastCompleted - 1] === false) {
      turnBars.push(i)
    }
  }
  return { stateByBar, turnBars }
}

/**
 * Build all per-bar series needed by the motif detectors (trailing-only).
 * nifty: daily candles for down-day RS alignment (may be null).
 */
export function buildSeries(daily, nifty) {
  const n = daily.length
  const c = closes(daily)
  const vol = daily.map((x) => x.volume)
  const sma20 = sma(c, 20)
  const bb = bollinger(c, 20, 2)
  const obvArr = obv(daily)

  const bbPct = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (bb.width[i] == null) continue
    let cnt = 0, tot = 0
    for (let k = Math.max(0, i - 119); k <= i; k++) {
      if (bb.width[k] == null) continue
      tot++
      if (bb.width[k] <= bb.width[i]) cnt++
    }
    if (tot >= 60) bbPct[i] = (cnt / tot) * 100
  }

  const baseFlag = new Array(n).fill(false)
  const baseLen = new Array(n).fill(0)
  for (let i = 20; i < n; i++) {
    baseFlag[i] = !!(sma20[i] && Math.abs(c[i] - sma20[i]) / sma20[i] < 0.08)
    baseLen[i] = baseFlag[i] ? baseLen[i - 1] + 1 : 0
  }

  // rolling volume sums for dry-up + ratios
  const dryUp = new Array(n).fill(null)
  const volRatio = new Array(n).fill(null)
  let s10 = 0, s20 = 0, s50 = 0
  for (let i = 0; i < n; i++) {
    s10 += vol[i]; s20 += vol[i]; s50 += vol[i]
    if (i >= 10) s10 -= vol[i - 10]
    if (i >= 20) s20 -= vol[i - 20]
    if (i >= 50) s50 -= vol[i - 50]
    if (i >= 49) dryUp[i] = (s10 / 10) / (s50 / 50)
    if (i >= 19) volRatio[i] = vol[i] / (s20 / 20)
  }

  const obvSlope = new Array(n).fill(null)
  const obvShift = obvArr.map((v) => v - obvArr[0] + 1e9)
  for (let i = 20; i < n; i++) obvSlope[i] = trailingSlope(obvShift, i, 20)

  const priorGain120 = new Array(n).fill(null)
  for (let i = 120; i < n; i++) if (c[i - 120]) priorGain120[i] = ((c[i] / c[i - 120]) - 1) * 100

  const pivots = confirmedPivots(daily)
  const { stateByBar: weeklyState, turnBars } = weeklyStateByBar(daily)

  // down-day RS: trailing-20-NIFTY-down-day mean stock return
  const downDayRS = new Array(n).fill(null)
  if (nifty?.length) {
    const dateOf = (x) => new Date(x.time * 1000).toISOString().slice(0, 10)
    const nRet = new Map()
    for (let k = 1; k < nifty.length; k++) {
      nRet.set(dateOf(nifty[k]), (nifty[k].close - nifty[k - 1].close) / nifty[k - 1].close)
    }
    const stockRetOnDown = [] // {i, ret}
    for (let i = 1; i < n; i++) {
      const nr = nRet.get(dateOf(daily[i]))
      if (nr != null && nr < 0) stockRetOnDown.push({ i, ret: (c[i] - c[i - 1]) / c[i - 1] })
    }
    let ptr = 0
    const window = []
    for (let i = 0; i < n; i++) {
      while (ptr < stockRetOnDown.length && stockRetOnDown[ptr].i <= i) { window.push(stockRetOnDown[ptr]); ptr++ }
      while (window.length > 20) window.shift()
      if (window.length >= 10) downDayRS[i] = window.reduce((a, b) => a + b.ret, 0) / window.length
    }
  }

  // audit behaviours (participation family) — trailing 20-bar
  const closingRange20 = new Array(n).fill(null)
  const volAsym20 = new Array(n).fill(null)
  const gapUpFreq20 = new Array(n).fill(null)
  for (let i = 20; i < n; i++) {
    let crSum = 0, crN = 0, upV = 0, upN = 0, dnV = 0, dnN = 0, gaps = 0
    for (let k = i - 19; k <= i; k++) {
      const range = daily[k].high - daily[k].low
      if (range > 0) { crSum += (daily[k].close - daily[k].low) / range; crN++ }
      const ret = c[k] - c[k - 1]
      if (ret > 0) { upV += vol[k]; upN++ } else if (ret < 0) { dnV += vol[k]; dnN++ }
      if (daily[k].open >= c[k - 1] * 1.01) gaps++
    }
    if (crN >= 10) closingRange20[i] = crSum / crN
    if (upN >= 3 && dnN >= 3) volAsym20[i] = (upV / upN) / (dnV / dnN)
    gapUpFreq20[i] = gaps / 20
  }

  return {
    n, c, vol, daily, sma20, bbPct, baseFlag, baseLen, dryUp, volRatio, obvSlope,
    priorGain120, pivots, weeklyState, turnBars, downDayRS,
    closingRange20, volAsym20, gapUpFreq20,
  }
}

// ── Base episodes (correction/base segmentation) ─────────────────────────────

export function findEpisodes(S) {
  const eps = []
  let i = 0
  while (i < S.n) {
    if (S.baseLen[i] === 10) {
      const start = i - 9
      let end = i
      while (end + 1 < S.n && S.baseFlag[end + 1]) end++
      // peak: highest high in the 60 bars before base start
      let peak = Math.max(0, start - 60)
      for (let k = Math.max(0, start - 60); k <= start; k++) if (S.daily[k].high > S.daily[peak].high) peak = k
      eps.push({ start, end, peak, signalBar: start + 10 <= end ? start + 10 : end })
      i = end + 1
    } else i++
  }
  return eps
}

// ── Motif detectors (fixed definitions; each returns events {bar, ...}) ──────

const outcome = (daily, bar) => {
  const B = forwardStats(daily, bar, 40, 20)
  const D = forwardStats(daily, bar, 120, 50)
  return B ? { winB: B.win, winD: D ? D.win : null, retB: B.retClose, ddB: B.maxDD } : null
}

/** M1 rest-after-run: base episode whose start has priorGain120 ≥ 30. */
export function detectM1(S, eps) {
  return eps
    .filter((e) => S.priorGain120[e.start] != null && S.priorGain120[e.start] >= 30)
    .map((e) => ({ bar: e.signalBar, ep: e }))
}
/** Unordered baseline for M1: bars where compressed && priorAdvance (stride 5). */
export function baselineM1(S) {
  const ev = []
  for (let i = 140; i < S.n; i += 5) {
    if (S.bbPct[i] != null && S.bbPct[i] <= 30 && S.baseLen[i] >= 10 &&
        S.priorGain120[i] != null && S.priorGain120[i] >= 30) ev.push({ bar: i })
  }
  return ev
}

/** M2 monotonic contraction: ≥2 successively smaller H→L legs inside the episode. */
export function detectM2(S, eps) {
  const out = []
  for (const e of eps) {
    const legs = []
    const pv = S.pivots.filter((p) => p.i >= e.peak && p.confirmedAt <= e.end)
    for (let k = 1; k < pv.length; k++) {
      if (pv[k - 1].type === 'H' && pv[k].type === 'L') {
        legs.push({ depth: (pv[k - 1].price - pv[k].price) / pv[k - 1].price, at: pv[k].confirmedAt })
      }
    }
    let contractions = 0
    for (let k = 1; k < legs.length; k++) {
      if (legs[k].depth < legs[k - 1].depth) {
        contractions++
        if (contractions >= 2) { out.push({ bar: legs[k].at, ep: e }); break }
      } else contractions = 0
    }
  }
  return out
}

/** M3 dry-up deepening: declining dry-up across base, minimum in final third. */
export function detectM3(S, eps) {
  const out = []
  for (const e of eps) {
    const vals = []
    for (let k = e.start; k <= e.end; k++) if (S.dryUp[k] != null) vals.push({ k, v: S.dryUp[k] })
    if (vals.length < 12) continue
    const slope = trailingSlopeArr(vals.map((x) => x.v))
    let minIdx = 0
    vals.forEach((x, idx) => { if (x.v < vals[minIdx].v) minIdx = idx })
    if (slope < 0 && minIdx >= Math.floor((vals.length * 2) / 3)) out.push({ bar: e.end, ep: e })
  }
  return out
}
function trailingSlopeArr(ys) {
  const n = ys.length
  const xM = (n - 1) / 2
  const yM = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (i - xM) * (ys[i] - yM); den += (i - xM) ** 2 }
  return den ? num / den : 0
}

/** M4 accumulation precedes turn: OBV-rising streak ≥15 bars before a weekly turn. */
export function detectM4(S) {
  return S.turnBars
    .filter((t) => {
      let streak = 0
      for (let k = t - 1; k >= Math.max(0, t - 60); k--) {
        if (S.obvSlope[k] != null && S.obvSlope[k] > 0) streak++
        else break
      }
      return streak >= 15
    })
    .map((t) => ({ bar: t }))
}
/** Baseline: turn with OBV rising at the turn bar itself (unordered co-existence). */
export function baselineM4(S) {
  return S.turnBars.filter((t) => S.obvSlope[t] != null && S.obvSlope[t] > 0).map((t) => ({ bar: t }))
}
/** F2 price-led turn: weekly turn with NO obv-rising streak (≥15) in prior 30 bars. */
export function detectF2(S) {
  const m4 = new Set(detectM4(S).map((e) => e.bar))
  return S.turnBars.filter((t) => !m4.has(t)).map((t) => ({ bar: t }))
}

/**
 * M5 shakeout/spring + F3 unrecovered undercut.
 * Undercut = close breaking the ESTABLISHED base low (min low over ≥20 prior
 * base bars) by >0.5% — the margin prevents ordinary base wiggle from firing.
 */
export function detectM5F3(S, eps) {
  const springs = []
  const failures = []
  for (const e of eps) {
    let baseLow = Infinity
    for (let k = e.start; k <= Math.min(e.start + 19, e.end); k++) baseLow = Math.min(baseLow, S.daily[k].low)
    for (let k = e.start + 20; k <= e.end; k++) {
      if (S.c[k] < baseLow * 0.995) {
        const quietUndercut = S.volRatio[k] != null && S.volRatio[k] < 1.2
        let reclaimed = -1
        for (let m = k + 1; m <= Math.min(k + 5, S.n - 1); m++) {
          if (S.c[m] > baseLow) { reclaimed = m; break }
        }
        if (reclaimed > 0 && quietUndercut) springs.push({ bar: reclaimed, ep: e })
        else if (reclaimed < 0) failures.push({ bar: Math.min(k + 5, S.n - 1), ep: e })
        break // first qualifying undercut per episode only (fixed)
      }
      baseLow = Math.min(baseLow, S.daily[k].low)
    }
  }
  return { springs, failures }
}

/** M6 down-day resilience: downDayRS 10-bar slope > 0 AND value > value 10 bars ago, in base. */
export function detectM6(S) {
  const out = []
  for (let i = 30; i < S.n; i++) {
    if (S.baseLen[i] < 5) continue
    if (S.downDayRS[i] == null || S.downDayRS[i - 10] == null) continue
    const win = []
    for (let k = i - 9; k <= i; k++) if (S.downDayRS[k] != null) win.push(S.downDayRS[k])
    if (win.length < 8) continue
    if (trailingSlopeArr(win) > 0 && S.downDayRS[i] > S.downDayRS[i - 10]) {
      out.push({ bar: i })
      i += 20 // event gap (fixed) to reduce autocorrelation
    }
  }
  return out
}

/** M7 higher-low cadence: ≥3 consecutive higher lows with strictly shortening intervals. */
export function detectM7(S) {
  const lows = S.pivots.filter((p) => p.type === 'L')
  const out = []
  for (let k = 2; k < lows.length; k++) {
    const a = lows[k - 2], b = lows[k - 1], d = lows[k]
    if (b.price > a.price && d.price > b.price && (d.i - b.i) < (b.i - a.i)) {
      out.push({ bar: d.confirmedAt })
    }
  }
  return out
}

/** F1 distribution-then-quiet: vol expansion + falling OBV BEFORE first dry-up bar of the episode. */
export function detectF1(S, eps) {
  const flagged = []
  const clean = []
  for (const e of eps) {
    let firstDry = -1
    for (let k = e.start; k <= e.end; k++) if (S.dryUp[k] != null && S.dryUp[k] < 0.75) { firstDry = k; break }
    let hasDistribution = false
    const distEnd = firstDry > 0 ? firstDry : e.end
    for (let k = e.peak; k < distEnd; k++) {
      if (S.volRatio[k] != null && S.volRatio[k] >= 1.4 && S.obvSlope[k] != null && S.obvSlope[k] < 0) { hasDistribution = true; break }
    }
    ;(hasDistribution ? flagged : clean).push({ bar: e.end, ep: e })
  }
  return { flagged, clean }
}

// ── Behaviour Quality (6 pre-registered dimensions, on M1 episodes) ──────────

export function qualityMetrics(S, ep) {
  const { peak, start, end } = ep
  const corr = { from: peak, to: end }
  const len = corr.to - corr.from
  if (len < 5) return null
  const advStart = Math.max(0, peak - 120)
  const advLen = peak - advStart
  const peakHigh = S.daily[peak].high

  // duration proportion
  const durationProportion = advLen ? len / advLen : null

  // smoothness: path efficiency + worst single-day drop share
  let pathSum = 0, worstDrop = 0, minLow = Infinity
  for (let k = corr.from + 1; k <= corr.to; k++) {
    const d = S.c[k] - S.c[k - 1]
    pathSum += Math.abs(d)
    if (-d > worstDrop) worstDrop = -d
    minLow = Math.min(minLow, S.daily[k].low)
  }
  const netMove = Math.abs(S.c[corr.to] - S.c[corr.from])
  const pathEfficiency = pathSum > 0 ? netMove / pathSum : null
  const corrDepth = peakHigh - minLow
  const worstDropShare = corrDepth > 0 ? worstDrop / corrDepth : null

  // volatility profile: mean |ret| second half ÷ first half (falling < 1 = good)
  const mid = Math.floor((corr.from + corr.to) / 2)
  const meanAbs = (a, b) => {
    let s = 0, cnt = 0
    for (let k = a + 1; k <= b; k++) { s += Math.abs(S.c[k] - S.c[k - 1]) / S.c[k - 1]; cnt++ }
    return cnt ? s / cnt : null
  }
  const volFirst = meanAbs(corr.from, mid)
  const volSecond = meanAbs(mid, corr.to)
  const volCalming = volFirst && volSecond != null ? volSecond / volFirst : null

  // volume behaviour: corr(volume, down-move magnitude) — negative = exhausting
  const xs = [], ys = []
  for (let k = corr.from + 1; k <= corr.to; k++) {
    xs.push(S.vol[k])
    ys.push(Math.max(0, -(S.c[k] - S.c[k - 1])))
  }
  const volDownCorr = pearson(xs, ys)

  // structural integrity: retracement of advance + violated prior swing lows
  const advRange = peakHigh - S.c[advStart]
  const retracement = advRange > 0 ? (peakHigh - minLow) / advRange : null
  const priorLows = S.pivots.filter((p) => p.type === 'L' && p.i >= advStart && p.i < peak)
  const violated = priorLows.filter((p) => minLow < p.price).length

  // recovery character: touches of base-low zone (±1.5%) — ≥2 = built floor
  const baseLow = minLow
  let touches = 0
  for (let k = start; k <= end; k++) {
    if (Math.abs(S.daily[k].low - baseLow) / baseLow < 0.015) touches++
  }

  return { durationProportion, pathEfficiency, worstDropShare, volCalming, volDownCorr, retracement, violated, floorTouches: touches }
}

function pearson(xs, ys) {
  const n = xs.length
  if (n < 5) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2 }
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}

// Quality "goodness" direction per dimension (fixed): value that experts call beautiful.
export const QUALITY_DIMS = {
  durationProportion: { better: 'mid', label: 'Duration proportion' }, // tested as terciles; mid preferred [hypothesis]
  pathEfficiency: { better: 'low', label: 'Smoothness (path efficiency)' }, // low = stair-step, not straight-line crash
  worstDropShare: { better: 'low', label: 'Smoothness (worst-day share)' },
  volCalming: { better: 'low', label: 'Volatility calming' },
  volDownCorr: { better: 'low', label: 'Volume-on-weakness' }, // negative corr = exhausting
  retracement: { better: 'low', label: 'Structural integrity (retracement)' },
}

/** Attach outcomes to a list of events; drops events without forward data. */
export function withOutcomes(daily, events) {
  const out = []
  for (const e of events) {
    const o = outcome(daily, e.bar)
    if (o) out.push({ ...e, ...o, date: new Date(daily[e.bar].time * 1000).toISOString().slice(0, 10) })
  }
  return out
}
