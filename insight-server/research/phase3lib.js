// ── Phase-3: opportunity-engine discovery (pure functions, testable) ─────────
// Tests Option A (universal score) vs B (specialized engines) vs C (hybrid)
// by training per-engine models on candidate subsets and comparing against
// the universal model ON THE SAME validation subsets.
import { designMatrix, trainLogistic, predict, evaluate, FEATURES } from './analyze.js'
import { v1Score } from './features.js'
import { tradingMetrics } from './phase2lib.js'

const pct = (v, d = 1) => (v == null ? null : +v.toFixed(d))
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)

// ── Engine definitions (candidate filters + label + engine-relevant features) ─
// Declared before analysis. An observation can qualify for multiple engines.
export const ENGINES = {
  momentum: {
    name: 'Momentum Leader',
    candidate: (o) => o.weeklyUp === true && o.aboveSma200 === true,
    labelKey: 'B',
    features: ['rsPositive', 'rsImproving', 'nearHigh', 'obvRising', 'volDryUp', 'relVolAccel', 'dailyUptrend', 'extended', 'adxLow', 'rsiMid'],
  },
  breakout: {
    name: 'Breakout Preparation',
    candidate: (o) => o.bbPct != null && o.bbPct <= 40 && o.baseLen >= 5,
    labelKey: 'B',
    features: ['weeklyUp', 'aboveSma200', 'volDryUp', 'obvRising', 'rsPositive', 'nearHigh', 'rsiMid', 'compressed'],
  },
  reversal: {
    name: 'Early Reversal',
    candidate: (o) => o.fromHighPct != null && o.fromHighPct <= -30,
    labelKey: 'B',
    features: ['chochInDown', 'choch', 'obvRising', 'volDryUp', 'weeklyUp', 'rsImproving', 'aboveSma200', 'relVolAccel'],
  },
  multibagger: {
    name: 'Multibagger Discovery',
    candidate: () => true, // discovery runs over the full universe
    labelKey: 'E',
    features: ['weeklyUp', 'aboveSma200', 'nearHigh', 'obvRising', 'volDryUp', 'rsPositive', 'compressed', 'extended'],
  },
}

// Extra boolean features for phase-3 (registered here, not in phase-1 FEATURES,
// so earlier phases remain reproducible)
export const P3_FEATURES = {
  rsiRecovery: (o) => o.rsiRecovery,
  higherLow: (o) => o.higherLow,
  priorAdvance: (o) => (o.priorGain120 == null ? null : o.priorGain120 >= 30),
  tightRange: (o) => (o.rangeTight20 == null ? null : o.rangeTight20 <= 15),
  longDecline: (o) => (o.barsSinceHigh == null ? null : o.barsSinceHigh >= 120),
}
const ALL_FEATS = { ...FEATURES, ...P3_FEATURES }

function winFor(o, labelKey, gainOverride = null) {
  const f = o.fwd?.[labelKey]
  if (!f) return null
  return gainOverride != null ? f.maxGain >= gainOverride : f.win
}

// ── Core: specialized vs universal, per engine ───────────────────────────────

export function trainUniversal(dev, labelKey = 'B') {
  const elig = dev.filter((o) => o.fwd?.[labelKey])
  const { X, stats } = designMatrix(elig)
  const y = elig.map((o) => (o.fwd[labelKey].win ? 1 : 0))
  const model = trainLogistic(X, y)
  return { model, stats, scoreFn: (o) => predict(model, designMatrix([o], stats).X[0]) }
}

/**
 * For each engine: train a specialized model on dev candidates only,
 * evaluate specialized vs universal vs V1 on VALIDATION candidates.
 */
