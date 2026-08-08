// ── Shared payoff engine + ECharts renderer ──────────────────────────────────
// Single source of truth for the payoff diagram used by both the dashboard
// (Strategy Deep Dive) and the Trade module (Strategy section) — identical
// look, feel, and calculation logic.

import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer])

// ── Formatters ────────────────────────────────────────────────────────────────

export function inr(n: number, compact = false): string {
  const a = Math.abs(n)
  if (compact) {
    if (a >= 100_000) return `${(a / 100_000).toFixed(1)}L`
    if (a >= 1_000)   return `${Math.round(a / 1_000)}K`
    return `${Math.round(a)}`
  }
  return a.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}
const yFmt = (v: number) => `${v < 0 ? '-' : ''}${inr(v, true)}`

// ── Dark-mode detection ───────────────────────────────────────────────────────

export function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

// ── Black-Scholes ─────────────────────────────────────────────────────────────

function ncdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}
function bsPrice(S: number, K: number, T: number, sigma: number, type: 'CE' | 'PE'): number {
  if (T <= 0 || sigma <= 0) return type === 'CE' ? Math.max(S - K, 0) : Math.max(K - S, 0)
  const sq = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (0.065 + sigma * sigma / 2) * T) / (sigma * sq)
  const d2 = d1 - sigma * sq
  const df = Math.exp(-0.065 * T)
  return type === 'CE' ? S * ncdf(d1) - K * df * ncdf(d2) : K * df * ncdf(-d2) - S * ncdf(-d1)
}

// ── Payoff engine ─────────────────────────────────────────────────────────────

export interface OptionLeg { optType: 'CE' | 'PE'; strike: number; qty: number; entry: number; dte: number; iv: number }
export interface PayoffPoint { price: number; expiry: number; today: number }

// X range fixed to the option STRIKES (not spot) → stable between ticks.
export function computePayoffCurve(legs: OptionLeg[], dteOverride?: number, N = 240): PayoffPoint[] {
  if (!legs.length) return []
  const strikes = legs.map(l => l.strike)
  const minStrike = Math.min(...strikes), maxStrike = Math.max(...strikes)
  const center = (minStrike + maxStrike) / 2
  const spread = Math.max(maxStrike - minStrike, center * 0.08)
  const lo = center - spread * 2.4, hi = center + spread * 2.4
  return Array.from({ length: N + 1 }, (_, i) => {
    const S = lo + (hi - lo) * (i / N)
    let expiryPnl = 0, todayPnl = 0
    for (const l of legs) {
      const intrinsic = l.optType === 'CE' ? Math.max(S - l.strike, 0) : Math.max(l.strike - S, 0)
      expiryPnl += l.qty * (intrinsic - l.entry)
      const T = Math.max(0.5, dteOverride ?? l.dte) / 365
      todayPnl += l.qty * (bsPrice(S, l.strike, T, l.iv, l.optType) - l.entry)
    }
    return { price: Math.round(S), expiry: Math.round(expiryPnl), today: Math.round(todayPnl) }
  })
}

export function findBreakevenPrices(data: PayoffPoint[]): number[] {
  const bes: number[] = []
  for (let i = 1; i < data.length; i++) {
    const a = data[i - 1], b = data[i]
    if ((a.expiry <= 0 && b.expiry > 0) || (a.expiry >= 0 && b.expiry < 0)) {
      const t = a.expiry / (a.expiry - b.expiry)
      bes.push(Math.round(a.price + t * (b.price - a.price)))
    }
  }
  return bes
}

export interface PayoffStats { maxProfit: number; maxLoss: number; breakevens: number[]; pop: number }

// Probability-weighted POP + max/loss/breakevens over the curve.
export function computeStats(data: PayoffPoint[], spot: number, dteDays: number): PayoffStats {
  if (!data.length) return { maxProfit: 0, maxLoss: 0, breakevens: [], pop: 0 }
  const ex = data.map(d => d.expiry)
  const maxProfit = Math.max(...ex), maxLoss = Math.min(...ex)
  const breakevens = findBreakevenPrices(data)
  let pop = 0
  if (spot > 0 && dteDays > 0) {
    const sd = 0.20 * Math.sqrt(Math.max(dteDays, 0.5) / 365)
    let wSum = 0, wProfit = 0
    for (const d of data) {
      if (d.price <= 0) continue
      const z = (Math.log(d.price / spot) + 0.5 * sd * sd) / sd
      const w = Math.exp(-0.5 * z * z)
      wSum += w
      if (d.expiry >= 0) wProfit += w
    }
    pop = wSum > 0 ? Math.round((wProfit / wSum) * 100) : 0
  } else {
    pop = Math.round((ex.filter(v => v >= 0).length / ex.length) * 100)
  }
  return { maxProfit, maxLoss, breakevens, pop }
}

// ── ECharts option builder ────────────────────────────────────────────────────

