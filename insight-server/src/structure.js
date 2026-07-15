// ── Market structure: swings, trend, BOS/CHOCH, S/R zones, compression ──────
import { atr, bollinger, closes, sma } from './indicators.js'

/** Pivot swing highs/lows with `left`/`right` bar confirmation. */
export function findSwings(candles, left = 3, right = 3) {
  const swings = []
  for (let i = left; i < candles.length - right; i++) {
    const isHigh = candles.slice(i - left, i + right + 1).every((c) => c.high <= candles[i].high)
    const isLow = candles.slice(i - left, i + right + 1).every((c) => c.low >= candles[i].low)
    if (isHigh) swings.push({ i, type: 'H', price: candles[i].high, time: candles[i].time })
    if (isLow) swings.push({ i, type: 'L', price: candles[i].low, time: candles[i].time })
  }
  return swings
}

/**
 * Classify structure from the last few swings:
 * UPTREND (HH+HL), DOWNTREND (LH+LL), RANGE otherwise.
 * Also detects Break of Structure / Change of Character on the last close.
 */
export function analyseStructure(candles) {
  const empty = { trend: 'UNKNOWN', lastSwings: [], bos: false, choch: false, detail: 'Insufficient data' }
  if (candles.length < 30) return empty
  const swings = findSwings(candles)
  if (swings.length < 4) return empty

  const hs = swings.filter((s) => s.type === 'H').slice(-3)
  const ls = swings.filter((s) => s.type === 'L').slice(-3)
  if (hs.length < 2 || ls.length < 2) return empty

  const hh = hs[hs.length - 1].price > hs[hs.length - 2].price
  const hl = ls[ls.length - 1].price > ls[ls.length - 2].price
  const lh = hs[hs.length - 1].price < hs[hs.length - 2].price
  const ll = ls[ls.length - 1].price < ls[ls.length - 2].price

  let trend = 'RANGE'
  if (hh && hl) trend = 'UPTREND'
  else if (lh && ll) trend = 'DOWNTREND'

  const lastClose = candles[candles.length - 1].close
  const lastHigh = hs[hs.length - 1]
  const lastLow = ls[ls.length - 1]

  // BOS: close beyond the most recent swing extreme in trend direction.
  // CHOCH: close breaking against the prevailing trend (early reversal signal).
  let bos = false
  let choch = false
  if (trend === 'UPTREND' && lastClose > lastHigh.price) bos = true
  if (trend === 'DOWNTREND' && lastClose < lastLow.price) bos = true
  if (trend === 'DOWNTREND' && lastClose > lastHigh.price) choch = true // bullish CHOCH
  if (trend === 'UPTREND' && lastClose < lastLow.price) choch = true // bearish CHOCH
  if (trend === 'RANGE' && lastClose > lastHigh.price) bos = true

  const detail =
    trend === 'UPTREND' ? 'Higher highs and higher lows' :
    trend === 'DOWNTREND' ? 'Lower highs and lower lows' :
    'Overlapping swings — range/base'

  return { trend, lastSwings: swings.slice(-6), bos, choch, detail, lastSwingHigh: lastHigh.price, lastSwingLow: lastLow.price }
}

/**
 * Support/resistance zones by clustering swing pivots.
 * Returns zones sorted by strength (touch count), each { lo, hi, touches, kind }.
 */
