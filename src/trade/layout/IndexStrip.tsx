import { Fragment, useEffect } from 'react'
import { useChartStore } from '../store/chartStore'
import { realtime } from '../data/realtime/realtimeService'
import { STRIP_INDICES, EXCHANGE_ORDER } from '../config/indices'
import { IndexCard } from './IndexCard'

export function IndexStrip() {
  const symbolCode = useChartStore((s) => s.symbolCode)
  const setSymbol = useChartStore((s) => s.setSymbol)

  // Keep every configured index subscribed (ref-counted; reserved card either way).
  useEffect(() => {
    realtime.start()
    const codes = STRIP_INDICES.map((i) => i.code)
    // Fetch prev-close + seed price ONCE on load. After that prices track purely
    // through the WebSocket — no repeated /data/quotes polling.
    realtime.primeIndices(codes)
    const unsubs = STRIP_INDICES.map((i) => realtime.subscribeIndexTick(i.code))
    return () => { unsubs.forEach((u) => u()) }
  }, [])

  return (
    <div className="flex-1 min-w-0 flex items-stretch overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {EXCHANGE_ORDER.map((ex) => {
        const group = STRIP_INDICES.filter((i) => i.exchange === ex)
        if (!group.length) return null
        return (
          <Fragment key={ex}>
            <div className="shrink-0 flex flex-col justify-center px-2 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-white/[0.04]">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 [writing-mode:vertical-lr] rotate-180">{ex}</span>
            </div>
            {group.map((cfg) => (
              <IndexCard key={cfg.code} cfg={cfg} active={cfg.selectable ? symbolCode === cfg.code : false} onSelect={() => setSymbol(cfg.code)} />
            ))}
          </Fragment>
        )
      })}
    </div>
  )
}
