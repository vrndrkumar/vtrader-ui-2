// ── MockOptionMarketDataProvider ─────────────────────────────────────────────
// Synthetic — for UI/UX development only. Generates a deterministic (seeded)
// underlying path per session and prices an option chain off it with Black-
// Scholes + a synthetic IV smile. Everything is tagged `synthetic: true`.
//
// Back-data rule (per product spec): only COMPLETED trading sessions are
// selectable. Today's session appears only AFTER market close (15:30 IST).

import type {
  AvailableSession, OptionMarketDataProvider,
} from './provider'
import type {
  Candle, Expiry, Frequency, IndexCode, OptionChainSnapshot, OptionChainRow,
  OptionContract, OptionQuote,
} from '../types'
import { bsPrice } from '../engine/blackScholes'
import { fetchExpiries } from './httpExpiries'
import { fetchChainSnapshot, fetchQuote, tokenToDate } from './httpChain'
import { fetchIndexCandles } from './httpCandles'

const FREQ_MIN: Record<Frequency, number> = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60 }
const SESSION_START_MIN = 555   // 09:15
const SESSION_END_MIN = 930     // 15:30
const STEP: Record<IndexCode, number> = { NIFTY: 50, SENSEX: 100 }
const BASE_SPOT: Record<IndexCode, number> = { NIFTY: 24800, SENSEX: 81200 }
const LOT: Record<IndexCode, number> = { NIFTY: 75, SENSEX: 20 }

// ── deterministic RNG ─────────────────────────────────────────────────────────
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// ── IST timestamp helpers ─────────────────────────────────────────────────────
const istTs = (date: string, min: number) => Date.parse(`${date}T00:00:00+05:30`) + min * 60_000
const pad = (n: number) => String(n).padStart(2, '0')

// ── session underlying (1m base, cached) ──────────────────────────────────────
const sessionCache = new Map<string, Candle[]>()
function baseSeries(index: IndexCode, date: string): Candle[] {
  const key = `${index}:${date}`
  const hit = sessionCache.get(key)
  if (hit) return hit
  const rnd = mulberry32(hash(key))
  // A gentle gap + intraday drift so different dates look different but plausible.
  let price = BASE_SPOT[index] * (0.97 + rnd() * 0.06)
  const drift = (rnd() - 0.5) * 0.0006
  const vol = BASE_SPOT[index] * (index === 'SENSEX' ? 0.0009 : 0.0011)
  const out: Candle[] = []
  for (let m = SESSION_START_MIN; m <= SESSION_END_MIN; m++) {
    const open = price
    const shock = (rnd() - 0.5) * vol * 2 + price * drift
    const close = Math.max(1, open + shock)
    const hi = Math.max(open, close) + rnd() * vol * 0.6
    const lo = Math.min(open, close) - rnd() * vol * 0.6
    out.push({ ts: istTs(date, m), open: round(open), high: round(hi), low: round(lo), close: round(close), volume: Math.round(2000 + rnd() * 8000) })
    price = close
  }
  sessionCache.set(key, out)
  return out
}
const round = (n: number) => Math.round(n * 100) / 100

function resample(base: Candle[], freq: Frequency): Candle[] {
  const step = FREQ_MIN[freq]
  if (step === 1) return base
  const out: Candle[] = []
  for (let i = 0; i < base.length; i += step) {
    const slice = base.slice(i, i + step)
    if (!slice.length) break
    out.push({
      ts: slice[0].ts, open: slice[0].open,
      high: Math.max(...slice.map(c => c.high)), low: Math.min(...slice.map(c => c.low)),
      close: slice[slice.length - 1].close, volume: slice.reduce((s, c) => s + (c.volume ?? 0), 0),
    })
  }
  return out
}
function spotAt(index: IndexCode, date: string, ts: number): number {
  const base = baseSeries(index, date)
  let px = base[0]?.close ?? BASE_SPOT[index]
  for (const c of base) { if (c.ts <= ts) px = c.close; else break }
  return px
}

