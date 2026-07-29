// ── Countdown to bar close ───────────────────────────────────────────────────
// TradingView-style timer at the last price showing time until the current
// candle closes. Aligned to the SAME epoch bucketing the forming candle uses, so
// it matches the chart. Intraday only (D/W/M bar-close = session/calendar, n/a).

import { useEffect, useRef } from 'react'
import type { ChartEngine } from './ChartEngine'
import { TF_MINUTES, type Timeframe } from '../types/market'

const p2 = (n: number) => String(n).padStart(2, '0')

export function BarCountdown({ engineRef, ltp, timeframe }: {
  engineRef: React.MutableRefObject<ChartEngine | null>
  ltp: number
  timeframe: Timeframe
}) {
  const ref = useRef<HTMLDivElement>(null)
  const intraday = timeframe !== 'D' && timeframe !== 'W' && timeframe !== 'M'

  useEffect(() => {
    if (!intraday) return
    const bucketMs = TF_MINUTES[timeframe] * 60_000
    let raf = 0
    const tick = () => {
      const el = ref.current
      const eng = engineRef.current
      if (el && eng) {
        const y = ltp > 0 ? eng.priceToY(ltp) : null
        if (y == null) { el.style.opacity = '0' }
        else {
          el.style.opacity = '1'
          el.style.top = `${y + 13}px` // sit just BELOW the last-price label (no overlap)
          const s = Math.max(0, Math.round((bucketMs - (Date.now() % bucketMs)) / 1000))
          el.textContent = TF_MINUTES[timeframe] >= 60
            ? `${Math.floor(s / 3600)}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`
            : `${p2(Math.floor(s / 60))}:${p2(s % 60)}`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engineRef, ltp, timeframe, intraday])

  if (!intraday) return null
  return (
    <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
      <div ref={ref} style={{ right: 2 }}
        className="absolute h-[16px] px-1.5 grid place-items-center rounded bg-slate-900/90 text-white text-[10px] font-bold tabular-nums ring-1 ring-white/15 shadow opacity-0" />
    </div>
  )
}
