// ── Statistical analysis: lift, combos, sweeps, regression, failures ─────────
import { RESEARCH } from './config.js'
import { v1Score } from './features.js'

export const win = (o, gainPct = RESEARCH.primaryGainPct) =>
  o.fwdGain >= gainPct && o.fwdGain > Math.abs(o.fwdDD)

export function splitDevVal(obs) {
  const dev = []
  const val = []
  for (const o of obs) (o.date <= RESEARCH.devEndDate ? dev : val).push(o)
  return { dev, val }
}

// ── Boolean feature definitions (V1 features + pre-registered candidates) ────
export const FEATURES = {
  compressed: (o) => (o.bbPct == null ? null : o.bbPct <= 30 && o.baseLen >= 10),
  bbTight40: (o) => (o.bbPct == null ? null : o.bbPct <= 40),
  cmfPos: (o) => (o.cmf == null ? null : o.cmf > 0.05),
  obvRising: (o) => (o.obvSlope == null ? null : o.obvSlope > 0),
  volExpansion: (o) => (o.volRatio == null ? null : o.volRatio >= 1.4),
  volDryUp: (o) => (o.dryUpRatio == null ? null : o.dryUpRatio < 0.75),
  rsImproving: (o) => (o.rs20 == null || o.rs60 == null ? null : o.rs20 > o.rs60),
  rsPositive: (o) => (o.rs20 == null ? null : o.rs20 > 0),
  sectorRsPos: (o) => (o.sectorRs20 == null ? null : o.sectorRs20 > 0),
  dailyUptrend: (o) => o.trend === 'UPTREND',
  dailyDowntrend: (o) => o.trend === 'DOWNTREND',
  choch: (o) => o.choch === true,
  chochInDown: (o) => o.choch === true && o.trend === 'DOWNTREND',
  bosWithTrend: (o) => o.bos === true && o.trend !== 'DOWNTREND',
  weeklyUp: (o) => o.weeklyUp === true,
  aboveSma200: (o) => o.aboveSma200,
  regimeUp: (o) => o.regimeUp,
  rsiMid: (o) => (o.rsi == null ? null : o.rsi >= 45 && o.rsi <= 65),
  adxLow: (o) => (o.adx == null ? null : o.adx < 20),
  relVolAccel: (o) => (o.relVolAccel == null ? null : o.relVolAccel >= 1.3),
  nearHigh: (o) => (o.fromHighPct == null ? null : o.fromHighPct >= -10),
  extended: (o) => (o.fromLowPct == null || o.rsi == null ? null : o.fromLowPct > 80 && o.rsi > 72),
  baseLen10: (o) => o.baseLen >= 10,
}

function rate(obsSubset, gainPct) {
  const wins = obsSubset.filter((o) => win(o, gainPct)).length
  return { n: obsSubset.length, wins, p: obsSubset.length ? wins / obsSubset.length : null }
}

/** Univariate: P(win | feature) vs base rate, per label threshold. */
export function univariate(obs, gainPct = RESEARCH.primaryGainPct) {
  const base = rate(obs, gainPct)
  const rows = []
  for (const [name, fn] of Object.entries(FEATURES)) {
    const on = obs.filter((o) => fn(o) === true)
    const r = rate(on, gainPct)
    rows.push({
      feature: name,
      n: r.n,
      pWin: r.p != null ? +(r.p * 100).toFixed(1) : null,
      lift: r.p != null && base.p ? +(r.p / base.p).toFixed(2) : null,
      avgGain: on.length ? +(on.reduce((s, o) => s + o.fwdGain, 0) / on.length).toFixed(1) : null,
      avgDD: on.length ? +(on.reduce((s, o) => s + o.fwdDD, 0) / on.length).toFixed(1) : null,
    })
  }
  rows.sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
  return { baseRate: +(base.p * 100).toFixed(1), baseN: base.n, rows }
}

/** Pre-registered combinations + all pairs among features with lift ≥ 1.1. */
export function combos(obs, uni, gainPct = RESEARCH.primaryGainPct) {
  const declared = [
    ['compressed'],
    ['compressed', 'volDryUp'],
    ['compressed', 'cmfPos'],
    ['compressed', 'rsPositive'],
    ['compressed', 'weeklyUp'],
    ['compressed', 'sectorRsPos'],
    ['compressed', 'regimeUp'],
    ['compressed', 'rsPositive', 'regimeUp'],
    ['compressed', 'weeklyUp', 'cmfPos'],
    ['compressed', 'sectorRsPos', 'volDryUp'],
    ['chochInDown'],
    ['chochInDown', 'regimeUp'],
    ['chochInDown', 'volExpansion'],
    ['bosWithTrend', 'weeklyUp'],
    ['rsPositive', 'weeklyUp', 'nearHigh'],
    ['dailyUptrend', 'compressed'],
  ]
  const strong = uni.rows.filter((r) => (r.lift ?? 0) >= 1.1 && r.n >= RESEARCH.minSupport).map((r) => r.feature)
  const pairSet = new Set(declared.map((d) => d.join('+')))
  for (let i = 0; i < strong.length; i++) {
    for (let j = i + 1; j < strong.length; j++) {
      const key = [strong[i], strong[j]].join('+')
      if (!pairSet.has(key)) { declared.push([strong[i], strong[j]]); pairSet.add(key) }
    }
  }
  const base = rate(obs, gainPct)
  const out = []
  for (const names of declared) {
    const subset = obs.filter((o) => names.every((f) => FEATURES[f](o) === true))
    const r = rate(subset, gainPct)
    if (r.n < 20) continue
    out.push({
      combo: names.join(' + '),
      n: r.n,
      pWin: r.p != null ? +(r.p * 100).toFixed(1) : null,
      lift: r.p != null && base.p ? +(r.p / base.p).toFixed(2) : null,
      reliable: r.n >= RESEARCH.minSupport,
    })
  }
  out.sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
  return out
}