function buildPayoffOption(data: PayoffPoint[], spot: number, dteDays: number, targetPct: number, isDark: boolean, breakevens: number[]) {
  if (!data.length) return {}
  const ex = data.map(d => d.expiry)
  const maxP = Math.max(...ex), maxL = Math.min(...ex)
  const pAbs = Math.max(Math.abs(maxP), 500)
  const rawHalf = Math.max(pAbs, Math.min(Math.abs(maxL), pAbs * 3)) * 1.15
  const niceNum = (x: number) => {
    if (x <= 0) return 1
    const e = Math.floor(Math.log10(x)), f = x / Math.pow(10, e)
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
    return nf * Math.pow(10, e)
  }
  const yStep = niceNum(rawHalf / 3)
  const halfY = Math.ceil(rawHalf / yStep) * yStep
  const targetPrice = spot > 0 ? Math.round(spot * (1 + targetPct / 100)) : 0
  const sdVol = spot > 0 && dteDays > 0 ? spot * 0.20 * Math.sqrt(Math.max(dteDays, 1) / 365) : 0

  const txt  = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.5)'
  const grid = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)'
  const axis = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.12)'
  const zero = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.25)'
  const ttBg = isDark ? 'rgba(7,11,22,0.96)' : 'rgba(255,255,255,0.98)'
  const ttBd = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.12)'
  const dotBg = isDark ? '#151c2e' : '#ffffff'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const series: any[] = []

  series.push({
    name: '_base', type: 'line', data: [], silent: true, legendHoverLink: false,
    markLine: { silent: true, symbol: ['none', 'none'], data: [{ yAxis: 0, lineStyle: { color: zero, width: 1.25 }, label: { show: false } }] },
  })

  if (sdVol > 0) {
    series.push({
      name: '_sd', type: 'line', data: [], silent: true, legendHoverLink: false,
      markLine: {
        silent: true, symbol: ['none', 'none'],
        lineStyle: { type: 'dashed', width: 1, color: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.16)' },
        label: { fontSize: 8, color: isDark ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.5)', fontWeight: 'normal' },
        data: [
          { xAxis: Math.round(spot - 2 * sdVol), label: { formatter: '-2σ', position: 'insideStartTop' } },
          { xAxis: Math.round(spot - sdVol),     label: { formatter: '-1σ', position: 'insideStartTop' } },
          { xAxis: Math.round(spot + sdVol),     label: { formatter: '+1σ', position: 'insideStartTop' } },
          { xAxis: Math.round(spot + 2 * sdVol), label: { formatter: '+2σ', position: 'insideStartTop' } },
        ],
      },
    })
  }

  if (breakevens.length > 0) {
    series.push({
      name: '_be', type: 'line', data: [], silent: true, legendHoverLink: false,
      markLine: {
        silent: true, symbol: ['none', 'none'], lineStyle: { type: 'dashed', width: 1.5, color: '#818CF8' },
        data: breakevens.map((be, i) => ({ xAxis: be, label: { show: true, formatter: `BE ${be.toLocaleString('en-IN')}`, position: i % 2 === 0 ? 'insideStartTop' : 'insideStartBottom', fontSize: 9, fontWeight: 'bold', color: '#818CF8', offset: [4, 4] } })),
      },
    })
    series.push({ name: '_beDots', type: 'scatter', data: breakevens.map(be => [be, 0]), symbol: 'circle', symbolSize: 9, itemStyle: { color: '#818CF8', borderColor: dotBg, borderWidth: 2.5 }, silent: true, legendHoverLink: false, z: 6 })
  }

  if (spot > 0) {
    series.push({
      name: '_spot', type: 'line', data: [], silent: true, legendHoverLink: false,
      markLine: { silent: true, symbol: ['none', 'none'], data: [{ xAxis: Math.round(spot), lineStyle: { color: '#EF4444', width: 1.75 }, label: { show: true, formatter: `${Math.round(spot).toLocaleString('en-IN')}`, position: 'insideStartTop', color: '#EF4444', fontWeight: 700, fontSize: 10, offset: [4, 4] } }] },
    })
  }

  const projPrice = targetPrice > 0 ? targetPrice : Math.round(spot)
  if (projPrice > 0 && data.length) {
    const idx = data.reduce((b, d, i) => Math.abs(d.price - projPrice) < Math.abs(data[b].price - projPrice) ? i : b, 0)
    const pl = data[idx]?.today ?? 0
    const projGreen = pl >= 0
    series.push({
      name: '_proj', type: 'scatter', data: [[projPrice, -halfY * 0.86]], symbolSize: 1, silent: true, legendHoverLink: false, z: 8,
      label: { show: true, position: 'bottom', distance: 2, formatter: `Projected ${projGreen ? 'profit' : 'loss'}: ${projGreen ? '+' : '−'}₹${inr(Math.abs(pl))}`, backgroundColor: projGreen ? '#10B981' : '#EF4444', color: '#fff', fontSize: 9, fontWeight: 'bold', padding: [3, 7], borderRadius: 5 },
    })
    if (Math.abs(targetPct) >= 0.1) {
      series.push({
        name: '_target', type: 'line', data: [], silent: true, legendHoverLink: false,
        markLine: { silent: true, symbol: ['none', 'none'], data: [{ xAxis: projPrice, lineStyle: { color: '#F59E0B', width: 1.5, type: 'dashed' }, label: { show: true, formatter: `${projPrice.toLocaleString('en-IN')}`, position: targetPct > 0 ? 'insideEndBottom' : 'insideStartBottom', color: '#F59E0B', fontWeight: 700, fontSize: 9, offset: [4, -4] } }] },
      })
    }
  }

  const areaOp = isDark ? 0.12 : 0.10
  series.push({ name: '_profitArea', type: 'line', data: data.map(d => [d.price, Math.max(d.expiry, 0)]), smooth: false, showSymbol: false, lineStyle: { width: 0 }, areaStyle: { origin: 0, color: '#10B981', opacity: areaOp }, silent: true, legendHoverLink: false, z: 2 })
  series.push({ name: '_lossArea', type: 'line', data: data.map(d => [d.price, Math.min(d.expiry, 0)]), smooth: false, showSymbol: false, lineStyle: { width: 0 }, areaStyle: { origin: 0, color: '#EF4444', opacity: areaOp }, silent: true, legendHoverLink: false, z: 2 })
  series.push({ name: 'At Expiry', type: 'line', data: data.map(d => [d.price, d.expiry]), smooth: false, showSymbol: false, lineStyle: { color: '#10B981', width: 2.5 }, z: 4 })
  series.push({ name: `Today (${dteDays}d)`, type: 'line', data: data.map(d => [d.price, d.today]), smooth: true, showSymbol: false, lineStyle: { color: '#60A5FA', width: 2, type: 'dashed' }, z: 3 })

  return {
    animation: false, backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis', backgroundColor: ttBg, borderColor: ttBd, borderWidth: 1, padding: [10, 14], textStyle: { color: txt, fontSize: 11 },
      formatter: (params: unknown) => {
        const ps = (params as Array<{ seriesName: string; value: [number, number]; color: string }>).filter(p => p.seriesName === 'At Expiry' || p.seriesName.startsWith('Today'))
        if (!ps.length) return ''
        const price = ps[0]?.value[0] ?? 0
        let html = `<div style="font-size:9px;font-weight:800;letter-spacing:0.07em;margin-bottom:8px;color:${txt}">SPOT ${price.toLocaleString('en-IN')}</div>`
        for (const p of ps) {
          const v = p.value[1] ?? 0
          const c = v >= 0 ? '#10B981' : '#EF4444'
          html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="display:inline-block;width:14px;height:3px;background:${p.color};border-radius:2px"></span><span style="font-size:10px;color:${txt}">${p.seriesName}:</span><span style="font-size:13px;font-weight:800;color:${c}">${v >= 0 ? '+' : '−'}₹${inr(Math.abs(v))}</span></div>`
        }
        return html
      },
    },
    grid: { left: 58, right: 20, top: 14, bottom: 26 },
    xAxis: { type: 'value', min: data[0]?.price, max: data[data.length - 1]?.price, axisLabel: { fontSize: 10, color: txt, formatter: (v: number) => v.toLocaleString('en-IN'), margin: 8 }, splitLine: { show: false }, axisLine: { lineStyle: { color: axis } }, axisTick: { show: false } },
    yAxis: { type: 'value', min: -halfY, max: halfY, interval: yStep, axisLabel: { fontSize: 10, color: txt, formatter: (v: number) => Math.abs(v) < 1 ? '0' : yFmt(v), margin: 8 }, splitLine: { lineStyle: { color: grid } }, axisLine: { show: false }, axisTick: { show: false } },
    series,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PayoffEChart({ data, spot, dteDays, targetPct, breakevens }: { data: PayoffPoint[]; spot: number; dteDays: number; targetPct: number; breakevens: number[] }) {
  const isDark = useDarkMode()
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)
  useEffect(() => {
    if (!ref.current) return
    const c = echarts.init(ref.current); inst.current = c
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); c.dispose() }
  }, [])
  useEffect(() => {
    inst.current?.setOption(buildPayoffOption(data, spot, dteDays, targetPct, isDark, breakevens), { notMerge: true })
  }, [data, spot, dteDays, targetPct, isDark, breakevens])

  if (!data.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <svg viewBox="0 0 24 24" className="h-9 w-9 text-slate-200 dark:text-white/10" fill="none" stroke="currentColor" strokeWidth="1"><path d="M3 17l5-5 4 4 9-9" /><path d="M21 7h-4v4" /></svg>
        <p className="text-[12px] text-slate-300 dark:text-white/15">No option legs selected</p>
      </div>
    )
  }
  return <div ref={ref} className="flex-1 min-h-0" style={{ width: '100%', height: '100%' }} />
}
