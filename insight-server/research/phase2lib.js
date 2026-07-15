// ── Phase-2 research library (pure functions, testable offline) ──────────────
// Multi-horizon labels, winner taxonomy, early/late decomposition,
// ranking simulation, walk-forward, trading metrics, failure vetoes.
import { FEATURES, designMatrix, trainLogistic, predict, evaluate } from './analyze.js'
import { v1Score } from './features.js'

// Business-aligned labels (declared before analysis; do not tune afterwards)
export const LABELS = {
  A: { name: 'Short momentum', gain: 10, bars: 20 },
  B: { name: 'Swing momentum', gain: 20, bars: 40 },
  C: { name: 'Strong expansion', gain: 30, bars: 60 },
  D: { name: 'Major move', gain: 50, bars: 120 },
  E: { name: 'Multi-bagger style', gain: 100, bars: 250 },
}
export const PRIMARY = 'B' // business-primary label for models/sims

/** Forward stats over one window, from bar i (uses closes only for ret). */
export function forwardStats(daily, i, bars, gainPct) {
  if (i + bars >= daily.length) return null
  const entry = daily[i].close
  let maxHigh = -Infinity
  let minLow = Infinity
  let peakK = 0
  let hitK = null
  for (let k = 1; k <= bars; k++) {
    const c = daily[i + k]
    if (c.high > maxHigh) { maxHigh = c.high; peakK = k }
    if (c.low < minLow) minLow = c.low
    if (hitK == null && ((c.high - entry) / entry) * 100 >= gainPct) hitK = k
  }
  return {
    maxGain: +(((maxHigh - entry) / entry) * 100).toFixed(2),
    maxDD: +(((minLow - entry) / entry) * 100).toFixed(2),
    retClose: +(((daily[i + bars].close - entry) / entry) * 100).toFixed(2),
    timeToPeak: peakK,
    timeToTarget: hitK,
    win: hitK != null,
  }
}

/** Attach fwd.<label> to every observation (mutates). Needs full daily series. */
export function attachLabels(obs, dailyBySymbol) {
  for (const o of obs) {
    const daily = dailyBySymbol.get(o.symbol)
    o.fwd = {}
    if (!daily) continue
    for (const [key, def] of Object.entries(LABELS)) {
      o.fwd[key] = forwardStats(daily, o.barIndex, def.bars, def.gain)
    }
  }
  return obs
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const median = (a) => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}
const pct = (v, d = 1) => (v == null ? null : +v.toFixed(d))

/** Section 1: per-label summary + V1/V2 precision (V2 trained per label on dev). */
export function labelSummaries(dev, val) {
  const rows = []
  const models = {}
  for (const [key, def] of Object.entries(LABELS)) {
    const eligDev = dev.filter((o) => o.fwd?.[key])
    const eligVal = val.filter((o) => o.fwd?.[key])
    const winsDev = eligDev.filter((o) => o.fwd[key].win)
    // train V2 for this label on dev
    let v2PrecVal = null
    let v1PrecVal = null
    let v2AucVal = null
    let v1AucVal = null
    if (eligDev.length > 300 && eligVal.length > 300) {
      const { X, stats } = designMatrix(eligDev)
      const y = eligDev.map((o) => (o.fwd[key].win ? 1 : 0))
      const model = trainLogistic(X, y)
      models[key] = { model, stats }
      const { X: Xv } = designMatrix(eligVal, stats)
      const yv = eligVal.map((o) => o.fwd[key].win)
      const evV2 = evaluate(Xv.map((x) => predict(model, x)), yv)
      const evV1 = evaluate(eligVal.map(v1Score), yv)
      v2PrecVal = evV2.precisionTop10
      v1PrecVal = evV1.precisionTop10
      v2AucVal = evV2.auc
      v1AucVal = evV1.auc
    }
    rows.push({
      label: `${key} — ${def.name} (+${def.gain}% / ${def.bars} bars)`,
      nDev: eligDev.length,
      nVal: eligVal.length,
      winRateDev: pct(eligDev.length ? (winsDev.length / eligDev.length) * 100 : null),
      winRateVal: pct(eligVal.length ? (eligVal.filter((o) => o.fwd[key].win).length / eligVal.length) * 100 : null),
      avgMaxGain: pct(mean(eligDev.map((o) => o.fwd[key].maxGain))),
      avgDD: pct(mean(eligDev.map((o) => o.fwd[key].maxDD))),
      avgTimeToPeak: pct(mean(winsDev.map((o) => o.fwd[key].timeToPeak)), 0),
      v1PrecVal, v2PrecVal, v1AucVal, v2AucVal,
    })
  }
  return { rows, models }
}