/** Threshold sweeps over the declared grids. */
export function sweeps(obs, gainPct = RESEARCH.primaryGainPct) {
  const base = rate(obs, gainPct)
  const res = {}
  res.bbPct = RESEARCH.grids.bbPct.map((th) => {
    const subset = obs.filter((o) => o.bbPct != null && o.bbPct <= th && o.baseLen >= 10)
    const r = rate(subset, gainPct)
    return { threshold: `≤${th}`, n: r.n, pWin: r.p != null ? +(r.p * 100).toFixed(1) : null, lift: r.p && base.p ? +(r.p / base.p).toFixed(2) : null }
  })
  res.rsiBand = RESEARCH.grids.rsiBand.map(([lo, hi]) => {
    const subset = obs.filter((o) => o.rsi != null && o.rsi >= lo && o.rsi <= hi && o.bbPct != null && o.bbPct <= 30)
    const r = rate(subset, gainPct)
    return { threshold: `${lo}–${hi} (in squeeze)`, n: r.n, pWin: r.p != null ? +(r.p * 100).toFixed(1) : null, lift: r.p && base.p ? +(r.p / base.p).toFixed(2) : null }
  })
  res.volRatio = RESEARCH.grids.volRatio.map((th) => {
    const subset = obs.filter((o) => o.volRatio != null && o.volRatio >= th)
    const r = rate(subset, gainPct)
    return { threshold: `≥${th}×`, n: r.n, pWin: r.p != null ? +(r.p * 100).toFixed(1) : null, lift: r.p && base.p ? +(r.p / base.p).toFixed(2) : null }
  })
  res.baseLen = RESEARCH.grids.baseLen.map((th) => {
    const subset = obs.filter((o) => o.baseLen >= th && o.bbPct != null && o.bbPct <= 30)
    const r = rate(subset, gainPct)
    return { threshold: `≥${th} bars (in squeeze)`, n: r.n, pWin: r.p != null ? +(r.p * 100).toFixed(1) : null, lift: r.p && base.p ? +(r.p / base.p).toFixed(2) : null }
  })
  res.dryUp = RESEARCH.grids.dryUpRatio.map((th) => {
    const subset = obs.filter((o) => o.dryUpRatio != null && o.dryUpRatio < th)
    const r = rate(subset, gainPct)
    return { threshold: `<${th}`, n: r.n, pWin: r.p != null ? +(r.p * 100).toFixed(1) : null, lift: r.p && base.p ? +(r.p / base.p).toFixed(2) : null }
  })
  res.extended = RESEARCH.grids.extendedPct.map((th) => {
    const subset = obs.filter((o) => o.fromLowPct != null && o.fromLowPct > th && o.rsi != null && o.rsi > 72)
    const r = rate(subset, gainPct)
    return { threshold: `>${th}% off low + RSI>72`, n: r.n, pWin: r.p != null ? +(r.p * 100).toFixed(1) : null, lift: r.p && base.p ? +(r.p / base.p).toFixed(2) : null }
  })
  return { baseRate: +(base.p * 100).toFixed(1), grids: res }
}

// ── Logistic regression (plain JS, L2, standardized) ─────────────────────────

const NUMERIC = ['bbPct', 'rsi', 'adx', 'cmf', 'rs20', 'fromHighPct', 'relVolAccel', 'baseLen', 'dryUpRatio']
const BOOLEAN = ['compressed', 'volDryUp', 'cmfPos', 'obvRising', 'rsImproving', 'rsPositive', 'sectorRsPos',
  'dailyUptrend', 'chochInDown', 'bosWithTrend', 'weeklyUp', 'aboveSma200', 'regimeUp', 'relVolAccel', 'nearHigh', 'extended']

