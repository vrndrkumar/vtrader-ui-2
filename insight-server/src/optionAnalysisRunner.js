// ── Option Insight analysis runner (Stage 2) ─────────────────────────────────
// Server-side data orchestration for the ported Option-Analysis BUYING engine.
// Faithful re-implementation of Option-Analysis/engine.py `_run_analysis`, but:
//   • NO Kite — data comes from our own APIs (data.vtrader.in option-chain + candle).
//   • NO trade execution — this only produces an analysis result.
//   • NO AI — ai_sentiment is always NEUTRAL (quantitative-only, per spec).
//   • Buying-only for now (selling deferred).
//   • VWAP dropped (index candles carry no volume) → vwap_bias NEUTRAL.
// Admin triggers a run for NIFTY/BANKNIFTY/SENSEX; the stored result is served
// to all users. Pure signal/decision math lives in ./optionAnalysis.js.
import * as A from './optionAnalysis.js'
import { fetchOptionChain, marketOpenNow } from './optionLab.js'
import { openFromAnalysis } from './optionDryRun.js'
import { getSettings } from './optionSettings.js'
import { kvGet, kvSet } from './optionStore.js'
import { config } from './config.js'

export const INDICES = ['NIFTY', 'BANKNIFTY', 'SENSEX']
const OI_WINDOW_STRIKES = 5

// ── IST helpers ──────────────────────────────────────────────────────────────
const istDate = () => new Date(Date.now() + 5.5 * 3600e3)
const fmtDay = (d) => d.toISOString().slice(0, 10)
const hhmm = () => { const d = istDate(); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` }
/** epoch (s or ms) → IST YYYY-MM-DD */
const dayKeyOf = (t) => { const ms = t < 1e12 ? t * 1000 : t; return fmtDay(new Date(ms + 5.5 * 3600e3)) }

// ── candle fetch (our API) ─────────────────────────────────────────────────
async function fetchCandles(symbol, frequency, days) {
  const to = new Date()
  const from = new Date(to.getTime() - days * 864e5)
  const url = `${config.candleBaseUrl}/data/candle?symbol=${encodeURIComponent(symbol)}&from=${fmtDay(from)}&to=${fmtDay(to)}&frequency=${frequency}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`candle ${res.status}`)
    const j = await res.json()
    return (Array.isArray(j?.candles) ? j.candles : [])
      .filter((c) => Number.isFinite(c?.close))
      .map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 }))
      .sort((a, b) => a.time - b.time)
  } finally { clearTimeout(timer) }
}

// ── expiry discovery (nearest expiry that returns a live chain) ──────────────
const expiryCache = new Map() // "index|day" -> nearest expiry ISO
function candidateExpiries() {
  const base = istDate()
  const set = new Set()
  for (let i = 0; i < 14; i++) { const d = new Date(base); d.setUTCDate(base.getUTCDate() + i); if ([2, 3, 4].includes(d.getUTCDay())) set.add(fmtDay(d)) }
  for (const mo of [0, 1]) {
    const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + mo + 1, 0))
    for (let back = 0; back < 7; back++) { const x = new Date(last); x.setUTCDate(last.getUTCDate() - back); if ([2, 3, 4].includes(x.getUTCDay()) && x >= base) set.add(fmtDay(x)) }
  }
  return [...set].sort()
}
async function discoverExpiry(index) {
  const day = fmtDay(istDate())
  const key = `${index}|${day}`
  if (expiryCache.has(key)) return expiryCache.get(key)
  for (const iso of candidateExpiries()) {
    try { const j = await fetchOptionChain(index, iso, day, hhmm()); if (j?.chain?.length && j.spot != null) { expiryCache.set(key, iso); return iso } }
    catch { /* try next */ }
  }
  expiryCache.set(key, null)
  return null
}

