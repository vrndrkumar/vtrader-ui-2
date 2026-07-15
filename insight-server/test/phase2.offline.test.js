// Offline test of the Phase-2 pipeline on a synthetic universe (no network/DB).
import assert from 'node:assert'
import { extractObservations, v1Score } from '../research/features.js'
import { splitDevVal, designMatrix, predict } from '../research/analyze.js'
import {
  LABELS, PRIMARY, attachLabels, labelSummaries, categoryAnalysis,
  earlyLateAnalysis, rankingSimulation, captureRates, walkForward, failureVetoes,
  forwardStats, tradingMetrics,
} from '../research/phase2lib.js'
import { renderPhase2 } from '../research/phase2report.js'
import { sma, closes } from '../src/indicators.js'

function synthSeries(seed, n = 1600) {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const candles = []
  let px = 50 + rnd() * 950
  let t = Math.floor(new Date('2020-01-06').getTime() / 1000)
  let regime = rnd()
  for (let i = 0; i < n; i++) {
    if (i % 110 === 0) regime = rnd()
    const drift = (regime - 0.42) * 0.5
    const vol = 0.6 + rnd() * 2.4
    const chg = ((drift + (rnd() - 0.5) * vol) / 100) * px
    const open = px
    const close = Math.max(3, px + chg)
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

// unit: forwardStats sanity
{
  const d = synthSeries(9, 400)
  const fs40 = forwardStats(d, 100, 40, 20)
  assert.ok(fs40 && Number.isFinite(fs40.maxGain) && fs40.maxDD <= 0.01, 'forwardStats shape')
  assert.equal(forwardStats(d, 395, 40, 20), null, 'insufficient forward → null')
  assert.ok(fs40.win === (fs40.timeToTarget != null), 'win consistent with timeToTarget')
}
// unit: tradingMetrics
{
  const m = tradingMetrics([10, -5, 3, -2, -1, 8])
  assert.equal(m.n, 6)
  assert.equal(m.worstLosingStreak, 2) // [-2, -1] is the longest losing run
  assert.ok(m.profitFactor > 1, 'profit factor computed')
}

const dailyBySymbol = new Map()
const observations = []
for (let k = 0; k < 28; k++) {
  const candles = synthSeries(50 + k * 7)
  const sym = `S${k}-EQ`
  dailyBySymbol.set(sym, candles)
  observations.push(...extractObservations(sym, { sector: 'X' }, candles, niftyByDate, regimeByDate, null))
}
attachLabels(observations, dailyBySymbol)
assert.ok(observations.every((o) => o.fwd && 'B' in o.fwd), 'labels attached')
assert.ok(observations.some((o) => o.fwd.E === null) || observations.some((o) => o.fwd.E), 'E label handled')

const { dev, val } = splitDevVal(observations)
const { rows: labelRows, models } = labelSummaries(dev, val)
assert.equal(labelRows.length, 5, 'five labels summarised')
for (const r of labelRows) assert.ok(r.nDev >= 0 && (r.winRateDev == null || (r.winRateDev >= 0 && r.winRateDev <= 100)), 'label stats sane')

const catDev = categoryAnalysis(dev, PRIMARY)
assert.equal(catDev.rows.length, 4, 'four categories')

const earlyLate = earlyLateAnalysis(dev, ['B', 'D'])
assert.ok(earlyLate.length === 6, 'stage × label rows')

const primaryModel = models[PRIMARY]
const v2Fn = primaryModel ? (o) => predict(primaryModel.model, designMatrix([o], primaryModel.stats).X[0]) : v1Score
const rankRows = rankingSimulation(val, { V1: v1Score, V2: v2Fn })
assert.ok(rankRows.length > 0, 'ranking sim produced rows')
assert.ok(rankRows.some((r) => r.scorer === 'Random baseline'), 'random baseline included')

const capture = captureRates(val, { V1: v1Score, V2: v2Fn })
assert.ok(Array.isArray(capture), 'capture computed')

const walkRows = walkForward(observations, PRIMARY)
assert.equal(walkRows.length, 4, 'four folds')

const vetoes = failureVetoes(dev, v2Fn, PRIMARY)
assert.equal(vetoes.rows.length, 10, 'veto conditions tabulated')

const md = renderPhase2({
  datasetInfo: 'synthetic (offline test)',
  labelRows, catDev, earlyLate,
  rankRowsVal: rankRows, captureVal: capture, walkRows, vetoes,
  answers: [{ q: 'test?', a: 'test.' }],
})
assert.ok(md.includes('## 5. Walk-forward validation') && md.length > 3000, 'report renders')

console.log('✓ phase-2 pipeline offline test passed')
const b = labelRows.find((r) => r.label.startsWith('B'))
console.log(`  obs ${observations.length} · label B base dev ${b.winRateDev}% val ${b.winRateVal}% · folds ${walkRows.filter((w) => w.v2Prec10 != null).length}/4 modelled`)
