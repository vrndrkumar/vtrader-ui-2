import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PayoffPoint } from './payoff'

function inr(n: number): string {
  const a = Math.abs(n)
  const s = a >= 1e5 ? `${(a / 1e5).toFixed(2)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}k` : `${Math.round(a)}`
  return `${n < 0 ? '-' : ''}₹${s}`
}

export function PayoffChart({ points, spot, breakevens }: { points: PayoffPoint[]; spot: number; breakevens: number[] }) {
  if (!points.length) {
    return <div className="h-full flex items-center justify-center text-sm text-slate-400">Add legs to see the payoff.</div>
  }
  const vals = points.map((p) => p.expiry)
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, -1)
  const split = max / (max - min) // y-position of the zero line (0=top)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={points} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="pnlSplit" x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor="#16a34a" stopOpacity={0.28} />
            <stop offset={split} stopColor="#16a34a" stopOpacity={0.05} />
            <stop offset={split} stopColor="#dc2626" stopOpacity={0.05} />
            <stop offset={1} stopColor="#dc2626" stopOpacity={0.28} />
          </linearGradient>
        </defs>
        <XAxis dataKey="price" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={44} tickFormatter={inr} />
        <Tooltip
          formatter={(value, name) => [inr(Number(value)), name === 'today' ? 'Today' : 'Expiry']}
          labelFormatter={(l) => `Price ${l}`}
          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
        />
        <Area type="monotone" dataKey="expiry" stroke="none" fill="url(#pnlSplit)" isAnimationActive={false} />
        <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
        <ReferenceLine x={points.reduce((c, p) => (Math.abs(p.price - spot) < Math.abs(c - spot) ? p.price : c), points[0].price)}
          stroke="#64748b" strokeDasharray="4 4" label={{ value: `LTP ${spot.toFixed(0)}`, fontSize: 10, fill: '#64748b', position: 'top' }} />
        {breakevens.map((b) => (
          <ReferenceLine key={b} x={b} stroke="#f59e0b" strokeDasharray="2 3" strokeOpacity={0.7} />
        ))}
        <Line type="monotone" dataKey="today" stroke="#6366f1" strokeWidth={1.6} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="expiry" stroke="#db2777" strokeWidth={1.8} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
