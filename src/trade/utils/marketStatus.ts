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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface IstParts { day: string; date: string; time: string; d: number; m: number; y: number }

/** IST wall-clock parts for a live clock. */
export function istParts(now: Date = new Date()): IstParts {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    day: DAYS[ist.getUTCDay()],
    date: `${pad(ist.getUTCDate())} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`,
    time: `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`,
    d: ist.getUTCDate(), m: ist.getUTCMonth(), y: ist.getUTCFullYear(),
  }
}