export function designMatrix(obs, stats = null) {
  const boolNames = BOOLEAN.filter((b, i) => BOOLEAN.indexOf(b) === i)
  const names = [...NUMERIC.map((x) => `num_${x}`), ...boolNames.map((x) => `is_${x}`)]
  // stats (means/sds) computed on dev only, reused for val
  if (!stats) {
    stats = {}
    for (const f of NUMERIC) {
      const vals = obs.map((o) => o[f]).filter((v) => v != null && Number.isFinite(v))
      const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1)
      const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length || 1)) || 1
      stats[f] = { mean, sd }
    }
  }
  const X = obs.map((o) => {
    const row = []
    for (const f of NUMERIC) {
      const v = o[f] != null && Number.isFinite(o[f]) ? o[f] : stats[f].mean
      row.push((v - stats[f].mean) / stats[f].sd)
    }
    for (const b of boolNames) row.push(FEATURES[b] && FEATURES[b](o) === true ? 1 : 0)
    return row
  })
  return { X, names, stats }
}

export function trainLogistic(X, y) {
  const nF = X[0].length
  let w = new Array(nF).fill(0)
  let b = 0
  const lr = RESEARCH.gdLearningRate
  const lam = RESEARCH.l2Lambda
  const m = X.length
  for (let it = 0; it < RESEARCH.gdIterations; it++) {
    const gw = new Array(nF).fill(0)
    let gb = 0
    for (let i = 0; i < m; i++) {
      let z = b
      for (let j = 0; j < nF; j++) z += w[j] * X[i][j]
      const p = 1 / (1 + Math.exp(-z))
      const err = p - y[i]
      for (let j = 0; j < nF; j++) gw[j] += err * X[i][j]
      gb += err
    }
    for (let j = 0; j < nF; j++) w[j] = w[j] - lr * (gw[j] / m + lam * w[j])
    b -= lr * (gb / m)
  }
  return { w, b }
}

export const predict = (model, x) => {
  let z = model.b
  for (let j = 0; j < x.length; j++) z += model.w[j] * x[j]
  return 1 / (1 + Math.exp(-z))
}

/** AUC via Mann-Whitney and precision in the top decile of scores. */
export function evaluate(scores, labels) {
  const pos = []
  const neg = []
  for (let i = 0; i < scores.length; i++) (labels[i] ? pos : neg).push(scores[i])
  let u = 0
  // O(n log n) AUC via ranking
  const all = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s)
  let rankSumPos = 0
  let i = 0
  while (i < all.length) {
    let j = i
    while (j < all.length && all[j].s === all[i].s) j++
    const avgRank = (i + j + 1) / 2 // 1-based average rank for ties
    for (let k = i; k < j; k++) if (all[k].y) rankSumPos += avgRank
    i = j
  }
  const auc = pos.length && neg.length ? (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length) : null
  // precision@10%
  const idx = scores.map((s, k) => k).sort((a, b) => scores[b] - scores[a])
  const topN = Math.max(1, Math.floor(scores.length * 0.1))
  let wins = 0
  for (let k = 0; k < topN; k++) if (labels[idx[k]]) wins++
  const baseRate = labels.filter(Boolean).length / labels.length
  return {
    auc: auc != null ? +auc.toFixed(3) : null,
    precisionTop10: +((wins / topN) * 100).toFixed(1),
    baseRate: +(baseRate * 100).toFixed(1),
    topN,
  }
}

/** Failure patterns among high-V1-score losers (dev set). */
export function failureAnalysis(dev, gainPct = RESEARCH.primaryGainPct) {
  const highScore = dev.filter((o) => v1Score(o) >= 55)
  const losers = highScore.filter((o) => !win(o, gainPct))
  const conds = {
    'Market regime down (NIFTY < 200SMA)': (o) => o.regimeUp === false,
    'Sector RS negative': (o) => o.sectorRs20 != null && o.sectorRs20 <= 0,
    'Stock RS vs NIFTY negative': (o) => o.rs20 != null && o.rs20 <= 0,
    'Daily still in downtrend': (o) => o.trend === 'DOWNTREND',
    'Weekly not in uptrend': (o) => o.weeklyUp === false,
    'No positive money flow (CMF ≤ 0)': (o) => o.cmf != null && o.cmf <= 0,
    'Extended (>80% off 52w low)': (o) => o.fromLowPct != null && o.fromLowPct > 80,
    'Volume already expanded (≥2×)': (o) => o.volRatio != null && o.volRatio >= 2,
    'Thin liquidity (<₹2cr turnover)': (o) => o.turnoverCr != null && o.turnoverCr < 2,
    'Base too young (<10 bars)': (o) => o.baseLen < 10,
  }
  const rows = Object.entries(conds).map(([name, fn]) => {
    const inLosers = losers.filter(fn).length
    const inWinners = highScore.filter((o) => win(o, gainPct)).filter(fn).length
    const winners = highScore.length - losers.length
    return {
      condition: name,
      pctOfLosers: losers.length ? +((inLosers / losers.length) * 100).toFixed(1) : null,
      pctOfWinners: winners ? +((inWinners / winners) * 100).toFixed(1) : null,
    }
  })
  rows.sort((a, b) => (b.pctOfLosers ?? 0) - (a.pctOfLosers ?? 0))
  return { highScoreN: highScore.length, losersN: losers.length, rows }
}
