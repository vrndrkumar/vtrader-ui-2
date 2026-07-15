// ── Analysis engine: MTF snapshots, evidence, scores, trade plans ────────────
import {
  adx, atr, bollinger, closes, cmf, ema, last, macd, obv, rsi, slope, sma,
} from './indicators.js'
import { analyseStructure, compression, srZones, yearContext } from './structure.js'

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v))
const round = (v, d = 2) => (v == null ? null : +v.toFixed(d))

// ── Per-timeframe snapshot ───────────────────────────────────────────────────

export function snapshot(candles, label) {
  if (!candles || candles.length < 35) {
    return { timeframe: label, available: false }
  }
  const c = closes(candles)
  const px = c[c.length - 1]
  const e20 = last(ema(c, 20))
  const e50 = last(ema(c, 50))
  const s200 = c.length >= 200 ? last(sma(c, 200)) : null
  const r = last(rsi(c, 14))
  const m = macd(c)
  const macdHist = last(m.hist)
  const macdPrev = m.hist.length > 1 ? m.hist[m.hist.length - 2] : null
  const a = adx(candles, 14)
  const adxV = last(a.adx)
  const atrV = last(atr(candles, 14))
  const struct = analyseStructure(candles)
  const comp = compression(candles)
  const slope20 = slope(c, 20)
  const vol = candles.map((x) => x.volume)
  const v20 = vol.slice(-20).reduce((s, v) => s + v, 0) / Math.min(20, vol.length)
  const volRatio = v20 ? vol[vol.length - 1] / v20 : null
  const obvArr = obv(candles)
  const obvSlope = slope(obvArr.map((v) => v + Math.abs(Math.min(...obvArr)) + 1), 20)
  const cmfV = last(cmf(candles, 20))

  let momentum = 'NEUTRAL'
  if (r != null) {
    if (r >= 60 && macdHist > 0) momentum = 'BULLISH'
    else if (r <= 40 && macdHist < 0) momentum = 'BEARISH'
    else if (r > 50) momentum = 'IMPROVING'
    else momentum = 'SOFT'
  }

  return {
    timeframe: label,
    available: true,
    price: round(px),
    trend: struct.trend,
    structureDetail: struct.detail,
    bos: struct.bos,
    choch: struct.choch,
    momentum,
    rsi: round(r, 1),
    macdHist: round(macdHist, 4),
    macdRising: macdHist != null && macdPrev != null ? macdHist > macdPrev : null,
    adx: round(adxV, 1),
    atr: round(atrV),
    atrPct: round(atrV && px ? (atrV / px) * 100 : null, 2),
    aboveEma20: e20 != null ? px > e20 : null,
    aboveEma50: e50 != null ? px > e50 : null,
    aboveSma200: s200 != null ? px > s200 : null,
    slope20Pct: round(slope20, 3),
    volumeRatio: round(volRatio, 2),
    obvSlope: round(obvSlope, 3),
    cmf: round(cmfV, 3),
    compressed: comp.isCompressed,
    bbWidthPct: comp.bbWidthPct,
    compressionDetail: comp.detail,
    lastSwingHigh: round(struct.lastSwingHigh),
    lastSwingLow: round(struct.lastSwingLow),
  }
}

// ── Relative strength vs a benchmark (ratio slope over 20/60 bars) ───────────

export function relativeStrength(stockDaily, benchDaily) {
  if (!stockDaily?.length || !benchDaily?.length) return null
  const byDay = new Map(benchDaily.map((c) => [new Date(c.time * 1000).toISOString().slice(0, 10), c.close]))
  const ratio = []
  for (const c of stockDaily) {
    const k = new Date(c.time * 1000).toISOString().slice(0, 10)
    const b = byDay.get(k)
    if (b) ratio.push(c.close / b)
  }
  if (ratio.length < 60) return null
  const rs20 = slope(ratio, 20)
  const rs60 = slope(ratio, 60)
  const improving = rs20 != null && rs60 != null && rs20 > rs60
  return {
    slope20: round(rs20, 3),
    slope60: round(rs60, 3),
    improving,
    outperforming20: rs20 != null && rs20 > 0,
    outperforming60: rs60 != null && rs60 > 0,
  }
}

// ── Technical Health Score (current trend quality) ───────────────────────────

