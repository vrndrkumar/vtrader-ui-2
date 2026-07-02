import { useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ReferenceLine,
} from 'recharts'
import { clsx } from 'clsx'
import type { DailyPnl, GroupedPnl } from '@/types/reports'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPnl(v: number): string {
  const abs = Math.abs(v)
  const s =
    abs >= 1_00_000 ? `₹${(abs / 1_00_000).toFixed(2)}L`
    : abs >= 1_000  ? `₹${(abs / 1_000).toFixed(2)}K`
    : `₹${abs.toFixed(2)}`
  return v < 0 ? `-${s}` : `+${s}`
}

function fmtDate(d: string) {
  return d.slice(5) // MM-DD
}

// ── Colors ───────────────────────────────────────────────────────────────────

export const CHART_COLORS = {
  green:  '#22c55e',
  red:    '#ef4444',
  blue:   '#3b82f6',
  indigo: '#6366f1',
  amber:  '#f59e0b',
  slate:  '#94a3b8',
  teal:   '#14b8a6',
  purple: '#a855f7',
  rose:   '#f43f5e',
}

const PALETTE = [
  CHART_COLORS.blue,
  CHART_COLORS.teal,
  CHART_COLORS.purple,
  CHART_COLORS.amber,
  CHART_COLORS.rose,
  CHART_COLORS.indigo,
  CHART_COLORS.green,
  CHART_COLORS.slate,
]

// ── Shared tooltip ────────────────────────────────────────────────────────────

interface TooltipEntry {
  color?: string
  name?: string | number
  value?: string | number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  formatter?: (v: number, n: string) => string
}

function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl px-3 py-2.5 text-xs min-w-[120px]">
      {label != null && <p className="text-slate-400 dark:text-slate-500 mb-1.5 font-medium">{String(label)}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-slate-600 dark:text-slate-400">{String(p.name ?? '')}</span>
          </span>
          <span className="font-bold text-slate-900 dark:text-white tabular-nums">
            {formatter
              ? formatter(p.value as number, String(p.name ?? ''))
              : fmtPnl(p.value as number)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyChart({ label = 'No data available', height = 280 }: { label?: string; height?: number }) {
  return (
    <div className={`flex flex-col items-center justify-center`} style={{ height }}>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-200 dark:text-slate-700 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
      <p className="text-sm text-slate-400 dark:text-slate-500">{label}</p>
    </div>
  )
}

// ── Axis tick styles ──────────────────────────────────────────────────────────

const tickStyle = {
  fontSize: 10,
  fill: '#94a3b8',
}

const gridStyle = {
  stroke: 'rgba(148,163,184,0.12)',
}

// ── 1. Cumulative PnL Area Chart ──────────────────────────────────────────────

export function CumulativePnlChart({ data, height = 280 }: { data: DailyPnl[]; height?: number }) {
  if (!data.length) return <EmptyChart label="No closed trades yet" height={height} />

  const isPositive = data[data.length - 1].cumulative >= 0
  const color = isPositive ? CHART_COLORS.green : CHART_COLORS.red
  const gradId = isPositive ? 'cumGreen' : 'cumRed'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" {...gridStyle} />
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={(v) => fmtPnl(v)} tick={tickStyle} axisLine={false} tickLine={false} width={60} />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0} stroke="rgba(148,163,184,0.3)" strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="cumulative"
          name="Cumulative P&L"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0 }}
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── 2. Daily PnL Bar Chart ────────────────────────────────────────────────────

export function DailyPnlChart({ data, height = 280 }: { data: DailyPnl[]; height?: number }) {
  if (!data.length) return <EmptyChart label="No closed trades yet" height={height} />

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} {...gridStyle} />
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={(v) => fmtPnl(v)} tick={tickStyle} axisLine={false} tickLine={false} width={60} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <ReferenceLine y={0} stroke="rgba(148,163,184,0.4)" />
        <Bar dataKey="pnl" name="Daily P&L" radius={[3, 3, 0, 0]} maxBarSize={32} animationDuration={600}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? CHART_COLORS.green : CHART_COLORS.red} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── 3. Cumulative + Daily Composed Chart ──────────────────────────────────────

