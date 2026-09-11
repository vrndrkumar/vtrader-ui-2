// ── Scheduled baskets API ────────────────────────────────────────────────────
// A basket that fires on an entry trigger (+ optional exit), each an index level
// and/or a time. Auth via axiosPrivate; owner derived from token server-side.

import { axiosPrivate } from './axios'

export type Side = 'BUY' | 'SELL'
export type PriceType = 'MKT' | 'LMT'
export type IndexDir = 'ABOVE' | 'BELOW'
export type ScheduledStatus = 'SCHEDULED' | 'ENTERING' | 'ENTERED' | 'EXITING' | 'COMPLETED' | 'CANCELLED'

export interface ScheduledLeg {
  side: Side
  symbolName: string
  indexName: string
  display?: string
  qty: number
  priceType: PriceType
  price: number
  product?: string
}

export interface ScheduledBasket {
  id: number
  name: string
  indexName: string
  brokers: string[]
  legs: ScheduledLeg[]
  entryIndexLevel: number | null
  entryIndexDir: IndexDir | null
  entryTime: string | null
  exitIndexLevel: number | null
  exitIndexDir: IndexDir | null
  exitTime: string | null
  status: ScheduledStatus
  entryFiredBy?: string | null
  exitFiredBy?: string | null
  enteredAt?: string | null
  exitedAt?: string | null
}

export interface ScheduledPayload {
  name?: string
  indexName: string
  brokers: string[]
  legs: ScheduledLeg[]
  entryIndexLevel?: number | null
  entryIndexDir?: IndexDir | null
  entryTime?: string | null
  exitIndexLevel?: number | null
  exitIndexDir?: IndexDir | null
  exitTime?: string | null
}

function arr<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (typeof v === 'string') { try { return JSON.parse(v) as T[] } catch { return [] } }
  return []
}
function one(data: unknown): ScheduledBasket {
  const d = ((data as { data?: unknown })?.data ?? data) as ScheduledBasket
  return { ...d, legs: arr<ScheduledLeg>(d.legs), brokers: arr<string>(d.brokers) }
}
function many(data: unknown): ScheduledBasket[] {
  const d = (data as { data?: unknown })?.data ?? data
  return Array.isArray(d) ? (d as ScheduledBasket[]).map((b) => ({ ...b, legs: arr<ScheduledLeg>(b.legs), brokers: arr<string>(b.brokers) })) : []
}

export async function listScheduledBaskets(): Promise<ScheduledBasket[]> {
  const { data } = await axiosPrivate.get('/scheduled-baskets')
  return many(data)
}
export async function createScheduledBasket(payload: ScheduledPayload): Promise<ScheduledBasket> {
  const { data } = await axiosPrivate.post('/scheduled-baskets', payload)
  return one(data)
}
export async function updateScheduledBasket(id: number, patch: Partial<ScheduledPayload>): Promise<ScheduledBasket> {
  const { data } = await axiosPrivate.put(`/scheduled-baskets/${id}`, patch)
  return one(data)
}
export async function cancelScheduledBasket(id: number): Promise<void> {
  await axiosPrivate.delete(`/scheduled-baskets/${id}`)
}