export function technicalHealthScore(snaps) {
  const d = snaps.daily
  const w = snaps.weekly
  if (!d?.available) return { score: null, components: [], note: 'Insufficient daily data' }
  const comps = []
  const add = (name, pts, max, why) => comps.push({ name, points: round(pts, 1), max, why })

  let s = 0
  // Trend alignment (30)
  let trendPts = 0
  if (d.trend === 'UPTREND') trendPts += 14
  else if (d.trend === 'RANGE') trendPts += 7
  if (w?.available) {
    if (w.trend === 'UPTREND') trendPts += 10
    else if (w.trend === 'RANGE') trendPts += 5
  } else trendPts += 5
  if (d.aboveSma200) trendPts += 6
  trendPts = Math.min(trendPts, 30)
  add('Trend quality', trendPts, 30, `Daily ${d.trend}, weekly ${w?.trend ?? 'n/a'}, ${d.aboveSma200 ? 'above' : 'below'} 200SMA`)
  s += trendPts

  // Momentum (25)
  let mom = 0
  if (d.rsi != null) mom += clamp(((d.rsi - 30) / 40) * 12, 0, 12)
  if (d.macdHist > 0) mom += 6
  if (d.macdRising) mom += 3
  if (d.adx != null) mom += clamp(((d.adx - 15) / 25) * 4, 0, 4)
  mom = Math.min(mom, 25)
  add('Momentum', mom, 25, `RSI ${d.rsi}, MACD hist ${d.macdHist}${d.macdRising ? ' rising' : ''}, ADX ${d.adx}`)
  s += mom

  // Moving average posture (20)
  let mas = 0
  if (d.aboveEma20) mas += 7
  if (d.aboveEma50) mas += 7
  if (d.aboveSma200) mas += 6
  add('MA posture', mas, 20, `20EMA ${d.aboveEma20 ? '✓' : '✗'} 50EMA ${d.aboveEma50 ? '✓' : '✗'} 200SMA ${d.aboveSma200 ? '✓' : '✗'}`)
  s += mas

  // Volume / flow (15)
  let flow = 0
  if (d.cmf != null) flow += clamp((d.cmf + 0.1) / 0.3 * 8, 0, 8)
  if (d.obvSlope != null && d.obvSlope > 0) flow += 4
  if (d.volumeRatio != null && d.volumeRatio > 1) flow += 3
  flow = Math.min(flow, 15)
  add('Volume & money flow', flow, 15, `CMF ${d.cmf}, OBV slope ${d.obvSlope}, vol ratio ${d.volumeRatio}`)
  s += flow

  // Structure integrity (10)
  let st = 0
  if (d.bos && d.trend !== 'DOWNTREND') st += 6
  if (!d.choch || d.trend === 'DOWNTREND') st += 4
  add('Structure', Math.min(st, 10), 10, d.structureDetail)
  s += Math.min(st, 10)

  return { score: Math.round(clamp(s)), components: comps }
}

// ── Explosion Probability Score (pre-move energy) ────────────────────────────

