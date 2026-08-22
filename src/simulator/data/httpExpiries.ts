// ── Real expiries (data.vtrader.in) ──────────────────────────────────────────
// GET /data/expiries?symbol=NIFTY&date=YYYY-MM-DD
//   → { symbol, from, count, expiries: [{ date, token, label }] }
// Credential-free host (uses axiosCandle) — kept a CORS "simple GET" (no auth
// header) so no preflight. Maps the raw rows onto the simulator's Expiry type;
// `id` stays `${index}-${date}` so chainAt/quoteAt/contractMeta keep working.

import { axiosCandle } from '@/api/axios'
import type { Expiry, IndexCode } from '../types'

interface RawExpiry { date: string; token: string; label: string }
interface ExpiriesResponse { symbol: string; from: string; count: number; expiries: RawExpiry[] }

export async function fetchExpiries(index: IndexCode, date: string): Promise<Expiry[]> {
  const { data } = await axiosCandle.get<ExpiriesResponse>('/data/expiries', { params: { symbol: index, date } })
  const raw = Array.isArray(data?.expiries) ? data.expiries : []

  // Monthly = the last expiry within its calendar month among the returned list.
  const lastOfMonth = new Map<string, string>() // 'YYYY-MM' → max date
  for (const e of raw) {
    if (!e?.date) continue
    const ym = e.date.slice(0, 7)
    const cur = lastOfMonth.get(ym)
    if (!cur || e.date > cur) lastOfMonth.set(ym, e.date)
  }

  return raw
    .filter((e) => !!e?.date)
    .map((e) => ({
      id: `${index}-${e.date}`,
      date: e.date,
      label: e.label || e.token || e.date,
      type: lastOfMonth.get(e.date.slice(0, 7)) === e.date ? 'monthly' : 'weekly',
    }))
}
