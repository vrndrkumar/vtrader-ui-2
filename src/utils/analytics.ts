import type { Trade } from '@/types/reports'
import { computeDailyPnl } from './tradeStats'

// ── Day-of-week labels ────────────────────────────────────────────────────────

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

export interface DayOfWeekStats {
  day: string
  shortDay: string
  dayIndex: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  totalPnl: number
  avgPnl: number
  bestPnl: number
  worstPnl: number
  tradingDays: number
  profitableDays: number
}

export function computeDayOfWeekStats(trades: Trade[]): DayOfWeekStats[] {
  const closed = trades.filter((t) => t.status === 'CLOSED')

  // Build per-day-of-week data using trade-level granularity
  const map: Record<number, { trades: Trade[] }> = {}
  for (let i = 1; i <= 5; i++) map[i] = { trades: [] } // Mon=1..Fri=5

  for (const t of closed) {
    const d = new Date(t.first_placed_time)
    const dow = d.getDay() // 0=Sun..6=Sat
    if (dow >= 1 && dow <= 5) {
      map[dow].trades.push(t)
    }
  }

  // Also need daily PnL grouped by day-of-week for "profitable days" metric
  const dailyPnl = computeDailyPnl(trades)
  const dayPnlMap: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  for (const dp of dailyPnl) {
    const d = new Date(dp.date)
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) {
      dayPnlMap[dow].push(dp.pnl)
    }
  }

  return [1, 2, 3, 4, 5].map((dow) => {
    const trades = map[dow].trades
    const winners = trades.filter((t) => t.realized_pnl > 0)
    const losers  = trades.filter((t) => t.realized_pnl < 0)
    const totalPnl = trades.reduce((s, t) => s + t.realized_pnl, 0)
    const dayPnls = dayPnlMap[dow]
    const pnlVals = trades.map((t) => t.realized_pnl)

    return {
      day: DAYS[dow],
      shortDay: DAYS[dow].slice(0, 3),
      dayIndex: dow,
      totalTrades: trades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: trades.length === 0 ? 0 : (winners.length / trades.length) * 100,
      totalPnl,
      avgPnl: trades.length === 0 ? 0 : totalPnl / trades.length,
      bestPnl: pnlVals.length === 0 ? 0 : Math.max(...pnlVals),
      worstPnl: pnlVals.length === 0 ? 0 : Math.min(...pnlVals),
      tradingDays: dayPnls.length,
      profitableDays: dayPnls.filter((p) => p > 0).length,
    }
  })
}

// ── Strategy / group metrics ──────────────────────────────────────────────────

export interface StrategyMetrics {
  groupName: string
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  totalPnl: number
  avgPnl: number
  avgWin: number
  avgLoss: number
  expectancy: number        // (WinRate × AvgWin) - (LossRate × AvgLoss)
  maxDrawdown: number       // max peak-to-trough in cumulative PnL
  maxDrawdownPct: number
  longestWinStreak: number
  longestLoseStreak: number
  bestTrade: number
  worstTrade: number
  profitFactor: number
  consecutiveLoosingDays: number
  consecutiveWinningDays: number
}

export function computeStrategyMetrics(trades: Trade[]): StrategyMetrics[] {
  const groups: Record<string, Trade[]> = {}

  for (const t of trades) {
    const key = t.group_name || 'Ungrouped'
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  }

  return Object.entries(groups).map(([groupName, gTrades]) => {
    const closed  = gTrades.filter((t) => t.status === 'CLOSED')
    const winners = closed.filter((t) => t.realized_pnl > 0)
    const losers  = closed.filter((t) => t.realized_pnl < 0)

    const totalPnl    = closed.reduce((s, t) => s + t.realized_pnl, 0)
    const grossProfit = winners.reduce((s, t) => s + t.realized_pnl, 0)
    const grossLoss   = Math.abs(losers.reduce((s, t) => s + t.realized_pnl, 0))

    const winRate  = closed.length === 0 ? 0 : (winners.length / closed.length) * 100
    const lossRate = 100 - winRate
    const avgWin   = winners.length === 0 ? 0 : grossProfit / winners.length
    const avgLoss  = losers.length === 0  ? 0 : grossLoss  / losers.length

    const expectancy = (winRate / 100) * avgWin - (lossRate / 100) * avgLoss

    // Cumulative PnL for drawdown calc — sorted by date
    const sorted = [...closed].sort(
      (a, b) => new Date(a.first_placed_time).getTime() - new Date(b.first_placed_time).getTime(),
    )
    let peak = 0, runningPnl = 0, maxDD = 0
    for (const t of sorted) {
      runningPnl += t.realized_pnl
      if (runningPnl > peak) peak = runningPnl
      const dd = peak - runningPnl
      if (dd > maxDD) maxDD = dd
    }
    const maxDrawdownPct = peak === 0 ? 0 : (maxDD / peak) * 100

    // Trade streaks
    const pnls = sorted.map((t) => t.realized_pnl)
    const { longestWin, longestLose } = calcStreaks(pnls)

    // Day-level streaks
    const dailyPnls = computeDailyPnl(gTrades)
    const dayVals   = dailyPnls.map((d) => d.pnl)
    const { longestWin: cwDays, longestLose: clDays } = calcStreaks(dayVals)

    const pnlVals = closed.map((t) => t.realized_pnl)

    return {
      groupName,
      totalTrades: closed.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate,
      totalPnl,
      avgPnl: closed.length === 0 ? 0 : totalPnl / closed.length,
      avgWin,
      avgLoss,
      expectancy,
      maxDrawdown: maxDD,
      maxDrawdownPct,
      longestWinStreak: longestWin,
      longestLoseStreak: longestLose,
      bestTrade: pnlVals.length === 0 ? 0 : Math.max(...pnlVals),
      worstTrade: pnlVals.length === 0 ? 0 : Math.min(...pnlVals),
      profitFactor: grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss,
      consecutiveWinningDays: cwDays,
      consecutiveLoosingDays: clDays,
    }
  }).sort((a, b) => b.totalPnl - a.totalPnl)
}

