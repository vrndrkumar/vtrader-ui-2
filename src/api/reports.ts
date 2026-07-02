import { axiosPrivate } from './axios'
import type {
  Trade,
  TradeOrder,
  SyncOrderPayload,
  UpdateOrderPayload,
  GroupAssignPayload,
} from '@/types/reports'

// ── Response normalizer ───────────────────────────────────────────────────────

function toArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    for (const key of ['data', 'result', 'records', 'items', 'trades', 'orders']) {
      if (Array.isArray(obj[key])) return obj[key] as T[]
    }
  }
  return []
}

// ── Get trades (vtrader_ledger rows) ─────────────────────────────────────────
// GET /trades?brokerName=FINVASIA&groupName=MY_TEST

export async function getTrades(params: {
  brokerName?: string
  groupName?: string
  fromDate?: string   // YYYY-MM-DD
  toDate?: string     // YYYY-MM-DD
} = {}): Promise<Trade[]> {
  const query = new URLSearchParams()
  if (params.brokerName) query.set('brokerName', params.brokerName)
  if (params.groupName)  query.set('groupName',  params.groupName)
  if (params.fromDate)   query.set('fromDate',   params.fromDate)
  if (params.toDate)     query.set('toDate',     params.toDate)

  const qs = query.toString()
  const { data } = await axiosPrivate.get(`/trades${qs ? `?${qs}` : ''}`)
  return toArray<Trade>(data)
}

// ── Get orders for a specific trade ──────────────────────────────────────────
// GET /trades/orders?tradeId=<trade_id>

export async function getTradeOrders(tradeId: string): Promise<TradeOrder[]> {
  const { data } = await axiosPrivate.get(`/trades/orders?tradeId=${encodeURIComponent(tradeId)}`)
  return toArray<TradeOrder>(data)
}

// ── Sync / add a manual order ─────────────────────────────────────────────────
// POST /trades/orders

export async function syncOrder(payload: SyncOrderPayload): Promise<unknown> {
  const { data } = await axiosPrivate.post('/trades/orders', payload)
  return data
}

// ── Update an existing order ──────────────────────────────────────────────────
// PUT /trades/orders/:id

export async function updateOrder(id: number, payload: UpdateOrderPayload): Promise<unknown> {
  const { data } = await axiosPrivate.put(`/trades/orders/${id}`, payload)
  return data
}

// ── Assign orders to a group ──────────────────────────────────────────────────
// POST /trades/orders/group-assign

export async function assignOrderGroup(payload: GroupAssignPayload): Promise<unknown> {
  const { data } = await axiosPrivate.post('/trades/orders/group-assign', payload)
  return data
}
