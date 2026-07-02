// ── Option chain + strategy types ────────────────────────────────────────────

export type OptType = 'CE' | 'PE'
export type Side = 'BUY' | 'SELL'

export interface OcSide {
  ltp: number
  ltpChgPct: number
  oi: number
  oiChgPct: number
  iv: number
}

export interface OcRow {
  strike: number
  call: OcSide
  put: OcSide
}

export interface OptionChain {
  symbolCode: string
  expiry: string
  spot: number
  spotChg: number
  spotChgPct: number
  atm: number
  maxPain: number
  oiSupport: number      // strike below spot with highest put OI
  oiResistance: number   // strike above spot with highest call OI
  rows: OcRow[]
}

export interface StrategyLeg {
  id: string
  side: Side
  expiry: string
  strike: number
  optType: OptType
  qty: number
  lot: number
  priceType: 'Market' | 'Limit'
  price: number          // used when Limit
  ltp: number
  iv: number
}

export const EXPIRIES = ['02 Jul', '09 Jul', '16 Jul', '23 Jul', '30 Jul', '06 Aug', '13 Aug']

export const LOT_SIZE: Record<string, number> = { NIFTY: 75, SENSEX: 20 }
