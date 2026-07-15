// ── Phase-4: Early Discovery validation (pure functions, testable) ───────────
// Rule-based engine prototypes are DECLARED here from Phase-3 validated lifts.
// Point values were fixed before this run; do not tune them against Phase-4 output.
import { tradingMetrics } from './phase2lib.js'

const pct = (v, d = 1) => (v == null ? null : +v.toFixed(d))
const median = (a) => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}

// ── Transition features from per-symbol observation sequences ────────────────
// weeklyTurn: weeklyUp now, but NOT ~20+ bars ago. sma200Reclaim: same for 200SMA.
export function attachTransitions(obs) {
  const bySymbol = new Map()
  for (const o of obs) {
    if (!bySymbol.has(o.symbol)) bySymbol.set(o.symbol, [])
    bySymbol.get(o.symbol).push(o)
  }
  for (const list of bySymbol.values()) {
    list.sort((a, b) => a.barIndex - b.barIndex)
    for (let i = 0; i < list.length; i++) {
      const o = list[i]
      // nearest obs at least 20 bars back
      let prev = null
      for (let j = i - 1; j >= 0; j--) {
        if (o.barIndex - list[j].barIndex >= 20) { prev = list[j]; break }
      }
      o.weeklyTurn = prev ? o.weeklyUp === true && prev.weeklyUp !== true : null
      o.sma200Reclaim = prev ? o.aboveSma200 === true && prev.aboveSma200 !== true : null
    }
  }
  return bySymbol
}

// ── Rule-based engine prototypes (fixed weights) ─────────────────────────────

export function discoveryScore(o) {
  let s = 0
  const prior = o.priorGain120 != null && o.priorGain120 >= 30
  if (prior) s += 30
  if (o.weeklyTurn === true) s += 20
  if (prior && o.bbPct != null && o.bbPct <= 30 && o.baseLen >= 10) s += 15
  if (o.dryUpRatio != null && o.dryUpRatio < 0.75) s += 15
  if (o.obvSlope != null && o.obvSlope > 0) s += 10
  if (o.fromHighPct != null && o.fromHighPct <= -15) s += 10 // early-stage location, anti-confirmation
  return s
}

export function transitionScore(o) {
  let s = 0
  if (o.sma200Reclaim === true) s += 30
  if (o.weeklyTurn === true) s += 25
  if (o.dryUpRatio != null && o.dryUpRatio < 0.75) s += 15
  if (o.higherLow === true) s += 10
  if (o.obvSlope != null && o.obvSlope > 0) s += 10
  if (o.choch === true) s += 10
  return s
}

export function continuationScore(o) {
  let s = 0
  if (o.weeklyUp === true && o.aboveSma200 === true) s += 30
  else return 0 // continuation engine only scores in-trend stocks
  if (o.priorGain120 != null && o.priorGain120 >= 30) s += 20
  if (o.adx != null && o.adx < 20) s += 15
  if (o.dryUpRatio != null && o.dryUpRatio < 0.75) s += 10
  if (o.fromLowPct != null && o.fromLowPct > 80 && o.rsi != null && o.rsi > 72) s += 10
  if (o.rsi != null && o.rsi >= 45 && o.rsi <= 65) s += 10
  return s
}

export const ENGINE_SCORES = {
  Discovery: discoveryScore,
  Transition: transitionScore,
  Continuation: continuationScore,
}

// ── Weekly cross-sectional percentile ranks ──────────────────────────────────

const isoWeek = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

/** Attaches o.rank = { Discovery: pct0to1, ... } computed within each ISO week. */
export function attachWeeklyRanks(obs) {
  const byWeek = new Map()
  for (const o of obs) {
    const w = isoWeek(o.date)
    if (!byWeek.has(w)) byWeek.set(w, [])
    byWeek.get(w).push(o)
  }
  for (const list of byWeek.values()) {
    for (const [name, fn] of Object.entries(ENGINE_SCORES)) {
      const scored = list.map((o) => ({ o, s: fn(o) })).sort((a, b) => a.s - b.s)
      for (let i = 0; i < scored.length; i++) {
        // average rank for ties
        let j = i
        while (j + 1 < scored.length && scored[j + 1].s === scored[i].s) j++
        const p = scored.length > 1 ? ((i + j) / 2) / (scored.length - 1) : 0.5
        for (let k = i; k <= j; k++) {
          scored[k].o.rank = scored[k].o.rank || {}
          scored[k].o.rank[name] = p
        }
        i = j
      }
    }
  }
  return obs
}

