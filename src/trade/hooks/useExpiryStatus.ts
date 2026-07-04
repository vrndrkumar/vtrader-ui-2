import { useMemo, useSyncExternalStore } from 'react'
import { getExpiries, subscribeIndex } from '../data/realtime/optionChainCache'
import { istParts } from '../utils/marketStatus'

export type ExpiryKind = 'WEEKLY' | 'MONTHLY' | 'NONE'

const MONS: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }

interface ExpDate { d: number; m: number; y: number }
function parseExpiry(s: string): ExpDate | null {
  const m = /^(\d{2})([A-Z]{3})(\d{2})$/.exec(s.trim().toUpperCase())
  if (!m) return null
  const mon = MONS[m[2]]
  if (mon == null) return null
  return { d: +m[1], m: mon, y: 2000 + +m[3] }
}

/**
 * Best-effort expiry detection from the live option-chain expiries (NIFTY).
 * Monthly = today's expiry is the last one in its month; otherwise Weekly.
 */
export function useExpiryStatus(): ExpiryKind {
  const key = useSyncExternalStore((cb) => subscribeIndex('NIFTY', cb), () => getExpiries('NIFTY').join('|'), () => '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo<ExpiryKind>(() => {
    const t = istParts()
    const exps = getExpiries('NIFTY').map(parseExpiry).filter((e): e is ExpDate => !!e)
    const today = exps.find((e) => e.d === t.d && e.m === t.m && e.y === t.y)
    if (!today) return 'NONE'
    const laterSameMonth = exps.some((e) => e.m === today.m && e.y === today.y && e.d > today.d)
    return laterSameMonth ? 'WEEKLY' : 'MONTHLY'
  }, [key])
}
