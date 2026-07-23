// ── Compact TA utilities for Option Insights (client-side, pure) ─────────────

export interface OCandle {
  time: number // epoch seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const nn = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)
export const last = <T>(a: T[]): T | null => (a.length ? a[a.length - 1] : null)

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
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

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let g = 0
  let l = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) g += d
    else l -= d
  }
  let ag = g / period
  let al = l / period
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    ag = (ag * (period - 1) + Math.max(d, 0)) / period
    al = (al * (period - 1) + Math.max(-d, 0)) / period
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
  }
  return out
}

export function macdHist(values: number[]): (number | null)[] {
  const f = ema(values, 12)
  const s = ema(values, 26)
  const line = values.map((_, i) => (nn(f[i]) && nn(s[i]) ? (f[i] as number) - (s[i] as number) : null))
  const defined = line.filter(nn) as number[]
  const sig = ema(defined, 9)
  const out: (number | null)[] = new Array(values.length).fill(null)
  let j = 0
  for (let i = 0; i < values.length; i++) {
    if (nn(line[i])) {
      out[i] = nn(sig[j]) ? (line[i] as number) - (sig[j] as number) : null
      j++
    }
  }
  return out
}

function trueRanges(c: OCandle[]): number[] {
  return c.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close))))
}

export function atr(c: OCandle[], period = 14): (number | null)[] {
  const tr = trueRanges(c)
  const out: (number | null)[] = new Array(c.length).fill(null)
  if (c.length <= period) return out
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
  out[period] = prev
  for (let i = period + 1; i < c.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period
    out[i] = prev
  }
  return out
}

export function adx(c: OCandle[], period = 14): (number | null)[] {
  const n = c.length
  const out: (number | null)[] = new Array(n).fill(null)
  if (n <= period * 2) return out
  const tr = trueRanges(c)
  const pdm = new Array(n).fill(0)
  const mdm = new Array(n).fill(0)
  for (let i = 1; i < n; i++) {
    const up = c[i].high - c[i - 1].high
    const dn = c[i - 1].low - c[i].low
    pdm[i] = up > dn && up > 0 ? up : 0
    mdm[i] = dn > up && dn > 0 ? dn : 0
  }
  let sTR = 0
  let sP = 0
  let sM = 0
  for (let i = 1; i <= period; i++) {
    sTR += tr[i]
    sP += pdm[i]
    sM += mdm[i]
  }
  const dx: number[] = []
  for (let i = period; i < n; i++) {
    if (i > period) {
      sTR = sTR - sTR / period + tr[i]
      sP = sP - sP / period + pdm[i]
      sM = sM - sM / period + mdm[i]
    }
    const p = sTR ? (100 * sP) / sTR : 0
    const m = sTR ? (100 * sM) / sTR : 0
    const d = p + m ? (100 * Math.abs(p - m)) / (p + m) : 0
    dx.push(d)
    if (dx.length === period) out[i] = dx.reduce((a, b) => a + b, 0) / period
    else if (dx.length > period && nn(out[i - 1])) out[i] = ((out[i - 1] as number) * (period - 1) + d) / period
  }
  return out
}

/** Supertrend (10, 3). Returns +1 (up) / -1 (down) per bar. */
export function supertrend(c: OCandle[], period = 10, mult = 3): (1 | -1 | null)[] {
  const a = atr(c, period)
  const out: (1 | -1 | null)[] = new Array(c.length).fill(null)
  let upper = NaN
  let lower = NaN
  let dir: 1 | -1 = 1
  for (let i = 0; i < c.length; i++) {
    const at = a[i]
    if (!nn(at)) continue
    const mid = (c[i].high + c[i].low) / 2
    const bu = mid + mult * at
    const bl = mid - mult * at
    upper = Number.isNaN(upper) || bu < upper || c[i - 1].close > upper ? bu : upper
    lower = Number.isNaN(lower) || bl > lower || c[i - 1].close < lower ? bl : lower
    if (dir === 1 && c[i].close < lower) dir = -1
    else if (dir === -1 && c[i].close > upper) dir = 1
    out[i] = dir
  }
  return out
}

/** Session VWAP over today's candles (null when volume absent — e.g. indices). */
export function sessionVwap(todays: OCandle[]): number | null {
  let pv = 0
  let v = 0
  for (const c of todays) {
    if (c.volume > 0) {
      const tp = (c.high + c.low + c.close) / 3
      pv += tp * c.volume
      v += c.volume
    }
  }
  return v > 0 ? pv / v : null
}

/** Classic floor pivots from previous session H/L/C. */
export function classicPivots(h: number, l: number, c: number) {
  const p = (h + l + c) / 3
  return {
    pivot: p,
    r1: 2 * p - l,
    s1: 2 * p - h,
    r2: p + (h - l),
    s2: p - (h - l),
  }
}

/** Simple intraday swing S/R from today's candles (top-2 each side of price). */
export function intradaySwings(todays: OCandle[], price: number) {
  const highs: number[] = []
  const lows: number[] = []
  for (let i = 2; i < todays.length - 2; i++) {
    const w = todays.slice(i - 2, i + 3)
    if (w.every((x) => x.high <= todays[i].high)) highs.push(todays[i].high)
    if (w.every((x) => x.low >= todays[i].low)) lows.push(todays[i].low)
  }
  const res = [...new Set(highs.filter((x) => x > price))].sort((a, b) => a - b).slice(0, 2)
  const sup = [...new Set(lows.filter((x) => x < price))].sort((a, b) => b - a).slice(0, 2)
  return { resistance: res, support: sup }
}
