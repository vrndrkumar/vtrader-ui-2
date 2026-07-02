// ── Market data source (single swap point) ──────────────────────────────────
// The whole UI talks to this interface only. Today: real candles + mock quotes.
// When the Redis→WS gateway is ready, replace `subscribeQuote` with the real
// WebSocketManager and nothing in the UI/chart layer changes.

import type { Candle, Quote, Timeframe, TradeSymbol } from '../types/market'
import { getCandles } from './candleApi'
import { subscribeMockQuote } from './mockFeed'

export interface MarketDataSource {
  /** Historical candles for a symbol/timeframe (real API). */
  getCandles(symbol: TradeSymbol, tf: Timeframe): Promise<Candle[]>
  /** Live quotes for a symbol. Returns an unsubscribe fn. */
  subscribeQuote(symbol: TradeSymbol, seedPrice: number, cb: (q: Quote) => void): () => void
  /** True while the live feed is mocked (UI shows a "SIM" badge). */
  readonly isLiveMocked: boolean
}

export const dataSource: MarketDataSource = {
  getCandles,
  subscribeQuote: (symbol, seedPrice, cb) => subscribeMockQuote(symbol.code, seedPrice, cb),
  isLiveMocked: true,
}
