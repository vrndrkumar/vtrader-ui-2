// Offline unit test: featureSnapshot + production engines v3 (no network/DB).
import assert from 'node:assert'
import { featureSnapshot, toWeekly } from '../src/featureSnapshot.js'
import {
  analyse, momentumEngine, riskLayer, deriveBadges, lifecycle, conviction, executiveSummary,
} from '../src/engines.js'

function synth(seed, n = 900, profile = 'base') {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const candles = []
  let px = 200
  let t = Math.floor(new Date('2022-01-03').getTime() / 1000)
  for (let i = 0; i < n; i++) {
    let drift = 0
    let vol = 2
    if (profile === 'gem') {
      if (i < 400) { drift = 0.35; vol = 2.5 }
      else if (i < 800) { drift = 0; vol = Math.max(0.8, 2.5 - (i - 400) * 0.006) }
      else { drift = 0.1; vol = 1 }
    } else if (profile === 'leader') {
      drift = 0.25
      vol = 1.8
    } else if (profile === 'decliner') {
      drift = i < 600 ? -0.25 : 0.05
      vol = 2.5
    }
    const chg = ((drift + (rnd() - 0.5) * vol) / 100) * px
    const open = px
    const close = Math.max(5, px + chg)
    const high = Math.max(open, close) * (1 + rnd() * 0.008)
    const low = Math.min(open, close) * (1 - rnd() * 0.008)
    const baseVol = profile === 'gem' && i >= 500 && i < 800 ? 2e5 : 6e5
    candles.push({ time: t, open, high, low, close, volume: Math.round(baseVol * (0.6 + rnd())) })
    px = close
    t += 86400 * (i % 5 === 4 ? 3 : 1)
  }
  return candles
}

const nifty = synth(5, 900, 'leader')

const VALID_BADGES = [
  'HIDDEN GEM CANDIDATE', 'EARLY DISCOVERY', 'QUIET ACCUMULATION', 'TRANSITION STARTED',
  'BUILDING STRENGTH', 'LEADERSHIP EMERGING', 'MOMENTUM ESTABLISHED', 'WATCHLIST', 'QUIET',
]

// snapshot shape
const f = featureSnapshot(synth(11, 900, 'gem'), nifty)
assert.ok(f && f.price > 0 && f.date, 'snapshot computed')
assert.equal(featureSnapshot(synth(1, 25), nifty), null, '<30 bars → null (truly unanalysable)')
// graceful degradation: ~57 bars (the SIKA-EQ case) yields a partial snapshot
const tiny = featureSnapshot(synth(9, 57), nifty)
assert.ok(tiny && tiny.historyComplete === false, '57-bar snapshot computed, flagged incomplete')
assert.ok(tiny.rsi != null && tiny.atrPct != null, 'short-term signals available at 57 bars')
const tiny45 = featureSnapshot(synth(9, 45), nifty)
assert.ok(tiny45 && tiny45.dryUpRatio === null, 'dry-up null under 50 bars')
assert.ok(tiny45.bbPct === null, 'BB percentile null without 60 defined widths')
assert.ok(analyse(tiny45).scores.discovery >= 0, 'analysis runs on 45-bar snapshot')
// 100 bars: long-horizon fields null
const partial = featureSnapshot(synth(1, 100), nifty)
assert.ok(partial && partial.historyComplete === false, 'partial snapshot flagged incomplete')
assert.equal(partial.priorGain120, null, 'prior advance unavailable with short history')
assert.equal(partial.above200, null, '200SMA unavailable with short history')
assert.equal(partial.weeklyUp, null, 'weekly trend unavailable with short history')
const partialAnalysis = analyse(partial)
assert.ok(partialAnalysis.riskFactors.some((x) => x.label === 'Limited price history'), 'limited-history risk factor present')
assert.ok(toWeekly(synth(2, 200)).length > 30, 'weekly resample works')

