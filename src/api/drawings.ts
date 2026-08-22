// ── Chart drawings API ───────────────────────────────────────────────────────
// Backend is the source of truth for a user's drawings (per canonical symbol).
// Auth (Bearer token) is attached by the shared axiosPrivate interceptor; the
// server derives the owner from the token, so we never send a userId.

import { axiosPrivate } from './axios'
import type { DrawingDef } from '@/trade/chart/ChartEngine'

// Endpoints return { status, data }. Be liberal about the envelope.
function rows(data: unknown): DrawingDef[] {
  const d = (data as { data?: unknown })?.data ?? data
  return Array.isArray(d) ? (d as DrawingDef[]) : []
}

/** All of the authenticated user's drawings for a symbol. */
export async function getDrawings(symbol: string): Promise<DrawingDef[]> {
  const { data } = await axiosPrivate.get(`/drawings?symbol=${encodeURIComponent(symbol)}`)
  return rows(data)
}

/** Create/upsert one drawing (server keys on user + symbol + drawing id). */
export async function createDrawing(symbol: string, d: DrawingDef): Promise<void> {
  await axiosPrivate.post('/drawings', { symbol, ...d })
}

/** Update one drawing (anchors / style / lock / visibility). */
export async function updateDrawing(id: string, patch: Partial<DrawingDef>): Promise<void> {
  await axiosPrivate.put(`/drawings/${encodeURIComponent(id)}`, patch)
}

/** Delete only this drawing. */
export async function deleteDrawing(id: string): Promise<void> {
  await axiosPrivate.delete(`/drawings/${encodeURIComponent(id)}`)
}
