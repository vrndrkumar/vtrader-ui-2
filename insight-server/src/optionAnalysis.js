// ── Option-buying analysis (ported from Option-Analysis/option_signal.py +
//    decision.py) ─────────────────────────────────────────────────────────────
// PURE, deterministic signal + decision math. No data fetching, no AI, no
// execution. Buying-only. Faithful port of the Python reference; VWAP is dropped
// (our index candles carry no volume) and AI sentiment is always NEUTRAL.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

// ── strikes ──────────────────────────────────────────────────────────────────
export function getStrikeInterval(sortedStrikes) {
  if (sortedStrikes.length < 2) throw new Error('need at least 2 strikes to derive strike interval')
  const diffs = []
  for (let i = 1; i < sortedStrikes.length; i++) { const d = sortedStrikes[i] - sortedStrikes[i - 1]; if (d > 0) diffs.push(d) }
  if (!diffs.length) throw new Error('could not derive a positive strike interval')
  return Math.min(...diffs)
}
export const getAtmStrike = (spot, interval) => Math.round(spot / interval) * interval

// ── OI bias (real PCR + proximity/oi-change-weighted PCR) ────────────────────
export function computeOiBias(strikeOiData, pcrThreshold, spot = null, interval = null, windowStrikes = 5, strikeOiChangeRatios = null, oiChangeClamp = 0.5) {
  const entries = Object.entries(strikeOiData).map(([s, v]) => [Number(s), v])
  const totalCallOi = entries.reduce((a, [, v]) => a + (v.CE || 0), 0)
  const totalPutOi = entries.reduce((a, [, v]) => a + (v.PE || 0), 0)
  const pcr = totalCallOi <= 0 ? (totalPutOi > 0 ? Infinity : 0) : totalPutOi / totalCallOi

  const proximity = (strike) => {
    if (spot == null || !interval) return 1
    const maxD = windowStrikes * interval
    if (maxD <= 0) return 1
    return Math.max(0, 1 - Math.abs(strike - spot) / maxD)
  }
  const changeMul = (strike, opt) => {
    const ratio = strikeOiChangeRatios?.[strike]?.[opt]
    if (ratio == null) return 1
    return clamp(ratio, 1 - oiChangeClamp, 1 + oiChangeClamp)
  }
  let wCall = 0, wPut = 0
  for (const [strike, v] of entries) {
    wCall += (v.CE || 0) * proximity(strike) * changeMul(strike, 'CE')
    wPut += (v.PE || 0) * proximity(strike) * changeMul(strike, 'PE')
  }
  const weightedPcr = wCall <= 0 ? (wPut > 0 ? Infinity : 0) : wPut / wCall
  const oiBias = weightedPcr > 1 + pcrThreshold ? 'BULLISH' : weightedPcr < 1 - pcrThreshold ? 'BEARISH' : 'NEUTRAL'
  return { pcr, weightedPcr, oiBias, totalCallOi, totalPutOi }
}

// ── opening-range breakout ───────────────────────────────────────────────────
export const computeOrbBias = (price, orbHigh, orbLow) => (price > orbHigh ? 'BULLISH' : price < orbLow ? 'BEARISH' : 'NEUTRAL')

// ── central pivot range width (yesterday H/L/C) ─────────────────────────────
export function computeCprWidth(prevHigh, prevLow, prevClose) {
  const pivot = (prevHigh + prevLow + prevClose) / 3
  const bc = (prevHigh + prevLow) / 2
  const tc = 2 * pivot - bc
  return Math.abs(tc - bc)
}

// ── today's realized move vs VIX expected move ───────────────────────────────
export function computeMomentumBias(pointsMovedFromOpen, expectedMove, minFraction = 0.25, maxFraction = 0.65) {
  if (expectedMove == null || expectedMove <= 0 || pointsMovedFromOpen == null) return { momentumBias: 'NEUTRAL', usedFraction: null }
  const usedFraction = Math.abs(pointsMovedFromOpen) / expectedMove
  const momentumBias = usedFraction >= minFraction && usedFraction <= maxFraction ? (pointsMovedFromOpen > 0 ? 'BULLISH' : 'BEARISH') : 'NEUTRAL'
  return { momentumBias, usedFraction }
}

