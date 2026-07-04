import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useQuote } from '../../store/marketStore'
import { realtime } from '../../data/realtime/realtimeService'
import {
  getExpiries, getExpiryVersion, getSortedStrikes, getStrikeRow, subscribeExpiry, subscribeIndex,
  type OptionContract,
} from '../../data/realtime/optionChainCache'
import type { OcSide, OptionChain } from '../../types/options'

function sideFrom(c: OptionContract): OcSide {
  return {
    ltp: c.ltp,
    ltpChgPct: c.openLtp ? +(((c.ltp - c.openLtp) / c.openLtp) * 100).toFixed(0) : 0,
    oi: c.oi, oiChgPct: c.oiChg, iv: c.iv, // undefined until the feed carries them
  }
}

function buildLiveChain(index: string, expiry: string, spot: number, spotChg: number, spotChgPct: number, step: number): OptionChain {
  const atm = spot > 0 ? Math.round(spot / step) * step : 0
  const strikes = expiry ? getSortedStrikes(index, expiry) : []
  const rows = strikes.map((strike) => {
    const row = getStrikeRow(index, expiry, strike)
    return { strike, call: row?.CE ? sideFrom(row.CE) : undefined, put: row?.PE ? sideFrom(row.PE) : undefined }
  })
  // Markers (Max Pain / OI support/resistance) require OI, which the feed does
  // not yet carry — set to -1 so nothing false is highlighted.
  return { symbolCode: index, expiry, spot, spotChg, spotChgPct, atm, maxPain: -1, oiSupport: -1, oiResistance: -1, rows }
}

/**
 * Live option chain for an index, built ONLY from the realtime cache (live feed
 * or last persisted snapshot). No mock/synthetic data. Returns the chain plus
 * the list of expiries the feed has actually delivered.
 */
export function useLiveOptionChain(symbolCode: string, expiry: string): { chain: OptionChain; expiries: string[] } {
  useEffect(() => {
    realtime.start()
    const u1 = realtime.subscribeOptionChain(symbolCode)
    const u2 = realtime.subscribeIndexTick(symbolCode)
    return () => { u1(); u2() }
  }, [symbolCode])

  const q = useQuote(symbolCode)
  const step = symbolCode === 'SENSEX' ? 100 : 50
  const spot = q?.ltp ?? 0
  const spotChg = q?.chg ?? 0
  const spotChgPct = q?.chgPct ?? 0

  const expiriesKey = useSyncExternalStore(
    (cb) => subscribeIndex(symbolCode, cb),
    () => getExpiries(symbolCode).join('|'),
    () => '',
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const expiries = useMemo(() => getExpiries(symbolCode), [symbolCode, expiriesKey])

  const version = useSyncExternalStore(
    (cb) => subscribeExpiry(symbolCode, expiry || '', cb),
    () => getExpiryVersion(symbolCode, expiry || ''),
    () => 0,
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chain = useMemo(
    () => buildLiveChain(symbolCode, expiry, spot, spotChg, spotChgPct, step),
    [symbolCode, expiry, version, spot, spotChg, spotChgPct, step],
  )

  return { chain, expiries }
}
