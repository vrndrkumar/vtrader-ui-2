// ── SimPayoffChart ────────────────────────────────────────────────────────────
// Dedicated payoff chart for the Option Simulator ONLY. Not shared with the rest
// of the app. A proper financial payoff: data-fit axes, ~90% plot usage, labelled
// current-spot, quiet strike ticks, dashed breakevens, subtle zones, crosshair
// tooltip and a live current-payoff marker.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { bsPrice } from './engine/blackScholes'
import type { OptionLeg } from '@/components/PayoffEChart'

echarts.use([LineChart, ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer])

const inrShort = (v: number) => { const a = Math.abs(v); return `${v < 0 ? '-' : ''}${a >= 1e5 ? (a / 1e5).toFixed(a >= 1e6 ? 0 : 1) + 'L' : a >= 1e3 ? Math.round(a / 1e3) + 'K' : Math.round(a)}` }
const inrFull = (v: number) => `${v < 0 ? '−' : '+'}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`

function useDark() {
  const [d, setD] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  useEffect(() => { const el = document.documentElement; const o = new MutationObserver(() => setD(el.classList.contains('dark'))); o.observe(el, { attributes: true, attributeFilter: ['class'] }); return () => o.disconnect() }, [])
  return d
}

function niceNum(x: number): number {
  if (x <= 0) return 1
  const e = Math.floor(Math.log10(x)), f = x / Math.pow(10, e)
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nf * Math.pow(10, e)
}

interface Computed {
  xs: number[]; expiry: number[]; today: number[]
  xMin: number; xMax: number; yMin: number; yMax: number; yStep: number; xStep: number
  breakevens: number[]; strikes: number[]; spotPayoff: number
}

function compute(legs: OptionLeg[], spot: number): Computed | null {
  if (!legs.length || spot <= 0) return null
  const strikes = [...new Set(legs.map(l => l.strike))].sort((a, b) => a - b)
  const at = (S: number) => {
    let ex = 0, td = 0
    for (const l of legs) {
      const intr = l.optType === 'CE' ? Math.max(S - l.strike, 0) : Math.max(l.strike - S, 0)
      ex += l.qty * (intr - l.entry)
      const T = Math.max(0.5, l.dte) / 365
      td += l.qty * (bsPrice(S, l.strike, T, l.iv || 0.15, l.optType) - l.entry)
    }
    return { ex, td }
  }
  // provisional focused range from spot + strikes
  const foc0 = [spot, ...strikes]
  const lo0 = Math.min(...foc0), hi0 = Math.max(...foc0)
  const span0 = hi0 - lo0
  const pad0 = Math.max(span0 * 0.45, spot * 0.05)
  let xMin = lo0 - pad0, xMax = hi0 + pad0
  const sample = (a: number, b: number) => {
    const N = 220, out: number[] = [], ex: number[] = [], td: number[] = []
    for (let i = 0; i <= N; i++) { const S = a + (b - a) * (i / N); const v = at(S); out.push(S); ex.push(v.ex); td.push(v.td) }
    return { out, ex, td }
  }
  // breakevens from a first pass, then widen range to include them
  const first = sample(xMin, xMax)
  const bes: number[] = []
  for (let i = 1; i < first.out.length; i++) { const a = first.ex[i - 1], b = first.ex[i]; if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) { const t = a / (a - b); bes.push(first.out[i - 1] + t * (first.out[i] - first.out[i - 1])) } }
  const foc = [spot, ...strikes, ...bes]
  const lo = Math.min(...foc), hi = Math.max(...foc)
  // Zoom IN on the tent: tight padding around spot/strikes/breakevens so the payoff
  // fills the width, and lock the tick grid to 100 strike points. Only widen the
  // tick beyond 100 if the strike window is genuinely large.
  const pad = Math.max((hi - lo) * 0.55, 300)
  const lox = lo - pad, hix = hi + pad
  const gridUnit = 100                                     // 100-point strike grid
  const xStep = Math.max(gridUnit, Math.ceil((hix - lox) / 14 / gridUnit) * gridUnit)
  xMin = Math.floor(lox / xStep) * xStep
  xMax = Math.ceil(hix / xStep) * xStep
  const s = sample(xMin, xMax)
  const xs = s.out.map(v => Math.round(v)), expiry = s.ex.map(Math.round), today = s.td.map(Math.round)

  // Y-range: DON'T give the whole panel to a deep-loss tail. Anchor the top to the
  // Y-axis is driven by MAX PROFIT so the payoff tent fills the frame instead of
  // being crushed by a huge loss tail. Symmetric around 0 (zero line dead-center):
  // yMax = +bound, yMin = -bound, where bound ≈ max profit (nice-rounded). Deep-loss
  // lines simply exit the bottom of the visible window (values stay exact — only the
  // view is zoomed in on the profit region).
  const maxV = Math.max(...expiry, ...today)          // profit side (may be ≤ 0)
  const minV = Math.min(...expiry, ...today)          // loss side
  const driver = Math.max(maxV, 0) > 1 ? Math.max(maxV, 0) : Math.abs(minV)  // fall back to loss if no capped profit
  const mag = Math.max(driver, 500)
  const yStep = niceNum(mag / 3)                      // ~3 ticks to reach the peak
  const bound = Math.ceil((mag * 1.12) / yStep) * yStep
  const yMax = bound
  const yMin = -bound

  // recompute breakevens on final grid + x tick step
  const bes2: number[] = []
  for (let i = 1; i < xs.length; i++) { const a = expiry[i - 1], b = expiry[i]; if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) { const t = a / (a - b); bes2.push(Math.round(xs[i - 1] + t * (xs[i] - xs[i - 1]))) } }
  const spotPayoff = at(spot).td
  return { xs, expiry, today, xMin, xMax, yMin, yMax, yStep, xStep, breakevens: bes2, strikes, spotPayoff }
}

