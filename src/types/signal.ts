export type TradeType = 'LONG' | 'SHORT'
export type SLMode = 'PRICE' | 'POINTS'
export type TPMode = 'PRICE' | 'RR'

export interface ExecConditionItem {
  value: number
  opType: string
  symbol: string
  marketPrice: string
}

export interface TradeDetails {
  signal?: {
    status: boolean
    signalTime: number
    signalTimeIST: string
  }
  entryPrice?: number
  slPrice?: number
  targetPrice?: number
  signalPrice?: number
  execCondition?: {
    isRealTime?: boolean
    execCondition?: ExecConditionItem[]
  }
}

export interface Signal {
  id: number
  strategy_code: string
  index_name: string
  symbol_name: string
  trade_type: TradeType
  trade_details: string | TradeDetails
  is_active: 0 | 1
  created_at: string
  updated_at?: string
}

export interface CreateSignalPayload {
  strategyCode: string
  indexName: string
  symbolName: string
  tradeType: TradeType
  entryPrice: number
  slMode: SLMode
  slValue: number
  targetMode: TPMode
  targetValue: number | string
  isRealTime: boolean
  opType: string
  marketPrice: string
}

export interface SignalsResponse {
  success?: boolean
  signals: Signal[]
  total?: number
}

export interface CreateSignalResponse {
  success?: boolean
  id: number
}

/** Parse trade_details (may be JSON string or already an object) */
export function parseTradeDetails(raw: string | TradeDetails | undefined): TradeDetails {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return raw
}