// ── Move episodes + discovery timing ─────────────────────────────────────────

function winnerFlag(o, target) {
  if (target === '+50%/120b') return o.fwd?.D?.win === true
  if (target === '+100%/250b') return o.fwd?.E?.win === true
  if (target === '+200%/250b') return o.fwd?.E != null && o.fwd.E.maxGain >= 200
  return false
}
function eligible(o, target) {
  if (target === '+50%/120b') return o.fwd?.D != null
  return o.fwd?.E != null
}

/** Group consecutive winner observations per symbol into move episodes. */
export function findEpisodes(obs, target, gapBars = 40) {
  const bySymbol = new Map()
  for (const o of obs) {
    if (!eligible(o, target)) continue
    if (!bySymbol.has(o.symbol)) bySymbol.set(o.symbol, [])
    bySymbol.get(o.symbol).push(o)
  }
  const episodes = []
  for (const [symbol, list] of bySymbol) {
    list.sort((a, b) => a.barIndex - b.barIndex)
    let start = null
    let lastWinBar = null
    for (const o of list) {
      if (winnerFlag(o, target)) {
        if (start == null || o.barIndex - lastWinBar > gapBars) {
          if (start != null) episodes.push({ symbol, startBar: start })
          start = o.barIndex
        }
        lastWinBar = o.barIndex
      }
    }
    if (start != null) episodes.push({ symbol, startBar: start })
  }
  return episodes
}

/**
 * For each episode, when did each engine FIRST place the symbol in its
 * cross-sectional top decile (or top-20% for Discovery), scanning up to
 * 250 bars before the move start?
 */
export function discoveryTiming(obs, target) {
  const episodes = findEpisodes(obs, target)
  const bySymbol = new Map()
  for (const o of obs) {
    if (!bySymbol.has(o.symbol)) bySymbol.set(o.symbol, [])
    bySymbol.get(o.symbol).push(o)
  }
  for (const list of bySymbol.values()) list.sort((a, b) => a.barIndex - b.barIndex)

  const detectors = [
    { name: 'Discovery top 10%', engine: 'Discovery', cut: 0.9 },
    { name: 'Discovery top 20%', engine: 'Discovery', cut: 0.8 },
    { name: 'Transition top 10%', engine: 'Transition', cut: 0.9 },
    { name: 'Continuation top 10%', engine: 'Continuation', cut: 0.9 },
  ]
  const rows = []
  for (const det of detectors) {
    const leads = []
    let d30 = 0
    let d60 = 0
    let d90 = 0
    for (const ep of episodes) {
      const list = bySymbol.get(ep.symbol) ?? []
      // observations strictly before (or at) move start, within 250 bars
      const window = list.filter((o) => o.barIndex <= ep.startBar && ep.startBar - o.barIndex <= 250 && o.rank?.[det.engine] != null)
      const hits = window.filter((o) => o.rank[det.engine] >= det.cut)
      if (hits.length) {
        const first = hits[0]
        const lead = ep.startBar - first.barIndex
        leads.push(lead)
        if (lead >= 30) d30++
        if (lead >= 60) d60++
        if (lead >= 90) d90++
      }
    }
    const n = episodes.length || 1
    rows.push({
      target,
      detector: det.name,
      episodes: episodes.length,
      detectedPct: pct((leads.length / n) * 100),
      medianLeadBars: leads.length ? median(leads) : null,
      pct30dBefore: pct((d30 / n) * 100),
      pct60dBefore: pct((d60 / n) * 100),
      pct90dBefore: pct((d90 / n) * 100),
      randomAnyPct: det.cut === 0.8 ? '~20/obs' : '~10/obs',
    })
  }
  return rows
}

// ── Prior-advance decomposition ──────────────────────────────────────────────

