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

/** Lot size per index (fallback if index master unavailable) */
export const INDEX_LOT_SIZES: Record<string, number> = {
  NIFTY: 65,
  BANKNIFTY: 35,
  FINNIFTY: 40,
  SENSEX: 20,
  BANKEX: 15,
  MIDCPNIFTY: 75,
}

/** Extract which indices a strategy config covers */
export function getStrategyIndices(config: StrategyConfig): string[] {
  if (!config.configData) return ['NIFTY', 'BANKNIFTY']
  const keys = Object.keys(config.configData)
  const found = STANDARD_INDICES.filter((idx) => keys.includes(idx))
  return found.length > 0 ? found : ['NIFTY', 'BANKNIFTY']
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
