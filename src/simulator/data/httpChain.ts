// ── Real option chain (data.vtrader.in) ─────────────────────────────────────
// GET /data/option-chain?symbol=NIFTY&expiry=YYYY-MM-DD&date=YYYY-MM-DD&time=HH:mm
//   → { symbol, expiry, at, spot, atm, count, chain: [{ strike, call, put }] }
//     call/put = { symbol, ltp, oi, volume, at }
// The feed serves LTP/OI/volume but NO implied vol — we invert Black-Scholes from
// the LTP so the Δ / IV columns stay meaningful. Credential-free host (axiosCandle,
// no auth header → CORS simple GET, no preflight).

import { axiosCandle } from '@/api/axios'
import type { IndexCode, OptionChainSnapshot, OptionChainRow, OptionQuote } from '../types'
import { bsImpliedVol } from '../engine/blackScholes'

interface RawSide { symbol: string; ltp: number; oi?: number; volume?: number; at?: string }
interface RawRow { strike: number; call?: RawSide; put?: RawSide }
interface ChainResponse { symbol: string; expiry: string; at: string; spot: number; atm: number; count: number; chain: RawRow[] }

const SESSION_END_MIN = 930 // 15:30 IST expiry cutoff for time-to-expiry
const istTs = (date: string, min: number) => Date.parse(`${date}T00:00:00+05:30`) + min * 60_000
const round = (n: number) => Math.round(n * 100) / 100

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
/** "18AUG26" → "2026-08-18". Passes through anything already ISO. */
export function tokenToDate(token: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token
  const m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(token.toUpperCase())
  if (!m) return token
  return `20${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** IST date (YYYY-MM-DD) + time (HH:mm) from an epoch ts. */
function istDateTime(ts: number): { date: string; time: string } {
  const d = new Date(ts)
  return {
    date: d.toLocaleString('sv', { timeZone: 'Asia/Kolkata' }).slice(0, 10),
    time: d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' }),
  }
}

// Small time-keyed cache (chain is immutable for a given symbol/expiry/date/time).
const cache = new Map<string, ChainResponse>()
async function fetchChainRaw(index: IndexCode, expiry: string, date: string, time: string): Promise<ChainResponse> {
  const key = `${index}|${expiry}|${date}|${time}`
  const hit = cache.get(key)
  if (hit) return hit
  const { data } = await axiosCandle.get<ChainResponse>('/data/option-chain', { params: { symbol: index, expiry, date, time } })
  if (cache.size > 600) cache.clear()
  cache.set(key, data)
  return data
}

/** Full chain snapshot at `ts` (never beyond — the caller passes steps[cursor]). */
export async function fetchChainSnapshot(index: IndexCode, expiryDate: string, ts: number): Promise<OptionChainSnapshot | null> {
  const { date, time } = istDateTime(ts)
  const data = await fetchChainRaw(index, expiryDate, date, time)
  const raw = Array.isArray(data?.chain) ? data.chain : []
  if (!raw.length) return null

  const spot = data.spot
  const expiryEnd = istTs(expiryDate, SESSION_END_MIN)
  const T = Math.max(1e-6, (expiryEnd - ts) / (365 * 86_400_000))
  const strikes = raw.map((r) => r.strike).sort((a, b) => a - b)
  const step = strikes.length > 1 ? Math.min(...strikes.slice(1).map((s, i) => s - strikes[i])) : 50

  const mk = (side: RawSide | undefined, strike: number, type: 'CE' | 'PE'): OptionQuote | undefined => {
    if (!side) return undefined
    const iv = bsImpliedVol(side.ltp, spot, strike, T, type)
    return { contractId: side.symbol, ltp: round(side.ltp), changePct: 0, oi: side.oi, volume: side.volume, iv: iv ? round(iv) : undefined }
  }
  const rows: OptionChainRow[] = raw.map((r) => ({ strike: r.strike, ce: mk(r.call, r.strike, 'CE'), pe: mk(r.put, r.strike, 'PE') }))
  return { ts, index, expiryId: `${index}-${expiryDate}`, spot: round(spot), atm: data.atm, step, rows, synthetic: false }
}

/** LTP of a single contract (by its exact broker symbol) at `ts`, or null. */
export async function fetchQuote(index: IndexCode, expiryDate: string, contractId: string, ts: number): Promise<number | null> {
  const { date, time } = istDateTime(ts)
  const data = await fetchChainRaw(index, expiryDate, date, time)
  for (const r of data.chain ?? []) {
    if (r.call?.symbol === contractId) return r.call.ltp
    if (r.put?.symbol === contractId) return r.put.ltp
  }
  return null
}
