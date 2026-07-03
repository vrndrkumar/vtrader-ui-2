import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useQuote } from '../../store/marketStore'
import { buildOptionChain } from '../../data/optionChainMock'
import { realtime } from '../../data/realtime/realtimeService'
import { getExpiries, getExpiryVersion, getStrikeRow, hasLiveData, subscribeExpiry } from '../../data/realtime/optionChainCache'
import type { OptionChain } from '../../types/options'

const chgPct = (ltp: number, open: number) => (open ? +(((ltp - open) / open) * 100).toFixed(0) : 0)

/** Best-effort map of a UI expiry label to the live feed's expiry key. */
function resolveFeedExpiry(index: string, label: string): string {
  const live = getExpiries(index)
  if (!live.length) return label
  const norm = label.replace(/\s/g, '').toUpperCase().slice(0, 5)
  return live.find((e) => e.toUpperCase().startsWith(norm)) ?? live[0]
}

/**
 * Live option chain for an index+expiry.
 *  - Subscribes to the realtime channels (ref-counted; safe across mounts).
 *  - Base ladder + OI/IV come from the mock generator (feed lacks OI/IV) so the
 *    grid stays complete; LTP / change% are overlaid from the live cache when
 *    present. Falls back entirely to mock when there's no live data.
 *  - Re-renders only when this expiry's rAF-batched version bumps.
 */
export function useOptionChain(symbolCode: string, expiryLabel: string): OptionChain {
  useEffect(() => {
    realtime.start()
    const u1 = realtime.subscribeOptionChain(symbolCode)
    const u2 = realtime.subscribeIndexTick(symbolCode)
    return () => { u1(); u2() }
  }, [symbolCode])

  const q = useQuote(symbolCode)
  const step = symbolCode === 'SENSEX' ? 100 : 50
  const spot = q?.ltp ?? (symbolCode === 'SENSEX' ? 77000 : 24100)
  const chg = q?.chg ?? 0
  const atm = Math.round(spot / step) * step
  const feedExpiry = resolveFeedExpiry(symbolCode, expiryLabel)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => buildOptionChain(symbolCode, spot, chg, expiryLabel), [symbolCode, atm, expiryLabel])

  const version = useSyncExternalStore(
    (cb) => subscribeExpiry(symbolCode, feedExpiry, cb),
    () => getExpiryVersion(symbolCode, feedExpiry),
    () => 0,
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (!hasLiveData(symbolCode, feedExpiry)) return base
    const rows = base.rows.map((r) => {
      const live = getStrikeRow(symbolCode, feedExpiry, r.strike)
      if (!live) return r
      const call = live.CE ? { ...r.call, ltp: live.CE.ltp, ltpChgPct: chgPct(live.CE.ltp, live.CE.openLtp) } : r.call
      const put = live.PE ? { ...r.put, ltp: live.PE.ltp, ltpChgPct: chgPct(live.PE.ltp, live.PE.openLtp) } : r.put
      return { ...r, call, put }
    })
    return { ...base, rows }
  }, [base, version, feedExpiry, symbolCode])
}
