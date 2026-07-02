import type { Trade, TradeStats, DailyPnl, GroupedPnl } from '@/types/reports'

export function computeStats(trades: Trade[]): TradeStats {
  const closed = trades.filter((t) => t.status === 'CLOSED')
  const winners = closed.filter((t) => t.realized_pnl > 0)
  const losers  = closed.filter((t) => t.realized_pnl < 0)

  const totalRealizedPnl   = closed.reduce((s, t) => s + t.realized_pnl, 0)
  const totalUnrealizedPnl = trades.filter((t) => t.status === 'OPEN').reduce((s, t) => s + t.unrealized_pnl, 0)

  const grossProfit = winners.reduce((s, t) => s + t.realized_pnl, 0)
  const grossLoss   = Math.abs(losers.reduce((s, t) => s + t.realized_pnl, 0))
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss

  const sortedByPnl = [...closed].sort((a, b) => b.realized_pnl - a.realized_pnl)
  const largestWin  = sortedByPnl[0] ?? null
  const largestLoss = sortedByPnl[sortedByPnl.length - 1] ?? null

  return {
    totalRealizedPnl,
    totalUnrealizedPnl,
    totalTrades: trades.length,
    closedTrades: closed.length,
    openTrades: trades.filter((t) => t.status === 'OPEN').length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: closed.length === 0 ? 0 : (winners.length / closed.length) * 100,
    profitFactor,
    avgPnlPerTrade: closed.length === 0 ? 0 : totalRealizedPnl / closed.length,
    bestTrade: largestWin?.realized_pnl ?? 0,
    worstTrade: largestLoss?.realized_pnl ?? 0,
    largestWin,
    largestLoss,
  }
}

export function computeDailyPnl(trades: Trade[]): DailyPnl[] {
  const closed = trades.filter((t) => t.status === 'CLOSED')
  const map: Record<string, number> = {}

  for (const t of closed) {
    const date = t.first_placed_time.split('T')[0].split(' ')[0]
    map[date] = (map[date] ?? 0) + t.realized_pnl
  }

  const sorted = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, pnl]) => ({ date, pnl }))

  let cumulative = 0
  return sorted.map(({ date, pnl }) => {
    cumulative += pnl
    return { date, pnl, cumulative }
  })
}

export function computeGroupPnl(trades: Trade[]): GroupedPnl[] {
  const closed = trades.filter((t) => t.status === 'CLOSED')
  const map: Record<string, { pnl: number; trades: number }> = {}

  for (const t of closed) {
    const key = t.group_name || 'Ungrouped'
    if (!map[key]) map[key] = { pnl: 0, trades: 0 }
    map[key].pnl    += t.realized_pnl
    map[key].trades += 1
  }

  return Object.entries(map)
    .map(([name, { pnl, trades }]) => ({ name, pnl, trades }))
    .sort((a, b) => b.pnl - a.pnl)
}

export function computeSymbolPnl(trades: Trade[]): GroupedPnl[] {
  const closed = trades.filter((t) => t.status === 'CLOSED')
  const map: Record<string, { pnl: number; trades: number }> = {}

  for (const t of closed) {
    // Use the base symbol (e.g. "NIFTY") extracted from symbol_name
    const base = t.symbol_name.split('_')[0]
    if (!map[base]) map[base] = { pnl: 0, trades: 0 }
    map[base].pnl    += t.realized_pnl
    map[base].trades += 1
  }

  return Object.entries(map)
    .map(([name, { pnl, trades }]) => ({ name, pnl, trades }))
    .sort((a, b) => b.pnl - a.pnl)
}

export function formatPnl(val: number): string {
  const abs = Math.abs(val)
  const str = abs >= 1_00_000
    ? `₹${(abs / 1_00_000).toFixed(2)}L`
    : abs >= 1_000
    ? `₹${(abs / 1_000).toFixed(2)}K`
    : `₹${abs.toFixed(2)}`
  return val < 0 ? `-${str}` : str
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