// ── expiries ──────────────────────────────────────────────────────────────────
function nextWeekday(from: Date, weekday: number): Date {
  const d = new Date(from); const diff = (weekday - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff); return d
}
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function monthLabel(d: Date) { return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) }

function buildExpiries(index: IndexCode, date: string): Expiry[] {
  const base = new Date(`${date}T00:00:00+05:30`)
  const weekday = index === 'SENSEX' ? 4 : 4 // Thursday (mock)
  const w1 = nextWeekday(base, weekday)
  const w2 = new Date(w1); w2.setDate(w2.getDate() + 7)
  const w3 = new Date(w1); w3.setDate(w3.getDate() + 14)
  // Monthly = last Thursday of w1's month
  const last = new Date(w1.getFullYear(), w1.getMonth() + 1, 0)
  while (last.getDay() !== weekday) last.setDate(last.getDate() - 1)
  const mk = (d: Date, type: 'weekly' | 'monthly'): Expiry => ({
    id: `${index}-${fmtDate(d)}`, date: fmtDate(d), label: `${monthLabel(d)}${type === 'monthly' ? ' (M)' : ''}`, type,
  })
  const list = [mk(w1, 'weekly'), mk(w2, 'weekly'), mk(w3, 'weekly')]
  if (!list.some(e => e.date === fmtDate(last))) list.push(mk(last, 'monthly'))
  // de-dup by date
  const seen = new Set<string>()
  return list.filter(e => (seen.has(e.date) ? false : (seen.add(e.date), true)))
}

function ivFor(moneyness: number): number {
  // Simple smile: min ~0.13 ATM, rising in the wings.
  return 0.13 + Math.min(0.22, Math.abs(moneyness) * 0.9)
}

// ── contract id ────────────────────────────────────────────────────────────────
function contractId(index: IndexCode, expiryDate: string, optType: 'CE' | 'PE', strike: number) {
  return `${index}_${expiryDate}_${optType}_${strike}`
}
function parseContract(id: string): { index: IndexCode; expiryDate: string; optType: 'CE' | 'PE'; strike: number } | null {
  const p = id.split('_')
  if (p.length < 4) return null
  // Second segment may be an ISO date (synthetic) or an expiry token like 18AUG26 (real feed).
  return { index: p[0] as IndexCode, expiryDate: tokenToDate(p[1]), optType: p[2] as 'CE' | 'PE', strike: Number(p[3]) }
}

export class MockOptionMarketDataProvider implements OptionMarketDataProvider {
  readonly synthetic = true

