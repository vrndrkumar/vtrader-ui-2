import { useMemo, useSyncExternalStore } from 'react'
import { useQuote } from '../store/marketStore'
import { getExpiries, getExpiryVersion, getStrikeRow, subscribeExpiry, subscribeIndex } from '../data/realtime/optionChainCache'
import type { ChartSymbol } from '../types/market'

/**
 * ATM strike-chart symbol (Call by default, or Put) of the nearest live expiry,
 * built from the realtime cache and reactive to the index spot. Returns null
 * until option-chain data exists.
 */
export function useAtmStrikeSymbol(index: string, type: 'CE' | 'PE' = 'CE'): ChartSymbol | null {
  const q = useQuote(index)
  const spot = q?.ltp ?? 0

  const idxKey = useSyncExternalStore((cb) => subscribeIndex(index, cb), () => getExpiries(index).join('|'), () => '')
  const expiry = getExpiries(index)[0] ?? ''
  const ver = useSyncExternalStore((cb) => subscribeExpiry(index, expiry, cb), () => getExpiryVersion(index, expiry), () => 0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (!index || !expiry || spot <= 0) return null
    const step = index === 'SENSEX' ? 100 : 50
    const atm = Math.round(spot / step) * step
    const row = getStrikeRow(index, expiry, atm)
    const contract = type === 'PE' ? row?.PE : row?.CE
    if (!contract) return null
    return { key: contract.symbol, candleSymbol: contract.symbol, display: `${index} ${atm} ${type}`, kind: 'OPTION' }
  }, [index, expiry, ver, idxKey, spot, type])
}
