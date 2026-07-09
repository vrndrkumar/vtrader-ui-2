import { useMemo, useSyncExternalStore } from 'react'
import { getExpiries, subscribeIndex } from '../data/realtime/optionChainCache'
import { istParts } from '../utils/marketStatus'
import { parseExpiry, type ExpiryDate } from '../utils/expiry'

export type ExpiryKind = 'WEEKLY' | 'MONTHLY' | 'NONE'

/**
 * Best-effort expiry detection from the live option-chain expiries (NIFTY).
 * Monthly = today's expiry is the last one in its month; otherwise Weekly.
 */
export function useExpiryStatus(): ExpiryKind {
  const key = useSyncExternalStore((cb) => subscribeIndex('NIFTY', cb), () => getExpiries('NIFTY').join('|'), () => '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo<ExpiryKind>(() => {
    const t = istParts()
    const exps = getExpiries('NIFTY').map(parseExpiry).filter((e): e is ExpiryDate => !!e)
    const today = exps.find((e) => e.d === t.d && e.m === t.m + 1 && e.y === t.y) // e.m is 1-based
    if (!today) return 'NONE'
    const laterSameMonth = exps.some((e) => e.m === today.m && e.y === today.y && e.d > today.d)
    return laterSameMonth ? 'WEEKLY' : 'MONTHLY'
  }, [key])
}
