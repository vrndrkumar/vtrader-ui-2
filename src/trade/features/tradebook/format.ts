export const inr = (n: number, sign = false): string => {
  const s = sign && n > 0 ? '+' : ''
  return `${s}${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

export const pnlCls = (n: number): string => (n > 0 ? 'text-green-600' : n < 0 ? 'text-red-600' : 'text-slate-500')

export const px = (n: number): string => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const timeShort = (iso: string): string => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
