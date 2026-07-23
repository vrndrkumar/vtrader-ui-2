// Offline test: Phase-5 series builder, motif detectors, quality metrics.
// Uses constructed series with KNOWN motifs to verify detection logic.
import assert from 'node:assert'
import {
  buildSeries, findEpisodes, detectM1, baselineM1, detectM2, detectM4,
  detectF2, detectM5F3, detectM6, detectM7, detectF1, qualityMetrics, withOutcomes,
} from '../research/phase5lib.js'

// ── constructed price series: advance → orderly base (with spring) → markup ──
function constructedStock() {
  const candles = []
  let t = Math.floor(new Date('2022-01-03').getTime() / 1000)
  const push = (o, h, l, c, v) => { candles.push({ time: t, open: o, high: h, low: l, close: c, volume: v }); t += 86400 * (candles.length % 5 === 4 ? 3 : 1) }
  let px = 140
  // 0) decline: 130 bars, −40% (weekly state → false, enabling a real TURN later)
  for (let i = 0; i < 130; i++) { const nx = px * 0.996; push(px, px * 1.002, nx * 0.996, nx, 600000); px = nx }
  // 1) sharp advance: 60 bars, +80% (steep enough to break the ±8% base band)
  for (let i = 0; i < 60; i++) { const nx = px * 1.01; push(px, nx * 1.004, px * 0.998, nx, 800000); px = nx }
  // 2) base: 50 bars, contracting wiggle + declining volume (dry-up deepening)
  const baseMid = px
  for (let i = 0; i < 50; i++) {
    const amp = 0.025 * (1 - i / 70) // contracting
    const c2 = baseMid * (1 + Math.sin(i / 4) * amp)
    const vol = Math.round(800000 * (1 - (i / 50) * 0.6)) // declining volume
    push(c2 * 0.999, c2 * 1.005, c2 * 0.995, c2, vol)
    px = c2
  }
  // 3) spring: quiet undercut of the base low, recovered in 3 bars
  const baseLow = baseMid * 0.97
  push(px, px, baseLow * 0.985, baseLow * 0.99, 200000)
  push(baseLow * 0.99, baseMid * 0.99, baseLow * 0.99, baseMid * 0.985, 250000)
  push(baseMid * 0.985, baseMid * 1.01, baseMid * 0.98, baseMid * 1.005, 300000)
  px = baseMid * 1.005
  // 4) markup: 130 bars at +0.7%/bar (M1 signals win label D within 120 bars)
  for (let i = 0; i < 130; i++) { const nx = px * 1.007; push(px, nx * 1.004, px * 0.998, nx, 900000); px = nx }
  return candles
}

function flatNifty(n) {
  const candles = []
  let t = Math.floor(new Date('2022-01-03').getTime() / 1000)
  let px = 10000
  for (let i = 0; i < n; i++) {
    px = px * (1 + (i % 7 === 3 ? -0.004 : 0.001)) // some down days for down-day RS
    candles.push({ time: t, open: px, high: px * 1.002, low: px * 0.998, close: px, volume: 1 })
    t += 86400 * (i % 5 === 4 ? 3 : 1)
  }
  return candles
}

const daily = constructedStock()
const nifty = flatNifty(daily.length + 10)
const S = buildSeries(daily, nifty)

// series sanity
assert.equal(S.n, daily.length, 'series length')
assert.ok(S.priorGain120.some((v) => v != null && v >= 30), 'prior advance detected in series')
assert.ok(S.baseLen.some((v) => v >= 10), 'base forms')
assert.ok(S.turnBars.length >= 1, 'weekly turn(s) detected across advance/markup')
assert.ok(S.dryUp.filter((v) => v != null).length > 100, 'dry-up series populated')
assert.ok(S.closingRange20.some((v) => v != null), 'closing range computed')
assert.ok(S.downDayRS.some((v) => v != null), 'down-day RS computed')

// episodes + M1: base after +60% advance must register
const eps = findEpisodes(S)
assert.ok(eps.length >= 1, `episodes found (${eps.length})`)
const m1 = detectM1(S, eps)
assert.ok(m1.length >= 1, 'M1 rest-after-run detected on constructed gem')
assert.ok(baselineM1(S).length >= 1, 'M1 unordered baseline non-empty')

// M2 contraction: constructed base has shrinking amplitude
const m2 = detectM2(S, eps)
assert.ok(Array.isArray(m2), 'M2 runs')

// spring detection: constructed undercut+recover on low volume
const { springs, failures } = detectM5F3(S, eps)
assert.ok(springs.length >= 1, `spring detected (${springs.length})`)
assert.ok(failures.length === 0 || failures.length < springs.length + 2, 'no spurious failure flood')

// M4/F2 partition all turn bars
const m4 = detectM4(S)
const f2 = detectF2(S)
assert.equal(m4.length + f2.length, S.turnBars.length, 'M4 + F2 partition turns')

// F1: constructed base has declining volume, no distribution → should be clean
const { flagged, clean } = detectF1(S, eps)
assert.ok(clean.length >= 1 && flagged.length === 0, 'orderly base not flagged as distribution')

// M6/M7 run without error
assert.ok(Array.isArray(detectM6(S)) && Array.isArray(detectM7(S)), 'M6/M7 run')

// quality metrics on the M1 episode
const q = qualityMetrics(S, m1[0].ep)
assert.ok(q, 'quality computed')
assert.ok(q.pathEfficiency == null || (q.pathEfficiency >= 0 && q.pathEfficiency <= 1), 'path efficiency bounded')
assert.ok(q.worstDropShare == null || (q.worstDropShare >= 0 && q.worstDropShare <= 1.01), 'worst drop share bounded')
assert.ok(q.retracement == null || q.retracement < 2, 'retracement sane')
assert.ok(q.volDownCorr == null || (q.volDownCorr >= -1 && q.volDownCorr <= 1), 'volume corr bounded')
assert.ok(q.floorTouches >= 0, 'floor touches non-negative')

// outcomes: signals in the base should be winners (markup follows +50%)
const withO = withOutcomes(daily, m1)
assert.ok(withO.length >= 1 && withO.every((e) => typeof e.winB === 'boolean'), 'outcomes attached')
assert.ok(withO.some((e) => e.winD === true), 'constructed gem wins label D (markup follows the base)')

// no look-ahead: an event near the series end has no outcome
const tailEvent = [{ bar: daily.length - 5 }]
assert.equal(withOutcomes(daily, tailEvent).length, 0, 'no forward window → event dropped, not faked')

console.log('✓ phase-5 offline tests passed')
console.log(`  episodes ${eps.length} · M1 ${m1.length} · springs ${springs.length} · turns ${S.turnBars.length} (M4 ${m4.length}/F2 ${f2.length})`)