  async availableSessions(_index: IndexCode): Promise<AvailableSession[]> {
    const out: AvailableSession[] = []
    const now = new Date()
    // "today after market close" check in IST.
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const marketClosed = istNow.getHours() > 15 || (istNow.getHours() === 15 && istNow.getMinutes() >= 30)
    const cursor = new Date(istNow); cursor.setHours(0, 0, 0, 0)
    // Every trading weekday from 2020-01-01 up to today (newest first). Weekends are
    // excluded; market holidays can't be known here (the real availability API will
    // provide the exact tradable calendar).
    const FLOOR = new Date('2020-01-01T00:00:00')
    for (let i = 0; ; i++) {
      const d = new Date(cursor); d.setDate(d.getDate() - i)
      if (d < FLOOR) break
      const dow = d.getDay()
      if (dow === 0 || dow === 6) continue // skip weekends
      const isToday = i === 0
      if (isToday && !marketClosed) continue // today only after close
      out.push({ date: fmtDate(d), label: d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }), isToday })
    }
    return out
  }

  // Real expiries from data.vtrader.in; fall back to synthetic only if unreachable
  // so the workstation never blanks out.
  async expiries(index: IndexCode, date: string): Promise<Expiry[]> {
    try {
      const real = await fetchExpiries(index, date)
      if (real.length) return real
    } catch { /* offline / CORS / 5xx → synthetic fallback below */ }
    return buildExpiries(index, date)
  }

  // Real index candles; synthetic fallback if the feed is unreachable/empty.
  async underlyingSession(index: IndexCode, date: string, freq: Frequency): Promise<Candle[]> {
    try {
      const real = await fetchIndexCandles(index, date, freq)
      if (real.length) return real
    } catch { /* fall through */ }
    return resample(baseSeries(index, date), freq)
  }

  async underlyingUpTo(index: IndexCode, date: string, freq: Frequency, upToTs: number): Promise<Candle[]> {
    try {
      const real = await fetchIndexCandles(index, date, freq)
      if (real.length) return real.filter(c => c.ts <= upToTs)
    } catch { /* fall through */ }
    return resample(baseSeries(index, date), freq).filter(c => c.ts <= upToTs)
  }

  // Real chain from data.vtrader.in; synthetic fallback keeps the workstation alive
  // if the feed is unreachable.
  async chainAt(index: IndexCode, expiryId: string, _freq: Frequency, ts: number): Promise<OptionChainSnapshot> {
    const expiryDate = expiryId.split('-').slice(1).join('-')
    try {
      const real = await fetchChainSnapshot(index, expiryDate, ts)
      if (real && real.rows.length) return real
    } catch { /* offline / CORS / 5xx → synthetic below */ }
    return this.syntheticChain(index, expiryId, ts)
  }

  private syntheticChain(index: IndexCode, expiryId: string, ts: number): OptionChainSnapshot {
    const expiryDate = expiryId.split('-').slice(1).join('-')
    const date = new Date(ts).toLocaleString('sv', { timeZone: 'Asia/Kolkata' }).slice(0, 10)
    const spot = spotAt(index, date, ts)
    const step = STEP[index]
    const atm = Math.round(spot / step) * step
    const expiryEnd = istTs(expiryDate, SESSION_END_MIN)
    const T = Math.max(0, (expiryEnd - ts) / (365 * 86_400_000))
    const rnd = mulberry32(hash(`${index}:${expiryDate}:${Math.floor(ts / 60000)}`))
    const rows: OptionChainRow[] = []
    for (let k = -10; k <= 10; k++) {
      const strike = atm + k * step
      if (strike <= 0) continue
      const mk = (optType: 'CE' | 'PE'): OptionQuote => {
        const moneyness = (strike - spot) / spot
        const iv = ivFor(moneyness)
        const ltp = round(Math.max(0.05, bsPrice(spot, strike, Math.max(T, 1e-4), iv, optType)))
        const oi = Math.round(1e5 * (2 + 6 * Math.exp(-((k) ** 2) / 8)) * (0.6 + rnd() * 0.8))
        return {
          contractId: contractId(index, expiryDate, optType, strike),
          ltp, changePct: round((rnd() - 0.5) * 12), oi, volume: Math.round(oi * (0.05 + rnd() * 0.2)),
          iv: round(iv),
        }
      }
      rows.push({ strike, ce: mk('CE'), pe: mk('PE') })
    }
    return { ts, index, expiryId, spot: round(spot), atm, step, rows, synthetic: true }
  }

  async quoteAt(cid: string, ts: number): Promise<number> {
    const p = parseContract(cid)
    if (!p) return 0
    // Real LTP for fills; synthetic BS fallback if the feed is unreachable.
    try {
      const real = await fetchQuote(p.index, p.expiryDate, cid, ts)
      if (real != null) return real
    } catch { /* fall through */ }
    const date = new Date(ts).toLocaleString('sv', { timeZone: 'Asia/Kolkata' }).slice(0, 10)
    const spot = spotAt(p.index, date, ts)
    const expiryEnd = istTs(p.expiryDate, SESSION_END_MIN)
    const T = Math.max(1e-4, (expiryEnd - ts) / (365 * 86_400_000))
    const iv = ivFor((p.strike - spot) / spot)
    return round(Math.max(0.05, bsPrice(spot, p.strike, T, iv, p.optType)))
  }

  async contractMeta(cid: string): Promise<OptionContract | null> {
    const p = parseContract(cid)
    if (!p) return null
    return {
      id: cid, index: p.index, expiryId: `${p.index}-${p.expiryDate}`,
      strike: p.strike, optType: p.optType, lotSize: LOT[p.index], tickSize: 0.05,
    }
  }
}

export const lotSizeForIndex = (index: IndexCode) => LOT[index]