export function engineComparison(dev, val, universal) {
  const rows = []
  const engineModels = {}
  for (const [key, eng] of Object.entries(ENGINES)) {
    const devC = dev.filter((o) => eng.candidate(o) && o.fwd?.[eng.labelKey])
    const valC = val.filter((o) => eng.candidate(o) && o.fwd?.[eng.labelKey])
    if (devC.length < 400 || valC.length < 200) {
      rows.push({ engine: eng.name, note: 'insufficient candidates', nDev: devC.length, nVal: valC.length })
      continue
    }
    const { X, stats } = designMatrix(devC)
    const y = devC.map((o) => (o.fwd[eng.labelKey].win ? 1 : 0))
    const model = trainLogistic(X, y)
    const specFn = (o) => predict(model, designMatrix([o], stats).X[0])
    engineModels[key] = { model, stats, scoreFn: specFn, labelKey: eng.labelKey }

    const yv = valC.map((o) => o.fwd[eng.labelKey].win)
    const evSpec = evaluate(valC.map(specFn), yv)
    const evUni = evaluate(valC.map(universal.scoreFn), yv)
    const evV1 = evaluate(valC.map(v1Score), yv)

    // trading quality of specialized top-decile (label-B close returns)
    const scores = valC.map(specFn)
    const cut = [...scores].sort((a, b) => b - a)[Math.floor(scores.length * 0.1)]
    const top = valC.filter((o, i) => scores[i] >= cut && o.fwd?.B)
    const tm = tradingMetrics(top.map((o) => o.fwd.B.retClose))

    rows.push({
      engine: `${eng.name} (label ${eng.labelKey})`,
      nDev: devC.length,
      nVal: valC.length,
      baseVal: evSpec.baseRate,
      v1Prec: evV1.precisionTop10,
      uniPrec: evUni.precisionTop10,
      specPrec: evSpec.precisionTop10,
      uniAuc: evUni.auc,
      specAuc: evSpec.auc,
      specEdge: pct(evSpec.precisionTop10 - evUni.precisionTop10),
      topAvgRet: tm?.avgRet ?? null,
      topPF: tm?.profitFactor ?? null,
      topMaxDD: pct(mean(top.map((o) => o.fwd.B.maxDD))),
    })
  }
  return { rows, engineModels }
}

/** Per-engine univariate lifts of the engine's declared features (dev candidates). */
export function engineFeatureTable(dev) {
  const out = []
  for (const eng of Object.values(ENGINES)) {
    const cand = dev.filter((o) => eng.candidate(o) && o.fwd?.[eng.labelKey])
    const base = cand.filter((o) => o.fwd[eng.labelKey].win).length / (cand.length || 1)
    const feats = [...eng.features, ...Object.keys(P3_FEATURES)]
    for (const f of feats) {
      const fn = ALL_FEATS[f]
      if (!fn) continue
      const on = cand.filter((o) => fn(o) === true)
      if (on.length < 50) continue
      const p = on.filter((o) => o.fwd[eng.labelKey].win).length / on.length
      out.push({
        engine: eng.name,
        feature: f,
        n: on.length,
        pWin: pct(p * 100),
        lift: base ? +(p / base).toFixed(2) : null,
      })
    }
  }
  out.sort((a, b) => a.engine.localeCompare(b.engine) || (b.lift ?? 0) - (a.lift ?? 0))
  return out
}

// ── Breakout autopsy: why did base detection fail? Definition sweep ──────────

export function breakoutDefinitionSweep(dev) {
  const defs = {
    'V1 def: bb≤30 + base≥10': (o) => o.bbPct != null && o.bbPct <= 30 && o.baseLen >= 10,
    'Tight range ≤15% (20 bars)': (o) => o.rangeTight20 != null && o.rangeTight20 <= 15,
    'Tight range ≤15% + weeklyUp': (o) => o.rangeTight20 != null && o.rangeTight20 <= 15 && o.weeklyUp === true,
    'bb≤30 + prior advance ≥30%': (o) => o.bbPct != null && o.bbPct <= 30 && o.priorGain120 != null && o.priorGain120 >= 30,
    'bb≤30 + prior advance + weeklyUp': (o) => o.bbPct != null && o.bbPct <= 30 && o.priorGain120 != null && o.priorGain120 >= 30 && o.weeklyUp === true,
    'bb≤30 + vol dry-up <0.75': (o) => o.bbPct != null && o.bbPct <= 30 && o.dryUpRatio != null && o.dryUpRatio < 0.75,
    'bb≤30 + RS positive': (o) => o.bbPct != null && o.bbPct <= 30 && o.rs20 != null && o.rs20 > 0,
    'Full VCP: tight + dry-up + prior advance + weeklyUp': (o) =>
      o.rangeTight20 != null && o.rangeTight20 <= 15 && o.dryUpRatio != null && o.dryUpRatio < 0.75 &&
      o.priorGain120 != null && o.priorGain120 >= 30 && o.weeklyUp === true,
    'Long base 20+ bars + tight + weeklyUp': (o) => o.baseLen >= 20 && o.rangeTight20 != null && o.rangeTight20 <= 20 && o.weeklyUp === true,
  }
  const elig = dev.filter((o) => o.fwd?.B)
  const base = elig.filter((o) => o.fwd.B.win).length / (elig.length || 1)
  const rows = []
  for (const [name, fn] of Object.entries(defs)) {
    const on = elig.filter((o) => fn(o) === true)
    if (!on.length) continue
    const p = on.filter((o) => o.fwd.B.win).length / on.length
    const pD = on.filter((o) => o.fwd?.D).length
      ? on.filter((o) => o.fwd?.D?.win).length / on.filter((o) => o.fwd?.D).length
      : null
    rows.push({
      definition: name,
      n: on.length,
      pWinB: pct(p * 100),
      liftB: base ? +(p / base).toFixed(2) : null,
      pWinD: pD != null ? pct(pD * 100) : null,
      avgDD: pct(mean(on.map((o) => o.fwd.B.maxDD))),
    })
  }
  rows.sort((a, b) => (b.liftB ?? 0) - (a.liftB ?? 0))
  return { universeBase: pct(base * 100), rows }
}

