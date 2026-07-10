import { useMemo, useSyncExternalStore } from 'react'
import { getExpiries, subscribeIndex } from '../data/realtime/optionChainCache'
import { istParts } from '../utils/marketStatus'
import { parseExpiry, type ExpiryDate } from '../utils/expiry'
import { OPTION_CHAIN_INDICES } from '../config/indices'

export type ExpiryKind = 'WEEKLY' | 'MONTHLY' | 'NONE'

/** All selectable index codes (NIFTY, BANKNIFTY, SENSEX, BANKEX, …) */
const TRACKED = OPTION_CHAIN_INDICES.map((i) => i.code)

/**
 * Checks ALL option-chain indices for today's expiry.
 *
 * Classification rules (per index):
 *  - MONTHLY: today IS an expiry AND there is no later expiry in the same
 *    calendar month AND the cache has loaded >1 expiry for this index
 *    (the >1 guard prevents misclassifying a sparsely-loaded index whose
 *    future expiries simply haven't arrived yet from the feed)
 *  - WEEKLY:  today IS an expiry in any other case
 *  - skipped: today is not an expiry for this index
 *
 * Aggregation: MONTHLY beats WEEKLY only if at least one index is genuinely
 * monthly. A WEEKLY expiry anywhere returns WEEKLY immediately.
 */
export function useExpiryStatus(): ExpiryKind {
  // Single reactive key across all tracked indices.
  const key = useSyncExternalStore(
    (cb) => {
      const unsubs = TRACKED.map((idx) => subscribeIndex(idx, cb))
      return () => unsubs.forEach((u) => u())
    },
    () => TRACKED.map((idx) => `${idx}:${getExpiries(idx).join(',')}`).join('|'),
    () => '',
  )

  return useMemo<ExpiryKind>(() => {
    const t = istParts()
    let hasWeekly = false
    let hasMonthly = false

    for (const idx of TRACKED) {
      const exps = getExpiries(idx).map(parseExpiry).filter((e): e is ExpiryDate => !!e)
      // Find today's expiry for this index (e.m is 1-based, t.m is 0-based)
      const today = exps.find((e) => e.d === t.d && e.m === t.m + 1 && e.y === t.y)
      if (!today) continue // this index doesn't expire today

      const laterSameMonth = exps.some(
        (e) => e.m === today.m && e.y === today.y && e.d > today.d,
      )

      // Only trust a MONTHLY classification when the cache has loaded more
      // than just today's expiry — otherwise the feed hasn't delivered future
      // expiry dates yet and we'd misclassify a regular weekly expiry.
      const cacheHasFutureData = exps.length > 1

      if (!laterSameMonth && cacheHasFutureData) {
        hasMonthly = true
      } else {
        hasWeekly = true
      }
    }

    if (hasMonthly) return 'MONTHLY'
    if (hasWeekly)  return 'WEEKLY'
    return 'NONE'
  }, [key])
}