function buildOption(c: Computed, spot: number, isDark: boolean) {
  const txt = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.5)'
  const title = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.4)'
  const grid = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(15,23,42,0.05)'
  const zero = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.32)'
  const axis = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.12)'
  const dotBg = isDark ? '#0b1220' : '#ffffff'
  const ttBg = isDark ? 'rgba(9,13,22,0.96)' : 'rgba(255,255,255,0.98)'
  const ttBd = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.12)'
  const areaOp = isDark ? 0.11 : 0.09

  const line = (data: number[]) => c.xs.map((x, i) => [x, data[i]])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const series: any[] = []

  // subtle zones hugging the expiry curve
  series.push({ type: 'line', data: c.xs.map((x, i) => [x, Math.max(c.expiry[i], 0)]), showSymbol: false, lineStyle: { width: 0 }, areaStyle: { origin: 0, color: '#16a34a', opacity: areaOp }, silent: true, z: 1 })
  series.push({ type: 'line', data: c.xs.map((x, i) => [x, Math.min(c.expiry[i], 0)]), showSymbol: false, lineStyle: { width: 0 }, areaStyle: { origin: 0, color: '#dc2626', opacity: areaOp }, silent: true, z: 1 })

  // breakeven dots (on zero) + strike ticks (triangles at bottom)
  series.push({ type: 'scatter', data: c.breakevens.map(be => [be, 0]), symbol: 'circle', symbolSize: 8, itemStyle: { color: '#6366F1', borderColor: dotBg, borderWidth: 2 }, silent: true, z: 7 })
  series.push({ type: 'scatter', data: c.strikes.map(k => [k, c.yMin]), symbol: 'triangle', symbolSize: 8, symbolOffset: [0, -4], itemStyle: { color: txt }, silent: true, z: 5,
    label: { show: true, position: 'bottom', distance: 2, formatter: (p: { value: [number, number] }) => p.value[0].toLocaleString('en-IN'), color: title, fontSize: 9 } })

  // markers via a silent carrier series
  const markData: { xAxis?: number; yAxis?: number; lineStyle: object; label: object }[] = [
    { yAxis: 0, lineStyle: { color: zero, width: 1.25 }, label: { show: false } },
    { xAxis: Math.round(spot), lineStyle: { color: '#EF4444', width: 2 }, label: { show: true, formatter: `SPOT ${Math.round(spot).toLocaleString('en-IN')}`, position: 'start', color: '#fff', backgroundColor: '#EF4444', padding: [3, 6], borderRadius: 3, fontSize: 9, fontWeight: 'bold' } },
  ]
  c.breakevens.forEach((be, i) => markData.push({ xAxis: be, lineStyle: { color: '#818CF8', width: 1.5, type: 'dashed' }, label: { show: true, formatter: `BE ${be.toLocaleString('en-IN')}`, position: i % 2 ? 'insideEndBottom' : 'insideEndTop', color: '#6366F1', fontSize: 9, fontWeight: 'bold' } }))
  series.push({ type: 'line', data: [], silent: true, markLine: { silent: true, symbol: ['none', 'none'], data: markData } })

  // curves
  series.push({ name: 'At expiry', type: 'line', data: line(c.expiry), smooth: false, showSymbol: false, lineStyle: { color: '#16a34a', width: 2.5 }, z: 4 })
  series.push({ name: 'Now', type: 'line', data: line(c.today), smooth: true, showSymbol: false, lineStyle: { color: '#3b82f6', width: 2, type: 'dashed' }, z: 3 })

  // current payoff marker on the Now curve at spot
  series.push({ type: 'scatter', data: [[Math.round(spot), Math.round(c.spotPayoff)]], symbol: 'circle', symbolSize: 9, itemStyle: { color: '#3b82f6', borderColor: dotBg, borderWidth: 2 }, silent: true, z: 8,
    label: { show: true, position: 'right', distance: 6, formatter: inrFull(c.spotPayoff), backgroundColor: c.spotPayoff >= 0 ? '#16a34a' : '#dc2626', color: '#fff', padding: [3, 6], borderRadius: 4, fontSize: 10, fontWeight: 'bold' } })

  return {
    animation: false, backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis', backgroundColor: ttBg, borderColor: ttBd, borderWidth: 1, padding: [9, 12], textStyle: { color: txt, fontSize: 11 },
      axisPointer: { type: 'line', lineStyle: { color: axis, width: 1, type: 'dashed' } },
      formatter: (params: unknown) => {
        const ps = (params as Array<{ seriesName?: string; value: [number, number] }>).filter(p => p.seriesName === 'At expiry' || p.seriesName === 'Now')
        if (!ps.length) return ''
        const price = ps[0]?.value[0] ?? 0
        let html = `<div style="font-size:10px;font-weight:700;letter-spacing:0.04em;margin-bottom:6px;color:${txt}">Underlying ${Math.round(price).toLocaleString('en-IN')}</div>`
        for (const p of ps) { const v = p.value[1] ?? 0; const col = v >= 0 ? '#16a34a' : '#dc2626'; html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px"><span style="font-size:10px;color:${txt};width:42px">${p.seriesName}</span><span style="font-size:12px;font-weight:800;color:${col}">${inrFull(v)}</span></div>` }
        return html
      },
    },
    grid: { left: 64, right: 18, top: 20, bottom: 40, containLabel: false },
    xAxis: {
      type: 'value', min: c.xMin, max: c.xMax, interval: c.xStep,
      name: 'Underlying price', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: title, fontSize: 10, fontWeight: 500 },
      axisLabel: { color: txt, fontSize: 10, formatter: (v: number) => Math.round(v).toLocaleString('en-IN'), margin: 8 },
      splitLine: { lineStyle: { color: grid } }, axisLine: { lineStyle: { color: axis } }, axisTick: { show: false },
    },
    yAxis: {
      type: 'value', min: c.yMin, max: c.yMax, interval: c.yStep,
      name: 'P&L (₹)', nameLocation: 'middle', nameGap: 48, nameTextStyle: { color: title, fontSize: 10, fontWeight: 500 },
      axisLabel: { color: txt, fontSize: 10, formatter: (v: number) => Math.abs(v) < 1 ? '0' : inrShort(v), margin: 8 },
      splitLine: { lineStyle: { color: grid } }, axisLine: { show: false }, axisTick: { show: false },
    },
    series,
  }
}

export function SimPayoffChart({ legs, spot, step }: { legs: OptionLeg[]; spot: number; step: number }) {
  const isDark = useDark()
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)
  const c = useMemo(() => compute(legs, spot), [legs, spot, step])

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current); inst.current = chart
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); chart.dispose() }
  }, [])
  useEffect(() => { if (c) inst.current?.setOption(buildOption(c, spot, isDark), { notMerge: true }) }, [c, spot, isDark])

  if (!c) return <div className="flex-1 flex items-center justify-center text-[12px] text-slate-300 dark:text-white/20">Build a strategy to see payoff</div>
  return <div ref={ref} className="w-full h-full" />
}
