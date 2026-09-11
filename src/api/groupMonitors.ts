// ── Group (combined) protect API ─────────────────────────────────────────────
// Portfolio-level SL/Target over several running positions of ONE index, across
// brokers. Auth (Bearer) is attached by axiosPrivate; the server derives the
// owner from the token, so we never send a userId.

import { axiosPrivate } from './axios'

/** A locked leg — qty (signed net) and average entry are frozen at creation. */
export interface GroupLeg {
  brokerName: string          // SHORT broker key ("FYERS") — matches user_broker, used for order/position calls
  brokerLabel?: string        // display label ("FYERS[XV00439]") — used for UI matching to positions
  symbolName: string          // NIFTY_15SEP26_CE_23200
  display?: string            // "NIFTY 23200 CE"
  product?: string
  lockedQty: number           // signed net at creation (+long / -short)
  lockedAvg: number           // locked average entry price
  valueFactor: number         // ₹ per point (1 for NFO)
  armPrice: number            // live premium at arm — P&L reference (running rebuilt from here)
  liveQty?: number            // server-refreshed live net (informational)
}

export type GroupStatus = 'ACTIVE' | 'FIRING' | 'COMPLETED' | 'CANCELLED'
export type GroupTrigger = 'PNL_SL' | 'PNL_TARGET' | 'INDEX_SL' | 'INDEX_TARGET' | 'TIME'

export interface GroupMonitor {
  id: number
  name: string
  indexName: string
  legs: GroupLeg[]
  pnlSl: number | null
  pnlTarget: number | null
  indexSl: number | null
  indexTarget: number | null
  timeStop: string | null     // ISO
  status: GroupStatus
  triggeredBy?: GroupTrigger | null
  exitOrders?: unknown
  createdAt?: string
}

export interface GroupPayload {
  name?: string
  indexName: string
  legs: GroupLeg[]
  armPnl?: number | null      // running P&L the user saw at arm (absolute anchor)
  pnlSl?: number | null       // absolute running-P&L level: fire when running ≤ this
  pnlTarget?: number | null   // absolute running-P&L level: fire when running ≥ this
  indexSl?: number | null
  indexTarget?: number | null
  timeStop?: string | null
}

function normalizeLegs(raw: unknown): GroupLeg[] {
  if (Array.isArray(raw)) return raw as GroupLeg[]
  if (typeof raw === 'string') { try { return JSON.parse(raw) as GroupLeg[] } catch { return [] } }
  return []
}
function one(data: unknown): GroupMonitor {
  const d = ((data as { data?: unknown })?.data ?? data) as GroupMonitor
  return { ...d, legs: normalizeLegs(d.legs) }
}
function many(data: unknown): GroupMonitor[] {
  const d = (data as { data?: unknown })?.data ?? data
  return Array.isArray(d) ? (d as GroupMonitor[]).map((g) => ({ ...g, legs: normalizeLegs(g.legs) })) : []
}

export async function listGroupMonitors(): Promise<GroupMonitor[]> {
  const { data } = await axiosPrivate.get('/group-monitors')
  return many(data)
}
export async function createGroupMonitor(payload: GroupPayload): Promise<GroupMonitor> {
  const { data } = await axiosPrivate.post('/group-monitors', payload)
  return one(data)
}
export async function updateGroupMonitor(id: number, patch: Partial<GroupPayload>): Promise<GroupMonitor> {
  const { data } = await axiosPrivate.put(`/group-monitors/${id}`, patch)
  return one(data)
}
export async function cancelGroupMonitor(id: number): Promise<void> {
  await axiosPrivate.delete(`/group-monitors/${id}`)
}
