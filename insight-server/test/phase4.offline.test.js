// Offline test of the Phase-4 pipeline on a synthetic universe (no network/DB).
import assert from 'node:assert'
import { extractObservations } from '../research/features.js'
import { splitDevVal } from '../research/analyze.js'
import { attachLabels } from '../research/phase2lib.js'
import {
  attachTransitions, attachWeeklyRanks, findEpisodes, discoveryTiming,
  priorAdvanceDecomposition, discoveryFalsePositives,
  discoveryScore, transitionScore, continuationScore,
} from '../research/phase4lib.js'
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
    const drift = (regime - 0.40) * 0.8
    const vol = 0.6 + rnd() * 2.6
    const chg = ((drift + (rnd() - 0.5) * vol) / 100) * px
    const open = px
    const close = Math.max(2, px + chg)
    const high = Math.max(open, close) * (1 + rnd() * 0.012)
    const low = Math.min(open, close) * (1 - rnd() * 0.012)
    candles.push({ time: t, open, high, low, close, volume: Math.round(4e5 * (0.5 + rnd() * 2)) })
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
attachTransitions(observations)
attachWeeklyRanks(observations)

// transitions computed and boolean-ish
assert.ok(observations.some((o) => o.weeklyTurn === true), 'some weekly turns found')
assert.ok(observations.some((o) => o.sma200Reclaim === true), 'some 200SMA reclaims found')
// ranks in [0,1] and every engine ranked
for (const o of observations.slice(0, 200)) {
  assert.ok(o.rank && ['Discovery', 'Transition', 'Continuation'].every((k) => o.rank[k] >= 0 && o.rank[k] <= 1), 'ranks attached')
}
// scores bounded
for (const o of observations.slice(0, 500)) {
  for (const fn of [discoveryScore, transitionScore, continuationScore]) {
    const s = fn(o)
    assert.ok(s >= 0 && s <= 100, 'score in [0,100]')
  }
}

const { dev, val } = splitDevVal(observations)

const eps = findEpisodes(val, '+50%/120b')
assert.ok(Array.isArray(eps), 'episodes found')
if (eps.length) {
  // episodes must be ≥40 bars apart per symbol
  const bySym = new Map()
  for (const e of eps) {
    const prev = bySym.get(e.symbol)
    if (prev != null) assert.ok(e.startBar - prev > 40, 'episode gap respected')
    bySym.set(e.symbol, e.startBar)
  }
}

const timing = discoveryTiming(val, '+50%/120b')
assert.equal(timing.length, 4, 'four detectors timed')
for (const t of timing) {
  assert.ok(t.detectedPct == null || (t.detectedPct >= 0 && t.detectedPct <= 100), 'detection pct sane')
  if (t.medianLeadBars != null) assert.ok(t.medianLeadBars >= 0 && t.medianLeadBars <= 250, 'lead in window')
}

const decomp = priorAdvanceDecomposition(dev)
assert.ok(decomp.rows.length === 5, 'five decomposition rows')

const fps = discoveryFalsePositives(dev, 'D')
assert.equal(fps.rows.length, 10, 'ten fp conditions')
assert.ok(fps.topN > 0, 'top decile non-empty')

console.log('✓ phase-4 pipeline offline test passed')
console.log(`  obs ${observations.length} · episodes(+50%) ${eps.length} · discovery top-decile n ${fps.topN} (hit ${fps.baseWin}%)`)