// ── Section 2: winner taxonomy ────────────────────────────────────────────────

export const CATEGORIES = {
  'A: Trend continuation': (o) => o.aboveSma200 === true && o.weeklyUp === true && FEATURES.nearHigh(o) === true,
  'B: Base breakout': (o) => o.bbPct != null && o.bbPct <= 30 && o.baseLen >= 10 && FEATURES.nearHigh(o) !== true,
  'C: Early reversal': (o) => (o.trend === 'DOWNTREND' || (o.fromHighPct != null && o.fromHighPct < -30)) && (o.choch === true || (o.obvSlope != null && o.obvSlope > 0)),
  'D: Speculative expansion': (o) => o.price != null && o.price < 100 && o.volRatio != null && o.volRatio >= 1.4,
}

/** Which setup contexts produce winners, and which features add lift inside each. */
export function categoryAnalysis(dev, labelKey = PRIMARY) {
  const elig = dev.filter((o) => o.fwd?.[labelKey])
  const base = elig.filter((o) => o.fwd[labelKey].win).length / (elig.length || 1)
  const out = []
  for (const [name, fn] of Object.entries(CATEGORIES)) {
    const subset = elig.filter((o) => fn(o) === true)
    const wins = subset.filter((o) => o.fwd[labelKey].win)
    // per-category feature lifts (top 6 by lift with n≥50)
    const catBase = wins.length / (subset.length || 1)
    const feats = []
    for (const [fname, ffn] of Object.entries(FEATURES)) {
      const on = subset.filter((o) => ffn(o) === true)
      if (on.length < 50) continue
      const p = on.filter((o) => o.fwd[labelKey].win).length / on.length
      feats.push({ feature: fname, n: on.length, lift: catBase ? +(p / catBase).toFixed(2) : null })
    }
    feats.sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
    out.push({
      category: name,
      n: subset.length,
      winRate: pct((catBase || 0) * 100),
      liftVsUniverse: base ? +((catBase || 0) / base).toFixed(2) : null,
      avgMaxGain: pct(mean(subset.map((o) => o.fwd[labelKey].maxGain))),
      avgDD: pct(mean(subset.map((o) => o.fwd[labelKey].maxDD))),
      topFeatures: feats.slice(0, 5).map((f) => `${f.feature} (${f.lift}×, n=${f.n})`).join('; '),
    })
  }
  return { baseRate: pct(base * 100), rows: out }
}

// ── Section 3: weeklyUp — early stage vs late stage ──────────────────────────

export function earlyLateAnalysis(dev, labelKeys = ['B', 'D']) {
  const stages = {
    'EARLY (≥15% below 52w high)': (o) => o.fromHighPct != null && o.fromHighPct <= -15,
    'MID (−15%..−10%)': (o) => o.fromHighPct != null && o.fromHighPct > -15 && o.fromHighPct < -10,
    'LATE (within 10% of high)': (o) => o.fromHighPct != null && o.fromHighPct >= -10,
  }
  const out = []
  for (const key of labelKeys) {
    const elig = dev.filter((o) => o.fwd?.[key])
    const base = elig.filter((o) => o.fwd[key].win).length / (elig.length || 1)
    for (const [stage, sfn] of Object.entries(stages)) {
      const inStage = elig.filter(sfn)
      const stageBase = inStage.filter((o) => o.fwd[key].win).length / (inStage.length || 1)
      const wUp = inStage.filter((o) => o.weeklyUp === true)
      const wUpWin = wUp.filter((o) => o.fwd[key].win).length / (wUp.length || 1)
      const wDown = inStage.filter((o) => o.weeklyUp !== true)
      const wDownWin = wDown.filter((o) => o.fwd[key].win).length / (wDown.length || 1)
      out.push({
        label: key,
        stage,
        n: inStage.length,
        stageWinRate: pct(stageBase * 100),
        weeklyUpWinRate: pct(wUpWin * 100),
        weeklyDownWinRate: pct(wDownWin * 100),
        weeklyUpLiftInStage: stageBase ? +(wUpWin / stageBase).toFixed(2) : null,
        universeBase: pct(base * 100),
      })
    }
  }
  return out
}

