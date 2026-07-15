// ── Report orchestrator: builds the full Stock Insight report JSON ───────────
import { fetchAllTimeframes, fetchDaily } from './candles.js'
import { getSymbol } from './db.js'
import {
  explosionScore, historicalValidation, relativeStrength, snapshot,
  technicalHealthScore, tradePlans, verdict,
} from './engine.js'
import { srZones, yearContext } from './structure.js'
import { config } from './config.js'

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v))

function riskScore(snaps, hist, rs) {
  // Higher = riskier
  let r = 40
  const d = snaps.daily
  if (!d?.available) return 80
  if (d.atrPct != null) r += clamp((d.atrPct - 1.5) * 8, -10, 20) // volatility
  if (d.trend === 'DOWNTREND') r += 15
  if (d.trend === 'UPTREND') r -= 10
  if (snaps.yearContext?.fromHighPct != null && snaps.yearContext.fromHighPct < -35) r += 10 // deep drawdown name
  if (hist?.sampleSize >= 5 && hist.avgDrawdownPct != null) r += clamp((Math.abs(hist.avgDrawdownPct) - 5) * 1.5, -5, 12)
  if (rs && !rs.outperforming60) r += 5
  return Math.round(clamp(r))
}

function confidenceScore(snaps, hist, dataGaps) {
  let c = 50
  const availableTfs = ['15m', '30m', '1h', '4h', 'daily', 'weekly', 'monthly'].filter((k) => snaps[k]?.available).length
  c += (availableTfs - 4) * 4
  if (hist?.sampleSize >= 8) c += 15
  else if (hist?.sampleSize >= 4) c += 8
  else c -= 5
  c -= dataGaps.length * 6
  return Math.round(clamp(c))
}

async function sectorAnalysis(master, stockDaily) {
  const out = {
    sector: master?.sector ?? null,
    industry: master?.industry ?? null,
    sectorIndexSymbol: master?.sector_index_symbol ?? null,
    vsNifty: null,
    sectorVsNifty: null,
    stockVsSector: null,
    note: null,
  }
  let nifty = []
  try {
    nifty = await fetchDaily(config.benchmarkSymbol, '2023-01-01')
  } catch {
    out.note = 'Benchmark (NIFTY) candles unavailable'
    return out
  }
  out.vsNifty = relativeStrength(stockDaily, nifty)

  if (master?.sector_index_symbol) {
    try {
      const sectorIdx = await fetchDaily(master.sector_index_symbol, '2023-01-01')
      if (sectorIdx.length) {
        out.sectorVsNifty = relativeStrength(sectorIdx, nifty)
        out.stockVsSector = relativeStrength(stockDaily, sectorIdx)
      }
    } catch {
      out.note = `Sector index ${master.sector_index_symbol} candles unavailable`
    }
  } else {
    out.note = 'No sector index mapped for this symbol'
  }
  return out
}

function sectorScore(sec) {
  if (!sec?.vsNifty && !sec?.sectorVsNifty) return null
  let s = 50
  const rs = sec.sectorVsNifty ?? sec.vsNifty
  if (rs.outperforming20) s += 15
  if (rs.outperforming60) s += 15
  if (rs.improving) s += 10
  if (!rs.outperforming20 && !rs.outperforming60) s -= 20
  if (sec.stockVsSector?.outperforming20) s += 10
  return Math.round(clamp(s))
}

