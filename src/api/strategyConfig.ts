// ── Strategy master-data API (Admin Control Panel) ───────────────────────────
// Endpoints (base = https://api.vtrader.in):
//   GET    /strategy-config          → { status, data: StrategyMaster[] }
//   GET    /strategy-config/:id       → { status, data: StrategyMaster } | StrategyMaster
//   POST   /strategy-config           → create
//   PUT    /strategy-config/:id        → update (full record)
//   DELETE /strategy-config/:id        → delete (where supported)
// Auth + 401 handling come from axiosPrivate interceptors.

import { axiosPrivate } from './axios'
import type { StrategyMaster, StrategyUpsertPayload } from '@/types/strategyConfig'

// Unwrap the `{ status, data }` envelope (or a bare object/array).
function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return (raw as { data: T }).data
  }
  return raw as T
}

export async function listStrategies(): Promise<StrategyMaster[]> {
  const { data } = await axiosPrivate.get('/strategy-config')
  const arr = unwrap<StrategyMaster[]>(data)
  return Array.isArray(arr) ? arr : []
}

export async function getStrategy(id: number): Promise<StrategyMaster> {
  const { data } = await axiosPrivate.get(`/strategy-config/${id}`)
  return unwrap<StrategyMaster>(data)
}

export async function createStrategy(payload: StrategyUpsertPayload): Promise<StrategyMaster> {
  const { data } = await axiosPrivate.post('/strategy-config', payload)
  return unwrap<StrategyMaster>(data)
}

export async function updateStrategy(id: number, payload: StrategyUpsertPayload): Promise<StrategyMaster> {
  const { data } = await axiosPrivate.put(`/strategy-config/${id}`, payload)
  return unwrap<StrategyMaster>(data)
}

export async function deleteStrategy(id: number): Promise<void> {
  await axiosPrivate.delete(`/strategy-config/${id}`)
}

/** Convenience: change only the lifecycle status (sends the full record back). */
export async function setStrategyStatus(s: StrategyMaster, status: string): Promise<StrategyMaster> {
  return updateStrategy(s.id, {
    strategyName: s.strategyName,
    strategyCode: s.strategyCode,
    description: s.description ?? null,
    configData: s.configData ?? {},
    status,
  })
}
