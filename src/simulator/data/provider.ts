// ── OptionMarketDataProvider ─────────────────────────────────────────────────
// The single seam between the simulator and its data source. The UI and engine
// depend ONLY on this interface, never on a concrete implementation. Today it is
// backed by MockOptionMarketDataProvider; when the real VTrader historical-option
// API lands, a VTraderOptionMarketDataProvider is dropped in with no UI changes.
//
// LOOK-AHEAD RULE: chainAt()/underlyingUpTo() must never return data for a
// timestamp later than the one requested.

import type {
  Candle, Expiry, Frequency, IndexCode, OptionChainSnapshot, OptionContract,
} from '../types'

export interface AvailableSession {
  date: string        // yyyy-mm-dd
  label: string       // "Fri, 17 Jul 2026"
  isToday: boolean
}

export interface OptionMarketDataProvider {
  /** True while this provider serves synthetic data (drives the UI banner). */
  readonly synthetic: boolean

  /** Trading sessions available to simulate (back-data only). */
  availableSessions(index: IndexCode): Promise<AvailableSession[]>

  /** Expiries tradable on the given session date. */
  expiries(index: IndexCode, date: string): Promise<Expiry[]>

  /** Underlying candles for the session, sampled at `freq`, but ONLY up to `upToTs`. */
  underlyingUpTo(index: IndexCode, date: string, freq: Frequency, upToTs: number): Promise<Candle[]>

  /** Full underlying series for the session (used to precompute the replay range only). */
  underlyingSession(index: IndexCode, date: string, freq: Frequency): Promise<Candle[]>

  /** Option-chain snapshot at exactly `ts` (never beyond). */
  chainAt(index: IndexCode, expiryId: string, freq: Frequency, ts: number): Promise<OptionChainSnapshot>

  /** LTP of a single contract at `ts` (for fills / position marking). */
  quoteAt(contractId: string, ts: number): Promise<number>

  /** Contract metadata (lot / tick) — never hardcoded in the UI. */
  contractMeta(contractId: string): Promise<OptionContract | null>
}
