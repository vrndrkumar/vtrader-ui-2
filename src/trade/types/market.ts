// ── Trade module — core market types ────────────────────────────────────────

export type Timeframe = '1' | '3' | '5' | '15' | '30' | '60' | 'D'

export const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1', label: '1m' },
  { value: '3', label: '3m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1H' },
  { value: 'D', label: '1D' },
]

/** Minutes per timeframe bucket (used to build the live forming candle). */
export const TF_MINUTES: Record<Timeframe, number> = {
  '1': 1, '3': 3, '5': 5, '15': 15, '30': 30, '60': 60, D: 1440,
}

/** KLineCharts candle shape (timestamp in ms). */
export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

/** Normalized live quote (maps from the Redis index-tick payload). */
export interface Quote {
  key: string          // marketStore key = symbol code (e.g. "NIFTY")
  index?: string
  ltp: number
  bid?: number
  ask?: number
  chg?: number
  chgPct?: number
  volume?: number
  ts: number           // epoch ms
}

/**
 * A tradable symbol. `candleSymbol` is what /data/candle expects,
 * `tickKey` is the Redis key/field used by the live feed
 * (e.g. NIFTY index tick is stored under "Nifty 50").
 */
export interface TradeSymbol {
  code: string
  display: string
  candleSymbol: string
  tickKey: string
  type: 'INDEX' | 'EQUITY' | 'OPTION'
}

// Phase 0: NIFTY + SENSEX only (per direction). More added when live feed lands.
export const SYMBOLS: TradeSymbol[] = [
  { code: 'NIFTY',  display: 'NIFTY 50', candleSymbol: 'NIFTY',  tickKey: 'Nifty 50', type: 'INDEX' },
  { code: 'SENSEX', display: 'SENSEX',   candleSymbol: 'SENSEX', tickKey: 'SENSEX',   type: 'INDEX' },
]

export function getSymbol(code: string): TradeSymbol {
  return SYMBOLS.find((s) => s.code === code) ?? SYMBOLS[0]
}