// ── OI-change ratio for a single leg (current OI vs yesterday's close OI) ─────
function legRatio(leg) {
  if (!leg) return null
  const prev = leg.prev_oi != null ? Number(leg.prev_oi)
    : (leg.oi != null && leg.oi_change != null ? Number(leg.oi) - Number(leg.oi_change) : null)
  if (prev == null || !(prev > 0) || leg.oi == null) return null
  return Number(leg.oi) / prev
}

// ── analyse one index ────────────────────────────────────────────────────────
async function analyseIndex(index, settings) {
  const day = fmtDay(istDate())
  const expiry = await discoverExpiry(index)
  if (!expiry) return { index, ok: false, skip: 'no expiry with a live chain' }

  const chain = await fetchOptionChain(index, expiry, day, hhmm())
  if (!chain?.chain?.length || chain.spot == null) return { index, ok: false, skip: 'no chain/spot' }

  const spot = Number(chain.spot)
  const indiaVix = chain.india_vix != null ? Number(chain.india_vix) : null
  const rows = chain.chain
  const strikes = rows.map((r) => Number(r.strike)).filter(Number.isFinite).sort((a, b) => a - b)
  const interval = A.getStrikeInterval(strikes)
  const atmStrike = chain.atm != null ? Number(chain.atm) : A.getAtmStrike(spot, interval)
  const rowAt = (k) => rows.find((r) => Number(r.strike) === Number(k))

  // ── OI window (ATM ± 5 strikes) ──
  const lo = atmStrike - OI_WINDOW_STRIKES * interval
  const hi = atmStrike + OI_WINDOW_STRIKES * interval
  const strikeOiData = {}
  for (const r of rows) {
    const k = Number(r.strike)
    if (k < lo || k > hi) continue
    strikeOiData[k] = { CE: r.call?.oi ?? 0, PE: r.put?.oi ?? 0 }
  }

  // ── OI walls + fresh OI-change ratios at the walls and ATM (faithful to engine.py) ──
  const walls = A.computeOiWalls(strikeOiData, atmStrike)
  const resLeg = walls.resistanceStrike != null ? rowAt(walls.resistanceStrike)?.call : null
  const supLeg = walls.supportStrike != null ? rowAt(walls.supportStrike)?.put : null
  const atmRow = rowAt(atmStrike)
  const oiChange = {
    resistanceOiChangeRatio: legRatio(resLeg),
    supportOiChangeRatio: legRatio(supLeg),
    atmCeOiChangeRatio: legRatio(atmRow?.call),
    atmPeOiChangeRatio: legRatio(atmRow?.put),
  }
  const strikeOiChangeRatios = {}
  if (walls.resistanceStrike != null) (strikeOiChangeRatios[walls.resistanceStrike] ??= {}).CE = oiChange.resistanceOiChangeRatio
  if (walls.supportStrike != null) (strikeOiChangeRatios[walls.supportStrike] ??= {}).PE = oiChange.supportOiChangeRatio
  ;(strikeOiChangeRatios[atmStrike] ??= {}).CE = oiChange.atmCeOiChangeRatio
  ;(strikeOiChangeRatios[atmStrike] ??= {}).PE = oiChange.atmPeOiChangeRatio

  // ── OI bias (real PCR + proximity/oi-change-weighted PCR) ──
  const oiBiasR = A.computeOiBias(
    strikeOiData, settings.pcr_threshold, spot, interval, OI_WINDOW_STRIKES,
    strikeOiChangeRatios, settings.oi_change_clamp,
  )
  const atmOiBias = A.computeAtmOiChangeBias(oiChange.atmCeOiChangeRatio, oiChange.atmPeOiChangeRatio, settings.atm_oi_change_threshold)

  // ── candles: daily (gap/CPR/hist range) + intraday (ORB) + VIX daily fallback ──
  const [daily, intraday] = await Promise.all([
    fetchCandles(index, 'D', 60).catch(() => []),
    fetchCandles(index, '3', 3).catch(() => []),
  ])
  const completed = daily.filter((c) => dayKeyOf(c.time) < day)
  const todayDaily = daily.find((c) => dayKeyOf(c.time) === day) || null
  const prevDay = completed[completed.length - 1] || null

  // day open: intraday first candle (today) → today's daily → yesterday close
  const todayIntraday = intraday.filter((c) => dayKeyOf(c.time) === day)
  const dayOpen = todayIntraday.length ? todayIntraday[0].open : (todayDaily?.open ?? prevDay?.close ?? spot)

  // ── gap flag ──
  let gapResult = { avgRange: null, gap: null, largeGap: false }
  const gapRanges = completed.slice(-settings.range_lookback_days).map((c) => c.high - c.low).filter((x) => x > 0)
  if (gapRanges.length && prevDay) {
    try { gapResult = A.computeGapFlag(gapRanges, dayOpen, prevDay.close, settings.gap_threshold_factor) } catch { /* keep default */ }
  }
  const avgRange = gapResult.avgRange
  const largeGap = gapResult.largeGap

  // ── ORB (opening-range breakout) from intraday ──
  let orbBias = 'NEUTRAL'
  let orbHigh = null; let orbLow = null
  const barsForOrb = Math.max(1, Math.round(settings.orb_minutes / 3))
  if (todayIntraday.length >= barsForOrb) {
    const win = todayIntraday.slice(0, barsForOrb)
    orbHigh = Math.max(...win.map((c) => c.high))
    orbLow = Math.min(...win.map((c) => c.low))
    orbBias = A.computeOrbBias(spot, orbHigh, orbLow)
  }

  // ── CPR width ratio (yesterday H/L/C) ──
  let cprWidth = null; let cprWidthRatio = null
  if (prevDay && avgRange && avgRange > 0) {
    cprWidth = A.computeCprWidth(prevDay.high, prevDay.low, prevDay.close)
    cprWidthRatio = cprWidth / avgRange
  }

  // ── technical bias (majority vote: OI + VWAP[dropped] + ORB) ──
  const vwapBias = 'NEUTRAL'
  const technicalBias = A.combineBias(oiBiasR.oiBias, vwapBias, orbBias)

  // ── expected move: blend(VIX-implied anchored to day open, historical open→close avg) ──
  let vixExpectedMove = null
  if (indiaVix != null && dayOpen > 0) { try { vixExpectedMove = A.computeVixExpectedMove(dayOpen, indiaVix) } catch { /* skip */ } }
  const histOcRange = completed.length ? A.computeAvgOpenToCloseRange(completed.slice(-settings.historical_range_lookback_days)) : null
  let expectedMove = null
  if (vixExpectedMove != null && histOcRange != null) expectedMove = (vixExpectedMove + histOcRange) / 2
  else expectedMove = vixExpectedMove

  const pointsMovedFromOpen = spot - dayOpen

  // ── OI-wall base probability (proximity + oi-change weighted) ──
  const baseProb = A.computeDirectionProbability(walls.supportOi, walls.resistanceOi, {
    supportStrike: walls.supportStrike, resistanceStrike: walls.resistanceStrike,
    spot, interval, windowStrikes: OI_WINDOW_STRIKES,
    supportOiChangeRatio: oiChange.supportOiChangeRatio, resistanceOiChangeRatio: oiChange.resistanceOiChangeRatio,
    oiChangeClamp: settings.oi_change_clamp,
  })
  const resistanceDistance = walls.resistanceStrike != null ? Math.abs(walls.resistanceStrike - spot) : null
  const supportDistance = walls.supportStrike != null ? Math.abs(walls.supportStrike - spot) : null

  // ── range-too-tight gate ──
  const rangeTooTight = expectedMove != null && expectedMove < settings.min_expected_move_points

  // ── live ATM premiums → required (breakeven+margin) moves ──
  const cePremium = atmRow?.call?.ltp != null ? Number(atmRow.call.ltp) : null
  const pePremium = atmRow?.put?.ltp != null ? Number(atmRow.put.ltp) : null
  const pmf = settings.profit_margin_factor
  const requiredMoveCall = cePremium != null ? cePremium * pmf : null
  const requiredMovePut = pePremium != null ? pePremium * pmf : null
  const requiredMoveBoth = (cePremium != null && pePremium != null) ? (cePremium + pePremium) * pmf : null

  // ── momentum (realized move vs expected) ──
  const momentum = A.computeMomentumBias(pointsMovedFromOpen, expectedMove, settings.momentum_min_fraction, settings.momentum_max_fraction)

  // ── volatility confidence (0-100) ──
  const volatilityConfidence = A.computeVolatilityConfidence(
    expectedMove, avgRange, orbBias, momentum.usedFraction, {
      resistanceOiChangeRatio: oiChange.resistanceOiChangeRatio, supportOiChangeRatio: oiChange.supportOiChangeRatio,
      oiChangeClamp: settings.oi_change_clamp, cprWidthRatio,
      ratioScale: settings.volatility_confidence_ratio_scale, orbBonus: settings.volatility_confidence_orb_bonus,
      momentumScale: settings.volatility_confidence_momentum_scale, oiBuildupScale: settings.volatility_confidence_oi_buildup_scale,
      cprNarrowScale: settings.volatility_confidence_cpr_narrow_scale,
    },
  )

  // ── final combined probability (OI-wall base nudged by the other signals) ──
  const AI_SENTIMENT = 'NEUTRAL'
  const combined = A.combineProbabilitySignals(
    baseProb.upsideProbability, oiBiasR.pcr, settings.pcr_threshold, vwapBias, orbBias,
    gapResult.gap, AI_SENTIMENT, momentum.momentumBias, atmOiBias,
  )

  // ── final BUY-direction decision ──
  const decision = A.decideDirection(combined.upsideProbability, AI_SENTIMENT, largeGap, {
    rangeTooTight, expectedMove, requiredMoveCall, requiredMovePut, requiredMoveBoth,
    callThreshold: settings.call_probability_threshold, putThreshold: settings.put_probability_threshold,
  })

  // ── human-readable reason ──
  const reason = buildReason({ decision, rangeTooTight, largeGap, expectedMove, minMove: settings.min_expected_move_points, upside: combined.upsideProbability, requiredMoveCall, requiredMovePut, requiredMoveBoth })

  // ── recommendation (which ATM leg(s) to buy) ──
  const recommendation = buildRecommendation({ decision, atmStrike, expiry, cePremium, pePremium, dayOpen, expectedMove })

  return {
    index, ok: true, generatedAt: new Date().toISOString(), marketOpen: marketOpenNow(),
    preference: 'BUYING', aiSentiment: AI_SENTIMENT,
    spot, dayOpen, atmStrike, strikeInterval: interval, expiry, indiaVix,
    decision, reason, recommendation,
    probability: { upside: combined.upsideProbability, downside: combined.downsideProbability, base: baseProb.upsideProbability, net: combined.net },
    expectedMove, vixExpectedMove, historicalOcRange: histOcRange,
    expectedUpsideTarget: expectedMove != null ? dayOpen + expectedMove : null,
    expectedDownsideTarget: expectedMove != null ? dayOpen - expectedMove : null,
    rangeTooTight,
    pcr: oiBiasR.pcr, weightedPcr: oiBiasR.weightedPcr, oiBias: oiBiasR.oiBias,
    totalCallOi: oiBiasR.totalCallOi, totalPutOi: oiBiasR.totalPutOi,
    atmOiBias, technicalBias, vwapBias, orbBias, orb: { high: orbHigh, low: orbLow, minutes: settings.orb_minutes },
    gap: { points: gapResult.gap, large: largeGap, avgRange, thresholdFactor: settings.gap_threshold_factor },
    cpr: { width: cprWidth, widthRatio: cprWidthRatio },
    momentum: { bias: momentum.momentumBias, usedFraction: momentum.usedFraction, pointsMoved: pointsMovedFromOpen },
    volatilityConfidence,
    walls: {
      resistanceStrike: walls.resistanceStrike, resistanceOi: walls.resistanceOi, resistanceDistance, resistanceOiChangeRatio: oiChange.resistanceOiChangeRatio,
      supportStrike: walls.supportStrike, supportOi: walls.supportOi, supportDistance, supportOiChangeRatio: oiChange.supportOiChangeRatio,
    },
    premiums: { ce: cePremium, pe: pePremium },
    required: { call: requiredMoveCall, put: requiredMovePut, both: requiredMoveBoth, profitMarginFactor: pmf },
  }
}

