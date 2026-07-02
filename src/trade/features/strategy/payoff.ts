// ── Strategy payoff + greeks engine ──────────────────────────────────────────
// Expiry curve is exact (piecewise-linear intrinsic). Today curve + greeks use
// Black-Scholes with the leg's mocked IV. All estimates flagged in the UI.

import { EXPIRIES, type StrategyLeg } from '../../types/options'

const R = 0.065 // risk-free

function nPdf(x: number): number { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) }
function nCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

function daysToExpiry(expiry: string): number {
  const i = Math.max(0, EXPIRIES.indexOf(expiry))
  return Math.max(1, 2 + i * 7)
}

function bsPrice(S: number, K: number, T: number, iv: number, type: 'CE' | 'PE'): number {
  const sigma = iv / 100
  if (T <= 0 || sigma <= 0) return type === 'CE' ? Math.max(S - K, 0) : Math.max(K - S, 0)
  const d1 = (Math.log(S / K) + (R + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  return type === 'CE'
    ? S * nCdf(d1) - K * Math.exp(-R * T) * nCdf(d2)
    : K * Math.exp(-R * T) * nCdf(-d2) - S * nCdf(-d1)
}

function legGreeks(S: number, K: number, T: number, iv: number, type: 'CE' | 'PE') {
  const sigma = iv / 100
  if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, vega: 0, theta: 0 }
  const d1 = (Math.log(S / K) + (R + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  const pdf = nPdf(d1)
  const delta = type === 'CE' ? nCdf(d1) : nCdf(d1) - 1
  const gamma = pdf / (S * sigma * Math.sqrt(T))
  const vega = (S * pdf * Math.sqrt(T)) / 100
  const theta = (-(S * pdf * sigma) / (2 * Math.sqrt(T)) - R * K * Math.exp(-R * T) * (type === 'CE' ? nCdf(d2) : nCdf(-d2))) / 365
  return { delta, gamma, vega, theta }
}

export interface PayoffPoint { price: number; expiry: number; today: number }
export interface PayoffResult {
  points: PayoffPoint[]
  maxProfit: number | null   // null = unlimited
  maxLoss: number | null     // null = unlimited
  breakevens: number[]
  marginEst: number
  netPremium: number         // + credit / - debit
  greeks: { delta: number; theta: number; gamma: number; vega: number }
  hasLegs: boolean
}

export function computePayoff(legs: StrategyLeg[], spot: number): PayoffResult {
  const empty: PayoffResult = {
    points: [], maxProfit: 0, maxLoss: 0, breakevens: [], marginEst: 0,
    netPremium: 0, greeks: { delta: 0, theta: 0, gamma: 0, vega: 0 }, hasLegs: false,
  }
  if (!legs.length || spot <= 0) return empty

  const lo = spot * 0.72
  const hi = spot * 1.28
  const N = 140
  const signed = (l: StrategyLeg) => (l.side === 'BUY' ? 1 : -1) * l.qty

  const points: PayoffPoint[] = []
  for (let i = 0; i <= N; i++) {
    const S = lo + ((hi - lo) * i) / N
    let expiry = 0, today = 0
    for (const l of legs) {
      const entry = l.priceType === 'Limit' ? l.price : l.ltp
      const intrinsic = l.optType === 'CE' ? Math.max(S - l.strike, 0) : Math.max(l.strike - S, 0)
      const T = daysToExpiry(l.expiry) / 365
      expiry += signed(l) * (intrinsic - entry)
      today += signed(l) * (bsPrice(S, l.strike, T, l.iv, l.optType) - entry)
    }
    points.push({ price: Math.round(S), expiry: Math.round(expiry), today: Math.round(today) })
  }

  // Unlimited detection from tail slopes.
  const netCall = legs.filter((l) => l.optType === 'CE').reduce((a, l) => a + signed(l), 0)
  const netPut = legs.filter((l) => l.optType === 'PE').reduce((a, l) => a + signed(l), 0)
  const profitUnlimited = netCall > 0 || netPut > 0
  const lossUnlimited = netCall < 0 || netPut < 0

  const exp = points.map((p) => p.expiry)
  const maxProfit = profitUnlimited ? null : Math.max(...exp)
  const maxLoss = lossUnlimited ? null : Math.min(...exp)

  // Breakevens: sign changes in the expiry curve.
  const breakevens: number[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    if ((a.expiry <= 0 && b.expiry > 0) || (a.expiry >= 0 && b.expiry < 0)) {
      const t = a.expiry / (a.expiry - b.expiry)
      breakevens.push(Math.round(a.price + t * (b.price - a.price)))
    }
  }

  // Net premium (credit +, debit -).
  const netPremium = legs.reduce((a, l) => {
    const px = l.priceType === 'Limit' ? l.price : l.ltp
    return a + (l.side === 'SELL' ? 1 : -1) * px * l.qty
  }, 0)

  // Rough margin: short legs' notional × factor, minus credit received.
  const shortNotional = legs.filter((l) => l.side === 'SELL').reduce((a, l) => a + l.strike * l.qty, 0)
  const marginEst = Math.max(0, shortNotional * 0.173 - Math.max(netPremium, 0) * 0.5)

  // Aggregate greeks at spot.
  const greeks = { delta: 0, theta: 0, gamma: 0, vega: 0 }
  for (const l of legs) {
    const T = daysToExpiry(l.expiry) / 365
    const g = legGreeks(spot, l.strike, T, l.iv, l.optType)
    const s = signed(l)
    greeks.delta += s * g.delta
    greeks.gamma += s * g.gamma
    greeks.vega += s * g.vega
    greeks.theta += s * g.theta
  }

  return {
    points, maxProfit, maxLoss, breakevens, marginEst, netPremium,
    greeks: {
      delta: +greeks.delta.toFixed(2), theta: +greeks.theta.toFixed(2),
      gamma: +greeks.gamma.toFixed(4), vega: +greeks.vega.toFixed(2),
    },
    hasLegs: true,
  }
}
