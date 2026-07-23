// ── Option Insights engine (client-side, rule-based, tick-reactive) ──────────
// Institutional-style intraday analysis for NIFTY / BANKNIFTY / SENSEX built
// ONLY from data the application actually has. Missing inputs (OI, IV, Greeks,
// futures, depth, breadth, news) are DECLARED, never fabricated, and reduce
// confidence. Educational research output — never personalised advice.
import {
  type OCandle, adx, atr, classicPivots, ema, intradaySwings, last, macdHist,
  rsi, sessionVwap, supertrend,
} from './indicators'

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface ChainStrikeInput {
  strike: number
  ce?: { ltp: number; volume: number; bid: number; ask: number; symbol: string }
  pe?: { ltp: number; volume: number; bid: number; ask: number; symbol: string }
}

export interface EngineInput {
  index: 'NIFTY' | 'BANKNIFTY' | 'SENSEX'
  nowIst: { y: number; m: number; d: number; hh: number; mm: number } // m 0-based
  spot: number | null
  spotTs: number | null
  vix: number | null
  vixPrevClose: number | null
  daily: OCandle[] // ≥ 10 sessions, for prev close / pivots / gap
  tf: { m3: OCandle[]; m5: OCandle[]; m15: OCandle[]; m30: OCandle[] } // full series; engine slices today
  expiries: string[] // feed format "07JUL26", sorted nearest first
  chain: ChainStrikeInput[] // nearest expiry, sorted by strike
  chainExpiry: string | null
}

// ── Output types (only what the UI renders) ──────────────────────────────────

export interface TfStructure {
  tf: string
  trend: 'UP' | 'DOWN' | 'SIDEWAYS'
  aboveVwap: boolean | null
  ema20: boolean | null
  ema50: boolean | null
  ema200: boolean | null
  rsi: number | null
  macdBull: boolean | null
  adx: number | null
  supertrendUp: boolean | null
  atrPts: number | null
}

/** Snapshot of objective evidence — a recommendation may only change when one
 *  of these materially changes (spec: OBJECTIVE EVIDENCE REQUIRED). */
export interface EvidenceSnapshot {
  dayKey: string
  spot: number | null
  trend5: string
  trend15: string
  ema15Sig: string // price vs e20/e50 on 15m
  adxBucket: 'low' | 'mid' | 'high' | 'na'
  vixBand: string | null
  orState: string | null
  atmStrike: number | null
  pcr: number | null
  breakout: number | null
  breakdown: number | null
  s1: number | null
  r1: number | null
}

export interface EngineMemory {
  evidence: EvidenceSnapshot
  decision: string
  setup: OptionInsightsReport['trader']['setup']
  bestId: string | null
  bestScore: number
  at: number
}

export interface StrategyEval {
  id: string
  action: 'BUY' | 'SELL'
  moneyness: 'ATM' | 'ITM' | 'OTM'
  side: 'CE' | 'PE'
  strike: number | null
  premium: number | null
  probPct: number
  rr: number | null
  theta: 'Tailwind' | 'Headwind' | 'Neutral'
  gamma: 'Favorable' | 'Risky' | 'Neutral'
  vega: 'Favorable' | 'Unfavorable' | 'Neutral'
  liquidity: 'Good' | 'Acceptable' | 'Poor' | 'Unknown'
  spreadPct: number | null
  premiumRichness: 'Rich' | 'Fair' | 'Cheap' | 'Unknown'
  trendConfirm: boolean
  volumeConfirm: boolean | null
  maxRisk: string
  expectedReward: string
  stars: 1 | 2 | 3 | 4 | 5
  score: number
  rejected: string | null // consistency/premium-floor veto reason
}

export interface StrikeCandidate {
  label: string
  strike: number
  side: 'CALL' | 'PUT'
  symbol: string | null
  premium: number | null
  spreadPct: number | null
  volume: number | null
  liquidity: 'Good' | 'Acceptable' | 'Poor' | 'Unknown'
  deltaProxy: number
  score: number
  reason: string
}

export interface OptionInsightsReport {
  generatedAt: number
  index: string
  session: {
    prevClose: number | null
    open: number | null
    gapPct: number | null
    gapType: 'Gap Up' | 'Gap Down' | 'Flat' | null
    dayHigh: number | null
    dayLow: number | null
    orHigh: number | null // opening range (first 15m)
    orLow: number | null
    orState: 'Above OR' | 'Below OR' | 'Inside OR' | null
    phase: string
    marketOpen: boolean
  }
  expiry: {
    current: string | null
    dte: number | null
    isExpiryDay: boolean
    kind: 'Weekly' | 'Monthly' | null
    thetaPressure: 'Extreme' | 'High' | 'Moderate' | 'Low' | null
    gammaRisk: 'Extreme' | 'High' | 'Moderate' | 'Low' | null
    favors: 'Option Buying' | 'Option Selling' | 'Balanced' | 'No Trade Bias' | null
    note: string
  }
  vix: {
    value: number | null
    changePct: number | null
    band: 'Very Low' | 'Low' | 'Normal' | 'Elevated' | 'High' | 'Extreme' | null
    note: string
  }
  structure: TfStructure[]
  keyLevels: {
    pivot: number | null
    s1: number | null
    s2: number | null
    r1: number | null
    r2: number | null
    swingSupport: number[]
    swingResistance: number[]
    breakout: number | null
    breakdown: number | null
    vwapZone: string | null
  }
  chain: {
    expiry: string | null
    atmStrike: number | null
    straddle: number | null
    straddlePctOfSpot: number | null
    impliedDayRangeLow: number | null // spot ± straddle-scaled
    impliedDayRangeHigh: number | null
    pcrVolume: number | null
    callVolumeHeavyStrike: number | null
    putVolumeHeavyStrike: number | null
    atmSpreadPct: number | null
    liquidity: 'Good' | 'Acceptable' | 'Poor' | 'Unknown'
    note: string
  }
  sentiment: {
    label: string
    confidencePct: number
    basis: string
  }
  quality: { score: number | null; interpretation: string; components: Array<{ name: string; pts: number | null; max: number; note: string }> }
  probabilities: { bullish: number; bearish: number; rangebound: number; highVol: number; reasoning: string }
  projection: {
    current: number | null
    expectedHigh: number | null
    expectedLow: number | null
    expectedRangePts: number | null
  }
  strategy: {
    verdict: 'Option Buying' | 'Option Selling' | 'NO TRADE'
    comparison: Array<{ aspect: string; buying: string; selling: string }>
    gates: Array<{ gate: string; pass: boolean | null; detail: string }>
    reasons: string[]
  }
  recommendation: null | {
    strike: number
    side: 'CALL' | 'PUT'
    symbol: string | null
    premium: number | null
    entryZone: [number, number] | null
    entryTime: string
    trigger: string
    confirmation: string[]
    stopLossPremium: number | null
    target1Premium: number | null
    target2Premium: number | null
    holdingTime: string
    maxHoldingTime: string
    riskReward: number | null
    confidencePct: number
    candidates: StrikeCandidate[]
  }
  candidates: StrikeCandidate[]
  strategyMatrix: {
    ranked: StrategyEval[]
    whyBest: string | null
    whyNotSecond: string | null
    nearTieNote: string | null
  }
  trader: {
    decision: 'NO TRADE' | 'BUY SETUP ACTIVE' | 'SELL SETUP ACTIVE'
    reason: string
    mqsExplainer: string
    setup: null | {
      stars: 1 | 2 | 3 | 4 | 5
      action: 'BUY' | 'SELL'
      strike: number
      side: 'CE' | 'PE'
      condition: string
      premiumZone: string
      stopLoss: string
      target1: string
      target2: string
      active: boolean
      statusLine: string
      sizingNote: string | null
      alternative: string | null // the competing expression (buy vs sell) and why it lost
    }
    whatChanged: string[] // objective changes vs previous analysis (or the no-change sentence)
    kept: boolean // true = previous recommendation retained
    heldSince: number | null // timestamp the current recommendation has been standing
  }
  memory: EngineMemory // feed back into the next analyse call (market memory)
  timeBlocks: Array<{ block: string; current: boolean; trend: string; volatility: string; momentum: string; strategy: string; avoid: boolean }>
  risks: Array<{ risk: string; level: 'Low' | 'Moderate' | 'High'; note: string }>
  missing: string[]
  disclaimer: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const r2 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(2))