function buildReason({ decision, rangeTooTight, largeGap, expectedMove, minMove, upside, requiredMoveCall, requiredMovePut, requiredMoveBoth }) {
  const em = expectedMove != null ? `${expectedMove.toFixed(0)}pts` : 'n/a'
  const up = `${Math.round(upside * 100)}%`
  if (rangeTooTight) return `NO TRADE — India VIX implies only ±${em} today, below the ${minMove}pt floor; not worth paying time decay.`
  if (largeGap) return `BOTH legs — large gap open; direction unconfirmed, so straddle rather than pick a side. Expected move ±${em}.`
  if (decision === 'CALL') return `CALL — upside probability ${up}; expected move ±${em} clears the CALL breakeven (~${requiredMoveCall?.toFixed(0)}pts).`
  if (decision === 'PUT') return `PUT — upside probability ${up} (downside-leaning); expected move ±${em} clears the PUT breakeven (~${requiredMovePut?.toFixed(0)}pts).`
  if (decision === 'BOTH') return `BOTH legs — direction unclear (${up} upside) but expected move ±${em} clears the combined straddle breakeven (~${requiredMoveBoth?.toFixed(0)}pts).`
  return `NO TRADE — upside ${up}; expected move ±${em} does not clear the option's breakeven, so no profitable buy this run.`
}

