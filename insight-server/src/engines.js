// ── Stock Insight production engines (v2 weights, v3 presentation) ───────────
// Scoring weights come from Phase 1-4 validation (2020-2026, 25k observations)
// and are FROZEN — change them only through the research protocol.
// v3 adds presentation intelligence on top: evidence themes (dedup), evidence-
// driven badges, opportunity lifecycle, conviction, executive summary.
//
// This is an intelligence/ranking system, NOT a trading system.

export const ENGINE_VERSION = 'v3-2026.07'

const compressed = (f) => f.bbPct != null && f.bbPct <= 30 && f.baseLen >= 10
const priorAdvance = (f) => f.priorGain120 != null && f.priorGain120 >= 30
const volDryUp = (f) => f.dryUpRatio != null && f.dryUpRatio < 0.75
const obvRising = (f) => f.obvSlope != null && f.obvSlope > 0

// Every evidence item carries a `theme` so the UI can de-duplicate signals
// shared across engines (shown once as "overall evidence").

export function discoveryEngine(f) {
  const items = []
  const missing = []
  let s = 0
  const add = (pts, theme, label, detail) => { s += pts; items.push({ ok: true, points: pts, theme, label, detail }) }
  const miss = (theme, label, detail) => missing.push({ theme, label, detail })

  if (priorAdvance(f)) add(30, 'priorAdvance', 'Prior strong advance', `+${f.priorGain120}% over ~6 months — demonstrated ability to move. The single strongest validated early signal (1.28×; every combo without it fell below base rate)`)
  else miss('priorAdvance', 'No prior advance', 'The strongest early evidence is absent — stocks that never demonstrated strength rarely lead the next expansion')

  if (f.weeklyTurn) add(20, 'weeklyTurn', 'Weekly structure turning', 'Weekly trend flipped up recently — the turn itself is early evidence; the established state is confirmation')
  else if (f.weeklyUp !== true) miss('weeklyTurn', 'Weekly trend not up yet', 'Discovery candidates often precede the weekly turn — watch for it')

  if (compressed(f) && priorAdvance(f)) add(15, 'compression', 'Quality compression', `Volatility squeeze (BB width ${f.bbPct}th pctile, ${f.baseLen}-bar base) AFTER a prior advance — the validated 1.3× recipe. Squeezes without prior strength tested at 0.95× and score nothing`)
  else if (compressed(f)) miss('compression', 'Compression without context', 'Squeeze present but no prior advance — historically no edge in that combination')

  if (volDryUp(f)) add(15, 'dryUp', 'Volume drying up', `10-day volume at ${Math.round((f.dryUpRatio ?? 0) * 100)}% of its 50-day average — supply going quiet (positive in every engine model tested)`)
  else miss('dryUp', 'No volume dry-up', 'Supply has not gone quiet yet')

  if (obvRising(f)) add(10, 'obv', 'Quiet accumulation footprint', 'On-balance volume rising while price is calm')
  else miss('obv', 'No accumulation footprint', 'OBV not rising — volume flow silent')

  if (f.fromHighPct != null && f.fromHighPct <= -15) add(10, 'location', 'Under-followed territory', `${f.fromHighPct}% below its 52-week high — future big winners sat deeper below highs than peers months before their moves`)

  return { score: Math.min(100, s), items, missing }
}

export function transitionEngine(f) {
  const items = []
  const missing = []
  let s = 0
  const add = (pts, theme, label, detail) => { s += pts; items.push({ ok: true, points: pts, theme, label, detail }) }
  const miss = (theme, label, detail) => missing.push({ theme, label, detail })

  if (f.sma200Reclaim) add(30, 'reclaim', '200-day average reclaimed', 'Price crossed back above the 200-SMA recently — the strongest validated recovery transition (1.38× in deep-decline contexts)')
  else if (f.above200 !== true) miss('reclaim', 'Below the 200-day average', 'The key long-term transition has not happened yet')

  if (f.weeklyTurn) add(25, 'weeklyTurn', 'Weekly trend just turned up', 'Fresh weekly uptrend — participation broadening (1.25× lift in early-stage names)')
  else if (f.weeklyUp === true) add(12, 'weeklyState', 'Weekly trend up (established)', 'Weekly uptrend in place — supportive, though the turn itself was the early event')

  if (volDryUp(f)) add(15, 'dryUp', 'Supply exhausted', 'Volume dry-up while price stabilises')
  if (f.higherLow === true) add(10, 'structure', 'Higher low formed', 'Sellers failing to make new lows — structure improving')
  if (obvRising(f)) add(10, 'obv', 'Volume flow confirming', 'OBV rising alongside the structural repair')
  if (f.choch) add(10, 'choch', 'Change of character', 'Price broke its last lower-high inside a downtrend')
  if (f.rs20 != null && f.rs60 != null && f.rs20 > f.rs60) add(5, 'rs', 'Relative strength improving', 'Performance vs NIFTY accelerating')
  else miss('rs', 'RS not improving yet', 'Still lagging or flat vs NIFTY')

  return { score: Math.min(100, s), items, missing }
}

