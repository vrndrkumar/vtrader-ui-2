// ── Calendar-aware payoff (Option Simulator) ─────────────────────────────────
// A multi-expiry position can't be drawn on a single "at expiry = intrinsic"
// assumption: at the NEAREST (front) expiry the front-expiring legs settle to
// intrinsic, but later-expiry legs still carry time value and must be priced
// with Black-Scholes for their REMAINING time. The "today" curve prices every
// leg with Black-Scholes at its own current days-to-expiry.
import { bsPrice } from './engine/blackScholes'
import type { OptionLeg } from '@/components/PayoffEChart'

const DAY = 86_400_000
const YEAR = 365

/** Earliest expiry among the legs (the front expiry the payoff is drawn at). */
export function frontExpiryTs(legs: OptionLeg[]): number | null {
  const ts = legs.map((l) => l.expiryTs).filter((x): x is number => x != null)
  return ts.length ? Math.min(...ts) : null
}

/** {ex, td} P&L contribution of one leg at underlying S (ex = at front expiry). */
function legAt(l: OptionLeg, S: number, frontTs: number | null): { ex: number; td: number } {
  const iv = l.iv || 0.15
  // Today: Black-Scholes at this leg's own remaining time.
  const td = l.qty * (bsPrice(S, l.strike, Math.max(0.5, l.dte) / YEAR, iv, l.optType) - l.entry)
  // At the front expiry: front-expiring legs → intrinsic; later legs → BS on the
  // time left AFTER the front expiry.
  let val: number
  if (frontTs == null || l.expiryTs == null || l.expiryTs <= frontTs) {
    val = l.optType === 'CE' ? Math.max(S - l.strike, 0) : Math.max(l.strike - S, 0)
  } else {
    val = bsPrice(S, l.strike, Math.max(0.5, (l.expiryTs - frontTs) / DAY) / YEAR, iv, l.optType)
  }
  return { ex: l.qty * (val - l.entry), td }
}

/** Total {ex, td} across all legs at underlying S. */
export function simPayoffAt(legs: OptionLeg[], S: number, frontTs: number | null = frontExpiryTs(legs)): { ex: number; td: number } {
  let ex = 0, td = 0
  for (const l of legs) { const p = legAt(l, S, frontTs); ex += p.ex; td += p.td }
  return { ex, td }
}

/** PayoffPoint[] over a strike-centred range — used for stats (max P/L, breakevens). */
export function simPayoffCurve(legs: OptionLeg[], spot: number, N = 240): { price: number; expiry: number; today: number }[] {
  if (!legs.length) return []
  const strikes = legs.map((l) => l.strike)
  const foc = [spot > 0 ? spot : (Math.min(...strikes) + Math.max(...strikes)) / 2, ...strikes]
  const lo0 = Math.min(...foc), hi0 = Math.max(...foc)
  const pad = Math.max((hi0 - lo0) * 0.6, (foc[0] || 1) * 0.06)
  const lo = lo0 - pad, hi = hi0 + pad
  const front = frontExpiryTs(legs)
  return Array.from({ length: N + 1 }, (_, i) => {
    const S = lo + (hi - lo) * (i / N)
    const { ex, td } = simPayoffAt(legs, S, front)
    return { price: Math.round(S), expiry: Math.round(ex), today: Math.round(td) }
  })
}