export function explosionScore(snaps, rsVsNifty, hist) {
  const d = snaps.daily
  if (!d?.available) return { score: null, evidence: [], against: [] }
  const evidence = [] // { icon, title, detail, weight }
  const against = []
  let s = 0
  const add = (pts, icon, title, detail) => { s += pts; evidence.push({ icon, title, detail, weight: round(pts, 1) }) }

  // 1. Volatility compression / base (up to 25)
  if (d.compressed) {
    add(18, 'compress', 'Volatility compression', d.compressionDetail.join('; ') || 'Tight base on daily chart')
    if (snaps.weekly?.available && snaps.weekly.bbWidthPct != null && snaps.weekly.bbWidthPct <= 35) {
      add(7, 'compress', 'Weekly squeeze too', `Weekly BB width in tightest ${snaps.weekly.bbWidthPct}%`)
    }
  } else if (d.bbWidthPct != null && d.bbWidthPct <= 40) {
    add(8, 'compress', 'Volatility contracting', `BB width percentile ${d.bbWidthPct}`)
  } else {
    against.push('No meaningful volatility compression — energy may already be spent')
  }

  // 2. Accumulation / liquidity absorption (up to 20)
  if (d.cmf != null && d.cmf > 0.05) add(8, 'accumulate', 'Positive money flow', `CMF(20) = ${d.cmf}`)
  if (d.obvSlope != null && d.obvSlope > 0) add(6, 'accumulate', 'OBV rising', 'On-balance volume trending up while price bases')
  if (d.volumeRatio != null && d.volumeRatio >= 1.4) add(6, 'volume', 'Volume expansion', `Latest volume ${d.volumeRatio}× its 20-bar average`)
  else if (d.volumeRatio != null && d.volumeRatio < 0.7 && d.compressed) add(4, 'volume', 'Volume dry-up in base', 'Supply absorbed — quiet volume inside the base')

  // 3. Relative strength improvement (up to 15)
  if (rsVsNifty) {
    if (rsVsNifty.improving && rsVsNifty.outperforming20) add(15, 'rs', 'Relative strength improving', 'Outperforming NIFTY over 20 sessions and accelerating vs its 60-session trend')
    else if (rsVsNifty.outperforming20) add(9, 'rs', 'Outperforming NIFTY', 'Positive 20-session RS slope vs NIFTY')
    else if (rsVsNifty.improving) add(6, 'rs', 'RS turning up', 'Underperformance narrowing vs NIFTY')
    else against.push('Relative strength vs NIFTY still weak')
  }

  // 4. Trend shift / CHOCH / BOS (up to 15)
  if (d.choch && d.trend === 'DOWNTREND') add(12, 'shift', 'Bullish change of character', 'Price broke above the last lower-high inside a downtrend — early reversal evidence')
  else if (d.bos && d.trend !== 'DOWNTREND') add(10, 'shift', 'Break of structure', 'Close beyond the last swing extreme in trend direction')
  else if (d.trend === 'RANGE' && snaps.weekly?.trend === 'UPTREND') add(7, 'shift', 'Daily base inside weekly uptrend', 'Consolidation within a larger uptrend — continuation setup')

  // 5. Multi-timeframe alignment (up to 10)
  const aligned = ['1h', '4h', 'daily', 'weekly']
    .map((k) => snaps[k])
    .filter((x) => x?.available && (x.trend === 'UPTREND' || x.momentum === 'BULLISH' || x.momentum === 'IMPROVING')).length
  if (aligned >= 3) add(10, 'mtf', 'Multi-timeframe alignment', `${aligned}/4 higher timeframes constructive`)
  else if (aligned === 2) add(5, 'mtf', 'Partial timeframe alignment', '2 of 4 timeframes constructive')
  else against.push('Timeframes not aligned yet')

  // 6. Historical analogue support (up to 15)
  if (hist?.sampleSize >= 5) {
    const wr = hist.winRate
    if (wr >= 60) add(15, 'history', 'History favours this setup', `${hist.sampleSize} similar setups since 2020 — ${wr}% resolved higher (avg +${hist.avgGainPct}% in ~${hist.avgDurationBars} bars)`)
    else if (wr >= 45) add(8, 'history', 'Mixed historical record', `${hist.sampleSize} similar setups, ${wr}% worked`)
    else against.push(`Similar setups since 2020 mostly failed (${wr}% win rate over ${hist.sampleSize} events)`)
  }

  // Penalty: already extended (chasing guard)
  const yc = snaps.yearContext
  if (yc && yc.fromLowPct > 80 && d.rsi != null && d.rsi > 72) {
    s -= 12
    against.push(`Already extended: +${yc.fromLowPct}% off 52-week low with RSI ${d.rsi} — move may be late-stage`)
  }

  return { score: Math.round(clamp(s)), evidence, against }
}

// ── Historical validation (no look-ahead) ────────────────────────────────────
// Finds past bars whose state resembles "compressed base + improving momentum"
// using only data up to that bar, then measures forward outcome.

