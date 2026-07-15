// ── Pure indicator math ──────────────────────────────────────────────────────
// All functions take arrays and return arrays aligned to input (leading nulls
// where the indicator is not yet defined).

export const closes = (c) => c.map((x) => x.close)
export const highs = (c) => c.map((x) => x.high)
export const lows = (c) => c.map((x) => x.low)
export const volumes = (c) => c.map((x) => x.volume)
export const last = (arr) => (arr.length ? arr[arr.length - 1] : null)

export function sma(values, period) {
  const out = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** Wilder RSI */
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast)
  const emaSlow = ema(values, slow)
  const macdLine = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null,
  )
  const defined = macdLine.filter((v) => v != null)
  const sigDefined = ema(defined, signal)
  const signalLine = new Array(values.length).fill(null)
  let j = 0
  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] != null) {
      signalLine[i] = sigDefined[j] ?? null
      j++
    }
  }
  const hist = macdLine.map((v, i) =>
    v != null && signalLine[i] != null ? v - signalLine[i] : null,
  )
  return { macdLine, signalLine, hist }
}

/** True range series */
function trueRanges(candles) {
  const tr = new Array(candles.length).fill(null)
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr[i] = candles[i].high - candles[i].low
      continue
    }
    const pc = candles[i - 1].close
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - pc),
      Math.abs(candles[i].low - pc),
    )
  }
  return tr
}

/** Wilder ATR */
export function atr(candles, period = 14) {
  const tr = trueRanges(candles)
  const out = new Array(candles.length).fill(null)
  if (candles.length <= period) return out
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
  out[period] = prev
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period
    out[i] = prev
  }
  return out
}

/** Wilder ADX (+DI/-DI) */
export function adx(candles, period = 14) {
  const n = candles.length
  const out = { adx: new Array(n).fill(null), pdi: new Array(n).fill(null), mdi: new Array(n).fill(null) }
  if (n <= period * 2) return out
  const tr = trueRanges(candles)
  const pdm = new Array(n).fill(0)
  const mdm = new Array(n).fill(0)
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high
    const dn = candles[i - 1].low - candles[i].low
    pdm[i] = up > dn && up > 0 ? up : 0
    mdm[i] = dn > up && dn > 0 ? dn : 0
  }
  let sTR = 0, sP = 0, sM = 0
  for (let i = 1; i <= period; i++) { sTR += tr[i]; sP += pdm[i]; sM += mdm[i] }
  const dxArr = []
  for (let i = period; i < n; i++) {
    if (i > period) {
      sTR = sTR - sTR / period + tr[i]
      sP = sP - sP / period + pdm[i]
      sM = sM - sM / period + mdm[i]
    }
    const pdi = sTR ? (100 * sP) / sTR : 0
    const mdi = sTR ? (100 * sM) / sTR : 0
    out.pdi[i] = pdi
    out.mdi[i] = mdi
    const dx = pdi + mdi ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0
    dxArr.push({ i, dx })
    if (dxArr.length === period) {
      out.adx[i] = dxArr.reduce((a, b) => a + b.dx, 0) / period
    } else if (dxArr.length > period) {
      out.adx[i] = (out.adx[i - 1] * (period - 1) + dx) / period
    }
  }
  return out
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period)
  const upper = new Array(values.length).fill(null)
  const lower = new Array(values.length).fill(null)
  const width = new Array(values.length).fill(null) // (upper-lower)/mid
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1)
    const m = mid[i]
    const sd = Math.sqrt(slice.reduce((a, v) => a + (v - m) ** 2, 0) / period)
    upper[i] = m + mult * sd
    lower[i] = m - mult * sd
    width[i] = m ? (upper[i] - lower[i]) / m : null
  }
  return { mid, upper, lower, width }
}

export function obv(candles) {
  const out = new Array(candles.length).fill(0)
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close
    out[i] = out[i - 1] + (d > 0 ? candles[i].volume : d < 0 ? -candles[i].volume : 0)
  }
  return out
}

/** Chaikin Money Flow */
export function cmf(candles, period = 20) {
  const out = new Array(candles.length).fill(null)
  const mfv = candles.map((c) => {
    const range = c.high - c.low
    if (!range) return 0
    return (((c.close - c.low) - (c.high - c.close)) / range) * c.volume
  })
  for (let i = period - 1; i < candles.length; i++) {
    let sm = 0, sv = 0
    for (let j = i - period + 1; j <= i; j++) { sm += mfv[j]; sv += candles[j].volume }
    out[i] = sv ? sm / sv : null
  }
  return out
}

/** Simple linear-regression slope of the last `period` values, normalised (% per bar). */
export function slope(values, period = 20) {
  if (values.length < period) return null
  const ys = values.slice(-period)
  const n = ys.length
  const xMean = (n - 1) / 2
  const yMean = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (i - xMean) * (ys[i] - yMean); den += (i - xMean) ** 2 }
  const m = den ? num / den : 0
  return yMean ? (m / yMean) * 100 : 0
}

/** Percentile rank of the last value within the trailing window (0..100). */
export function percentileRank(values, window = 120) {
  const defined = values.filter((v) => v != null)
  if (!defined.length) return null
  const tail = defined.slice(-window)
  const v = tail[tail.length - 1]
  const below = tail.filter((x) => x <= v).length
  return (below / tail.length) * 100
}