for (const profile of ['gem', 'leader', 'decliner', 'base']) {
  const ff = featureSnapshot(synth(23 + profile.length * 7, 900, profile), nifty)
  const a = analyse(ff)
  for (const key of ['discovery', 'transition', 'momentum', 'risk']) {
    assert.ok(a.scores[key] >= 0 && a.scores[key] <= 100, `${key} in [0,100]`)
  }
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(a.riskLevel), 'risk level valid')
  assert.ok(VALID_BADGES.includes(a.badge), `badge valid (${a.badge})`)
  assert.ok(Array.isArray(a.tags), 'warning tags array')
  assert.ok(['discovery', 'transition', 'momentum', 'none'].includes(a.phase), `phase valid (${a.phase})`)
  assert.ok(typeof a.earliness === 'string' && a.earliness.length > 10, 'earliness text')
  assert.ok(a.evidence.discovery.items.every((i) => i.theme && i.label && i.detail && i.points > 0), 'themed evidence')
  assert.ok(a.evidence.discovery.missing.every((m) => m.theme && m.label), 'themed missing items')
  assert.ok(a.summary.length > 60, 'executive summary substantial')
  assert.ok(a.honesty.includes('NOT'), 'honesty disclosure present')
  const json = JSON.stringify(a).toLowerCase()
  for (const banned of ['stoploss', 'stop_loss', 'entryzone', 'target1', '"entry"']) {
    assert.ok(!json.includes(banned), `no trading field: ${banned}`)
  }
}

// badge derivation logic
const mk = (d, t, m) => ({ discovery: d, transition: t, momentum: m, risk: 40 })
const base = { weeklyTurn: false, sma200Reclaim: false, dryUpRatio: 0.6, obvSlope: 1, volRatio: 1, trend: 'RANGE', higherLow: true, turnoverCr: 10, atrPct: 2 }
assert.equal(deriveBadges(base, mk(70, 20, 20)).badge, 'HIDDEN GEM CANDIDATE', 'gem: discovery >> momentum')
assert.equal(deriveBadges(base, mk(60, 20, 50)).badge, 'EARLY DISCOVERY', 'early: gap < 20')
assert.equal(deriveBadges(base, mk(45, 20, 10)).badge, 'QUIET ACCUMULATION', 'quiet accumulation via dryup+obv')
assert.equal(deriveBadges({ ...base, weeklyTurn: true }, mk(30, 60, 20)).badge, 'TRANSITION STARTED', 'transition w/ turn')
assert.equal(deriveBadges(base, mk(20, 30, 65)).badge, 'MOMENTUM ESTABLISHED', 'momentum established')
assert.equal(deriveBadges(base, mk(20, 30, 55)).badge, 'LEADERSHIP EMERGING', 'leadership emerging')
assert.equal(deriveBadges(base, mk(10, 10, 10)).badge, 'QUIET', 'quiet')
const tagged = deriveBadges({ ...base, obvSlope: -1, volRatio: 2, trend: 'DOWNTREND', higherLow: false, turnoverCr: 1, atrPct: 5 }, mk(40, 20, 10))
assert.ok(tagged.tags.includes('DISTRIBUTION RISK') && tagged.tags.includes('WEAK STRUCTURE') && tagged.tags.includes('THIN LIQUIDITY') && tagged.tags.includes('HIGH VOLATILITY'), 'warning tags fire')

// lifecycle + conviction
assert.equal(lifecycle(mk(70, 20, 10)).stage, 'discovery')
assert.equal(lifecycle(mk(30, 60, 20)).stage, 'transition')
assert.equal(lifecycle(mk(20, 40, 70)).stage, 'momentum')
const conv = conviction(mk(90, 40, 20), 99, 30)
assert.ok(conv.stars >= 4 && conv.label.length > 2, `high conviction (${conv.stars}★ ${conv.label})`)
const convLow = conviction(mk(10, 10, 10), 20, 80)
assert.ok(convLow.stars <= 2, 'low conviction')

// exec summary mentions the hidden-gem gap
const gemF = featureSnapshot(synth(11, 900, 'gem'), nifty)
const gemA = analyse(gemF)
if (gemA.scores.discovery - gemA.scores.momentum >= 20 && gemA.scores.discovery >= 50) {
  assert.ok(gemA.summary.includes('NOT yet recognised'), 'gem gap called out')
}

// momentum gating + risk stacking
const declF = featureSnapshot(synth(31, 900, 'decliner'), nifty)
if (!(declF.weeklyUp === true && declF.above200 === true)) {
  assert.equal(momentumEngine(declF).score, 0, 'momentum gated')
}
const r = riskLayer({ ...f, turnoverCr: 0.5, atrPct: 5, trend: 'DOWNTREND', higherLow: false, obvSlope: -1, dryUpRatio: 0.5, regimeUp: false, fromHighPct: -50 })
assert.equal(r.level, 'HIGH', 'stacked risks → HIGH')

console.log('✓ production engine v3 tests passed')