export function priorAdvanceDecomposition(dev) {
  const defs = {
    'A) Prior advance alone': (o) => o.priorGain120 != null && o.priorGain120 >= 30,
    'B) Prior + compression + dry-up + OBV': (o) =>
      o.priorGain120 != null && o.priorGain120 >= 30 &&
      o.bbPct != null && o.bbPct <= 30 &&
      o.dryUpRatio != null && o.dryUpRatio < 0.75 &&
      o.obvSlope != null && o.obvSlope > 0,
    'C) Prior + weekly transition': (o) => o.priorGain120 != null && o.priorGain120 >= 30 && o.weeklyTurn === true,
    'CONTROL: compression + dry-up + OBV, NO prior': (o) =>
      (o.priorGain120 == null || o.priorGain120 < 30) &&
      o.bbPct != null && o.bbPct <= 30 &&
      o.dryUpRatio != null && o.dryUpRatio < 0.75 &&
      o.obvSlope != null && o.obvSlope > 0,
    'CONTROL: weekly transition, NO prior': (o) => (o.priorGain120 == null || o.priorGain120 < 30) && o.weeklyTurn === true,
  }
  const eligB = dev.filter((o) => o.fwd?.B)
  const baseB = eligB.filter((o) => o.fwd.B.win).length / (eligB.length || 1)
  const rows = []
  for (const [name, fn] of Object.entries(defs)) {
    const on = eligB.filter((o) => fn(o) === true)
    if (on.length < 30) { rows.push({ definition: name, n: on.length, note: 'n too small' }); continue }
    const pB = on.filter((o) => o.fwd.B.win).length / on.length
    const onD = on.filter((o) => o.fwd?.D)
    const pD = onD.length ? onD.filter((o) => o.fwd.D.win).length / onD.length : null
    const onE = on.filter((o) => o.fwd?.E)
    const pE = onE.length ? onE.filter((o) => o.fwd.E.win).length / onE.length : null
    rows.push({
      definition: name,
      n: on.length,
      pWinB: pct(pB * 100),
      liftB: baseB ? +(pB / baseB).toFixed(2) : null,
      pWinD: pD != null ? pct(pD * 100) : null,
      pWinE: pE != null ? pct(pE * 100) : null,
    })
  }
  return { baseB: pct(baseB * 100), rows }
}

// ── False-positive analysis of Discovery top decile ──────────────────────────

export function discoveryFalsePositives(dev, labelKey = 'D') {
  const elig = dev.filter((o) => o.fwd?.[labelKey] && o.rank?.Discovery != null)
  const top = elig.filter((o) => o.rank.Discovery >= 0.9)
  const losers = top.filter((o) => !o.fwd[labelKey].win)
  const winners = top.filter((o) => o.fwd[labelKey].win)
  const conds = {
    'Falling knife (daily downtrend, no higher low)': (o) => o.trend === 'DOWNTREND' && o.higherLow !== true,
    'Value trap (long decline, OBV falling)': (o) => o.barsSinceHigh != null && o.barsSinceHigh >= 120 && o.obvSlope != null && o.obvSlope < 0,
    'False accumulation (dry-up but OBV falling)': (o) => o.dryUpRatio != null && o.dryUpRatio < 0.75 && o.obvSlope != null && o.obvSlope < 0,
    'Thin liquidity (<₹2cr)': (o) => o.turnoverCr != null && o.turnoverCr < 2,
    'Illiquid-ish (<₹5cr)': (o) => o.turnoverCr != null && o.turnoverCr < 5,
    'Weak RS (rs20 ≤ 0)': (o) => o.rs20 != null && o.rs20 <= 0,
    'Regime down': (o) => o.regimeUp === false,
    'Weekly still down (no turn yet)': (o) => o.weeklyUp !== true && o.weeklyTurn !== true,
    'High ATR (>4%)': (o) => o.atrPct != null && o.atrPct > 4,
    'No prior advance': (o) => o.priorGain120 == null || o.priorGain120 < 30,
  }
  const rows = Object.entries(conds).map(([name, fn]) => {
    const pl = losers.length ? (losers.filter(fn).length / losers.length) * 100 : null
    const pw = winners.length ? (winners.filter(fn).length / winners.length) * 100 : null
    return {
      condition: name,
      pctLosers: pct(pl),
      pctWinners: pct(pw),
      vetoCandidate: pl != null && pw != null && pl > pw * 1.5 && pl > 10 ? 'YES' : '',
    }
  })
  rows.sort((a, b) => (b.pctLosers ?? 0) - (a.pctLosers ?? 0))
  const tm = tradingMetrics(top.filter((o) => o.fwd?.B).map((o) => o.fwd.B.retClose))
  return { topN: top.length, losersN: losers.length, baseWin: pct((winners.length / (top.length || 1)) * 100), rows, trading: tm }
}
