// ── Expiry parsing (single source of truth) ──────────────────────────────────
// Feed expiries look like "07JUL26" (DDMMMYY). Be tolerant of variants:
// single-digit days ("9JUL26"), 4-digit years ("09JUL2026"), and separators
// ("09-JUL-26" / "09 JUL 26"). Anything unparseable sorts last but is never
// silently hidden.

import { istParts } from './marketStatus'

const MONS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}

export interface ExpiryDate { d: number; m: number; y: number } // m is 1-based

/** Parse an expiry string to its parts, or null if it can't be parsed. */
export function parseExpiry(s: string): ExpiryDate | null {
  const m = /^\s*(\d{1,2})[-\s]?([A-Za-z]{3})[-\s]?(\d{2}|\d{4})\s*$/.exec(s ?? '')
  if (!m) return null
  const mon = MONS[m[2].toUpperCase()]
  if (!mon) return null
  const yy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return { d: Number(m[1]), m: mon, y: yy }
}

/** Sortable YYYYMMDD number for an expiry (nearest first). Unparseable → last. */
export function expiryOrder(s: string): number {
  const e = parseExpiry(s)
  return e ? e.y * 10000 + e.m * 100 + e.d : Number.MAX_SAFE_INTEGER
}

/** Today's YYYYMMDD in IST. */
export function todayOrderIST(): number {
  const t = istParts()
  return t.y * 10000 + (t.m + 1) * 100 + t.d
}

/** True if the expiry is today or later in IST (i.e. NOT expired). */
export function isActiveExpiry(s: string): boolean {
  return expiryOrder(s) >= todayOrderIST()
}
