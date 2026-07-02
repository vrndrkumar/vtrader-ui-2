// ── Mock option chain generator ──────────────────────────────────────────────
// Produces a realistic-looking chain (OI, IV smile, change%, max-pain, OI
// support/resistance) that is STABLE for a given (symbol, atm, expiry) so it
// doesn't churn on every render. Shaped to swap for the Redis OptionChainData
// stream (OI/IV are mocked — the live feed does not carry them yet).

import type { OcRow, OcSide, OptionChain } from '../types/options'

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export function buildOptionChain(symbolCode: string, spot: number, spotChg: number, expiry: string): OptionChain {
  const step = symbolCode === 'SENSEX' ? 100 : 50
  const atm = Math.round(spot / step) * step
  const rand = mulberry32(hash(`${symbolCode}|${atm}|${expiry}`))
  const rows: OcRow[] = []

  for (let i = -10; i <= 10; i++) {
    const strike = atm + i * step
    const dist = Math.abs(strike - spot)
    const moneyness = dist / spot

    // Time value bell around ATM; intrinsic on top.
    const timeVal = step * 6 * Math.exp(-Math.pow((strike - spot) / (step * 5), 2)) + rand() * step * 0.3
    const ceLtp = Math.max(0.05, Math.max(spot - strike, 0) + timeVal)
    const peLtp = Math.max(0.05, Math.max(strike - spot, 0) + timeVal)

    // OI: puts pile up below spot, calls above; peaks at round strikes.
    // Scaled so display in lakhs (OI/1e5) reads realistically (~0.1–110 L).
    const round = strike % (step * 5) === 0 ? 1.6 : 1
    const ceOi = Math.round((20000 + 11_000_000 * Math.exp(-Math.pow((strike - (spot + step * 3)) / (step * 6), 2))) * round * (0.6 + rand() * 0.8))
    const peOi = Math.round((20000 + 11_000_000 * Math.exp(-Math.pow((strike - (spot - step * 3)) / (step * 6), 2))) * round * (0.6 + rand() * 0.8))

    // IV smile: higher on wings.
    const iv = +(14 + moneyness * 120 + rand() * 3).toFixed(2)

    const call: OcSide = {
      ltp: +ceLtp.toFixed(2), ltpChgPct: +((rand() - 0.7) * 90).toFixed(0),
      oi: ceOi, oiChgPct: +((rand() - 0.4) * 400).toFixed(0), iv,
    }
    const put: OcSide = {
      ltp: +peLtp.toFixed(2), ltpChgPct: +((rand() - 0.7) * 90).toFixed(0),
      oi: peOi, oiChgPct: +((rand() - 0.4) * 400).toFixed(0), iv: +(iv + 0.4).toFixed(2),
    }
    rows.push({ strike, call, put })
  }

  // Max pain: strike minimizing total intrinsic payout to option holders.
  let maxPain = atm, minPain = Infinity
  for (const k of rows) {
    let pain = 0
    for (const r of rows) {
      pain += r.call.oi * Math.max(k.strike - r.strike, 0)
      pain += r.put.oi * Math.max(r.strike - k.strike, 0)
    }
    if (pain < minPain) { minPain = pain; maxPain = k.strike }
  }

  const below = rows.filter((r) => r.strike < spot)
  const above = rows.filter((r) => r.strike > spot)
  const oiSupport = below.reduce((m, r) => (r.put.oi > (m?.put.oi ?? 0) ? r : m), below[0])?.strike ?? atm
  const oiResistance = above.reduce((m, r) => (r.call.oi > (m?.call.oi ?? 0) ? r : m), above[0])?.strike ?? atm

  return {
    symbolCode, expiry, spot,
    spotChg, spotChgPct: +((spotChg / (spot - spotChg)) * 100).toFixed(2),
    atm, maxPain, oiSupport, oiResistance, rows,
  }
}

export function fmtOi(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return `${n}`
}
