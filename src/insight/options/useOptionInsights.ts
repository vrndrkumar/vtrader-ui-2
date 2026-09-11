// ── Live data plumbing for Option Insights ───────────────────────────────────
// Subscribes the shared WS (index ticks, option chain, VIX), keeps intraday
// candles fresh (bypasses the immutable-history cache on purpose), and
// recomputes the engine on a throttle whenever new live data arrives.
import { useEffect, useRef, useState } from 'react'
import { axiosCandle } from '@/api/axios'
import { realtime } from '@/trade/data/realtime/realtimeService'
import { useQuote } from '@/trade/store/marketStore'
import {
  getExpiries, getSortedStrikes, getStrikeRow, subscribeExpiry, subscribeIndex,
} from '@/trade/data/realtime/optionChainCache'

const istNow = () => {
  const ist = new Date(Date.now() + 5.5 * 3600e3)
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), d: ist.getUTCDate(), hh: ist.getUTCHours(), mm: ist.getUTCMinutes() }
}
import { analyseOptions, type ChainStrikeInput, type EngineInput, type EngineMemory, type OptionInsightsReport } from './engine'
import type { OCandle } from './indicators'

export type OptIndex = 'NIFTY' | 'BANKNIFTY' | 'SENSEX'

const RECOMPUTE_MS = 3000
const CANDLE_REFRESH_MS = 45_000

// NOTE: Option-Lab logging is now done SERVER-SIDE by the headless runner
// (insight-server/src/optionRunner.js) — the single source of truth, like Stock
// Lab. The browser no longer posts signals, to avoid double-logging the same
// decision from two producers.

const fmt = (d: Date) => d.toISOString().slice(0, 10)

async function fetchFresh(symbol: string, frequency: string, days: number): Promise<OCandle[]> {
  const to = new Date()
  const from = new Date(to.getTime() - days * 864e5)
  const { data } = await axiosCandle.get('/data/candle', {
    params: { symbol, from: fmt(from), to: fmt(to), frequency },
  })
  const raw: unknown[] = Array.isArray(data?.candles) ? data.candles : []
  return raw
    .filter((c: any) => Number.isFinite(c?.close))
    .map((c: any) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 }))
    .sort((a, b) => a.time - b.time)
}

function chainInput(index: string, expiry: string): ChainStrikeInput[] {
  return getSortedStrikes(index, expiry).map((strike) => {
    const row = getStrikeRow(index, expiry, strike)
    const m = (c?: { ltp: number; volume: number; bidPrice: number; askPrice: number; symbol: string; oi?: number; iv?: number; greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number } }) =>
      c ? {
        ltp: c.ltp, volume: c.volume ?? 0, bid: c.bidPrice ?? 0, ask: c.askPrice ?? 0, symbol: c.symbol,
        oi: c.oi ?? null, iv: c.iv ?? null,
        delta: c.greeks?.delta ?? null, gamma: c.greeks?.gamma ?? null, theta: c.greeks?.theta ?? null, vega: c.greeks?.vega ?? null,
      } : undefined
    return { strike, ce: m(row?.CE), pe: m(row?.PE) }
  })
}

export function useOptionInsights(index: OptIndex) {
  const [report, setReport] = useState<OptionInsightsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [candleError, setCandleError] = useState<string | null>(null)

  const spotQ = useQuote(index)
  const vixQ = useQuote('INDIAVIX')

  const candlesRef = useRef<{ daily: OCandle[]; m3: OCandle[]; m5: OCandle[]; m15: OCandle[]; m30: OCandle[] }>({
    daily: [], m3: [], m5: [], m15: [], m30: [],
  })
  const vixPrevCloseRef = useRef<number | null>(null)
  const memoryRef = useRef<EngineMemory | null>(null) // market memory — session continuity
  const dirtyRef = useRef(true)
  const spotRef = useRef(spotQ)
  const vixRef = useRef(vixQ)
  spotRef.current = spotQ
  vixRef.current = vixQ
  useEffect(() => { dirtyRef.current = true }, [spotQ?.ltp, vixQ?.ltp])

  // index change → reset everything tied to the previous instrument. Without
  // this, stale candles from the old index (e.g. NIFTY) get evaluated under the
  // new index's chain/spot (e.g. SENSEX) until the refetch lands — producing
  // wrong pivots/levels (the "SENSEX S1 = 24,188" cross-wiring bug).
  useEffect(() => {
    memoryRef.current = null
    candlesRef.current = { daily: [], m3: [], m5: [], m15: [], m30: [] }
    vixPrevCloseRef.current = null
    setReport(null)
    setLoading(true)
    dirtyRef.current = true
  }, [index])

  // WS subscriptions (ref-counted by the shared manager)
  useEffect(() => {
    realtime.start()
    const u1 = realtime.subscribeIndexTick(index)
    const u2 = realtime.subscribeOptionChain(index)
    const u3 = realtime.subscribeIndexTick('INDIAVIX')
    return () => { u1(); u2(); u3() }
  }, [index])

  // chain change → dirty
  useEffect(() => {
    const un1 = subscribeIndex(index, () => { dirtyRef.current = true })
    const exp = getExpiries(index)[0] ?? ''
    const un2 = exp ? subscribeExpiry(index, exp, () => { dirtyRef.current = true }) : () => {}
    return () => { un1(); un2() }
  }, [index, report?.chain.expiry])

  // candles: initial + periodic refresh (today's bars change — no immutable cache)
  useEffect(() => {
    let stop = false
    async function refresh() {
      try {
        const [daily, m3, m5, m15, m30, vixDaily] = await Promise.all([
          fetchFresh(index, 'D', 30),
          fetchFresh(index, '3', 4),
          fetchFresh(index, '5', 6),
          fetchFresh(index, '15', 12),
          fetchFresh(index, '30', 20),
          fetchFresh('INDIAVIX', 'D', 10),
        ])
        if (stop) return
        candlesRef.current = { daily, m3, m5, m15, m30 }
        if (vixDaily.length >= 2) vixPrevCloseRef.current = vixDaily[vixDaily.length - 2].close
        setCandleError(null)
        dirtyRef.current = true
      } catch (e: unknown) {
        if (!stop) setCandleError((e as Error)?.message ?? 'candle fetch failed')
      }
    }
    void refresh()
    const t = setInterval(refresh, CANDLE_REFRESH_MS)
    return () => { stop = true; clearInterval(t) }
  }, [index])

  // throttled recompute loop
  useEffect(() => {
    const tick = () => {
      if (!dirtyRef.current && report) return
      const c = candlesRef.current
      if (!c.daily.length) return
      dirtyRef.current = false
      const expiries = getExpiries(index)
      const chainExpiry = expiries[0] ?? null
      const input: EngineInput = {
        index,
        nowIst: istNow(),
        spot: spotRef.current?.ltp ?? null,
        spotTs: spotRef.current?.ts ?? null,
        vix: vixRef.current?.ltp ?? null,
        vixPrevClose: vixPrevCloseRef.current,
        daily: c.daily,
        tf: { m3: c.m3, m5: c.m5, m15: c.m15, m30: c.m30 },
        expiries,
        chain: chainExpiry ? chainInput(index, chainExpiry) : [],
        chainExpiry,
      }
      try {
        const rep = analyseOptions(input, memoryRef.current)
        memoryRef.current = rep.memory
        setReport(rep)
        setLoading(false)
        // (Option-Lab logging happens server-side now — see optionRunner.js)
      } catch (e) {
        console.error('option insights engine failed:', e)
      }
    }
    tick()
    const t = setInterval(tick, RECOMPUTE_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  return { report, loading, candleError }
}
