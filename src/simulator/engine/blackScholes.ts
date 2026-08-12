// ── Black-Scholes (pricing + greeks) ─────────────────────────────────────────
// Used by the mock provider to synthesize believable option prices from a real-
// shaped underlying path, and by the payoff panel for the "today" curve.

const R = 0.065 // risk-free

function ncdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}
function npdf(x: number): number { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) }

export function bsPrice(S: number, K: number, T: number, sigma: number, type: 'CE' | 'PE'): number {
  if (T <= 0 || sigma <= 0) return type === 'CE' ? Math.max(S - K, 0) : Math.max(K - S, 0)
  const sq = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (R + sigma * sigma / 2) * T) / (sigma * sq)
  const d2 = d1 - sigma * sq
  const df = Math.exp(-R * T)
  return type === 'CE'
    ? S * ncdf(d1) - K * df * ncdf(d2)
    : K * df * ncdf(-d2) - S * ncdf(-d1)
}

export interface Greeks { delta: number; gamma: number; theta: number; vega: number }

export function bsGreeks(S: number, K: number, T: number, sigma: number, type: 'CE' | 'PE'): Greeks {
  if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 }
  const sq = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (R + sigma * sigma / 2) * T) / (sigma * sq)
  const d2 = d1 - sigma * sq
  const pdf = npdf(d1)
  const delta = type === 'CE' ? ncdf(d1) : ncdf(d1) - 1
  const gamma = pdf / (S * sigma * sq)
  const vega = (S * pdf * sq) / 100
  const theta = (-(S * pdf * sigma) / (2 * sq) - R * K * Math.exp(-R * T) * (type === 'CE' ? ncdf(d2) : ncdf(-d2))) / 365
  return { delta, gamma, theta, vega }
}