export function srZones(candles, maxZones = 6) {
  if (candles.length < 40) return []
  const swings = findSwings(candles, 3, 3)
  const atrArr = atr(candles, 14)
  const lastAtr = atrArr[atrArr.length - 1] || (candles[candles.length - 1].close * 0.02)
  const tol = lastAtr * 0.75
  const zones = []
  for (const s of swings) {
    const z = zones.find((z) => Math.abs(z.center - s.price) <= tol)
    if (z) {
      z.touches++
      z.center = (z.center * (z.touches - 1) + s.price) / z.touches
      z.lo = Math.min(z.lo, s.price)
      z.hi = Math.max(z.hi, s.price)
      z.lastTouchIdx = Math.max(z.lastTouchIdx, s.i)
    } else {
      zones.push({ center: s.price, lo: s.price, hi: s.price, touches: 1, lastTouchIdx: s.i })
    }
  }
  const price = candles[candles.length - 1].close
  return zones
    .filter((z) => z.touches >= 2)
    .map((z) => ({
      lo: +z.lo.toFixed(2),
      hi: +z.hi.toFixed(2),
      center: +z.center.toFixed(2),
      touches: z.touches,
      kind: z.center < price ? 'SUPPORT' : 'RESISTANCE',
      distancePct: +(((z.center - price) / price) * 100).toFixed(2),
    }))
    .sort((a, b) => b.touches - a.touches)
    .slice(0, maxZones)
    .sort((a, b) => a.center - b.center)
}

/**
 * Volatility compression / base detection (VCP-flavoured).
 * Looks at: BB width percentile, successive contraction of pullbacks,
 * range tightness, volume dry-up.
 */
export function compression(candles) {
  const res = { isCompressed: false, bbWidthPct: null, contractions: 0, volumeDryUp: false, baseLengthBars: 0, detail: [] }
  if (candles.length < 60) return res
  const c = closes(candles)
  const bb = bollinger(c, 20, 2)
  const widths = bb.width.filter((v) => v != null)
  if (!widths.length) return res
  const lastW = widths[widths.length - 1]
  const tail = widths.slice(-120)
  const below = tail.filter((x) => x <= lastW).length
  res.bbWidthPct = +((below / tail.length) * 100).toFixed(1)

  // Successive contraction: compare depth of last 3 pullbacks (swing high→low legs)
  const swings = findSwings(candles, 3, 3)
  const legs = []
  for (let i = 1; i < swings.length; i++) {
    if (swings[i - 1].type === 'H' && swings[i].type === 'L') {
      legs.push((swings[i - 1].price - swings[i].price) / swings[i - 1].price)
    }
  }
  const lastLegs = legs.slice(-3)
  let contractions = 0
  for (let i = 1; i < lastLegs.length; i++) if (lastLegs[i] < lastLegs[i - 1]) contractions++
  res.contractions = contractions

  // Volume dry-up: last-10-bar avg vs 50-bar avg
  const vol = candles.map((x) => x.volume)
  const v10 = vol.slice(-10).reduce((a, b) => a + b, 0) / 10
  const v50 = vol.slice(-50).reduce((a, b) => a + b, 0) / 50
  res.volumeDryUp = v50 > 0 && v10 / v50 < 0.75

  // Base length: consecutive bars inside ±8% band around 20SMA
  const ma = sma(c, 20)
  let len = 0
  for (let i = candles.length - 1; i >= 20; i--) {
    if (ma[i] && Math.abs(c[i] - ma[i]) / ma[i] < 0.08) len++
    else break
  }
  res.baseLengthBars = len

  res.isCompressed = res.bbWidthPct != null && res.bbWidthPct <= 30 && len >= 10
  if (res.bbWidthPct != null && res.bbWidthPct <= 30) res.detail.push(`Bollinger band width in the tightest ${res.bbWidthPct}% of the last 120 bars`)
  if (contractions >= 2) res.detail.push('Successive pullback contractions (VCP-like)')
  if (res.volumeDryUp) res.detail.push('Volume dry-up vs 50-bar average')
  if (len >= 15) res.detail.push(`Price basing near the 20-bar mean for ${len} bars`)
  return res
}

/** 52-week (250 trading bars) context on daily candles. */
export function yearContext(daily) {
  if (daily.length < 30) return null
  const tail = daily.slice(-250)
  const hi = Math.max(...tail.map((c) => c.high))
  const lo = Math.min(...tail.map((c) => c.low))
  const px = daily[daily.length - 1].close
  return {
    high52w: +hi.toFixed(2),
    low52w: +lo.toFixed(2),
    fromHighPct: +(((px - hi) / hi) * 100).toFixed(2),
    fromLowPct: +(((px - lo) / lo) * 100).toFixed(2),
  }
}
