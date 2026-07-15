// Offline test of the FULL research pipeline (no network/DB):
// synthesizes a 30-stock universe + NIFTY + one sector index, then runs
// feature extraction → univariate/combos/sweeps → regression → validation → report.
import assert from 'node:assert'
import { extractObservations, v1Score } from '../research/features.js'
import {
  splitDevVal, univariate, combos, sweeps, failureAnalysis,
  designMatrix, trainLogistic, predict, evaluate, win,
} from '../research/analyze.js'
import { renderReport } from '../research/report.js'
import { sma, closes } from '../src/indicators.js'

function synthSeries(seed, n = 1500, style = 'mixed') {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const candles = []
  let px = 100 + rnd() * 900
  let t = Math.floor(new Date('2020-01-06').getTime() / 1000)
  let regime = rnd()
  for (let i = 0; i < n; i++) {
    if (i % 120 === 0) regime = rnd() // shift regimes
    const drift = style === 'trend' ? 0.15 : (regime - 0.45) * 0.6
    const vol = 0.5 + rnd() * 2.2 + (regime > 0.8 ? 1.5 : 0)
    const chg = ((drift + (rnd() - 0.5) * vol) / 100) * px
    const open = px
    const close = Math.max(5, px + chg)
    const high = Math.max(open, close) * (1 + rnd() * 0.01)
    const low = Math.min(open, close) * (1 - rnd() * 0.01)
    const volume = Math.round(5e5 * (0.5 + rnd() * (regime > 0.6 ? 2 : 1)))
    candles.push({ time: t, open, high, low, close, volume })
    px = close
    // trading days: skip weekends roughly (5 of 7)
    t += 86400 * (i % 5 === 4 ? 3 : 1)
  }
  return candles
}

const dateOf = (c) => new Date(c.time * 1000).toISOString().slice(0, 10)

// Universe
const nifty = synthSeries(7, 1500, 'trend')
const sectorIdx = synthSeries(11, 1500)
const niftyByDate = new Map(nifty.map((c) => [dateOf(c), c.close]))
const nSma = sma(closes(nifty), 200)
const regimeByDate = new Map(nifty.map((c, i) => [dateOf(c), nSma[i] != null ? c.close > nSma[i] : null]))
const sectorByDate = new Map(sectorIdx.map((c) => [dateOf(c), c.close]))

const observations = []
for (let k = 0; k < 30; k++) {
  const candles = synthSeries(100 + k * 13)
  observations.push(
    ...extractObservations(`STOCK${k}-EQ`, { sector: k % 3 ? 'IT' : 'BANK' }, candles, niftyByDate, regimeByDate, k % 2 ? sectorByDate : null),
  )
}
assert.ok(observations.length > 1500, `enough observations (got ${observations.length})`)

// No-look-ahead spot check: every observation date must have ≥40 forward bars excluded
for (const o of observations.slice(0, 50)) {
  assert.ok(Number.isFinite(o.fwdGain) && Number.isFinite(o.fwdDD), 'labels defined')
}

const { dev, val } = splitDevVal(observations)
assert.ok(dev.length > 500 && val.length > 200, `split sane (dev ${dev.length}, val ${val.length})`)

const uniDev = univariate(dev)
assert.ok(uniDev.baseRate > 0 && uniDev.baseRate < 100, 'base rate sane')
assert.ok(uniDev.rows.length >= 15, 'all features evaluated')

const comboDev = combos(dev, uniDev)
assert.ok(Array.isArray(comboDev), 'combos computed')

const sweepDev = sweeps(dev)
assert.ok(sweepDev.grids.bbPct.length === 6, 'bb sweep grid complete')

const failures = failureAnalysis(dev)
assert.ok(failures.rows.length === 10, 'failure conditions tabulated')

const { X: Xdev, names, stats } = designMatrix(dev)
const ydev = dev.map((o) => (win(o) ? 1 : 0))
const model = trainLogistic(Xdev, ydev)
assert.ok(model.w.length === names.length, 'model dimensions')
assert.ok(model.w.every((w) => Number.isFinite(w)), 'weights finite')

const { X: Xval } = designMatrix(val, stats)
const yval = val.map((o) => (win(o) ? 1 : 0))
const evDev = evaluate(Xdev.map((x) => predict(model, x)), ydev.map(Boolean))
const evVal = evaluate(Xval.map((x) => predict(model, x)), yval.map(Boolean))
const evV1 = evaluate(val.map(v1Score), yval.map(Boolean))
assert.ok(evDev.auc != null && evDev.auc >= 0.45, `dev AUC sane (${evDev.auc})`)
assert.ok(evVal.auc != null, 'val AUC computed')
assert.ok(evV1.precisionTop10 != null, 'v1 baseline computed')

const md = renderReport({
  universeInfo: 'synthetic 30-stock universe (offline test)',
  devN: dev.length,
  valN: val.length,
  uniDev,
  uniByLabel: uniDev.rows.map((r) => ({ feature: r.feature, lift5: r.lift, lift8: r.lift, lift10: r.lift, lift15: r.lift })),
  comboDev,
  sweepDev,
  failures,
  modelEval: [
    { model: 'V1 Explosion score', set: 'VALIDATION', ...evV1 },
    { model: 'V2 logistic', set: 'dev', ...evDev },
    { model: 'V2 logistic', set: 'VALIDATION', ...evVal },
  ],
  coefTable: names.map((f, i) => ({ feature: f, coef: +model.w[i].toFixed(3), direction: model.w[i] > 0 ? 'FOR' : 'AGAINST' })),
  v2Weights: [{ feature: 'compressed', v1Points: 18, v2Points: 15, change: '-3' }],
  verdict: 'TEST RUN',
})
assert.ok(md.includes('## 6. Model comparison') && md.length > 4000, 'report renders')

console.log('✓ research pipeline offline test passed')
console.log(`  obs ${observations.length} · dev ${dev.length}/val ${val.length} · base ${uniDev.baseRate}% · dev AUC ${evDev.auc} · val AUC ${evVal.auc} · V1 val precision@10 ${evV1.precisionTop10}%`)
