// Offline test of the Phase-3 pipeline on a synthetic universe (no network/DB).
import assert from 'node:assert'
import { extractObservations } from '../research/features.js'
import { splitDevVal, designMatrix } from '../research/analyze.js'
import { attachLabels } from '../research/phase2lib.js'
import {
  ENGINES, trainUniversal, engineComparison, engineFeatureTable,
  breakoutDefinitionSweep, reversalSignalTest, multibaggerStudy,
  engineCapture, riskSeparationTest, featureUniversality,
} from '../research/phase3lib.js'
import { renderPhase3 } from '../research/phase3report.js'
import { sma, closes } from '../src/indicators.js'

function synthSeries(seed, n = 1600) {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const candles = []
  let px = 20 + rnd() * 900
  let t = Math.floor(new Date('2020-01-06').getTime() / 1000)
  let regime = rnd()
  for (let i = 0; i < n; i++) {
    if (i % 100 === 0) regime = rnd()
    const drift = (regime - 0.40) * 0.8 // some strong up-regimes → big movers exist
    const vol = 0.6 + rnd() * 2.6
    const chg = ((drift + (rnd() - 0.5) * vol) / 100) * px
    const open = px
    const close = Math.max(2, px + chg)
    const high = Math.max(open, close) * (1 + rnd() * 0.012)
    const low = Math.min(open, close) * (1 - rnd() * 0.012)
    const volume = Math.round(4e5 * (0.5 + rnd() * 2))
    candles.push({ time: t, open, high, low, close, volume })
    px = close
    t += 86400 * (i % 5 === 4 ? 3 : 1)
  }
  return candles
}

const dateOf = (c) => new Date(c.time * 1000).toISOString().slice(0, 10)
const nifty = synthSeries(3)
const niftyByDate = new Map(nifty.map((c) => [dateOf(c), c.close]))
const nSma = sma(closes(nifty), 200)
const regimeByDate = new Map(nifty.map((c, i) => [dateOf(c), nSma[i] != null ? c.close > nSma[i] : null]))

const dailyBySymbol = new Map()
const observations = []
for (let k = 0; k < 30; k++) {
  const candles = synthSeries(60 + k * 11)
  const sym = `S${k}-EQ`
  dailyBySymbol.set(sym, candles)
  observations.push(...extractObservations(sym, { sector: 'X' }, candles, niftyByDate, regimeByDate, null))
}
attachLabels(observations, dailyBySymbol)

// new features present + trailing-only sanity
const withRt = observations.filter((o) => o.rangeTight20 != null)
assert.ok(withRt.length > observations.length * 0.9, 'rangeTight20 populated')
assert.ok(observations.every((o) => o.rangeTight20 == null || o.rangeTight20 >= 0), 'tightness non-negative')
assert.ok(observations.some((o) => o.rsiRecovery === true) || observations.some((o) => o.rsiRecovery === false), 'rsiRecovery computed')
assert.ok(observations.some((o) => o.higherLow != null), 'higherLow computed')
assert.ok(observations.every((o) => o.barsSinceHigh == null || (o.barsSinceHigh >= 0 && o.barsSinceHigh <= 250)), 'barsSinceHigh in range')
assert.ok(observations.some((o) => o.priorGain120 != null), 'priorGain120 computed')

const { dev, val } = splitDevVal(observations)
const universal = trainUniversal(dev, 'B')
assert.ok(typeof universal.scoreFn(dev[0]) === 'number', 'universal scores')

const { rows: engineRows, engineModels } = engineComparison(dev, val, universal)
assert.equal(engineRows.length, 4, 'four engines evaluated')
for (const r of engineRows) assert.ok(r.note || (r.specPrec != null && r.uniPrec != null), 'engine row complete')

const feats = engineFeatureTable(dev)
assert.ok(feats.length > 10, 'per-engine feature lifts computed')

const sweep = breakoutDefinitionSweep(dev)
assert.ok(sweep.rows.length >= 5, 'breakout definitions swept')

const rev = reversalSignalTest(dev)
assert.ok(rev.candN > 0 && Array.isArray(rev.rows), 'reversal candidates found')

const mb = multibaggerStudy(dev, 'E')
assert.ok(mb.insufficient === true || mb.rows.length >= 4, 'multibagger study runs')

const cap = engineCapture(val, engineModels, universal)
assert.ok(cap.length >= 4, 'capture rows produced')

const risk = riskSeparationTest(val, universal)
assert.equal(risk.rows.length, 2, 'risk buckets')

const { names } = designMatrix(dev.slice(0, 5))
const uni = featureUniversality(engineModels, universal, names)
assert.ok(uni.length === names.length, 'universality table complete')

const md = renderPhase3({
  datasetInfo: 'synthetic (offline test)',
  engineRows, engineFeats: feats, breakoutSweep: sweep, reversal: rev,
  mbStudy: mb, capture: cap, riskSep: risk, universality: uni,
  architecture: 'TEST',
})
assert.ok(md.includes('## 9. Architecture recommendation') && md.length > 3000, 'report renders')

console.log('✓ phase-3 pipeline offline test passed')
console.log(`  obs ${observations.length} · engines: ${engineRows.map((r) => `${r.engine?.split(' (')[0] ?? '?'}${r.note ? '(skip)' : ''}`).join(', ')}`)
console.log(`  mb winners: ${mb.nWinners ?? 0}${mb.insufficient ? ' (insufficient — expected on synthetic)' : ''}`)
