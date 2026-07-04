// ── Market data source (single swap point) ──────────────────────────────────
// getCandles     → real historical API (index or option strike).
// subscribeQuote → live ticks via the realtime service (INDEX_TICK_* for
//                  indices, TICK_* for option strikes). No mock data.
//                  The chart reads marketStore updates; it never writes them.

import type { Candle, ChartSymbol, Timeframe, Quote } from '../types/market'
import { getCandlesBySymbol } from './candleApi'
import { realtime } from './realtime/realtimeService'
import { useMarketStore } from '../store/marketStore'

export interface MarketDataSource {
  getCandles(symbol: ChartSymbol, tf: Timeframe): Promise<Candle[]>
  /** Delivers live quotes for the chart's forming candle. Returns unsubscribe. */
  subscribeQuote(symbol: ChartSymbol, onTick: (q: Quote) => void): () => void
}

export const dataSource: MarketDataSource = {
  getCandles: (symbol, tf) => getCandlesBySymbol(symbol.candleSymbol, tf, symbol.kind),
  subscribeQuote(symbol, onTick) {
    realtime.start()
    const unsubChannel = symbol.kind === 'INDEX'
      ? realtime.subscribeIndexTick(symbol.key)
      : realtime.subscribeSymbolTick(symbol.key)

    let lastTs = 0
    const unsubStore = useMarketStore.subscribe((state) => {
      const q = state.quotes[symbol.key]
      if (q && q.ts !== lastTs) { lastTs = q.ts; onTick(q) }
    })

    return () => { unsubStore(); unsubChannel() }
  },
}
