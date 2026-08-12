// ── Option Simulator — domain types ──────────────────────────────────────────
// Framework-agnostic. Shared by the data providers, the replay engine and the UI.
// NOTE: all option data in this module is SIMULATED until the real VTrader
// historical-option API is wired behind OptionMarketDataProvider.

export type IndexCode = 'NIFTY' | 'SENSEX'
export type OptType = 'CE' | 'PE'
export type Side = 'BUY' | 'SELL'

/** Candle intervals the simulator exposes (subset the future API is expected to serve). */
export type Frequency = '1m' | '3m' | '5m' | '15m' | '30m' | '1h'

export interface Candle {
  ts: number          // epoch ms (bar OPEN time)
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface Expiry {
  id: string          // stable id, e.g. "NIFTY-2026-07-17"
  date: string        // yyyy-mm-dd
  label: string       // "17 Jul" / "17 Jul (M)"
  type: 'weekly' | 'monthly'
}

export interface OptionContract {
  id: string          // `${index}_${expiryDate}_${optType}_${strike}`
  index: IndexCode
  expiryId: string
  strike: number
  optType: OptType
  lotSize: number
  tickSize: number
}

/** One side (CE or PE) of a strike at a point in simulation time. */
export interface OptionQuote {
  contractId: string
  ltp: number
  changePct: number   // vs the session's prior close for that contract
  oi?: number
  volume?: number
  iv?: number         // implied vol (fraction, e.g. 0.18)
  bid?: number
  ask?: number
}

export interface OptionChainRow {
  strike: number
  ce?: OptionQuote
  pe?: OptionQuote
}

export interface OptionChainSnapshot {
  ts: number
  index: IndexCode
  expiryId: string
  spot: number
  atm: number
  step: number
  rows: OptionChainRow[]
  /** True while data is synthetic — the UI shows a persistent banner. */
  synthetic: boolean
}

// ── Session config ────────────────────────────────────────────────────────────

export interface SessionConfig {
  index: IndexCode
  date: string        // yyyy-mm-dd (a completed trading session)
  startTime: string   // "HH:mm"
  endTime: string     // "HH:mm"
  frequency: Frequency
  expiryId: string
}

export type ClockStatus = 'idle' | 'playing' | 'paused' | 'ended'

// ── Positions / orders / events ───────────────────────────────────────────────

export type OrderType = 'MKT' | 'LMT' | 'SL' | 'SL-M' | 'TARGET'

export interface PositionLeg {
  id: string
  contractId: string
  index: IndexCode
  expiryId: string
  strike: number
  optType: OptType
  side: Side          // opening side
  qty: number         // in units (lots × lotSize)
  lotSize: number
  avgEntry: number
  entryTs: number
  ltp: number
  realized: number
  unrealized: number
  sl?: number         // absolute premium
  target?: number
  status: 'OPEN' | 'CLOSED'
}

export type EventKind =
  | 'ENTRY' | 'EXIT' | 'ADD' | 'REDUCE' | 'ROLL'
  | 'SL_HIT' | 'TARGET_HIT' | 'SL_SET' | 'TARGET_SET'
  | 'STRATEGY_SL' | 'STRATEGY_TARGET' | 'SESSION_END'

export interface TradeEvent {
  id: string
  ts: number          // simulation timestamp
  kind: EventKind
  contractId?: string
  label: string       // e.g. "SELL NIFTY 25000 CE"
  qty?: number
  price?: number
  realized?: number
  note?: string
}

export interface PnLPoint { ts: number; realized: number; unrealized: number; total: number }

export interface RiskConfig {
  strategySL?: number        // absolute ₹ loss (positive number)
  strategyTarget?: number    // absolute ₹ profit
  slippage: number           // ₹ per unit applied against the trader
  costPerLot: number         // flat round-trip cost per lot (brokerage+charges proxy)
  /** How to resolve when SL & target both fall inside one bar's range. */
  intrabarPolicy: 'conservative' | 'optimistic'
}
