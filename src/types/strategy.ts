export interface StrategyConfig {
  id: number
  strategyName: string          // human-readable display name
  strategyCode: string          // matches trade.group_name  e.g. "INTPLUSEXP"
  configData?: {
    isActive?: boolean
    strategyName?: string
    marginRequired?: boolean
    description?: string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
}

/** Indices a strategy can trade (checked as keys in configData) */
export const STANDARD_INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX', 'BANKEX', 'MIDCPNIFTY'] as const
export type IndexKey = typeof STANDARD_INDICES[number]

/** configData keys that are non-index objects (never treated as a symbol) */
const NON_INDEX_KEYS = new Set(['timeWindow', 'slTrailingRule', 'strike', 'sl', 'lotChangeOnSL'])

/** Lot size per index (fallback if index master unavailable) */
export const INDEX_LOT_SIZES: Record<string, number> = {
  NIFTY: 65,
  BANKNIFTY: 35,
  FINNIFTY: 40,
  SENSEX: 20,
  BANKEX: 15,
  MIDCPNIFTY: 75,
}

/**
 * Extract which indices a strategy config covers.
 *
 * @param config     The strategy config
 * @param allSymbols Optional: all symbols from IndexMaster (most accurate — pass when available)
 *
 * Priority:
 *  1. configData keys ∩ allSymbols (IndexMaster) — fully dynamic, covers equity + any crypto
 *  2. configData keys ∩ STANDARD_INDICES            — equity fallback
 *  3. Any ALL-CAPS configData key with an object value — catches BTC/ETH without hardcoding
 *  4. Hard fallback: ['NIFTY', 'BANKNIFTY']
 */
export function getStrategyIndices(config: StrategyConfig, allSymbols?: string[]): string[] {
  if (!config.configData) return ['NIFTY', 'BANKNIFTY']
  const keys = Object.keys(config.configData)

  // 1. Use IndexMaster symbols when provided — most accurate
  if (allSymbols?.length) {
    const found = allSymbols.filter((s) => keys.includes(s))
    if (found.length > 0) return found
  }

  // 2. Known equity indices
  const known = STANDARD_INDICES.filter((idx) => keys.includes(idx))
  if (known.length > 0) return known as string[]

  // 3. Any ALL-CAPS key with an object value (catches BTC, ETH, any future symbol)
  const dynamic = keys.filter((k) => {
    if (NON_INDEX_KEYS.has(k)) return false
    if (k !== k.toUpperCase()) return false
    const v = config.configData![k]
    return v !== null && typeof v === 'object' && !Array.isArray(v)
  })
  if (dynamic.length > 0) return dynamic

  return ['NIFTY', 'BANKNIFTY']
}

/** Per-index lot counts for subscription */
export type IndexLots = Partial<Record<string, number>>

/** Payload to subscribe to a strategy — POST /strategy/subscribe */
export interface SubscribeStrategyPayload {
  strategyName: string        // = StrategyConfig.strategyCode
  brokerName: string
  executionRule: ExecutionRule[]
}

/** Payload to edit a user strategy — POST /strategy/edit-strategy/:id */
export interface EditStrategyPayload {
  strategyName: string        // = UserStrategy.strategyName
  brokerName: string
  isEnabled?: boolean
  executionRule: ExecutionRule[]
}

/** One entry in executionRule — per-symbol lot config */
export interface ExecutionRule {
  symbol: string
  number_lots: number
  marginBenefitRequired?: boolean
  active?: boolean
  isRealTrading?: boolean
  traderType?: string
  lotChangeOnSL?: { active: boolean; lotChangeQty: number }
  partialBookingRule?: { partialBookingPercentage: number }
}

/**
 * A user's subscribed strategy row from /strategy/user-strategies.
 * Key fields: strategyName matches StrategyConfig.strategyCode,
 * isEnabled = deployed/active, executionRule = per-index lots.
 */
export interface UserStrategy {
  id: number
  userId?: number
  userBrokerId?: number
  user_broker_id?: number
  strategyName?: string           // matches StrategyConfig.strategyCode
  brokerName?: string
  executionRule?: ExecutionRule[]
  isEnabled?: boolean             // true = deployed/active
  // Legacy / alternative field names
  strategyId?: number
  strategyCode?: string
  strategy_id?: number
  strategy_code?: string
  isActive?: boolean
  status?: string
  lots?: IndexLots
  marginRequired?: boolean
  [key: string]: unknown
}

/** Is this user-strategy currently deployed/active? */
export function isUserStrategyDeployed(us: UserStrategy): boolean {
  if (us.isEnabled === true)  return true
  if (us.isActive  === true)  return true
  const status = String(us.status ?? '').toUpperCase()
  return status === 'ACTIVE' || status === 'RUNNING' || status === 'LIVE'
}

/** Extract lots map from executionRule (number_lots per symbol) */
export function lotsFromExecutionRule(us: UserStrategy): IndexLots {
  if (!us.executionRule?.length) return us.lots ?? {}
  const map: IndexLots = {}
  us.executionRule.forEach((r) => { map[r.symbol] = r.number_lots })
  return map
}

/** trade.group_name values that are treated as "Manual" */
export const MANUAL_CODES = new Set(['', 'MANUAL', 'manual', 'Manual'])
