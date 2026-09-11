/// <reference types="vite/client" />
import axios from 'axios'
import type {
  DashboardData, Facets, InsightSymbol, JobStatus, StockInsightResponse,
  UniverseFilters, UniverseResponse,
} from './types'

/**
 * Dedicated instance for the Stock Insight micro-service.
 * Dev server → localhost:3600; production build → VPS. Override either
 * with VITE_INSIGHT_API if needed.
 */
const INSIGHT_BASE_URL =
  (import.meta.env.VITE_INSIGHT_API as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3600' : 'https://insights.vtrader.in')

const client = axios.create({ baseURL: INSIGHT_BASE_URL })

export async function searchInsightSymbols(q: string): Promise<InsightSymbol[]> {
  const { data } = await client.get<{ symbols: InsightSymbol[] }>('/symbols', { params: { q } })
  return data.symbols
}

export async function fetchUniverse(
  filters: Partial<UniverseFilters>,
  page: number,
  pageSize: number,
): Promise<UniverseResponse> {
  const params: Record<string, string | number> = { page, pageSize }
  if (filters.q) params.q = filters.q
  if (filters.sector) params.sector = filters.sector
  if (filters.industry) params.industry = filters.industry
  if (filters.badge) params.badge = filters.badge
  if (filters.riskLevel) params.riskLevel = filters.riskLevel
  if (filters.minDiscovery) params.minDiscovery = filters.minDiscovery
  if (filters.analyzed) params.analyzed = '1'
  if (filters.fundamentals) params.fundamentals = filters.fundamentals
  if (filters.sort) params.sort = filters.sort
  const { data } = await client.get<UniverseResponse>('/universe', { params })
  return data
}

export async function fetchFacets(): Promise<Facets> {
  const { data } = await client.get<Facets>('/universe/facets')
  return data
}

export async function fetchDashboard(): Promise<DashboardData> {
  const { data } = await client.get<DashboardData>('/dashboard')
  return data
}

export async function fetchStockInsight(symbol: string, refresh = false): Promise<StockInsightResponse> {
  const { data } = await client.get<StockInsightResponse>(
    `/stock/${encodeURIComponent(symbol)}/insight`,
    { params: refresh ? { refresh: 1 } : {} },
  )
  return data
}

export async function startAnalyzeSelected(symbols: string[]): Promise<JobStatus> {
  const { data } = await client.post<{ status: JobStatus }>('/analyze', { symbols })
  return data.status
}

export async function startAnalyzeAll(): Promise<JobStatus> {
  const { data } = await client.post<{ status: JobStatus }>('/analyze/all')
  return data.status
}

export async function fetchFundamentals(symbol: string, refresh = false): Promise<import('./types').FundamentalsResponse> {
  const { data } = await client.get<import('./types').FundamentalsResponse>(
    `/stock/${encodeURIComponent(symbol)}/fundamentals`,
    { params: refresh ? { refresh: 1 } : {} },
  )
  return data
}

export async function startRetryFailed(): Promise<JobStatus> {
  const { data } = await client.post<{ status: JobStatus }>('/analyze/retry-failed')
  return data.status
}

export async function fetchFailures(): Promise<import('./types').FailureReport> {
  const { data } = await client.get<import('./types').FailureReport>('/analyze/failures')
  return data
}

export async function fetchJobStatus(): Promise<JobStatus> {
  const { data } = await client.get<JobStatus>('/analyze/status')
  return data
}

export async function stopJob(): Promise<JobStatus> {
  const { data } = await client.post<{ status: JobStatus }>('/analyze/stop')
  return data.status
}