export function momentumEngine(f) {
  const items = []
  const missing = []
  if (!(f.weeklyUp === true && f.above200 === true)) {
    return { score: 0, items, missing: [{ theme: 'trend', label: 'Not in an established trend', detail: 'Momentum engine only scores stocks in a weekly uptrend above the 200-SMA' }] }
  }
  let s = 30
  items.push({ ok: true, points: 30, theme: 'trend', label: 'Established trend', detail: 'Weekly uptrend + above the 200-SMA — recognised leadership context' })
  const add = (pts, theme, label, detail) => { s += pts; items.push({ ok: true, points: pts, theme, label, detail }) }

  if (priorAdvance(f)) add(20, 'priorAdvance', 'Sustained advance', `+${f.priorGain120}% over ~6 months — persistent demand`)
  if (f.adx != null && f.adx < 20) add(15, 'quietPullback', 'Quiet pullback', 'Low ADX — resting rather than distributing (1.10× in leader contexts)')
  if (volDryUp(f)) add(10, 'dryUp', 'Volume contraction in rest', 'Healthy digestion of gains')
  if (f.fromLowPct != null && f.fromLowPct > 80 && f.rsi != null && f.rsi > 72) add(10, 'extended', 'Powerful momentum', 'Strongly extended — these historically kept going more often than they reversed')
  if (f.rsi != null && f.rsi >= 45 && f.rsi <= 65) add(10, 'rsiMid', 'Balanced momentum', 'RSI mid-zone — trend intact without froth')

  return { score: Math.min(100, s), items, missing }
}

export function riskLayer(f) {
  const factors = []
  let s = 20
  const add = (pts, level, label, detail) => { s += pts; factors.push({ level, label, detail }) }

  if (f.atrPct != null && f.atrPct > 4) add(20, 'high', 'High volatility', `ATR ${f.atrPct}% of price — large daily swings, deeper drawdowns on failures`)
  else if (f.atrPct != null && f.atrPct > 2.5) add(10, 'warn', 'Elevated volatility', `ATR ${f.atrPct}% of price`)

  if (f.turnoverCr != null && f.turnoverCr < 2) add(20, 'high', 'Thin liquidity', `~₹${f.turnoverCr}cr average daily turnover — exit slippage risk. Many past big winners were small, so this is a flag, not a disqualifier`)
  else if (f.turnoverCr != null && f.turnoverCr < 5) add(10, 'warn', 'Modest liquidity', `~₹${f.turnoverCr}cr average daily turnover`)

  if (f.fromHighPct != null && f.fromHighPct < -40) add(15, 'warn', 'Deep drawdown', `${f.fromHighPct}% below 52-week high — recovery may take long or never come`)
  if (f.trend === 'DOWNTREND' && f.higherLow !== true) add(15, 'high', 'Weak structure', 'Daily downtrend with no higher low yet — falling-knife territory')
  if (f.obvSlope != null && f.obvSlope < 0 && f.dryUpRatio != null && f.dryUpRatio < 0.75) add(10, 'warn', 'Unconfirmed accumulation', 'Volume is quiet but OBV is falling — the quiet may be disinterest, not absorption')
  if (f.regimeUp === false) add(10, 'warn', 'Market regime down', 'NIFTY below its 200-day average — index-level headwind')
  if (f.historyComplete === false) add(10, 'warn', 'Limited price history', `Only ${f.historyBars} daily bars available — long-term signals (200-SMA, 52-week context, prior advance, weekly trend) are partly or fully unavailable, so scores are based on short-term evidence only`)

  const score = Math.min(100, s)
  const level = score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW'
  return { score, level, factors }
}

// ── Badges v2: driven by the strongest engine's evidence ─────────────────────

export function deriveBadges(f, scores) {
  const { discovery, transition, momentum } = scores
  const maxScore = Math.max(discovery, transition, momentum)
  const family = maxScore === momentum ? 'momentum' : maxScore === transition ? 'transition' : 'discovery'

  let badge = 'QUIET'
  if (maxScore < 35) badge = 'QUIET'
  else if (family === 'momentum') {
    badge = momentum >= 65 ? 'MOMENTUM ESTABLISHED' : momentum >= 50 ? 'LEADERSHIP EMERGING' : 'WATCHLIST'
  } else if (family === 'transition') {
    badge = transition >= 55 && (f.weeklyTurn || f.sma200Reclaim) ? 'TRANSITION STARTED'
      : transition >= 55 ? 'BUILDING STRENGTH'
      : 'WATCHLIST'
  } else {
    badge = discovery >= 55 && discovery - momentum >= 20 ? 'HIDDEN GEM CANDIDATE'
      : discovery >= 55 ? 'EARLY DISCOVERY'
      : discovery >= 40 && volDryUp(f) && obvRising(f) ? 'QUIET ACCUMULATION'
      : 'WATCHLIST'
  }

  // Warning tags — independent of the opportunity badge
  const tags = []
  if (f.obvSlope != null && f.obvSlope < 0 && f.volRatio != null && f.volRatio >= 1.4) tags.push('DISTRIBUTION RISK')
  if (f.trend === 'DOWNTREND' && f.higherLow !== true) tags.push('WEAK STRUCTURE')
  if (f.turnoverCr != null && f.turnoverCr < 2) tags.push('THIN LIQUIDITY')
  if (f.atrPct != null && f.atrPct > 4) tags.push('HIGH VOLATILITY')

  return { badge, tags, family }
}

