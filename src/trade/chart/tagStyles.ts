// ── Shared on-chart tag styling ──────────────────────────────────────────────
// The exact design tokens used by the strike order layer, so index-bracket tags
// look identical (soft matte charcoal / lavender card, per-kind accent + badge,
// P&L badge).

export type Kind = 'long' | 'short' | 'sl' | 'tp' | 'buy' | 'sell'

export const CARD = 'border bg-[#F8F7FC] border-[#E2E0EE] shadow-md dark:bg-[#2d2d33] dark:border-[#2A2A32] dark:shadow-xl'
export const SEP = 'bg-[#2073e0] dark:bg-[#8888e6]'
export const AT = 'text-[#94A3B8] dark:text-[#71717A]'
export const PRICE = 'text-[#0F172A] dark:text-[#F4F4F5]'

export const COLORS = { long: '#4f46e5', short: '#7c3aed', sl: '#ef4444', tp: '#14b8a6' }

export const TYPE: Record<Kind, { accent: string; badge: string }> = {
  long:  { accent: 'bg-indigo-600 dark:bg-indigo-400', badge: 'text-indigo-700 border-indigo-300 bg-indigo-50 dark:text-indigo-200 dark:border-indigo-500/50 dark:bg-indigo-500/15' },
  short: { accent: 'bg-[#7C3AED] dark:bg-[#BB86FC]', badge: 'text-[#6B21A8] border-[#C084FC] bg-[#F3E8FF] dark:text-[#E1BEE7] dark:border-[#5E4B8A] dark:bg-[#2D253D]' },
  sl:    { accent: 'bg-red-500 dark:bg-red-400', badge: 'text-red-700 border-red-300 bg-red-50 dark:text-red-300 dark:border-red-500/50 dark:bg-red-500/15' },
  tp:    { accent: 'bg-teal-500 dark:bg-teal-400', badge: 'text-teal-700 border-teal-300 bg-teal-50 dark:text-teal-300 dark:border-teal-500/40 dark:bg-teal-500/15' },
  buy:   { accent: 'bg-blue-600 dark:bg-blue-400', badge: 'text-blue-700 border-blue-300 bg-blue-50 dark:text-blue-200 dark:border-blue-500/50 dark:bg-blue-500/15' },
  sell:  { accent: 'bg-rose-500 dark:bg-rose-400', badge: 'text-rose-700 border-rose-300 bg-rose-50 dark:text-rose-300 dark:border-rose-500/50 dark:bg-rose-500/15' },
}

export const pnlBadge = (n: number) => n >= 0
  ? 'text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-[#34D399] dark:border-[#1D6F7A] dark:bg-[#162E30]'
  : 'text-rose-700 border-rose-200 bg-rose-50 dark:text-[#F87171] dark:border-[#7F1D1D] dark:bg-[#2E1616]'

export const money = (n: number) => `${n >= 0 ? '+' : '-'}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
export const px = (n: number) => n.toFixed(2)