// ── Section 4/6: ranking simulation + trading metrics ────────────────────────

export function tradingMetrics(rets) {
  if (!rets.length) return null
  const wins = rets.filter((r) => r > 0)
  const losses = rets.filter((r) => r <= 0)
  const grossWin = wins.reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0))
  let streak = 0
  let worstStreak = 0
  for (const r of rets) {
    if (r <= 0) { streak++; worstStreak = Math.max(worstStreak, streak) }
    else streak = 0
  }
  return {
    n: rets.length,
    avgRet: pct(mean(rets)),
    medianRet: pct(median(rets)),
    winRate: pct((wins.length / rets.length) * 100),
    maxGain: pct(Math.max(...rets)),
    maxLoss: pct(Math.min(...rets)),
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : null,
    worstLosingStreak: worstStreak,
  }
}

const isoWeek = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

/**
 * Weekly scan: rank obs within each week by score, pick top K, outcome =
 * label-B close-to-close return. scorers: { name: (o)=>number }.
 * Includes a RANDOM baseline (seeded) for context.
 */
export function rankingSimulation(obs, scorers, topKs = [5, 10, 20]) {
  const byWeek = new Map()
  for (const o of obs) {
    if (!o.fwd?.B) continue
    const w = isoWeek(o.date)
    if (!byWeek.has(w)) byWeek.set(w, [])
    byWeek.get(w).push(o)
  }
  let seed = 12345
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const allScorers = { ...scorers, 'Random baseline': () => rnd() }
  const rows = []
  for (const [name, fn] of Object.entries(allScorers)) {
    for (const k of topKs) {
      const rets = []
      const dds = []
      const weeks = [...byWeek.keys()].sort()
      for (const w of weeks) {
        const pool = byWeek.get(w)
        if (pool.length < k * 2) continue
        const ranked = [...pool].sort((a, b) => fn(b) - fn(a)).slice(0, k)
        for (const o of ranked) { rets.push(o.fwd.B.retClose); dds.push(o.fwd.B.maxDD) }
      }
      const m = tradingMetrics(rets)
      if (m) rows.push({ scorer: name, topK: k, ...m, avgMaxDD: pct(mean(dds)) })
    }
  }
  return rows
}

/** Capture rate: of all big winners (labels D/E), what % scored in the scorer's top decile? */
export function captureRates(obs, scorers) {
  const rows = []
  for (const key of ['D', 'E']) {
    const elig = obs.filter((o) => o.fwd?.[key])
    if (elig.length < 200) continue
    const winners = elig.filter((o) => o.fwd[key].win)
    for (const [name, fn] of Object.entries(scorers)) {
      const scores = elig.map(fn)
      const cut = [...scores].sort((a, b) => b - a)[Math.floor(scores.length * 0.1)]
      const captured = winners.filter((o, idx) => fn(o) >= cut).length
      rows.push({
        label: `${key} (+${LABELS[key].gain}%/${LABELS[key].bars}b)`,
        scorer: name,
        winners: winners.length,
        captured,
        captureRate: pct((captured / (winners.length || 1)) * 100),
        randomExpectation: 10,
      })
    }
  }
  return rows
}

// ── Section 5: walk-forward validation ───────────────────────────────────────

export const FOLDS = [
  { train: '2021-12-31', testFrom: '2022-01-01', testTo: '2022-12-31' },
  { train: '2022-12-31', testFrom: '2023-01-01', testTo: '2023-12-31' },
  { train: '2023-12-31', testFrom: '2024-01-01', testTo: '2024-12-31' },
  { train: '2024-12-31', testFrom: '2025-01-01', testTo: '2026-12-31' },
]