export function ComposedPnlChart({ data, height = 300 }: { data: DailyPnl[]; height?: number }) {
  if (!data.length) return <EmptyChart label="No closed trades yet" height={height} />

  const isPositive = data[data.length - 1].cumulative >= 0
  const lineColor = isPositive ? CHART_COLORS.green : CHART_COLORS.red

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="composedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={lineColor} stopOpacity={0.15} />
            <stop offset="95%" stopColor={lineColor} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" {...gridStyle} />
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="bar" tickFormatter={(v) => fmtPnl(v)} tick={tickStyle} axisLine={false} tickLine={false} width={60} />
        <YAxis yAxisId="line" orientation="right" tickFormatter={(v) => fmtPnl(v)} tick={tickStyle} axisLine={false} tickLine={false} width={60} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <ReferenceLine yAxisId="bar" y={0} stroke="rgba(148,163,184,0.4)" />
        <Bar yAxisId="bar" dataKey="pnl" name="Daily P&L" radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={600}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? CHART_COLORS.green : CHART_COLORS.red} fillOpacity={0.75} />
          ))}
        </Bar>
        <Area
          yAxisId="line"
          type="monotone"
          dataKey="cumulative"
          name="Cumulative P&L"
          stroke={lineColor}
          strokeWidth={2}
          fill="url(#composedGrad)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          animationDuration={800}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── 4. Win / Loss Pie Chart ───────────────────────────────────────────────────

interface DonutProps {
  wins: number
  losses: number
  neutral: number
  height?: number
}

export function WinLossDonut({ wins, losses, neutral, height = 260 }: DonutProps) {
  const total = wins + losses + neutral
  if (total === 0) return <EmptyChart label="No closed trades" height={height} />

  const winPct = ((wins / total) * 100).toFixed(1)

  const pieData = [
    { name: 'Wins', value: wins, color: CHART_COLORS.green },
    { name: 'Losses', value: losses, color: CHART_COLORS.red },
    ...(neutral > 0 ? [{ name: 'Flat', value: neutral, color: CHART_COLORS.slate }] : []),
  ].filter((d) => d.value > 0)

  return (
    <div className="flex flex-col items-center gap-4">
      <div style={{ width: '100%', height: height - 60 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={3}
              dataKey="value"
              animationBegin={0}
              animationDuration={700}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]
                return (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl px-3 py-2 text-xs">
                    <span className="font-bold" style={{ color: d.payload.color }}>{d.name}: </span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold">{d.value} ({((d.value as number / total) * 100).toFixed(1)}%)</span>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Center label overlay — done as absolute positioned text */}
      <div className="flex items-center justify-center gap-6 text-xs -mt-2">
        {pieData.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-slate-500 dark:text-slate-400">
              {d.name} <strong className="text-slate-800 dark:text-slate-200">{d.value}</strong>
              <span className="text-slate-400 ml-1">({((d.value / total) * 100).toFixed(0)}%)</span>
            </span>
          </div>
        ))}
      </div>

      <div className="text-center">
        <p className="text-3xl font-bold text-slate-900 dark:text-white">{winPct}%</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Win Rate</p>
      </div>
    </div>
  )
}

// ── 5. Horizontal Bar Chart (strategy / symbol PnL) ──────────────────────────

interface HBarProps {
  data: GroupedPnl[]
  height?: number
  maxItems?: number
}

export function HorizontalBarChart({ data, height, maxItems = 10 }: HBarProps) {
  const sliced = useMemo(() => [...data]
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, maxItems), [data, maxItems])

  const computedHeight = height ?? Math.max(200, sliced.length * 44 + 40)

  if (!sliced.length) return <EmptyChart label="No data" height={computedHeight} />

  return (
    <ResponsiveContainer width="100%" height={computedHeight}>
      <BarChart
        data={sliced}
        layout="vertical"
        margin={{ top: 4, right: 60, left: 4, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="4 4" horizontal={false} {...gridStyle} />
        <XAxis type="number" tickFormatter={(v) => fmtPnl(v)} tick={tickStyle} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={90}
          tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + '…' : v}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as GroupedPnl
            return (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl px-3 py-2 text-xs">
                <p className="font-bold text-slate-800 dark:text-slate-200 mb-1">{d.name}</p>
                <p className={clsx('font-bold tabular-nums', d.pnl >= 0 ? 'text-green-600' : 'text-red-500')}>{fmtPnl(d.pnl)}</p>
                <p className="text-slate-400 mt-0.5">{d.trades} trades</p>
              </div>
            )
          }}
          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
        />
        <ReferenceLine x={0} stroke="rgba(148,163,184,0.4)" />
        <Bar dataKey="pnl" name="P&L" radius={[0, 4, 4, 0]} maxBarSize={22} animationDuration={600}>
          {sliced.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? CHART_COLORS.green : CHART_COLORS.red} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── 6. Stacked Bar Chart (multi-group by day) ─────────────────────────────────

