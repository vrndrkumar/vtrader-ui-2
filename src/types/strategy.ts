export interface StrategyConfig {
  id: number
  strategyName: string          // human-readable display name
  strategyCode: string          // matches trade.group_name  e.g. "INTPLUSEXP"
  status?: string               // lifecycle: PUBLISHED | READY | INACTIVE | DRAFT …
  configData?: {
    isActive?: boolean
    status?: string
    strategyName?: string
    marginRequired?: boolean
    description?: string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
}

/** Normalised template lifecycle status (top-level wins, falls back to configData). */
export function templateStatus(cfg: StrategyConfig): string {
  return String(cfg.status ?? cfg.configData?.status ?? '').toUpperCase()
}

/** Users only ever see PUBLISHED templates; admins see every status. */
export function isTemplateVisible(cfg: StrategyConfig, isAdmin: boolean): boolean {
  return isAdmin || templateStatus(cfg) === 'PUBLISHED'
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
 * Extract which indices a strategy config covers, by finding the index *objects*
 * wherever they live — not by relying on `expiry_days` or a hard-coded fallback.
 *
 * An index is included when a config object is keyed by an index symbol and it is
 * not explicitly disabled (`enabled: false`). Sources, unioned:
 *   1. FLAT     — top-level `configData.<INDEX>` objects (NIFTY_LIQUIDITY_TRADE, INTRADAY_SCALPING)
 *   2. NESTED   — `configData.indices.<INDEX>` objects (ZERO_HERO)
 *   3. DAY-MAP  — values of `indexDays` / `expiry_days` (day → index name)
 * A symbol counts as an index if it's in IndexMaster (when provided) or STANDARD_INDICES,
 * or — to catch future/crypto symbols without hardcoding — an ALL-CAPS key with an object value.
 * If nothing is found, returns [] (the strategy shows no indices — do not guess).
 */
export function getStrategyIndices(config: StrategyConfig, allSymbols?: string[]): string[] {
  const cd = config.configData
  if (!cd) return []
  const known = new Set<string>([...(allSymbols?.length ? allSymbols : []), ...STANDARD_INDICES].map((s) => s.toUpperCase()))
  const isObj = (v: unknown): v is Record<string, unknown> => v != null && typeof v === 'object' && !Array.isArray(v)
  const out = new Set<string>()

  // Collect index-keyed objects from a container (top level or the nested `indices`).
  const collect = (container: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(container)) {
      if (NON_INDEX_KEYS.has(k) || !isObj(v)) continue
      const KEY = k.toUpperCase()
      const looksLikeIndex = known.has(KEY) || k === KEY // known symbol, or an ALL-CAPS object (crypto/future)
      if (!looksLikeIndex) continue
      if ((v as { enabled?: unknown }).enabled === false) continue // honor explicit disable
      out.add(k)
    }
  }

  collect(cd)                                  // 1. flat
  if (isObj(cd.indices)) collect(cd.indices)   // 2. nested under `indices`

  // 3. day → index maps (values are index names)
  for (const mapKey of ['indexDays', 'indexdays', 'expiry_days', 'expiryDays']) {
    const m = cd[mapKey]
    if (isObj(m)) for (const idx of Object.values(m)) if (typeof idx === 'string' && idx.trim()) out.add(idx.trim())
  }

  return [...out]
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
