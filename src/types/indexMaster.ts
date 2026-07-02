export interface IndexMaster {
  id: number
  exchange: string | null
  // API returns camelCase
  symbolCode: string | null
  symbolName: string
  tokenId: number | null
  lot: string | number | null    // API returns "65.000" as string
  strikeDifference: number | null
  expiryDays: string | null
  createdAt: string
  updatedAt: string | null
  // snake_case aliases (legacy — keep for backwards compat)
  symbol_code?: string | null
  symbol_name?: string
  token_id?: number | null
  freeze_qty?: number | null
  strike_difference?: number | null
  expiry_days?: string | null
  created_at?: string
  updated_at?: string | null
}

/** Parse lot size from either string ("65.000") or number */
export function parseLot(raw: string | number | null | undefined): number {
  if (raw == null) return 1
  const n = typeof raw === 'string' ? parseFloat(raw) : raw
  return isNaN(n) || n <= 0 ? 1 : n
}