// ── Reversal signal test ─────────────────────────────────────────────────────

export function reversalSignalTest(dev) {
  const cand = dev.filter((o) => o.fromHighPct != null && o.fromHighPct <= -30 && o.fwd?.B)
  const base = cand.filter((o) => o.fwd.B.win).length / (cand.length || 1)
  const signals = {
    'CHOCH (bullish break in downtrend)': (o) => o.choch === true && o.trend === 'DOWNTREND',
    'Higher low formed': (o) => o.higherLow === true,
    'RSI recovery (<35 → >50)': (o) => o.rsiRecovery === true,
    'OBV rising': (o) => o.obvSlope != null && o.obvSlope > 0,
    'Volume dry-up': (o) => o.dryUpRatio != null && o.dryUpRatio < 0.75,
    'Back above 50EMA': (o) => o.aboveEma50 === true,
    'Back above 200SMA': (o) => o.aboveSma200 === true,
    'Weekly turned up': (o) => o.weeklyUp === true,
    'RS improving': (o) => o.rs20 != null && o.rs60 != null && o.rs20 > o.rs60,
    'Long decline (≥120 bars) done': (o) => o.barsSinceHigh != null && o.barsSinceHigh >= 120,
    'HL + RSI recovery + OBV rising': (o) => o.higherLow === true && o.rsiRecovery === true && o.obvSlope > 0,
    'Weekly up + higher low': (o) => o.weeklyUp === true && o.higherLow === true,
  }
  const rows = []
  for (const [name, fn] of Object.entries(signals)) {
    const on = cand.filter((o) => fn(o) === true)
    if (on.length < 40) continue
    const p = on.filter((o) => o.fwd.B.win).length / on.length
    const pD = on.filter((o) => o.fwd?.D).length
      ? on.filter((o) => o.fwd?.D?.win).length / on.filter((o) => o.fwd?.D).length
      : null
    rows.push({ signal: name, n: on.length, pWinB: pct(p * 100), liftB: base ? +(p / base).toFixed(2) : null, pWinD: pD != null ? pct(pD * 100) : null })
  }
  rows.sort((a, b) => (b.liftB ?? 0) - (a.liftB ?? 0))
  return { candN: cand.length, base: pct(base * 100), rows }
}

// ── Multibagger study: conditions BEFORE big moves ───────────────────────────

/** Profile features of winners vs non-winners at signal time and 30/60/90 bars before. */
export function multibaggerStudy(obs, labelKey = 'E', gainOverride = null) {
  const bySymbol = new Map()
  for (const o of obs) {
    if (!bySymbol.has(o.symbol)) bySymbol.set(o.symbol, [])
    bySymbol.get(o.symbol).push(o)
  }
  for (const list of bySymbol.values()) list.sort((a, b) => a.barIndex - b.barIndex)
  const lookback = (o, bars) => {
    const list = bySymbol.get(o.symbol)
    const target = o.barIndex - bars
    let best = null
    for (const x of list) {
      if (x.barIndex <= target) best = x
      else break
    }
    return best
  }
  const elig = obs.filter((o) => winFor(o, labelKey, gainOverride) != null)
  const winners = elig.filter((o) => winFor(o, labelKey, gainOverride) === true)
  const losers = elig.filter((o) => winFor(o, labelKey, gainOverride) === false)
  if (winners.length < 30) return { n: winners.length, insufficient: true }

  const profile = (set, at) => {
    const pts = at === 0 ? set : set.map((o) => lookback(o, at)).filter(Boolean)
    if (!pts.length) return null
    const frac = (fn) => pct((pts.filter((o) => fn(o) === true).length / pts.length) * 100)
    const med = (get) => {
      const v = pts.map(get).filter((x) => x != null).sort((a, b) => a - b)
      return v.length ? pct(v[Math.floor(v.length / 2)]) : null
    }
    return {
      n: pts.length,
      weeklyUp: frac((o) => o.weeklyUp),
      above200: frac((o) => o.aboveSma200),
      obvRising: frac((o) => o.obvSlope > 0),
      compressed: frac((o) => o.bbPct != null && o.bbPct <= 30 && o.baseLen >= 10),
      medFromHigh: med((o) => o.fromHighPct),
      medRs20: med((o) => o.rs20),
      medBbPct: med((o) => o.bbPct),
      medTurnoverCr: med((o) => o.turnoverCr),
      priceUnder100: frac((o) => o.price != null && o.price < 100),
    }
  }
  const rows = []
  for (const at of [0, 30, 60, 90]) {
    const w = profile(winners, at)
    const l = profile(losers, at)
    if (w) rows.push({ when: at === 0 ? 'At signal' : `${at} bars before`, group: 'WINNERS', ...w })
    if (l) rows.push({ when: at === 0 ? 'At signal' : `${at} bars before`, group: 'others', ...l })
  }
  return { nWinners: winners.length, nElig: elig.length, rows }
}

