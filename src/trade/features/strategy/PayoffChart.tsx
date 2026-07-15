import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function inr(n: number): string {
  const a = Math.abs(n)
  const s = a >= 1e5 ? `${(a / 1e5).toFixed(2)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}k` : `${Math.round(a)}`
  return `${n < 0 ? '-' : ''}₹${s}`
}
const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

export interface PayoffDatum { price: number; expiry: number; projected: number }

interface TipRow { value: number; dataKey: string }
function Tip({ active, payload, label }: { active?: boolean; payload?: TipRow[]; label?: number }) {
  if (!active || !payload?.length) return null
  const exp = payload.find((p) => p.dataKey === 'expiry')?.value ?? 0
  const proj = payload.find((p) => p.dataKey === 'projected')?.value ?? 0
  return (
    <div className="rounded-xl bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-xl ring-1 ring-black/5 dark:ring-white/10 px-3 py-2 text-xs min-w-[150px]">
      <p className="font-bold text-slate-700 dark:text-slate-100 tabular-nums mb-1">{label}</p>
      <p className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5 text-slate-500"><span className="w-2.5 h-[3px] rounded bg-emerald-500" />On expiry</span><span className={`font-bold tabular-nums ${exp >= 0 ? 'text-green-600' : 'text-red-600'}`}>{inr(exp)}</span></p>
      <p className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5 text-slate-500"><span className="w-2.5 h-[3px] rounded bg-blue-500" />On target</span><span className={`font-bold tabular-nums ${proj >= 0 ? 'text-green-600' : 'text-red-600'}`}>{inr(proj)}</span></p>
    </div>
  )
}

export function PayoffChart({ data, spot, breakevens, target, bands }: {
  data: PayoffDatum[]; spot: number; breakevens: number[]; target: number; bands: { price: number; label: string }[]
}) {
  if (!data.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 text-slate-400">
        <svg viewBox="0 0 24 24" className="h-8 w-8 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12l5-7 4 5 3-4 4 6" /></svg>
        <p className="text-sm font-medium">Add legs to see the payoff</p>
      </div>
    )
  }
  const dark = isDark()
  const grid = dark ? '#1e293b' : '#eef2f7'
  const axis = dark ? '#64748b' : '#94a3b8'
  const vals = data.map((p) => p.expiry)
  const max = Math.max(...vals, 1); const min = Math.min(...vals, -1)
  const split = max / (max - min)
  const ltpX = data.reduce((c, p) => (Math.abs(p.price - spot) < Math.abs(c - spot) ? p.price : c), data[0].price)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 4, left: 2 }}>
        <defs>
          <linearGradient id="pnlSplit" x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor="#16a34a" stopOpacity={0.32} />
            <stop offset={split} stopColor="#16a34a" stopOpacity={0.03} />
            <stop offset={split} stopColor="#dc2626" stopOpacity={0.03} />
            <stop offset={1} stopColor="#dc2626" stopOpacity={0.32} />
          </linearGradient>
        </defs>
        <XAxis dataKey="price" tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={{ stroke: grid }} minTickGap={44} />
        <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} width={46} tickFormatter={inr} />
        <Tooltip content={<Tip />} cursor={{ stroke: axis, strokeDasharray: '3 3' }} />

        {/* SD bands */}
        {bands.map((b) => (
          <ReferenceLine key={b.label} x={b.price} stroke={grid} strokeWidth={1}
            label={{ value: b.label, fontSize: 9, fill: axis, position: 'top' }} />
        ))}

        <Area type="monotone" dataKey="expiry" stroke="none" fill="url(#pnlSplit)" isAnimationActive={false} />
        <ReferenceLine y={0} stroke={axis} strokeWidth={1} />

        {breakevens.map((b) => (
          <ReferenceLine key={b} x={b} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.85}
            label={{ value: b.toFixed(0), fontSize: 9, fontWeight: 700, fill: '#f59e0b', position: 'insideBottomLeft', dy: -2 }} />
        ))}

        <ReferenceLine x={target} stroke="#2563eb" strokeWidth={1.4} strokeDasharray="4 3" />
        <ReferenceLine x={ltpX} stroke={dark ? '#cbd5e1' : '#334155'} strokeWidth={1.2}
          label={{ value: `${spot.toFixed(0)}`, fontSize: 10, fontWeight: 700, fill: dark ? '#cbd5e1' : '#334155', position: 'top' }} />

        <Line type="monotone" dataKey="projected" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="expiry" stroke="#16a34a" strokeWidth={2.25} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
