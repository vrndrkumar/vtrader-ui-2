import { useMemo, useSyncExternalStore } from 'react'
import { useQuote } from '../store/marketStore'
import { getExpiries, getExpiryVersion, getStrikeRow, subscribeExpiry, subscribeIndex } from '../data/realtime/optionChainCache'
import type { ChartSymbol } from '../types/market'

/**
 * Default strike-chart symbol: the ATM Call of the nearest live expiry, built
 * from the realtime cache. Returns null until option-chain data exists.
 */
export function useAtmStrikeSymbol(index: string): ChartSymbol | null {
  const q = useQuote(index)
  const spot = q?.ltp ?? 0

  const idxKey = useSyncExternalStore((cb) => subscribeIndex(index, cb), () => getExpiries(index).join('|'), () => '')
  const expiry = getExpiries(index)[0] ?? ''
  const ver = useSyncExternalStore((cb) => subscribeExpiry(index, expiry, cb), () => getExpiryVersion(index, expiry), () => 0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (!expiry || spot <= 0) return null
    const step = index === 'SENSEX' ? 100 : 50
    const atm = Math.round(spot / step) * step
    const ce = getStrikeRow(index, expiry, atm)?.CE
    if (!ce) return null
    return { key: ce.symbol, candleSymbol: ce.symbol, display: `${index} ${atm} CE`, kind: 'OPTION' }
  }, [index, expiry, ver, idxKey, spot])
}