const istDateKey = (t: number) => {
  const d = new Date((t + 19800) * 1000) // shift to IST then read UTC parts
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
}

function todays(c: OCandle[], now: EngineInput['nowIst']): OCandle[] {
  const key = `${now.y}-${now.m}-${now.d}`
  return c.filter((x) => istDateKey(x.time) === key)
}

const MONS: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }
function parseExpiry(s: string): Date | null {
  const m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec((s ?? '').toUpperCase().replace(/[-\s]/g, ''))
  if (!m) return null
  const mon = MONS[m[2]]
  if (mon == null) return null
  return new Date(Date.UTC(2000 + Number(m[3]), mon, Number(m[1])))
}

function minutesOfDay(now: EngineInput['nowIst']) { return now.hh * 60 + now.mm }
const MKT_OPEN = 9 * 60 + 15
const MKT_CLOSE = 15 * 60 + 30

// ── Engine ───────────────────────────────────────────────────────────────────

export function analyseOptions(inp: EngineInput, prev: EngineMemory | null = null): OptionInsightsReport {
  const missing: string[] = [
    'Open Interest (OI buildup, Max Pain, OI S/R) — not in feed yet',
    'Implied Volatility & Greeks — not in feed (ATM straddle used as expected-move proxy)',
    'Futures price / basis — not in feed',
    'Market depth beyond top-of-book bid/ask',
    'Market breadth & advance/decline',
    'Sector performance',
    'Live news / FII-DII / global market feeds',
  ]

  const spot = inp.spot
  const mins = minutesOfDay(inp.nowIst)
  const marketOpen = mins >= MKT_OPEN && mins <= MKT_CLOSE

  // ── session ────────────────────────────────────────────────────────────────
  const t5 = todays(inp.tf.m5, inp.nowIst)
  const t3 = todays(inp.tf.m3, inp.nowIst)
  const dailyPrev = inp.daily.length >= 2 ? inp.daily[inp.daily.length - (todays(inp.daily, inp.nowIst).length ? 2 : 1)] : null
  const prevClose = dailyPrev?.close ?? null
  const open = t5[0]?.open ?? t3[0]?.open ?? null
  const gapPct = prevClose && open ? ((open - prevClose) / prevClose) * 100 : null
  const gapType = gapPct == null ? null : gapPct > 0.15 ? 'Gap Up' : gapPct < -0.15 ? 'Gap Down' : 'Flat'
  const dayHigh = t3.length ? Math.max(...t3.map((c) => c.high)) : t5.length ? Math.max(...t5.map((c) => c.high)) : null
  const dayLow = t3.length ? Math.min(...t3.map((c) => c.low)) : t5.length ? Math.min(...t5.map((c) => c.low)) : null
  const orBars = t5.slice(0, 3) // first 15 minutes
  const orHigh = orBars.length >= 3 ? Math.max(...orBars.map((c) => c.high)) : null
  const orLow = orBars.length >= 3 ? Math.min(...orBars.map((c) => c.low)) : null
  const orState = spot != null && orHigh != null && orLow != null ? (spot > orHigh ? 'Above OR' : spot < orLow ? 'Below OR' : 'Inside OR') : null
  const phase = !marketOpen ? (mins < MKT_OPEN ? 'Pre-open' : 'Market closed') : mins < 10 * 60 ? 'Opening drive' : mins < 11 * 60 + 30 ? 'Morning trend' : mins < 13 * 60 ? 'Midday lull' : mins < 14 * 60 + 30 ? 'Afternoon positioning' : 'Closing hour'

  // ── expiry ─────────────────────────────────────────────────────────────────
  const curExp = inp.chainExpiry ?? inp.expiries[0] ?? null
  const expDate = curExp ? parseExpiry(curExp) : null
  const today = new Date(Date.UTC(inp.nowIst.y, inp.nowIst.m, inp.nowIst.d))
  const dte = expDate ? Math.round((expDate.getTime() - today.getTime()) / 86400000) : null
  const isExpiryDay = dte === 0
  let expKind: 'Weekly' | 'Monthly' | null = null
  if (expDate) {
    const nextInMonth = inp.expiries.map(parseExpiry).filter((d): d is Date => !!d)
      .some((d) => d > expDate && d.getUTCMonth() === expDate.getUTCMonth())
    expKind = nextInMonth ? 'Weekly' : 'Monthly'
  }
  const thetaPressure = dte == null ? null : dte === 0 ? 'Extreme' : dte === 1 ? 'High' : dte <= 3 ? 'Moderate' : 'Low'
  const gammaRisk = dte == null ? null : dte === 0 ? 'Extreme' : dte === 1 ? 'High' : dte <= 3 ? 'Moderate' : 'Low'

  // ── VIX ────────────────────────────────────────────────────────────────────
  const vix = inp.vix
  const vixChg = vix != null && inp.vixPrevClose ? ((vix - inp.vixPrevClose) / inp.vixPrevClose) * 100 : null
  const vixBand = vix == null ? null : vix < 10 ? 'Very Low' : vix < 12 ? 'Low' : vix < 16 ? 'Normal' : vix < 20 ? 'Elevated' : vix < 28 ? 'High' : 'Extreme'
  const vixNote = vix == null
    ? 'India VIX unavailable — volatility context missing, confidence reduced.'
    : vixBand === 'Very Low' || vixBand === 'Low'
      ? 'Cheap premiums but small expected swings: buying needs a clean trend; selling earns little and is vulnerable to any vol spike.'
      : vixBand === 'Normal'
        ? 'Balanced regime — neither premiums nor expected movement are extreme; edge must come from structure, not volatility.'
        : vixBand === 'Elevated'
          ? 'Premiums enriched, larger swings expected: buying needs momentum to outrun decay; selling earns more but with wider risk.'
          : 'Rich premiums and violent swings: option selling carries gap/tail risk; buying fights heavy decay unless the move is fast.'

  // ── structure per TF ───────────────────────────────────────────────────────
  function tfStruct(name: string, series: OCandle[]): TfStructure {
    const t = todays(series, inp.nowIst)
    const closes = series.map((c) => c.close)
    const px = spot ?? last(series)?.close ?? null
    const e20 = last(ema(closes, 20))
    const e50 = last(ema(closes, 50))
    const e200 = closes.length >= 200 ? last(ema(closes, 200)) : null
    const r = last(rsi(closes, 14))
    const mh = last(macdHist(closes))
    const ax = last(adx(series, 14))
    const st = last(supertrend(series))
    const at = last(atr(series, 14))
    const vwap = sessionVwap(t)
    const up = [px != null && e20 != null && px > e20, px != null && e50 != null && px > e50, st === 1].filter(Boolean).length
    const dn = [px != null && e20 != null && px < e20, px != null && e50 != null && px < e50, st === -1].filter(Boolean).length
    return {
      tf: name,
      trend: up >= 2 && (ax ?? 0) >= 18 ? 'UP' : dn >= 2 && (ax ?? 0) >= 18 ? 'DOWN' : 'SIDEWAYS',
      aboveVwap: vwap != null && px != null ? px > vwap : null,
      ema20: px != null && e20 != null ? px > e20 : null,
      ema50: px != null && e50 != null ? px > e50 : null,
      ema200: px != null && e200 != null ? px > e200 : null,
      rsi: r2(r),
      macdBull: mh != null ? mh > 0 : null,
      adx: r2(ax),
      supertrendUp: st == null ? null : st === 1,
      atrPts: r2(at),
    }
  }
  const structure = [tfStruct('3m', inp.tf.m3), tfStruct('5m', inp.tf.m5), tfStruct('15m', inp.tf.m15), tfStruct('30m', inp.tf.m30)]
  const upTfs = structure.filter((s) => s.trend === 'UP').length
  const dnTfs = structure.filter((s) => s.trend === 'DOWN').length
  const atr15 = structure[2].atrPts ?? structure[1].atrPts ?? null
  if (structure.every((s) => s.aboveVwap == null)) missing.push('VWAP (index candles carry no volume — needs futures feed)')

  // ── key levels ─────────────────────────────────────────────────────────────
  const piv = dailyPrev ? classicPivots(dailyPrev.high, dailyPrev.low, dailyPrev.close) : null
  const swings = spot != null ? intradaySwings(t5.length ? t5 : t3, spot) : { resistance: [], support: [] }
  const keyLevels = {
    pivot: r2(piv?.pivot ?? null),
    s1: r2(piv?.s1 ?? null),
    s2: r2(piv?.s2 ?? null),
    r1: r2(piv?.r1 ?? null),
    r2: r2(piv?.r2 ?? null),
    swingSupport: swings.support.map((x) => +x.toFixed(2)),
    swingResistance: swings.resistance.map((x) => +x.toFixed(2)),
    breakout: r2(dayHigh != null && orHigh != null ? Math.max(dayHigh, orHigh) : dayHigh ?? orHigh),
    breakdown: r2(dayLow != null && orLow != null ? Math.min(dayLow, orLow) : dayLow ?? orLow),
    vwapZone: null as string | null,
  }

  // ── chain analytics (volume-based; OI unavailable) ─────────────────────────
  const strikes = inp.chain
  let atmStrike: number | null = null
  if (spot != null && strikes.length) {
    atmStrike = strikes.reduce((best, s) => (Math.abs(s.strike - spot) < Math.abs(best - spot) ? s.strike : best), strikes[0].strike)
  }
  const atmRow = strikes.find((s) => s.strike === atmStrike)
  const straddle = atmRow?.ce && atmRow?.pe ? atmRow.ce.ltp + atmRow.pe.ltp : null
  const straddlePct = straddle != null && spot ? (straddle / spot) * 100 : null
  // straddle ≈ expected move to expiry; scale to ~1 session
  const dayFactor = dte == null ? 1 : Math.sqrt(1 / Math.max(1, dte + 0.5))
  const impliedHalfRange = straddle != null ? straddle * (dte != null && dte <= 1 ? 1 : dayFactor) : null
  let cVol = 0
  let pVol = 0
  let cHeavy: { strike: number; v: number } | null = null
  let pHeavy: { strike: number; v: number } | null = null
  for (const s of strikes) {
    const cv = s.ce?.volume ?? 0
    const pv = s.pe?.volume ?? 0
    cVol += cv
    pVol += pv
    if (spot != null && s.strike >= spot && cv > (cHeavy?.v ?? 0)) cHeavy = { strike: s.strike, v: cv }
    if (spot != null && s.strike <= spot && pv > (pHeavy?.v ?? 0)) pHeavy = { strike: s.strike, v: pv }
  }
  const pcrVolume = cVol > 0 ? pVol / cVol : null
  const spreadPct = (o?: { bid: number; ask: number; ltp: number }) =>
    o && o.ask > 0 && o.bid > 0 && o.ltp > 0 ? ((o.ask - o.bid) / o.ltp) * 100 : null
  const atmSpread = r2(Math.max(spreadPct(atmRow?.ce) ?? -1, spreadPct(atmRow?.pe) ?? -1))
  const atmVol = (atmRow?.ce?.volume ?? 0) + (atmRow?.pe?.volume ?? 0)
  const chainLiquidity: 'Good' | 'Acceptable' | 'Poor' | 'Unknown' =
    atmSpread == null || atmSpread < 0 ? 'Unknown' : atmSpread <= 0.8 && atmVol > 0 ? 'Good' : atmSpread <= 2 ? 'Acceptable' : 'Poor'

  // ── sentiment (tape-only; external feeds unavailable) ──────────────────────
  let sentScore = 0
  if (gapType === 'Gap Up') sentScore += 1
  if (gapType === 'Gap Down') sentScore -= 1
  sentScore += upTfs - dnTfs
  if (orState === 'Above OR') sentScore += 1
  if (orState === 'Below OR') sentScore -= 1
  if (vixChg != null && vixChg < -3) sentScore += 1
  if (vixChg != null && vixChg > 3) sentScore -= 1
  const sentLabel = sentScore >= 4 ? 'Strong Bullish' : sentScore >= 3 ? 'Bullish' : sentScore >= 1 ? 'Mild Bullish' : sentScore <= -4 ? 'Strong Bearish' : sentScore <= -3 ? 'Bearish' : sentScore <= -1 ? 'Mild Bearish' : 'Neutral'
  const sentConfidence = Math.max(25, Math.min(70, 40 + Math.abs(sentScore) * 6)) // capped: news/flows missing

  // ── market quality score ───────────────────────────────────────────────────
  const comps: Array<{ name: string; pts: number | null; max: number; note: string }> = []
  const trendPts = upTfs >= 3 || dnTfs >= 3 ? 20 : upTfs >= 2 || dnTfs >= 2 ? 13 : 5
  comps.push({ name: 'Trend strength (MTF)', pts: trendPts, max: 20, note: `${Math.max(upTfs, dnTfs)}/4 timeframes aligned` })
  const adx15 = structure[2].adx
  comps.push({ name: 'Momentum (ADX/RSI)', pts: adx15 == null ? null : adx15 >= 25 ? 15 : adx15 >= 18 ? 10 : 4, max: 15, note: `15m ADX ${adx15 ?? '—'}` })
  const chainPts = strikes.length ? (chainLiquidity === 'Good' ? 12 : chainLiquidity === 'Acceptable' ? 8 : 3) : null
  comps.push({ name: 'Option chain (liquidity/spread)', pts: chainPts, max: 15, note: `ATM spread ${atmSpread ?? '—'}%` })
  comps.push({ name: 'Volatility regime (VIX)', pts: vix == null ? null : vixBand === 'Normal' || vixBand === 'Elevated' ? 10 : vixBand === 'Low' ? 7 : 4, max: 10, note: `VIX ${vix ?? '—'} (${vixBand ?? 'n/a'})` })
  comps.push({ name: 'Expiry conditions', pts: dte == null ? null : isExpiryDay ? 5 : dte <= 2 ? 8 : 10, max: 10, note: dte == null ? 'expiry unknown' : `${dte} day(s) to expiry` })
  comps.push({ name: 'Session clarity (OR/gap)', pts: orState == null ? null : orState === 'Inside OR' ? 4 : 10, max: 10, note: orState ?? 'opening range not formed' })
  comps.push({ name: 'Open Interest', pts: null, max: 10, note: 'unavailable — excluded' })
  comps.push({ name: 'Market breadth', pts: null, max: 5, note: 'unavailable — excluded' })
  comps.push({ name: 'News sentiment', pts: null, max: 5, note: 'unavailable — excluded' })
  const availMax = comps.filter((c) => c.pts != null).reduce((a, c) => a + c.max, 0)
  const got = comps.reduce((a, c) => a + (c.pts ?? 0), 0)
  const coverage = availMax / comps.reduce((a, c) => a + c.max, 0)
  const mqs = availMax > 0 && marketOpen ? Math.round((got / availMax) * 100 * (0.85 + 0.15 * coverage)) : null
  const mqsInterp = mqs == null ? (marketOpen ? 'Insufficient data' : 'Market closed — no live session to score') : mqs >= 90 ? 'Exceptional' : mqs >= 80 ? 'Strong' : mqs >= 70 ? 'Tradable' : mqs >= 60 ? 'Weak' : 'Avoid'

  // ── probabilities ──────────────────────────────────────────────────────────
  let bull = 25
  let bear = 25
  let range = 40
  let hv = 10
  bull += upTfs * 6 - dnTfs * 3 + (orState === 'Above OR' ? 8 : 0) + (gapType === 'Gap Up' && orState !== 'Below OR' ? 4 : 0)
  bear += dnTfs * 6 - upTfs * 3 + (orState === 'Below OR' ? 8 : 0) + (gapType === 'Gap Down' && orState !== 'Above OR' ? 4 : 0)
  range += (orState === 'Inside OR' ? 10 : -6) + (adx15 != null && adx15 < 18 ? 8 : -4)
  hv += vixBand === 'High' || vixBand === 'Extreme' ? 10 : vixBand === 'Elevated' ? 5 : 0
  hv += isExpiryDay ? 6 : 0
  const clamp0 = (v: number) => Math.max(3, v)
  let tot = clamp0(bull) + clamp0(bear) + clamp0(range) + clamp0(hv)
  const probs = {
    bullish: Math.round((clamp0(bull) / tot) * 100),
    bearish: Math.round((clamp0(bear) / tot) * 100),
    rangebound: Math.round((clamp0(range) / tot) * 100),
    highVol: 0,
    reasoning: `${Math.max(upTfs, dnTfs)}/4 TFs ${upTfs >= dnTfs ? 'up' : 'down'} · ${orState ?? 'OR pending'} · ADX15 ${adx15 ?? '—'} · VIX ${vixBand ?? 'n/a'}${isExpiryDay ? ' · expiry day' : ''}. Breadth/news/OI missing → probabilities lean on price structure alone.`,
  }
  probs.highVol = 100 - probs.bullish - probs.bearish - probs.rangebound

  // ── projection ─────────────────────────────────────────────────────────────
  const atrRange = atr15 != null ? atr15 * 4 : null
  const halfRange = impliedHalfRange != null && atrRange != null ? (impliedHalfRange + atrRange / 2) / 2 : impliedHalfRange ?? (atrRange != null ? atrRange / 2 : null)
  const projection = {
    current: r2(spot),
    expectedHigh: r2(spot != null && halfRange != null ? spot + halfRange : null),
    expectedLow: r2(spot != null && halfRange != null ? spot - halfRange : null),
    expectedRangePts: r2(halfRange != null ? halfRange * 2 : null),
  }

  // ── strategy engine + gates ────────────────────────────────────────────────
  const dirBias: 'CALL' | 'PUT' | null = probs.bullish >= probs.bearish + 10 ? 'CALL' : probs.bearish >= probs.bullish + 10 ? 'PUT' : null
  const maxDirProb = Math.max(probs.bullish, probs.bearish)
  const buyEdge = (upTfs >= 3 || dnTfs >= 3 ? 2 : 0) + ((adx15 ?? 0) >= 22 ? 1 : 0) + (vixBand === 'Low' || vixBand === 'Very Low' || vixBand === 'Normal' ? 1 : 0) - (thetaPressure === 'Extreme' ? 2 : thetaPressure === 'High' ? 1 : 0)
  const sellEdge = (probs.rangebound >= 40 ? 2 : 0) + (thetaPressure === 'Extreme' || thetaPressure === 'High' ? 2 : 0) + (vixBand === 'Elevated' || vixBand === 'High' ? 1 : 0) - (hv > 20 ? 1 : 0)
  const comparison = [
    { aspect: 'Directional probability', buying: `${maxDirProb}% best direction`, selling: `${probs.rangebound}% range-bound` },
    { aspect: 'Theta', buying: thetaPressure === 'Extreme' || thetaPressure === 'High' ? 'Strong headwind' : 'Manageable', selling: thetaPressure === 'Extreme' || thetaPressure === 'High' ? 'Strong tailwind' : 'Modest income' },
    { aspect: 'Volatility (VIX proxy)', buying: vixBand ? (vixBand === 'Low' || vixBand === 'Very Low' ? 'Cheap entry' : 'Paying up') : 'unknown', selling: vixBand ? (vixBand === 'Elevated' || vixBand === 'High' ? 'Rich premium' : 'Thin premium') : 'unknown' },
    { aspect: 'Risk shape', buying: 'Limited (premium)', selling: 'Open-ended — spreads required; margin & tail risk' },
    { aspect: 'Data completeness', buying: 'OI/IV missing — reduced conviction', selling: 'OI/IV missing — reduced conviction' },
  ]

  // gates per spec (targets are constructed at 1:2 by design; the gate below
  // checks whether the expected range can structurally support that RR)
  const roomOk = spot != null && halfRange != null && atr15 != null ? halfRange >= atr15 * 1.5 : null
  const volConfirm = atmVol > 0 ? (dirBias === 'CALL' ? cVol >= pVol * 0.8 : dirBias === 'PUT' ? pVol >= cVol * 0.8 : null) : null
  const conflicts: string[] = []
  if (gapType === 'Gap Up' && dnTfs >= 2) conflicts.push('gap-up but lower TFs turning down')
  if (gapType === 'Gap Down' && upTfs >= 2) conflicts.push('gap-down but lower TFs turning up')
  if (dirBias === 'CALL' && structure[3].trend === 'DOWN') conflicts.push('30m still in downtrend')
  if (dirBias === 'PUT' && structure[3].trend === 'UP') conflicts.push('30m still in uptrend')
  const gates: Array<{ gate: string; pass: boolean | null; detail: string }> = [
    { gate: 'Market open', pass: marketOpen, detail: marketOpen ? phase : 'outside market hours' },
    { gate: 'Market Quality ≥ 70', pass: mqs == null ? null : mqs >= 70, detail: `MQS ${mqs ?? '—'} (${mqsInterp})` },
    { gate: 'Direction probability ≥ 70%', pass: maxDirProb >= 70, detail: `best ${maxDirProb}%` },
    { gate: 'Risk:Reward ≥ 1:2 achievable', pass: roomOk, detail: roomOk == null ? 'range data insufficient' : roomOk ? 'expected range supports 1:2' : 'expected range too small for 1:2' },
    { gate: 'Liquidity acceptable', pass: chainLiquidity === 'Unknown' ? null : chainLiquidity !== 'Poor', detail: `chain liquidity: ${chainLiquidity}` },
    { gate: 'Spread acceptable', pass: atmSpread == null ? null : atmSpread <= 2, detail: `ATM spread ${atmSpread ?? '—'}%` },
    { gate: 'Volume confirms direction', pass: volConfirm, detail: volConfirm == null ? 'no directional bias or no volume data' : volConfirm ? 'option flow agrees' : 'option flow disagrees' },
    { gate: 'No major conflicting signals', pass: conflicts.length === 0, detail: conflicts.length ? conflicts.join('; ') : 'none detected' },
  ]
  const allPass = gates.every((g) => g.pass === true)
  const verdict: 'Option Buying' | 'Option Selling' | 'NO TRADE' = !allPass ? 'NO TRADE' : buyEdge >= sellEdge ? 'Option Buying' : 'Option Selling'
  const strategyReasons = !allPass
    ? gates.filter((g) => g.pass !== true).map((g) => `${g.gate}: ${g.detail}`)
    : [`edge comparison → ${verdict} (buy edge ${buyEdge}, sell edge ${sellEdge})`]

  // ── strike selection (built even for NO TRADE, marked candidates only) ─────
  const step = strikes.length >= 2 ? Math.min(...strikes.slice(1).map((s, i) => s.strike - strikes[i].strike).filter((d) => d > 0)) : inp.index === 'NIFTY' ? 50 : 100
  const side: 'CALL' | 'PUT' = dirBias ?? (probs.bullish >= probs.bearish ? 'CALL' : 'PUT')
  const pick = (strike: number) => strikes.find((s) => s.strike === strike)
  const mk = (label: string, strike: number, deltaProxy: number): StrikeCandidate => {
    const row = pick(strike)
    const o = side === 'CALL' ? row?.ce : row?.pe
    const sp = o ? ((o.ask - o.bid) / Math.max(o.ltp, 0.05)) * 100 : null
    const liq: StrikeCandidate['liquidity'] = o == null ? 'Unknown' : (o.volume > 0 && (sp ?? 99) <= 1.5) ? 'Good' : (sp ?? 99) <= 3 ? 'Acceptable' : 'Poor'
    const score = (o ? 40 : 0) + (liq === 'Good' ? 25 : liq === 'Acceptable' ? 12 : 0) + deltaProxy * 40 - (sp ?? 5) * 2
    return {
      label, strike, side, symbol: o?.symbol ?? null, premium: r2(o?.ltp ?? null), spreadPct: r2(sp),
      volume: o?.volume ?? null, liquidity: liq, deltaProxy, score: Math.round(score),
      reason: `${label}: Δ≈${deltaProxy} · ${liq} liquidity${sp != null ? ` · spread ${sp.toFixed(1)}%` : ''}`,
    }
  }
  const dirSign = side === 'CALL' ? 1 : -1
  const candidates = atmStrike == null ? [] : [
    mk('ATM', atmStrike, 0.5),
    mk('1 ITM', atmStrike - dirSign * step, 0.65),
    mk('1 OTM', atmStrike + dirSign * step, 0.35),
    mk('2 OTM', atmStrike + dirSign * 2 * step, 0.22),
  ].sort((a, b) => b.score - a.score)

  // ── recommendation (only when verdict is a trade) ──────────────────────────
  let recommendation: OptionInsightsReport['recommendation'] = null
  if (verdict !== 'NO TRADE' && candidates.length && spot != null && atr15 != null) {
    const best = candidates[0]
    const slIdx = atr15 * 0.9
    const t1Idx = atr15 * 1.8
    const t2Idx = atr15 * 3
    const prem = best.premium
    const slPrem = prem != null ? Math.max(0.05, prem - slIdx * best.deltaProxy) : null
    const t1Prem = prem != null ? prem + t1Idx * best.deltaProxy : null
    const t2Prem = prem != null ? prem + t2Idx * best.deltaProxy : null
    const rr = prem != null && slPrem != null && t1Prem != null && prem - slPrem > 0 ? +(((t1Prem - prem) / (prem - slPrem))).toFixed(2) : null
    recommendation = {
      strike: best.strike, side: best.side, symbol: best.symbol, premium: prem,
      entryZone: prem != null ? [r2(prem * 0.99)!, r2(prem * 1.02)!] : null,
      entryTime: phase === 'Opening drive' ? 'After 09:45 (let opening volatility settle) on trigger' : 'Now, on trigger only',
      trigger: side === 'CALL' ? `Spot sustaining above ${r2(keyLevels.breakout ?? spot)} with 3m momentum` : `Spot sustaining below ${r2(keyLevels.breakdown ?? spot)} with 3m momentum`,
      confirmation: ['3m Supertrend agrees', '5m close beyond trigger level', 'Premium making session high (for the chosen side)'],
      stopLossPremium: r2(slPrem), target1Premium: r2(t1Prem), target2Premium: r2(t2Prem),
      holdingTime: '15–60 minutes typical', maxHoldingTime: isExpiryDay ? 'Do not carry past 14:45 (expiry-day gamma/theta)' : 'Intraday only — exit by 15:15',
      riskReward: rr,
      confidencePct: Math.min(75, Math.round((mqs ?? 50) * 0.5 + maxDirProb * 0.35)), // capped: OI/IV/news missing
      candidates,
    }
  }

  // ── trader view: plain-language decision + best-available setup ────────────
  const reasonBits: string[] = []
  if (!marketOpen) reasonBits.push('the market is closed')
  else {
    if (probs.rangebound >= 38) reasonBits.push('the market is range-bound')
    if (adx15 != null && adx15 < 18) reasonBits.push('trend strength (ADX) is weak')
    if (orState === 'Inside OR') reasonBits.push('price is stuck inside the opening range')
    if (vixBand === 'Low' || vixBand === 'Very Low') reasonBits.push('India VIX is low, so big moves are less likely')
    if (thetaPressure === 'High' || thetaPressure === 'Extreme') reasonBits.push('option premiums are decaying fast (theta)')
    if (chainLiquidity === 'Poor') reasonBits.push('option spreads are too wide')
    if (conflicts.length) reasonBits.push(`signals conflict (${conflicts[0]})`)
    if (mqs != null && mqs < 70) reasonBits.push(`overall market quality is only ${mqs}/100`)
  }
  const traderReason = verdict === 'NO TRADE'
    ? (reasonBits.length ? `${reasonBits.slice(0, 3).join(', ')} — none of the current setups clear the probability bar.` : 'conditions have not aligned yet — no setup clears the bar.')
    : `${Math.max(upTfs, dnTfs)}/4 timeframes agree, direction probability ${maxDirProb}%, and liquidity/spread checks pass — conditions align for ${verdict.toLowerCase()}.`

  // ── TRADE COMPARISON ENGINE: evaluate ALL 12 strategy expressions ──────────
  const fmtP = (v: number | null) => (v == null ? '—' : `₹${v.toFixed(v < 10 ? 2 : 0)}`)
  const hvAdj = probs.highVol / 2
  const pUp = probs.bullish + hvAdj
  const pDown = probs.bearish + hvAdj
  // premium richness: implied day range vs realised (ATR) range
  const richRatio = impliedHalfRange != null && atr15 != null && atr15 > 0 ? impliedHalfRange / (atr15 * 2) : null
  const richness: StrategyEval['premiumRichness'] = richRatio == null ? 'Unknown' : richRatio > 1.25 ? 'Rich' : richRatio < 0.8 ? 'Cheap' : 'Fair'

  function evalStrategy(action: 'BUY' | 'SELL', moneyness: 'ATM' | 'ITM' | 'OTM', sideCP: 'CE' | 'PE'): StrategyEval {
    const dirUp = sideCP === 'CE'
    const strike = atmStrike == null ? null
      : moneyness === 'ATM' ? atmStrike
      : moneyness === 'ITM' ? atmStrike + (dirUp ? -step : step)
      : atmStrike + (dirUp ? step : -step)
    const row = strike != null ? strikes.find((s) => s.strike === strike) : undefined
    const o = sideCP === 'CE' ? row?.ce : row?.pe
    const premium = o?.ltp ?? null
    const sp = o && o.ask > 0 && o.bid > 0 && o.ltp > 0 ? ((o.ask - o.bid) / o.ltp) * 100 : null
    const liquidity: StrategyEval['liquidity'] = o == null ? 'Unknown' : (o.volume > 0 && (sp ?? 99) <= 1.5) ? 'Good' : (sp ?? 99) <= 3 ? 'Acceptable' : 'Poor'
    const delta = moneyness === 'ATM' ? 0.5 : moneyness === 'ITM' ? 0.65 : 0.35

    // expression direction & consistency with the market bias (CONSISTENCY CHECK)
    const bullExprEarly = (action === 'BUY') === dirUp
    const exprFav = bullExprEarly ? pUp : pDown
    const exprAgainst = bullExprEarly ? pDown : pUp
    let rejected: string | null = null
    if (exprAgainst > exprFav + 5) {
      rejected = `conflicts with market bias (${bullExprEarly ? 'bullish' : 'bearish'} expression while ${bullExprEarly ? 'bearish' : 'bullish'} probability is higher)`
    }
    // OPTION SELLING RULES: premium too small vs tail risk → reject
    if (action === 'SELL' && premium != null && spot != null && premium < spot * 0.0012) {
      rejected = rejected ?? `premium too small (₹${premium.toFixed(0)}) vs open-ended risk — picking pennies in front of a steamroller`
    }

    // probability of success (transparent heuristic; Greeks/IV unavailable)
    const favDir = dirUp ? pUp : pDown
    const againstDir = dirUp ? pDown : pUp
    let prob: number
    if (action === 'BUY') {
      prob = favDir * (moneyness === 'ATM' ? 0.9 : moneyness === 'ITM' ? 1.0 : 0.62)
      prob -= thetaPressure === 'Extreme' ? 14 : thetaPressure === 'High' ? 8 : 0
      if (richness === 'Rich') prob -= 5 // overpaying
      if (richness === 'Cheap') prob += 4
    } else {
      // seller profits if the against-direction move doesn't reach the strike
      const cushion = moneyness === 'OTM' ? 12 : moneyness === 'ATM' ? 4 : -8
      prob = (100 - againstDir) * 0.62 + probs.rangebound * 0.25 + cushion
      prob += thetaPressure === 'Extreme' ? 10 : thetaPressure === 'High' ? 6 : 0
      prob -= probs.highVol >= 20 ? 8 : 0
      if (richness === 'Rich') prob += 4
      if (richness === 'Cheap') prob -= 5
    }
    prob = Math.round(Math.max(5, Math.min(85, prob)))

    // RR (premium-based; buys use ATR×delta targets, sells use 1.5× stop / 0.55 target)
    let rr: number | null = null
    let maxRisk = '—'
    let expectedReward = '—'
    if (premium != null && atr15 != null) {
      if (action === 'BUY') {
        const slP = Math.max(0.05, premium - atr15 * 0.9 * delta)
        const t1P = premium + atr15 * 1.8 * delta
        rr = premium - slP > 0 ? +(((t1P - premium) / (premium - slP)).toFixed(2)) : null
        maxRisk = `${fmtP(premium)} (premium paid)`
        expectedReward = `${fmtP(t1P - premium)}+ per unit`
      } else {
        rr = +((premium * 0.45) / (premium * 0.5)).toFixed(2) // stop 1.5×, target 0.55×
        maxRisk = 'Open-ended (stop at premium ×1.5; spreads advised)'
        expectedReward = `${fmtP(premium * 0.45)} of ${fmtP(premium)} collected`
      }
    }

    const theta: StrategyEval['theta'] = action === 'SELL'
      ? (thetaPressure === 'High' || thetaPressure === 'Extreme' ? 'Tailwind' : 'Neutral')
      : (thetaPressure === 'High' || thetaPressure === 'Extreme' ? 'Headwind' : 'Neutral')
    const gamma: StrategyEval['gamma'] = dte != null && dte <= 1
      ? (action === 'BUY' ? 'Favorable' : 'Risky')
      : 'Neutral'
    const vega: StrategyEval['vega'] = richness === 'Rich'
      ? (action === 'SELL' ? 'Favorable' : 'Unfavorable')
      : richness === 'Cheap'
        ? (action === 'BUY' ? 'Favorable' : 'Unfavorable')
        : 'Neutral'
    const bullExpr = (action === 'BUY') === dirUp // buy CE / sell PE are bullish
    const trendConfirm = bullExpr ? upTfs >= 2 && upTfs > dnTfs : dnTfs >= 2 && dnTfs > upTfs
    const volumeConfirm = cVol + pVol > 0 ? (bullExpr ? cVol >= pVol * 0.8 : pVol >= cVol * 0.8) : null

    let score = prob * 0.55
    score += rr != null ? Math.min(15, rr * 5) : 0
    score += liquidity === 'Good' ? 8 : liquidity === 'Acceptable' ? 4 : liquidity === 'Poor' ? -6 : 0
    score += theta === 'Tailwind' ? 5 : theta === 'Headwind' ? -5 : 0
    score += vega === 'Favorable' ? 4 : vega === 'Unfavorable' ? -4 : 0
    score += gamma === 'Risky' ? -5 : 0
    score += trendConfirm ? 6 : -3
    score += volumeConfirm === true ? 3 : volumeConfirm === false ? -3 : 0
    if (premium == null) score -= 25
    if (rejected) score -= 50 // vetoed strategies sink to the bottom, visibly
    score = Math.round(score)
    const stars = (score >= 62 ? 5 : score >= 52 ? 4 : score >= 42 ? 3 : score >= 32 ? 2 : 1) as 1 | 2 | 3 | 4 | 5

    return {
      id: `${action} ${moneyness} ${sideCP}`, action, moneyness, side: sideCP, strike, premium: r2(premium),
      probPct: prob, rr, theta, gamma, vega, liquidity, spreadPct: r2(sp), premiumRichness: richness,
      trendConfirm, volumeConfirm, maxRisk, expectedReward, stars, score, rejected,
    }
  }

  const ranked: StrategyEval[] = (['BUY', 'SELL'] as const)
    .flatMap((a) => (['ATM', 'ITM', 'OTM'] as const).flatMap((m) => (['CE', 'PE'] as const).map((s) => evalStrategy(a, m, s))))
    .sort((a, b) => b.score - a.score)
  // CONSISTENCY CHECK: never recommend a vetoed strategy, whatever its score
  const eligible = ranked.filter((s) => !s.rejected && s.premium != null)
  const best = eligible[0] ?? null
  const second = eligible[1] ?? null
  const describe = (s: StrategyEval) => `${s.action} ${s.strike?.toLocaleString('en-IN') ?? '—'} ${s.side} (${s.moneyness})`
  const whyBest = best ? `${describe(best)} ranks first: ${best.probPct}% estimated success, ${best.trendConfirm ? 'trend-aligned' : 'contra-trend'}, theta ${best.theta.toLowerCase()}, premiums ${best.premiumRichness.toLowerCase()}, ${best.liquidity.toLowerCase()} liquidity${best.rr != null ? `, RR 1:${best.rr}` : ''}. Risk: ${best.maxRisk}.` : null
  const whyNotSecond = best && second
    ? `${describe(second)} scored ${second.score} vs ${best.score}: ${second.probPct < best.probPct ? `lower success odds (${second.probPct}% vs ${best.probPct}%)` : 'similar odds'}${second.theta === 'Headwind' && best.theta !== 'Headwind' ? ', theta works against it' : ''}${second.vega === 'Unfavorable' && best.vega !== 'Unfavorable' ? ', premium pricing unfavourable' : ''}${second.action === 'SELL' && best.action === 'BUY' ? ', and the expected directional move favours the convex payoff of buying over capped premium collection' : second.action === 'BUY' && best.action === 'SELL' ? ', and without fast momentum the decay tailwind of selling wins' : ''}.`
    : null
  const nearTieNote = best && second && Math.abs(best.probPct - second.probPct) < 5
    ? `Near-tie (${best.probPct}% vs ${second.probPct}%): both are defensible. ${describe(best)} suits ${best.action === 'BUY' ? 'smaller capital, defined risk, momentum conviction' : 'margin availability and patience for decay'}; ${describe(second)} suits ${second.action === 'BUY' ? 'defined-risk preference' : 'traders comfortable with margin and open-ended risk (use spreads)'}. Choose by capital, margin and risk tolerance.`
    : null
  const strategyMatrix = { ranked, whyBest, whyNotSecond, nearTieNote }

  // best-available setup — driven by the matrix winner
  let traderSetup: OptionInsightsReport['trader']['setup'] = null
  // Setup is ALWAYS the matrix winner — never assumed, always compared first.
  if (best && best.strike != null && best.premium != null && atr15 != null) {
    const delta = best.moneyness === 'ATM' ? 0.5 : best.moneyness === 'ITM' ? 0.65 : 0.35
    const prem = best.premium
    const active = (verdict === 'Option Buying' && best.action === 'BUY') || (verdict === 'Option Selling' && best.action === 'SELL')
    if (best.action === 'BUY') {
      const bullExpr = best.side === 'CE'
      const trig = bullExpr ? keyLevels.breakout : keyLevels.breakdown
      traderSetup = {
        stars: best.stars,
        action: 'BUY',
        strike: best.strike,
        side: best.side,
        condition: `Entry only ${bullExpr ? 'above' : 'below'} ${trig != null ? trig.toLocaleString('en-IN') : 'the trigger level'} with strong ${bullExpr ? 'buying' : 'selling'} momentum on the 3-minute chart`,
        premiumZone: `${fmtP(prem * 0.98)} – ${fmtP(prem * 1.03)}`,
        stopLoss: fmtP(Math.max(0.05, prem - atr15 * 0.9 * delta)),
        target1: fmtP(prem + atr15 * 1.8 * delta),
        target2: fmtP(prem + atr15 * 3 * delta),
        active,
        statusLine: active
          ? '✅ Setup ACTIVE — entry conditions are met right now.'
          : '⏳ This setup is NOT active yet. Wait for the trigger + confirmation before entering.',
        sizingNote: best.stars <= 3 ? 'Lower-confidence setup — if taken at all, position sizing must be conservative.' : null,
        alternative: whyNotSecond,
      }
    } else {
      const sellsPut = best.side === 'PE'
      traderSetup = {
        stars: best.stars,
        action: 'SELL',
        strike: best.strike,
        side: best.side,
        condition: sellsPut
          ? `Only after price holds/rejects upward from ${keyLevels.s1 != null ? `S1 (${keyLevels.s1.toLocaleString('en-IN')})` : 'intraday support'}`
          : `Only after price rejects downward from ${keyLevels.r1 != null ? `R1 (${keyLevels.r1.toLocaleString('en-IN')})` : 'intraday resistance'}`,
        premiumZone: `${fmtP(prem)} (collect)`,
        stopLoss: `${fmtP(prem * 1.5)} (premium rises 50% against you)`,
        target1: fmtP(prem * 0.55),
        target2: fmtP(prem * 0.3),
        active,
        statusLine: active
          ? '✅ Conditions met — selling edge is live. Prefer defined-risk spreads over naked positions.'
          : '⏳ Conditional idea only — wait for the level test. Naked selling carries open-ended risk; prefer spreads.',
        sizingNote: 'Selling: conservative size, defined-risk (spread) strongly preferred over naked positions.',
        alternative: whyNotSecond,
      }
    }
  }
  // ── MARKET MEMORY: keep the previous recommendation unless objective
  //    evidence changed (spec: a consistent trader beats an inconsistent one) ─
  const s15 = structure[2]
  const evidence: EvidenceSnapshot = {
    dayKey: `${inp.nowIst.y}-${inp.nowIst.m}-${inp.nowIst.d}-${inp.index}`,
    spot,
    trend5: structure[1].trend,
    trend15: s15.trend,
    ema15Sig: `${s15.ema20 ?? '?'}|${s15.ema50 ?? '?'}`,
    adxBucket: adx15 == null ? 'na' : adx15 < 18 ? 'low' : adx15 < 25 ? 'mid' : 'high',
    vixBand,
    orState,
    atmStrike,
    pcr: pcrVolume != null ? +pcrVolume.toFixed(2) : null,
    breakout: keyLevels.breakout,
    breakdown: keyLevels.breakdown,
    s1: keyLevels.s1,
    r1: keyLevels.r1,
  }
  const changes: string[] = []
  if (prev && prev.evidence.dayKey === evidence.dayKey) {
    const pe = prev.evidence
    const crossed = (level: number | null, name: string) => {
      if (level == null || pe.spot == null || spot == null) return
      if ((pe.spot <= level && spot > level) || (pe.spot >= level && spot < level)) changes.push(`price crossed ${name} (${level.toLocaleString('en-IN')})`)
    }
    crossed(pe.breakout, 'the breakout level')
    crossed(pe.breakdown, 'the breakdown level')
    crossed(pe.s1, 'S1')
    crossed(pe.r1, 'R1')
    if (pe.trend15 !== evidence.trend15) changes.push(`15m trend changed ${pe.trend15} → ${evidence.trend15}`)
    if (pe.ema15Sig !== evidence.ema15Sig) changes.push('15m EMA alignment changed')
    if (pe.adxBucket !== evidence.adxBucket && evidence.adxBucket !== 'na' && pe.adxBucket !== 'na') changes.push(`trend strength regime changed (ADX ${pe.adxBucket} → ${evidence.adxBucket})`)
    if (pe.vixBand !== evidence.vixBand && evidence.vixBand && pe.vixBand) changes.push(`India VIX regime changed (${pe.vixBand} → ${evidence.vixBand})`)
    if (pe.orState !== evidence.orState && evidence.orState && pe.orState) changes.push(`opening-range state changed (${pe.orState} → ${evidence.orState})`)
    if (pe.atmStrike != null && evidence.atmStrike != null && Math.abs(pe.atmStrike - evidence.atmStrike) >= step) changes.push('spot moved a full strike (ATM shifted)')
    if (pe.pcr != null && evidence.pcr != null && Math.abs(pe.pcr - evidence.pcr) >= 0.2) changes.push(`option-chain flow shifted materially (PCR ${pe.pcr} → ${evidence.pcr})`)
  }
  const scoreJump = prev && best ? best.score - prev.bestScore >= 12 : false
  if (scoreJump && prev && best && prev.bestId !== best.id) changes.push('a different strategy now shows a decisively better edge (score +12 or more)')

  const sameDay = !!prev && prev.evidence.dayKey === evidence.dayKey
  const freshDecision = verdict === 'NO TRADE' ? 'NO TRADE' : verdict === 'Option Buying' ? 'BUY SETUP ACTIVE' : 'SELL SETUP ACTIVE'
  const decisionDiffers = sameDay && prev!.decision !== freshDecision
  const setupDiffers = sameDay && prev!.setup && traderSetup
    ? prev!.setup.action !== traderSetup.action || prev!.setup.side !== traderSetup.side || prev!.setup.strike !== traderSetup.strike
    : sameDay && !!prev!.setup !== !!traderSetup

  let kept = false
  if (sameDay && changes.length === 0 && (decisionDiffers || setupDiffers) && prev!.setup) {
    // nothing objective changed → the previous recommendation STANDS
    traderSetup = prev!.setup
    kept = true
  } else if (sameDay && changes.length === 0 && !decisionDiffers && !setupDiffers) {
    kept = true // same answer anyway — report continuity honestly
  }
  const whatChanged = kept && changes.length === 0
    ? ['No meaningful market change. Previous recommendation remains valid.']
    : changes.length ? changes : ['First analysis of this session — baseline established.']

  const trader: OptionInsightsReport['trader'] = {
    decision: kept && prev?.setup ? (prev!.decision as OptionInsightsReport['trader']['decision']) : (freshDecision as OptionInsightsReport['trader']['decision']),
    reason: traderReason,
    mqsExplainer: 'Market Quality Score = how clean today\'s market is for trading, out of 100 (trend + momentum + liquidity + volatility + expiry conditions). 70+ means tradable; below 70, capital preservation says stay out.',
    setup: traderSetup,
    whatChanged,
    kept,
    heldSince: kept && prev ? prev.at : Date.now(),
  }
  const memory: EngineMemory = {
    evidence,
    decision: trader.decision,
    setup: traderSetup,
    bestId: best?.id ?? null,
    bestScore: best?.score ?? 0,
    at: trader.heldSince ?? Date.now(),
  }

  // ── time blocks ────────────────────────────────────────────────────────────
  const blocks = [
    { block: '09:15–10:00', from: 555, to: 600, trend: 'Volatile discovery', volatility: 'High', momentum: 'Erratic', strategy: 'Observe OR; trade only clean OR breakouts', avoid: false },
    { block: '10:00–11:30', from: 600, to: 690, trend: upTfs > dnTfs ? 'Trend attempts up' : dnTfs > upTfs ? 'Trend attempts down' : 'Two-way', volatility: 'Moderate', momentum: 'Best of day', strategy: 'Directional (buying) if trend confirmed', avoid: false },
    { block: '11:30–13:00', from: 690, to: 780, trend: 'Drift', volatility: 'Low', momentum: 'Weak', strategy: 'Theta favours sellers; buyers stand aside', avoid: adx15 != null && adx15 < 18 },
    { block: '13:00–14:30', from: 780, to: 870, trend: 'Positioning', volatility: 'Building', momentum: 'Improving', strategy: 'Watch for range break with volume', avoid: false },
    { block: '14:30–15:30', from: 870, to: 930, trend: 'Resolution', volatility: isExpiryDay ? 'Extreme (expiry)' : 'High', momentum: 'Sharp', strategy: isExpiryDay ? 'Gamma scalps only for experts; most should avoid' : 'Momentum continuation / squaring-off moves', avoid: isExpiryDay },
  ].map(({ from, to, ...b }) => ({ ...b, current: marketOpen && mins >= from && mins < to }))

  // ── risks ──────────────────────────────────────────────────────────────────
  const risks: OptionInsightsReport['risks'] = [
    { risk: 'Unexpected news / events (feed unavailable)', level: 'Moderate', note: 'No live news integration — headline risk is invisible to this engine' },
    { risk: 'Expiry-day gamma', level: isExpiryDay ? 'High' : dte === 1 ? 'Moderate' : 'Low', note: isExpiryDay ? 'Violent premium swings near ATM' : `${dte ?? '—'} day(s) to expiry` },
    { risk: 'IV shift (crush/spike)', level: vixBand === 'High' || vixBand === 'Extreme' ? 'High' : 'Moderate', note: 'IV not observable directly — VIX used as proxy' },
    { risk: 'Liquidity/slippage', level: chainLiquidity === 'Poor' ? 'High' : chainLiquidity === 'Acceptable' ? 'Moderate' : 'Low', note: `ATM spread ${atmSpread ?? '—'}%` },
    { risk: 'Global/overnight reversal', level: 'Moderate', note: 'Global feeds unavailable — gap risk unmodelled' },
  ]

  return {
    generatedAt: Date.now(),
    index: inp.index,
    session: { prevClose: r2(prevClose), open: r2(open), gapPct: r2(gapPct), gapType, dayHigh: r2(dayHigh), dayLow: r2(dayLow), orHigh: r2(orHigh), orLow: r2(orLow), orState, phase, marketOpen },
    expiry: {
      current: curExp, dte, isExpiryDay, kind: expKind, thetaPressure, gammaRisk,
      favors: dte == null ? null : isExpiryDay ? (adx15 != null && adx15 >= 25 ? 'Balanced' : 'No Trade Bias') : thetaPressure === 'High' ? 'Option Selling' : vixBand === 'Low' || vixBand === 'Very Low' ? 'Option Buying' : 'Balanced',
      note: dte == null ? 'No expiry data from chain yet.' : `${curExp} (${expKind ?? '—'}) · ${dte === 0 ? 'EXPIRY DAY — extreme theta & gamma' : `${dte} day(s) left — theta ${thetaPressure}, gamma ${gammaRisk}`}. IV metrics unavailable; premium behaviour inferred from straddle & VIX.`,
    },
    vix: { value: r2(vix), changePct: r2(vixChg), band: vixBand, note: vixNote },
    structure,
    keyLevels,
    chain: {
      expiry: curExp, atmStrike, straddle: r2(straddle), straddlePctOfSpot: r2(straddlePct),
      impliedDayRangeLow: r2(spot != null && impliedHalfRange != null ? spot - impliedHalfRange : null),
      impliedDayRangeHigh: r2(spot != null && impliedHalfRange != null ? spot + impliedHalfRange : null),
      pcrVolume: pcrVolume != null ? +pcrVolume.toFixed(2) : null,
      callVolumeHeavyStrike: cHeavy?.strike ?? null,
      putVolumeHeavyStrike: pHeavy?.strike ?? null,
      atmSpreadPct: atmSpread, liquidity: chainLiquidity,
      note: 'OI-based analytics (Max Pain, buildups, OI S/R) unavailable — volume-based PCR and strike concentration shown instead. Straddle price is the market-implied expected move.',
    },
    sentiment: { label: sentLabel, confidencePct: sentConfidence, basis: 'Tape-derived only (gap, MTF trend, OR, VIX change). News/FII-DII/global feeds unavailable — treat as price sentiment, not full market sentiment.' },
    quality: { score: mqs, interpretation: mqsInterp, components: comps },
    probabilities: probs,
    projection,
    strategy: { verdict, comparison, gates, reasons: strategyReasons },
    recommendation,
    candidates,
    strategyMatrix,
    trader,
    memory,
    timeBlocks: blocks,
    risks,
    missing,
    disclaimer: 'Educational research output generated from live price/volume data only. Not personalised financial advice. Options carry substantial risk; probabilities are estimates, not certainties. Missing data (OI, IV, Greeks, news) reduces reliability — verify independently.',
  }
}