export async function buildReport(symbolCode) {
  const startedAt = Date.now()
  const dataGaps = []

  let master = null
  try {
    master = await getSymbol(symbolCode)
  } catch (e) {
    dataGaps.push(`Stock master DB unreachable (${e.code || e.message}) — sector/industry metadata missing`)
  }

  const tf = await fetchAllTimeframes(symbolCode)
  if (!tf.daily.length) throw Object.assign(new Error(`No candle data for ${symbolCode}`), { status: 404 })

  const snaps = {
    '15m': snapshot(tf['15m'], '15m'),
    '30m': snapshot(tf['30m'], '30m'),
    '1h': snapshot(tf['1h'], '1h'),
    '4h': snapshot(tf['4h'], '4h'),
    daily: snapshot(tf.daily, 'daily'),
    weekly: snapshot(tf.weekly, 'weekly'),
    monthly: snapshot(tf.monthly, 'monthly'),
    yearContext: yearContext(tf.daily),
  }

  const zonesDaily = srZones(tf.daily.slice(-260))
  const zonesWeekly = srZones(tf.weekly.slice(-160), 4)
  const hist = historicalValidation(tf.daily)
  const sector = await sectorAnalysis(master, tf.daily)

  const th = technicalHealthScore(snaps)
  const ex = explosionScore(snaps, sector.vsNifty, hist)
  const risk = riskScore(snaps, hist, sector.vsNifty)
  const secScore = sectorScore(sector)

  // Fundamental & sentiment: no data source wired — never guess.
  const fundamental = { score: null, category: 'Data unavailable', note: 'No fundamentals data source connected. Treat as neutral filter; verify externally before long-term positions.' }
  const sentiment = { score: null, category: 'Data unavailable', note: 'No news/announcement feed connected. Check latest results and corporate announcements before acting.' }
  dataGaps.push('Fundamental data unavailable', 'News/sentiment data unavailable')

  const confidence = confidenceScore(snaps, hist, dataGaps)

  // Overall opportunity: explosion-led, tempered by health, sector, risk.
  const parts = [
    [ex.score, 0.45],
    [th.score, 0.25],
    [secScore ?? 50, 0.15],
    [100 - risk, 0.15],
  ].filter(([v]) => v != null)
  const overall = Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / parts.reduce((s, [, w]) => s + w, 0))

  const scores = {
    technicalHealth: th.score,
    explosionProbability: ex.score,
    fundamental: fundamental.score,
    sector: secScore,
    sentiment: sentiment.score,
    risk,
    confidence,
    overall,
  }

  const plans = tradePlans(snaps, zonesDaily)
  const finalVerdict = verdict(scores, snaps)

  // Weekly chart payload for the UI card (2 years of weekly candles + key zone)
  const weeklyChart = {
    candles: tf.weekly.slice(-110),
    keyZones: zonesWeekly.slice(0, 3),
  }

  return {
    meta: {
      symbol: symbolCode,
      name: master?.symbol_name ?? symbolCode,
      exchange: master?.exchange ?? null,
      sector: master?.sector ?? null,
      industry: master?.industry ?? null,
      category: master?.category ?? null,
      description: master?.description ?? null,
      generatedAt: new Date().toISOString(),
      engine: 'rule-based v1',
      elapsedMs: Date.now() - startedAt,
      dataGaps,
    },
    price: {
      last: snaps.daily.price,
      atrPct: snaps.daily.atrPct,
      ...(snaps.yearContext ?? {}),
    },
    scores,
    scoreBreakdown: { technicalHealth: th.components },
    explosion: { evidence: ex.evidence, against: ex.against },
    timeframes: ['15m', '30m', '1h', '4h', 'daily', 'weekly', 'monthly'].map((k) => snaps[k]),
    zones: { daily: zonesDaily, weekly: zonesWeekly },
    historicalValidation: hist,
    sector,
    fundamental,
    sentiment,
    risks: buildRisks(snaps, sector, hist, risk),
    tradePlans: plans,
    verdict: {
      label: finalVerdict,
      bullishCase: buildBullCase(ex, snaps, sector),
      bearishCase: buildBearCase(ex, snaps, sector, hist),
      invalidation: buildInvalidation(snaps, plans),
      catalysts: ['Earnings/results (verify dates externally)', 'Sector index breakout/breakdown', 'Break of the key weekly zone in either direction'],
    },
    weeklyChart,
    disclaimer:
      'Generated by a deterministic rule-based engine from price/volume data only. Fundamental and news data were NOT evaluated. This is research/education, not investment advice; markets carry risk of loss. Verify independently and consult a registered advisor before trading.',
  }
}

function buildRisks(snaps, sector, hist, riskScoreVal) {
  const d = snaps.daily
  const risks = { technical: [], sector: [], liquidity: [], event: [], macro: [] }
  if (d.trend === 'DOWNTREND') risks.technical.push('Primary daily trend is still down — reversal evidence can fail')
  if (d.atrPct > 3) risks.technical.push(`High volatility (ATR ${d.atrPct}% of price) — wide stops required`)
  if (snaps.weekly?.available && snaps.weekly.trend === 'DOWNTREND') risks.technical.push('Weekly trend down — daily strength may be counter-trend')
  if (hist?.sampleSize >= 5 && hist.winRate < 50) risks.technical.push(`Similar historical setups failed more often than they worked (${hist.winRate}%)`)
  if (sector?.sectorVsNifty && !sector.sectorVsNifty.outperforming60) risks.sector.push('Sector underperforming NIFTY over 60 sessions')
  if (!sector?.sectorIndexSymbol) risks.sector.push('No sector index mapped — sector rotation unverified')
  risks.liquidity.push('Check average traded value before sizing; engine does not verify impact cost')
  risks.event.push('Earnings, policy and corporate announcements are NOT monitored by this engine')
  risks.macro.push('Index-level shocks (global risk-off, rates) can override any single-stock setup')
  risks.overall = riskScoreVal
  return risks
}

function buildBullCase(ex, snaps, sector) {
  const pts = ex.evidence.slice(0, 4).map((e) => e.title.toLowerCase())
  return pts.length
    ? `Energy is building: ${pts.join(', ')}. If the key zone breaks with volume, the compression can resolve into a directional expansion.`
    : 'Limited bullish evidence at present.'
}

function buildBearCase(ex, snaps, sector, hist) {
  const pts = [...ex.against]
  if (!pts.length) pts.push('A failed breakout from the base (bull trap) followed by a close back inside the range')
  return pts.join('. ') + '.'
}

function buildInvalidation(snaps, plans) {
  const stop = plans?.swing?.stopLoss
  return [
    stop != null ? `Daily close below ${stop} (swing stop zone)` : 'Daily close below the nearest demand zone',
    'Bearish change of character on the daily (break of last higher-low)',
    'Volume expanding on down moves while RSI loses 40',
  ]
}
