// ── Market data source (single swap point) ──────────────────────────────────
// getCandles       → real historical API.
// subscribeQuote   → live index ticks via the realtime service (which writes
//                    marketStore); if nothing arrives within a short window
//                    (socket down / market closed & no snapshot), a mock feed
//                    takes over so the UI keeps working. The chart consumes
//                    marketStore updates only — it never writes them back.

import type { Candle, Quote, Timeframe, TradeSymbol } from '../types/market'
import { getCandles } from './candleApi'
import { subscribeMockQuote } from './mockFeed'
import { realtime } from './realtime/realtimeService'
import { useMarketStore } from '../store/marketStore'

const MOCK_FALLBACK_MS = 3_000

export interface MarketDataSource {
  getCandles(symbol: TradeSymbol, tf: Timeframe): Promise<Candle[]>
  /** Delivers live quotes for the chart's forming candle. Returns unsubscribe. */
  subscribeQuote(symbol: TradeSymbol, seedPrice: number, onTick: (q: Quote) => void): () => void
}

export const dataSource: MarketDataSource = {
  getCandles,
  subscribeQuote(symbol, seedPrice, onTick) {
    realtime.start()
    const unsubChannel = realtime.subscribeIndexTick(symbol.code)

    let lastTs = 0
    let liveSeen = false
    let mockUnsub: (() => void) | undefined

    // Forward this symbol's marketStore quote (live or mock) to the chart.
    // The instant a LIVE quote arrives, stop the mock so it can't mask real data.
    const unsubStore = useMarketStore.subscribe((state) => {
      const q = state.quotes[symbol.code]
      if (!q || q.ts === lastTs) return
      lastTs = q.ts
      if (q.sim === false) {
        liveSeen = true
        if (mockUnsub) { mockUnsub(); mockUnsub = undefined }
      }
      onTick(q)
    })

    // Watchdog: start the mock feed only if no LIVE quote has arrived.
    const watchdog = setTimeout(() => {
      if (!liveSeen) mockUnsub = subscribeMockQuote(symbol.code, seedPrice, (q) => useMarketStore.getState().setQuote({ ...q, sim: true }))
    }, MOCK_FALLBACK_MS)

    return () => { clearTimeout(watchdog); unsubStore(); mockUnsub?.(); unsubChannel() }
  },
}
