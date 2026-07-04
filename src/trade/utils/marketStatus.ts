// ── Market status (NSE/BSE hours, IST) ───────────────────────────────────────
// Regular session: Mon–Fri, 09:15–15:30 IST. Timestamps are UTC epoch, so we
// shift by +5:30 and read UTC fields to get IST wall-clock (timezone-safe).

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

export function isMarketOpen(now: Date = new Date()): boolean {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  const day = ist.getUTCDay() // 0 Sun … 6 Sat
  if (day === 0 || day === 6) return false
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30
}

/** IST calendar date (YYYY-MM-DD) for an epoch-ms timestamp. */
export function istDate(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10)
}