// ── 0-100 "how likely is a big move today" gauge ─────────────────────────────
export function computeVolatilityConfidence(expectedMove, avgRange, orbBias, momentumUsedFraction, {
  resistanceOiChangeRatio = null, supportOiChangeRatio = null, oiChangeClamp = 0.5, cprWidthRatio = null,
  ratioScale = 50, orbBonus = 15, momentumScale = 20, oiBuildupScale = 15, cprNarrowScale = 15,
} = {}) {
  if (expectedMove == null || !avgRange || avgRange <= 0) return null
  let confidence = (expectedMove / avgRange) * ratioScale
  if (orbBias && orbBias !== 'NEUTRAL') confidence += orbBonus
  if (momentumUsedFraction != null) confidence += Math.min(momentumScale, Math.max(0, momentumUsedFraction) * momentumScale)
  const oiMags = [resistanceOiChangeRatio, supportOiChangeRatio].filter((r) => r != null).map((r) => Math.min(oiChangeClamp, Math.abs(r - 1)))
  if (oiMags.length && oiChangeClamp > 0) confidence += (mean(oiMags) / oiChangeClamp) * oiBuildupScale
  if (cprWidthRatio != null) confidence += Math.max(0, 1 - cprWidthRatio / (1 / 3)) * cprNarrowScale
  return clamp(confidence, 0, 100)
}

// ── majority-vote bias ───────────────────────────────────────────────────────
export function combineBias(...biases) {
  const bullish = biases.filter((b) => b === 'BULLISH').length
  const bearish = biases.filter((b) => b === 'BEARISH').length
  if (bullish >= 2 && bullish > bearish) return 'BULLISH'
  if (bearish >= 2 && bearish > bullish) return 'BEARISH'
  return 'NEUTRAL'
}

// ── gap flag ─────────────────────────────────────────────────────────────────
export function computeGapFlag(dailyRanges, todayOpen, yesterdayClose, gapThresholdFactor) {
  if (!dailyRanges.length) throw new Error('dailyRanges must not be empty')
  const avgRange = mean(dailyRanges)
  const gap = todayOpen - yesterdayClose
  return { avgRange, gap, largeGap: Math.abs(gap) > avgRange * gapThresholdFactor }
}

// ── VIX 1-day expected move ─────────────────────────────────────────────────
export function computeVixExpectedMove(spot, indiaVix, tradingDaysPerYear = 252) {
  if (spot <= 0 || indiaVix < 0) throw new Error('spot must be positive and india_vix non-negative')
  return spot * (indiaVix / 100) * Math.sqrt(1 / tradingDaysPerYear)
}

// ── avg |close-open| over recent completed days ─────────────────────────────
export const computeAvgOpenToCloseRange = (dailyCandles) =>
  !dailyCandles || !dailyCandles.length ? null : mean(dailyCandles.map((c) => Math.abs(c.close - c.open)))

// ── nearest OI walls (resistance = max CE OI above ATM, support = max PE below) ─
export function computeOiWalls(strikeOiData, atmStrike) {
  let resistanceStrike = null, resistanceOi = 0, supportStrike = null, supportOi = 0
  for (const [s, v] of Object.entries(strikeOiData)) {
    const strike = Number(s)
    if (strike > atmStrike) { const ce = v.CE || 0; if (ce > resistanceOi) { resistanceStrike = strike; resistanceOi = ce } }
    else if (strike < atmStrike) { const pe = v.PE || 0; if (pe > supportOi) { supportStrike = strike; supportOi = pe } }
  }
  return { resistanceStrike, resistanceOi, supportStrike, supportOi }
}

