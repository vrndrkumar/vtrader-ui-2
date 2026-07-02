import { useMemo } from 'react'
import { useQuote } from '../../store/marketStore'
import { buildOptionChain } from '../../data/optionChainMock'
import type { OptionChain } from '../../types/options'

/** Builds a stable option chain snapshot, rebuilt only when ATM or expiry changes. */
export function useOptionChain(symbolCode: string, expiry: string): OptionChain {
  const q = useQuote(symbolCode)
  const step = symbolCode === 'SENSEX' ? 100 : 50
  const spot = q?.ltp ?? (symbolCode === 'SENSEX' ? 77000 : 24100)
  const chg = q?.chg ?? 0
  const atm = Math.round(spot / step) * step
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildOptionChain(symbolCode, spot, chg, expiry), [symbolCode, atm, expiry])
}
