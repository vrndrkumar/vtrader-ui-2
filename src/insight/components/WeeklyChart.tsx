import { useMemo } from 'react'
import type { InsightCandle, Zone } from '../types'

// ── Lightweight SVG weekly chart: candles + key zones + volume + RSI ─────────

interface Props {
  candles: InsightCandle[]
  keyZones: Zone[]
  /** Controls x-axis tick labels: daily/weekly → "MMM", monthly → "MMM yy" */
  timeframe?: 'daily' | 'weekly' | 'monthly'
}

function computeRsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length <= period) return out
  let g = 0
  let l = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) g += d
    else l -= d
  }
  let ag = g / period
  let al = l / period
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    ag = (ag * (period - 1) + Math.max(d, 0)) / period
    al = (al * (period - 1) + Math.max(-d, 0)) / period
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
  }
  return out
}

const UP = '#10b981'
const DOWN = '#ef4444'

export function WeeklyChart({ candles, keyZones, timeframe = 'weekly' }: Props) {
  const W = 760
  const PRICE_H = 260
  const VOL_H = 70
  const RSI_H = 70
  const GAP = 18
  const PAD_R = 56
  const PAD_L = 8
  const H = PRICE_H + VOL_H + RSI_H + GAP * 2 + 24

  const model = useMemo(() => {
    if (!candles.length) return null
    const lo = Math.min(...candles.map((c) => c.low))
    const hi = Math.max(...candles.map((c) => c.high))
    const span = hi - lo || 1
    const maxVol = Math.max(...candles.map((c) => c.volume)) || 1
    const n = candles.length
    const chartW = W - PAD_L - PAD_R
    const step = chartW / n
    const bw = Math.max(2, step * 0.6)
    const x = (i: number) => PAD_L + i * step + step / 2
    const y = (p: number) => 12 + ((hi - p) / span) * (PRICE_H - 24)
    const rsiArr = computeRsi(candles.map((c) => c.close))
    const volTop = PRICE_H + GAP
    const rsiTop = PRICE_H + GAP + VOL_H + GAP
    const yRsi = (v: number) => rsiTop + ((100 - v) / 100) * RSI_H
    const last = candles[n - 1]
    return { lo, hi, span, maxVol, n, step, bw, x, y, rsiArr, volTop, rsiTop, yRsi, last }
  }, [candles])

  if (!model) {
    return <div className="h-64 flex items-center justify-center text-sm text-slate-400">No weekly data</div>
  }

  const { hi, lo, maxVol, n, bw, x, y, rsiArr, volTop, rsiTop, yRsi, last } = model

  const gridPrices = [0.25, 0.5, 0.75].map((f) => lo + (hi - lo) * f)
  const rsiPath = rsiArr
    .map((v, i) => (v == null ? null : `${i === 0 || rsiArr[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${yRsi(v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ')
  const lastRsi = [...rsiArr].reverse().find((v) => v != null)

  const fmtTick = (t: number) => {
    const d = new Date(t * 1000)
    // long spans (monthly view) need the year to stay readable
    return timeframe === 'monthly'
      ? d.toLocaleString('en-IN', { month: 'short', year: '2-digit' })
      : d.toLocaleString('en-IN', { month: 'short' })
  }
  const ticks: { i: number; label: string }[] = []
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 8))) ticks.push({ i, label: fmtTick(candles[i].time) })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="Weekly chart">
      {/* price grid */}
      {gridPrices.map((p) => (
        <g key={p}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(p)} y2={y(p)} className="stroke-slate-200 dark:stroke-slate-700/60" strokeDasharray="3 4" strokeWidth="1" />
          <text x={W - PAD_R + 6} y={y(p) + 3.5} className="fill-slate-400 text-[10px]">{p.toFixed(0)}</text>
        </g>
      ))}

      {/* key zones */}
      {keyZones.map((z, zi) => {
        const top = y(Math.min(z.hi, hi))
        const bot = y(Math.max(z.lo, lo))
        if (bot < 0 || top > PRICE_H) return null
        const isSup = z.kind === 'SUPPORT'
        return (
          <g key={zi}>
            <rect
              x={PAD_L}
              y={Math.min(top, bot)}
              width={W - PAD_L - PAD_R}
              height={Math.max(4, Math.abs(bot - top))}
              className={isSup ? 'fill-emerald-500/15' : 'fill-amber-500/15'}
            />
            <text x={PAD_L + 4} y={Math.min(top, bot) + 11} className={`text-[9px] font-semibold ${isSup ? 'fill-emerald-600' : 'fill-amber-600'}`}>
              {isSup ? 'Key demand' : 'Key supply'} {z.lo.toFixed(0)}–{z.hi.toFixed(0)} ({z.touches}×)
            </text>
          </g>
        )
      })}

      {/* candles */}
      {candles.map((c, i) => {
        const up = c.close >= c.open
        const color = up ? UP : DOWN
        return (
          <g key={c.time}>
            <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1" />
            <rect
              x={x(i) - bw / 2}
              y={y(Math.max(c.open, c.close))}
              width={bw}
              height={Math.max(1, Math.abs(y(c.open) - y(c.close)))}
              fill={color}
            />
          </g>
        )
      })}

      {/* last price marker */}
      <line x1={PAD_L} x2={W - PAD_R} y1={y(last.close)} y2={y(last.close)} stroke="#2563eb" strokeWidth="1" strokeDasharray="2 3" />
      <rect x={W - PAD_R + 2} y={y(last.close) - 9} width={PAD_R - 4} height={18} rx={4} fill="#2563eb" />
      <text x={W - PAD_R + (PAD_R - 4) / 2 + 2} y={y(last.close) + 3.5} textAnchor="middle" className="fill-white text-[10px] font-semibold">
        {last.close.toFixed(1)}
      </text>

      {/* month ticks */}
      {ticks.map((t) => (
        <text key={t.i} x={x(t.i)} y={PRICE_H + 12} textAnchor="middle" className="fill-slate-400 text-[9px]">{t.label}</text>
      ))}

      {/* volume pane */}
      <text x={PAD_L} y={volTop + 10} className="fill-slate-400 text-[9px] font-semibold">VOLUME</text>
      {candles.map((c, i) => {
        const h = (c.volume / maxVol) * (VOL_H - 14)
        return (
          <rect
            key={c.time}
            x={x(i) - bw / 2}
            y={volTop + VOL_H - h}
            width={bw}
            height={h}
            fill={c.close >= c.open ? UP : DOWN}
            opacity={0.55}
          />
        )
      })}

      {/* RSI pane */}
      <text x={PAD_L} y={rsiTop + 10} className="fill-slate-400 text-[9px] font-semibold">RSI (14)</text>
      {[30, 50, 70].map((v) => (
        <line key={v} x1={PAD_L} x2={W - PAD_R} y1={yRsi(v)} y2={yRsi(v)} className="stroke-slate-200 dark:stroke-slate-700/60" strokeDasharray="2 4" strokeWidth="1" />
      ))}
      <text x={W - PAD_R + 6} y={yRsi(70) + 3} className="fill-slate-400 text-[9px]">70</text>
      <text x={W - PAD_R + 6} y={yRsi(30) + 3} className="fill-slate-400 text-[9px]">30</text>
      <path d={rsiPath} fill="none" stroke="#8b5cf6" strokeWidth="1.5" />
      {lastRsi != null && (
        <g>
          <rect x={W - PAD_R + 2} y={yRsi(lastRsi) - 8} width={PAD_R - 20} height={16} rx={4} fill="#8b5cf6" />
          <text x={W - PAD_R + (PAD_R - 20) / 2 + 2} y={yRsi(lastRsi) + 3.5} textAnchor="middle" className="fill-white text-[9px] font-semibold">
            {lastRsi.toFixed(1)}
          </text>
        </g>
      )}
    </svg>
  )
}