export function walkForward(obs, labelKey = PRIMARY) {
  const rows = []
  for (const f of FOLDS) {
    const train = obs.filter((o) => o.date <= f.train && o.fwd?.[labelKey])
    const test = obs.filter((o) => o.date >= f.testFrom && o.date <= f.testTo && o.fwd?.[labelKey])
    if (train.length < 500 || test.length < 300) {
      rows.push({ fold: `train ≤${f.train} → test ${f.testFrom.slice(0, 4)}+`, note: 'insufficient data', nTrain: train.length, nTest: test.length })
      continue
    }
    const { X, stats } = designMatrix(train)
    const y = train.map((o) => (o.fwd[labelKey].win ? 1 : 0))
    const model = trainLogistic(X, y)
    const { X: Xt } = designMatrix(test, stats)
    const yt = test.map((o) => o.fwd[labelKey].win)
    const evV2 = evaluate(Xt.map((x) => predict(model, x)), yt)
    const evV1 = evaluate(test.map(v1Score), yt)
    rows.push({
      fold: `train ≤${f.train} → test ${f.testFrom.slice(0, 4)}${f.testTo.slice(0, 4) !== f.testFrom.slice(0, 4) ? '-' + f.testTo.slice(2, 4) : ''}`,
      nTrain: train.length,
      nTest: test.length,
      base: evV2.baseRate,
      v1Auc: evV1.auc,
      v1Prec10: evV1.precisionTop10,
      v2Auc: evV2.auc,
      v2Prec10: evV2.precisionTop10,
    })
  }
  return rows
}

// ── Section 7: failure vetoes (V2 top-decile losers, primary label) ──────────

export function failureVetoes(obs, v2ScoreFn, labelKey = PRIMARY) {
  const elig = obs.filter((o) => o.fwd?.[labelKey])
  const scores = elig.map(v2ScoreFn)
  const cut = [...scores].sort((a, b) => b - a)[Math.floor(scores.length * 0.1)]
  const top = elig.filter((o) => v2ScoreFn(o) >= cut)
  const losers = top.filter((o) => !o.fwd[labelKey].win)
  const winners = top.filter((o) => o.fwd[labelKey].win)
  const conds = {
    'Regime down (NIFTY<200SMA)': (o) => o.regimeUp === false,
    'Weekly not up': (o) => o.weeklyUp !== true,
    'Daily downtrend': (o) => o.trend === 'DOWNTREND',
    'False-breakout context (squeeze + vol spike)': (o) => o.bbPct != null && o.bbPct <= 30 && o.volRatio != null && o.volRatio >= 2,
    'Distribution (OBV falling + high volume)': (o) => o.obvSlope != null && o.obvSlope < 0 && o.volRatio != null && o.volRatio >= 1.4,
    'No flow confirmation (OBV falling)': (o) => o.obvSlope != null && o.obvSlope < 0,
    'Extended (>80% off 52w low)': (o) => o.fromLowPct != null && o.fromLowPct > 80,
    'Thin liquidity (<₹2cr)': (o) => o.turnoverCr != null && o.turnoverCr < 2,
    'High ATR (>4%)': (o) => o.atrPct != null && o.atrPct > 4,
    'RS vs NIFTY negative': (o) => o.rs20 != null && o.rs20 <= 0,
  }
  const rows = Object.entries(conds).map(([name, fn]) => {
    const inL = losers.filter(fn).length
    const inW = winners.filter(fn).length
    const pl = losers.length ? (inL / losers.length) * 100 : null
    const pw = winners.length ? (inW / winners.length) * 100 : null
    return {
      condition: name,
      pctLosers: pct(pl),
      pctWinners: pct(pw),
      vetoCandidate: pl != null && pw != null && pl > pw * 1.5 && pl > 10 ? 'YES' : '',
    }
  })
  rows.sort((a, b) => (b.pctLosers ?? 0) - (a.pctLosers ?? 0))
  return { topN: top.length, losersN: losers.length, rows }
}