function buildRecommendation({ decision, atmStrike, expiry, cePremium, pePremium, dayOpen, expectedMove }) {
  if (decision === 'NO_TRADE') return null
  const legs = []
  if (decision === 'CALL' || decision === 'BOTH') legs.push({ side: 'CE', action: 'BUY', strike: atmStrike, expiry, entryPremium: cePremium, breakeven: cePremium != null ? atmStrike + cePremium : null })
  if (decision === 'PUT' || decision === 'BOTH') legs.push({ side: 'PE', action: 'BUY', strike: atmStrike, expiry, entryPremium: pePremium, breakeven: pePremium != null ? atmStrike - pePremium : null })
  return { type: decision === 'BOTH' ? 'STRADDLE' : 'DIRECTIONAL', legs, expectedMovePoints: expectedMove }
}

// ── run all indices + store the current analysis (persisted in MySQL) ────────
export const analysisState = { running: false, lastRun: null }
let currentAnalysis = null

/** Serve the latest analysis — from memory, or lazily from the DB after a restart. */
export async function getCurrentAnalysis() {
  if (currentAnalysis) return currentAnalysis
  currentAnalysis = await kvGet('current')
  return currentAnalysis
}
async function persistCurrent(obj) {
  try { await kvSet('current', obj) } catch (e) { console.error('option-analysis persist:', e.message) }
}

export async function runAnalysis(indices = INDICES) {
  if (analysisState.running) return { running: true, current: currentAnalysis }
  analysisState.running = true
  const settings = await getSettings()
  const byIndex = {}
  try {
    for (const idx of indices) {
      try { byIndex[idx] = await analyseIndex(idx, settings) }
      catch (e) { byIndex[idx] = { index: idx, ok: false, error: e.message } }
    }
  } finally {
    analysisState.running = false
    analysisState.lastRun = new Date().toISOString()
  }
  currentAnalysis = {
    generatedAt: new Date().toISOString(),
    preference: settings.preference || 'BUYING',
    indices,
    settings,
    byIndex,
  }
  await persistCurrent(currentAnalysis)
  // Open/refresh dry-run paper positions from this analysis (market hours only).
  try { await openFromAnalysis(currentAnalysis) } catch (e) { console.error('option-dryrun open:', e.message) }
  return currentAnalysis
}