function calcStreaks(vals: number[]): { longestWin: number; longestLose: number } {
  let longestWin = 0, longestLose = 0, curWin = 0, curLose = 0
  for (const v of vals) {
    if (v > 0) {
      curWin++; curLose = 0
      if (curWin > longestWin) longestWin = curWin
    } else if (v < 0) {
      curLose++; curWin = 0
      if (curLose > longestLose) longestLose = curLose
    } else {
      curWin = 0; curLose = 0
    }
  }
  return { longestWin, longestLose }
}

// ── Overall streaks ───────────────────────────────────────────────────────────

export interface OverallStreaks {
  currentWinStreak: number
  currentLoseStreak: number
  longestWinStreak: number
  longestLoseStreak: number
  longestWinDayStreak: number
  longestLoseDayStreak: number
  currentWinDayStreak: number
  currentLoseDayStreak: number
}

export function computeOverallStreaks(trades: Trade[]): OverallStreaks {
  const closed = [...trades.filter((t) => t.status === 'CLOSED')].sort(
    (a, b) => new Date(a.first_placed_time).getTime() - new Date(b.first_placed_time).getTime(),
  )

  const tradePnls = closed.map((t) => t.realized_pnl)
  const { longestWin, longestLose } = calcStreaks(tradePnls)

  // Current streaks (from end)
  let curW = 0, curL = 0
  for (let i = tradePnls.length - 1; i >= 0; i--) {
    if (tradePnls[i] > 0 && curL === 0) curW++
    else if (tradePnls[i] < 0 && curW === 0) curL++
    else break
  }

  // Day-level streaks
  const dailyPnl = computeDailyPnl(trades)
  const dayVals  = dailyPnl.map((d) => d.pnl)
  const { longestWin: ldW, longestLose: ldL } = calcStreaks(dayVals)
  let curDW = 0, curDL = 0
  for (let i = dayVals.length - 1; i >= 0; i--) {
    if (dayVals[i] > 0 && curDL === 0) curDW++
    else if (dayVals[i] < 0 && curDW === 0) curDL++
    else break
  }

  return {
    currentWinStreak: curW,
    currentLoseStreak: curL,
    longestWinStreak: longestWin,
    longestLoseStreak: longestLose,
    longestWinDayStreak: ldW,
    longestLoseDayStreak: ldL,
    currentWinDayStreak: curDW,
    currentLoseDayStreak: curDL,
  }
}

// ── Max drawdown chart data ───────────────────────────────────────────────────

export interface DrawdownPoint {
  date: string
  cumPnl: number
  drawdown: number
  peak: number
}

export function computeDrawdownSeries(trades: Trade[]): DrawdownPoint[] {
  const daily = computeDailyPnl(trades)
  let peak = 0
  return daily.map(({ date, cumulative }) => {
    if (cumulative > peak) peak = cumulative
    return {
      date,
      cumPnl: cumulative,
      drawdown: peak - cumulative,
      peak,
    }
  })
}

// ── Daily P&L map (date → pnl) for calendar ──────────────────────────────────

export function computeDailyPnlMap(trades: Trade[]): Record<string, number> {
  const closed = trades.filter((t) => t.status === 'CLOSED')
  const map: Record<string, number> = {}
  for (const t of closed) {
    const date = t.first_placed_time.split('T')[0].split(' ')[0]
    map[date] = (map[date] ?? 0) + t.realized_pnl
  }
  return map
}

export function computeMonthlyPnl(dailyMap: Record<string, number>): Record<string, number> {
  const map: Record<string, number> = {}
  for (const [date, pnl] of Object.entries(dailyMap)) {
    const month = date.slice(0, 7) // YYYY-MM
    map[month] = (map[month] ?? 0) + pnl
  }
  return map
}