/** Capture of big winners by each engine's top decile (validation). */
export function engineCapture(val, engineModels, universal) {
  const targets = [
    { name: '+50% / 120b', key: 'D', gain: null },
    { name: '+100% / 250b', key: 'E', gain: null },
    { name: '+200% / 250b', key: 'E', gain: 200 },
    { name: '+300% / 250b', key: 'E', gain: 300 },
  ]
  const rows = []
  for (const t of targets) {
    const elig = val.filter((o) => o.fwd?.[t.key])
    const winners = elig.filter((o) => winFor(o, t.key, t.gain) === true)
    if (winners.length < 15) {
      rows.push({ move: t.name, winners: winners.length, note: 'sample too small — not evaluated' })
      continue
    }
    const scorers = { Universal: universal.scoreFn }
    for (const [k, m] of Object.entries(engineModels)) scorers[ENGINES[k].name] = m.scoreFn
    for (const [name, fn] of Object.entries(scorers)) {
      const scores = elig.map(fn)
      const cut = [...scores].sort((a, b) => b - a)[Math.floor(scores.length * 0.1)]
      const captured = winners.filter((o, i) => fn(o) >= cut).length
      rows.push({ move: t.name, scorer: name, winners: winners.length, captureRate: pct((captured / winners.length) * 100), random: 10 })
    }
  }
  return rows
}

// ── Risk-separation test (Q4) ────────────────────────────────────────────────

export function riskSeparationTest(val, universal) {
  const elig = val.filter((o) => o.fwd?.B)
  const scores = elig.map(universal.scoreFn)
  const cut = [...scores].sort((a, b) => b - a)[Math.floor(scores.length * 0.1)]
  const top = elig.filter((o, i) => scores[i] >= cut)
  const atrs = top.map((o) => o.atrPct).filter((v) => v != null).sort((a, b) => a - b)
  const medAtr = atrs[Math.floor(atrs.length / 2)]
  const lowRisk = top.filter((o) => o.atrPct != null && o.atrPct <= medAtr)
  const highRisk = top.filter((o) => o.atrPct != null && o.atrPct > medAtr)
  const mk = (set, name) => {
    const tm = tradingMetrics(set.map((o) => o.fwd.B.retClose))
    return { bucket: name, ...(tm ?? {}), avgMaxDD: pct(mean(set.map((o) => o.fwd.B.maxDD))) }
  }
  return { medAtr: pct(medAtr), rows: [mk(lowRisk, `Top-decile, ATR ≤ ${pct(medAtr)}%`), mk(highRisk, `Top-decile, ATR > ${pct(medAtr)}%`)] }
}

// ── Universal vs engine-specific features (Q5) ───────────────────────────────

export function featureUniversality(engineModels, universal, names) {
  const models = { Universal: universal, ...Object.fromEntries(Object.entries(engineModels).map(([k, m]) => [ENGINES[k].name, m])) }
  const rows = names.map((f, idx) => {
    const row = { feature: f }
    let pos = 0
    let neg = 0
    for (const [name, m] of Object.entries(models)) {
      const c = m.model.w[idx]
      row[name] = +c.toFixed(2)
      if (c > 0.05) pos++
      if (c < -0.05) neg++
    }
    row.classification = pos >= 3 && neg === 0 ? 'UNIVERSAL' : pos + neg >= 1 ? 'ENGINE-SPECIFIC' : 'weak'
    return row
  })
  rows.sort((a, b) => Math.abs(b.Universal ?? 0) - Math.abs(a.Universal ?? 0))
  return rows
}
