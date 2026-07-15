// ── Stock Insight platform types (mirrors insight-server v2 API) ─────────────

export interface InsightSymbol {
  symbol_code: string
  symbol_name: string
  exchange: string | null
  sector: string | null
  industry: string | null
  category: 'ETF' | 'EQUITY' | 'MF' | null
  sector_index_symbol: string | null
}

export interface InsightCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Zone {
  lo: number
  hi: number
  center: number
  touches: number
  kind: 'SUPPORT' | 'RESISTANCE'
  distancePct: number
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type Badge =
  | 'HIDDEN GEM CANDIDATE'
  | 'EARLY DISCOVERY'
  | 'QUIET ACCUMULATION'
  | 'TRANSITION STARTED'
  | 'BUILDING STRENGTH'
  | 'LEADERSHIP EMERGING'
  | 'MOMENTUM ESTABLISHED'
  | 'WATCHLIST'
  | 'QUIET'

export type WarningTag = 'DISTRIBUTION RISK' | 'WEAK STRUCTURE' | 'THIN LIQUIDITY' | 'HIGH VOLATILITY'

export interface Conviction {
  score: number
  stars: number
  label: string
}

export interface RankSlot {
  rank: number
  total: number
  topPct: number | null
}

export interface EngineRanks {
  market: RankSlot | null
  sector: RankSlot | null
  industry: RankSlot | null
}

export interface RankContext {
  discovery: EngineRanks
  transition: EngineRanks
  momentum: EngineRanks
  sectorName: string | null
  industryName: string | null
}

export interface UniverseRow {
  id: number
  symbol_code: string
  symbol_name: string
  sector: string | null
  industry: string | null
  category: string | null
  analysis_date: string | null
  price: number | null
  discovery_score: number | null
  transition_score: number | null
  momentum_score: number | null
  risk_score: number | null
  risk_level: RiskLevel | null
  badge: Badge | null
  conviction: number | null
  conviction_label: string | null
  summary: string | null
  analyzed_at: string | null
}

export interface UniverseResponse {
  rows: UniverseRow[]
  total: number
  page: number
  pageSize: number
}

export interface Facets {
  sectors: string[]
  industries: string[]
  badges: string[]
}

export interface EvidenceItem {
  ok: boolean
  points: number
  theme: string
  label: string
  detail: string
}

export interface MissingItem {
  theme?: string
  label: string
  detail: string
}

export interface EngineEvidence {
  score: number
  items: EvidenceItem[]
  missing: MissingItem[]
}

export interface RiskFactor {
  level: 'warn' | 'high'
  label: string
  detail: string
}

export interface AnalysisFeatures {
  price: number
  date: string
  trend: string
  weeklyUp: boolean | null
  weeklyTurn: boolean
  above200: boolean | null
  priorGain120: number | null
  bbPct: number | null
  baseLen: number
  dryUpRatio: number | null
  obvSlope: number | null
  rsi: number | null
  atrPct: number | null
  fromHighPct: number | null
  fromLowPct: number | null
  turnoverCr: number | null
  [key: string]: unknown
}

export interface StockAnalysis {
  engineVersion: string
  features: AnalysisFeatures | null
  scores: {
    discovery: number
    transition: number
    momentum: number
    risk: number
  }
  riskLevel: RiskLevel
  badge: Badge
  tags: WarningTag[]
  family: 'discovery' | 'transition' | 'momentum'
  phase: string
  earliness: string | null
  evidence: {
    discovery: EngineEvidence
    transition: EngineEvidence
    momentum: EngineEvidence
  } | null
  riskFactors: RiskFactor[]
  summary: string
  honesty: string
}

export interface HistoryRow {
  id: number
  analysis_date: string
  price: number | null
  discovery_score: number | null
  transition_score: number | null
  momentum_score: number | null
  risk_score: number | null
  risk_level: RiskLevel | null
  badge: Badge | null
  conviction: number | null
  conviction_label: string | null
  market_rank: number | null
  market_total: number | null
  engine_version: string | null
  created_at: string
}

export interface StockInsightResponse {
  meta: InsightSymbol & { description?: string | null }
  analysis: StockAnalysis | null
  storedAt: string | null
  history: HistoryRow[]
  weeklyChart: { candles: InsightCandle[]; keyZones: Zone[] } | null
  rankContext: RankContext | null
  conviction: Conviction | null
  standout: string[]
}

export interface RankingEntry {
  symbol_code: string
  symbol_name: string
  sector: string | null
  price: number | null
  discovery_score: number | null
  transition_score: number | null
  momentum_score: number | null
  risk_level: RiskLevel | null
  badge: Badge | null
  conviction: number | null
  conviction_label: string | null
  summary: string | null
  delta?: number
  isNew?: boolean
  fromBadge?: Badge
}

export interface FailureGroup {
  reason: string
  count: number
  symbols: string[]
}

export interface FailureReport {
  runLabel: string | null
  total: number
  groups: FailureGroup[]
}

export interface DashboardData {
  analyzedCount: number
  topPicks: RankingEntry[]
  topHiddenGems: RankingEntry[]
  topDiscovery: RankingEntry[]
  biggestImprovers: RankingEntry[]
  newSignals: RankingEntry[]
  momentumLeaders: RankingEntry[]
  highestRisk: RankingEntry[]
  sectorLeaders: RankingEntry[]
  upgraded: RankingEntry[]
  downgraded: RankingEntry[]
}

export interface JobStatus {
  running: boolean
  label: string | null
  total: number
  completed: number
  failed: number
  remaining: number
  current: string | null
  startedAt: string | null
  finishedAt: string | null
  errors: Array<{ symbol: string; error: string }>
}

export interface UniverseFilters {
  q: string
  sector: string
  industry: string
  badge: string
  riskLevel: string
  minDiscovery: string
  analyzed: boolean
  sort: 'discovery' | 'transition' | 'momentum' | 'conviction' | 'recent' | 'name'
}