/** Opportunity lifecycle: how early is this? */
export function lifecycle(scores) {
  const { discovery, transition, momentum } = scores
  let stage = 'none'
  if (momentum >= 55) stage = 'momentum'
  else if (transition >= 50 && transition >= discovery) stage = 'transition'
  else if (discovery >= 40) stage = 'discovery'
  else if (Math.max(discovery, transition, momentum) >= 35) stage = 'discovery'

  const earliness =
    stage === 'discovery' ? 'Early — before broad market recognition'
    : stage === 'transition' ? 'Middle — strength building, recognition beginning'
    : stage === 'momentum' ? 'Later-stage — the market already recognises this trend'
    : 'No active opportunity phase detected'
  return { stage, earliness }
}

/** Conviction (0-100 → 1-5 stars). Needs market percentile of the best engine. */
export function conviction(scores, marketPercentile, riskScore) {
  const maxScore = Math.max(scores.discovery, scores.transition, scores.momentum)
  const pct = marketPercentile ?? 50
  const raw = 0.45 * maxScore + 0.35 * pct + 0.2 * (100 - (riskScore ?? 50))
  const score = Math.round(Math.min(100, Math.max(0, raw)))
  const stars = score >= 78 ? 5 : score >= 64 ? 4 : score >= 50 ? 3 : score >= 36 ? 2 : 1
  const label = ['Minimal', 'Low', 'Moderate', 'High', 'Very High'][stars - 1]
  return { score, stars, label }
}

// ── Executive summary (analyst note, not indicator output) ───────────────────

export function executiveSummary(f, engines, badgeInfo, life, riskInfo) {
  const { discovery, transition, momentum } = engines
  const parts = []

  // 1. Why interesting today (or why not)
  const best = [
    { name: 'Discovery', ev: discovery, s: discovery.score },
    { name: 'Transition', ev: transition, s: transition.score },
    { name: 'Momentum', ev: momentum, s: momentum.score },
  ].sort((a, b) => b.s - a.s)[0]
  const topEvidence = best.ev.items.slice(0, 2).map((i) => i.label.toLowerCase())
  if (best.s >= 40 && topEvidence.length) {
    parts.push(`This stock is on the radar because of ${topEvidence.join(' and ')}.`)
  } else {
    parts.push('No strong opportunity evidence at the moment — this profile is quiet across all three engines.')
  }

  // 2. Strongest engine + stage
  parts.push(`Conviction is strongest in the ${best.name} engine (${best.s}/100). ${life.earliness}.`)

  // 3. Discovery-vs-momentum gap (the product's core question)
  const gap = engines.discovery.score - engines.momentum.score
  if (gap >= 20 && engines.discovery.score >= 50) {
    parts.push('Early evidence is much stronger than current momentum — the market has NOT yet recognised this stock. That is the hidden-gem profile this platform exists to surface.')
  } else if (-gap >= 20 && engines.momentum.score >= 50) {
    parts.push('The trend is already recognised by the market — this is a later-stage opportunity, not an undiscovered one.')
  }

  // 4. Biggest strength & biggest risk
  const strongest = best.ev.items[0]
  if (strongest) parts.push(`Biggest strength: ${strongest.label.toLowerCase()}.`)
  const topRisk = riskInfo.factors.find((x) => x.level === 'high') ?? riskInfo.factors[0]
  if (topRisk) parts.push(`Biggest risk: ${topRisk.label.toLowerCase()} (risk ${riskInfo.level}).`)
  else parts.push('No elevated risk factors detected.')

  return parts.join(' ')
}

/** Full analysis of one feature snapshot (rank-independent parts). */
export function analyse(f) {
  const discovery = discoveryEngine(f)
  const transition = transitionEngine(f)
  const momentum = momentumEngine(f)
  const risk = riskLayer(f)
  const scores = {
    discovery: discovery.score,
    transition: transition.score,
    momentum: momentum.score,
    risk: risk.score,
  }
  const badgeInfo = deriveBadges(f, scores)
  const life = lifecycle(scores)
  const summary = executiveSummary(f, { discovery, transition, momentum }, badgeInfo, life, risk)

  return {
    engineVersion: ENGINE_VERSION,
    features: f,
    scores,
    riskLevel: risk.level,
    badge: badgeInfo.badge,
    tags: badgeInfo.tags,
    family: badgeInfo.family,
    phase: life.stage,
    earliness: life.earliness,
    evidence: { discovery, transition, momentum },
    riskFactors: risk.factors,
    summary,
    honesty:
      'Historically ~32% of top-decile Discovery candidates advanced +50% within ~6 months (median detection lead ~7 months). Most candidates will NOT make a major move. This is research ranking, not a prediction or trading advice.',
  }
}