// ── OI-wall base probability (proximity + oi-change weighted) ────────────────
export function computeDirectionProbability(supportOi, resistanceOi, {
  supportStrike = null, resistanceStrike = null, spot = null, interval = null, windowStrikes = 5,
  supportOiChangeRatio = null, resistanceOiChangeRatio = null, oiChangeClamp = 0.5,
} = {}) {
  const weighted = (strike, oi, oiChangeRatio) => {
    oi = oi || 0
    let w
    if (strike == null || spot == null || !interval) w = oi
    else { const maxD = windowStrikes * interval; w = maxD <= 0 ? oi : oi * Math.max(0, 1 - Math.abs(strike - spot) / maxD) }
    if (oiChangeRatio != null) w *= clamp(oiChangeRatio, 1 - oiChangeClamp, 1 + oiChangeClamp)
    return w
  }
  const wSupport = weighted(supportStrike, supportOi, supportOiChangeRatio)
  const wResistance = weighted(resistanceStrike, resistanceOi, resistanceOiChangeRatio)
  const total = wSupport + wResistance
  if (total <= 0) return { upsideProbability: 0.5, downsideProbability: 0.5 }
  const upside = wSupport / total
  return { upsideProbability: upside, downsideProbability: 1 - upside }
}

// ── ATM fresh OI-change bias (PE build-up = bullish, CE build-up = bearish) ──
export function computeAtmOiChangeBias(atmCeOiChangeRatio, atmPeOiChangeRatio, threshold = 0.1) {
  if (atmCeOiChangeRatio == null || atmPeOiChangeRatio == null) return 'NEUTRAL'
  const diff = atmPeOiChangeRatio - atmCeOiChangeRatio
  return diff > threshold ? 'BULLISH' : diff < -threshold ? 'BEARISH' : 'NEUTRAL'
}

// ── final probability: OI-wall base nudged by the other signals ─────────────
export function combineProbabilitySignals(baseUpside, pcr, pcrThreshold, vwapBias, orbBias, gap, aiSentiment, momentumBias = 'NEUTRAL', atmOiBias = 'NEUTRAL', adjustmentPerSignal = 0.05) {
  let net = 0
  if (pcr != null) { if (pcr > 1 + pcrThreshold) net += 1; else if (pcr < 1 - pcrThreshold) net -= 1 }
  if (vwapBias === 'BULLISH') net += 1; else if (vwapBias === 'BEARISH') net -= 1
  if (orbBias === 'BULLISH') net += 1; else if (orbBias === 'BEARISH') net -= 1
  if (gap != null) { if (gap > 0) net += 1; else if (gap < 0) net -= 1 }
  if (atmOiBias === 'BULLISH') net += 1; else if (atmOiBias === 'BEARISH') net -= 1
  if (aiSentiment === 'POSITIVE') net += 1; else if (aiSentiment === 'NEGATIVE') net -= 1
  if (momentumBias === 'BULLISH') net += 1; else if (momentumBias === 'BEARISH') net -= 1
  const upside = clamp(baseUpside + net * adjustmentPerSignal, 0.05, 0.95)
  return { upsideProbability: upside, downsideProbability: 1 - upside, net }
}

// ── final BUY-direction decision (truth table) ──────────────────────────────
export function decideDirection(upsideProbability, aiSentiment, largeGap, {
  rangeTooTight = false, expectedMove = null, requiredMoveCall = null, requiredMovePut = null, requiredMoveBoth = null,
  callThreshold = 0.55, putThreshold = 0.45,
} = {}) {
  if (!(upsideProbability >= 0 && upsideProbability <= 1)) throw new Error(`upsideProbability out of range: ${upsideProbability}`)
  if (!(putThreshold < callThreshold)) throw new Error('putThreshold must be < callThreshold')
  if (rangeTooTight) return 'NO_TRADE'
  if (largeGap) return 'BOTH'
  const callCanProfit = expectedMove != null && requiredMoveCall != null && expectedMove >= requiredMoveCall
  const putCanProfit = expectedMove != null && requiredMovePut != null && expectedMove >= requiredMovePut
  const bothCanProfit = expectedMove != null && requiredMoveBoth != null && expectedMove >= requiredMoveBoth
  if (upsideProbability >= callThreshold) {
    if (aiSentiment === 'NEGATIVE') return bothCanProfit ? 'BOTH' : 'NO_TRADE'
    return callCanProfit ? 'CALL' : 'NO_TRADE'
  }
  if (upsideProbability <= putThreshold) {
    if (aiSentiment === 'POSITIVE') return bothCanProfit ? 'BOTH' : 'NO_TRADE'
    return putCanProfit ? 'PUT' : 'NO_TRADE'
  }
  return bothCanProfit ? 'BOTH' : 'NO_TRADE'
}