interface StackedBarProps {
  data: DailyPnl[]
  height?: number
}

export function StackedBarChart({ data, height = 280 }: StackedBarProps) {
  if (!data.length) return <EmptyChart label="No data" height={height} />

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} {...gridStyle} />
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={(v) => fmtPnl(v)} tick={tickStyle} axisLine={false} tickLine={false} width={60} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="pnl" name="P&L" stackId="a" radius={[3, 3, 0, 0]} fill={CHART_COLORS.blue} fillOpacity={0.85} maxBarSize={32} />
        <Bar dataKey="cumulative" name="Cumulative" stackId="b" radius={[3, 3, 0, 0]} fill={CHART_COLORS.indigo} fillOpacity={0.6} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── 7. Radar Chart (symbol distribution) ─────────────────────────────────────

interface RadarProps {
  data: GroupedPnl[]
  height?: number
}

export function SymbolRadarChart({ data, height = 280 }: RadarProps) {
  const top = data.slice(0, 8)
  if (top.length < 3) return <EmptyChart label="Need 3+ symbols for radar" height={height} />

  const radarData = top.map((d) => ({
    subject: d.name.length > 8 ? d.name.slice(0, 8) + '…' : d.name,
    pnl: Math.abs(d.pnl),
    trades: d.trades,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <PolarGrid stroke="rgba(148,163,184,0.2)" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <PolarRadiusAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} />
        <Radar name="P&L Volume" dataKey="pnl" stroke={CHART_COLORS.blue} fill={CHART_COLORS.blue} fillOpacity={0.18} strokeWidth={2} />
        <Radar name="Trades" dataKey="trades" stroke={CHART_COLORS.teal} fill={CHART_COLORS.teal} fillOpacity={0.12} strokeWidth={1.5} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null
          return (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl px-3 py-2 text-xs">
              <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">{label}</p>
              {payload.map((p, i) => (
                <p key={i} className="text-slate-500 dark:text-slate-400">
                  {p.name}: <strong className="text-slate-800 dark:text-slate-200">{typeof p.value === 'number' && p.name === 'P&L Volume' ? fmtPnl(p.value) : p.value}</strong>
                </p>
              ))}
            </div>
          )
        }} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

// ── 8. Smooth line chart (for single metric trends) ───────────────────────────

interface LineProps {
  data: DailyPnl[]
  height?: number
}

export function PnlLineChart({ data, height = 200 }: LineProps) {
  if (!data.length) return <EmptyChart label="No data" height={height} />
  const isPos = data[data.length - 1].cumulative >= 0
  const color = isPos ? CHART_COLORS.green : CHART_COLORS.red

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" {...gridStyle} />
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={(v) => fmtPnl(v)} tick={tickStyle} axisLine={false} tickLine={false} width={60} />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0} stroke="rgba(148,163,184,0.3)" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="cumulative"
          name="Cumulative P&L"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          animationDuration={700}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── 9. Scatter / distribution (daily pnl spread) ─────────────────────────────
// Reuse existing bar as scatter-equivalent via dots on line chart

export function PnlDistributionChart({ data, height = 200 }: { data: DailyPnl[]; height?: number }) {
  if (!data.length) return <EmptyChart label="No data" height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" {...gridStyle} />
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={(v) => fmtPnl(v)} tick={tickStyle} axisLine={false} tickLine={false} width={60} />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0} stroke="rgba(148,163,184,0.4)" />
        <Line
          type="monotone"
          dataKey="pnl"
          name="Daily P&L"
          stroke={CHART_COLORS.indigo}
          strokeWidth={0}
          dot={(props) => {
            const { cx, cy, payload } = props
            return (
              <circle
                key={`dot-${cx}-${cy}`}
                cx={cx} cy={cy} r={4}
                fill={payload.pnl >= 0 ? CHART_COLORS.green : CHART_COLORS.red}
                stroke="none"
                fillOpacity={0.85}
              />
            )
          }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── re-export palette for use elsewhere ──────────────────────────────────────
export { PALETTE }