export function historicalValidation(daily, opts = {}) {
  const lookForwardBars = opts.lookForwardBars ?? 40
  const minGap = 15
  if (!daily || daily.length < 260) return { sampleSize: 0, note: 'Not enough daily history' }

  const c = closes(daily)
  const bb = bollinger(c, 20, 2)
  const r = rsi(c, 14)
  const e50arr = ema(c, 50)
  const events = []

  for (let i = 140; i < daily.length - lookForwardBars; i++) {
    // BB width percentile within trailing 120 bars only (no future data)
    const win = bb.width.slice(i - 119, i + 1).filter((v) => v != null)
    if (win.length < 60) continue
    const wNow = bb.width[i]
    if (wNow == null) continue
    const pct = (win.filter((x) => x <= wNow).length / win.length) * 100
    const rsiOk = r[i] != null && r[i] >= 45 && r[i] <= 65
    const nearMa = e50arr[i] != null && Math.abs(c[i] - e50arr[i]) / e50arr[i] < 0.06
    if (pct <= 25 && rsiOk && nearMa) {
      if (events.length && i - events[events.length - 1].i < minGap) continue
      events.push({ i })
    }
  }

  if (!events.length) return { sampleSize: 0, note: 'No comparable historical setups found' }

  let wins = 0
  let gains = []
  let drawdowns = []
  let durations = []
  const samples = []
  for (const ev of events) {
    const entry = c[ev.i]
    const fwd = daily.slice(ev.i + 1, ev.i + 1 + lookForwardBars)
    const maxHigh = Math.max(...fwd.map((x) => x.high))
    const minLow = Math.min(...fwd.map((x) => x.low))
    const gain = ((maxHigh - entry) / entry) * 100
    const dd = ((minLow - entry) / entry) * 100
    const win = gain >= 8 && gain > Math.abs(dd)
    if (win) wins++
    gains.push(gain)
    drawdowns.push(dd)
    const peakIdx = fwd.findIndex((x) => x.high === maxHigh)
    durations.push(peakIdx + 1)
    samples.push({
      date: new Date(daily[ev.i].time * 1000).toISOString().slice(0, 10),
      entry: +entry.toFixed(2),
      maxGainPct: +gain.toFixed(1),
      maxDrawdownPct: +dd.toFixed(1),
      won: win,
    })
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length
  return {
    sampleSize: events.length,
    winRate: Math.round((wins / events.length) * 100),
    avgGainPct: +avg(gains).toFixed(1),
    avgDrawdownPct: +avg(drawdowns).toFixed(1),
    avgDurationBars: Math.round(avg(durations)),
    lookForwardBars,
    criteria: 'BB-width ≤ 25th percentile, RSI 45–65, price within 6% of 50EMA (state computed with data available at the time only)',
    samples: samples.slice(-8),
  }
}

// ── Trade plans per horizon ──────────────────────────────────────────────────

export function tradePlans(snaps, zones) {
  const d = snaps.daily
  if (!d?.available) return null
  const px = d.price
  const atrD = d.atr || px * 0.02
  const sup = zones.filter((z) => z.kind === 'SUPPORT').sort((a, b) => b.center - a.center)
  const res = zones.filter((z) => z.kind === 'RESISTANCE').sort((a, b) => a.center - b.center)
  const s1 = sup[0]?.center ?? px - 2 * atrD
  const r1 = res[0]?.center ?? px + 2 * atrD
  const r2 = res[1]?.center ?? px + 4 * atrD
  const mk = (entryLo, entryHi, stop, t1, t2, t3, period, notes) => {
    const entryMid = (entryLo + entryHi) / 2
    const risk = entryMid - stop
    const rr = risk > 0 ? +(((t2 - entryMid) / risk)).toFixed(2) : null
    return {
      entryZone: [round(entryLo), round(entryHi)],
      stopLoss: round(stop),
      support: round(s1),
      resistance: round(r1),
      targets: [round(t1), round(t2), round(t3)],
      riskReward: rr,
      holdingPeriod: period,
      notes,
    }
  }
  const h1 = snaps['1h']
  const atrH = h1?.available && h1.atr ? h1.atr : atrD / 3

  return {
    intraday: mk(
      px - 0.5 * atrH, px + 0.25 * atrH,
      px - 1.2 * atrH,
      px + 1 * atrH, px + 1.8 * atrH, px + 2.5 * atrH,
      'Same day to 5 trading days',
      'ATR-based day structure; trade only with 15m/1h momentum in agreement. Skip if the daily setup is against you.',
    ),
    swing: mk(
      Math.max(s1, px - 1.5 * atrD), px + 0.5 * atrD,
      Math.min(s1 - 0.75 * atrD, px - 2 * atrD),
      r1, r2, r2 + 2 * atrD,
      '2 weeks to 6 months',
      'Entry favours a retest toward the nearest demand zone; invalidation is a daily close below the zone.',
    ),
    longTerm: mk(
      s1, px + 0.25 * atrD,
      s1 - 2.5 * atrD,
      r2, r2 + 4 * atrD, r2 + 8 * atrD,
      '6 months to 5 years',
      'Position sizing over time (staggered buys near support). Thesis breaks on a weekly close below the stop zone.',
    ),
  }
}

// ── Verdict ──────────────────────────────────────────────────────────────────

export function verdict(scores, snaps) {
  const { technicalHealth, explosion, risk } = scores
  const d = snaps.daily
  let label = 'Watchlist'
  if (explosion >= 70 && technicalHealth >= 55 && risk <= 55) label = 'Buy'
  if (explosion >= 80 && technicalHealth >= 65 && risk <= 45) label = 'Strong Buy'
  if (explosion >= 65 && technicalHealth < 55) label = 'Accumulation Candidate'
  if (explosion < 45 && technicalHealth < 45) label = 'Avoid'
  if (explosion >= 65 && risk >= 70) label = 'High Risk Speculative'
  if (d?.trend === 'DOWNTREND' && !d.choch && explosion < 60) label = 'Avoid'
  return label
}
