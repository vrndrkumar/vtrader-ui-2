// ── Option engine REPLAY backtest: v2 (opt-v2.1) vs v3 (opt-v3.0) ────────────
// Runs BOTH engines over the SAME real historical NIFTY sessions and resolves
// every trade on REAL forward option premiums — an apples-to-apples P&L
// comparison with no look-ahead (entry/SL/target frozen at signal time; only
// later snapshots decide the outcome). This is the "rigorous replay" — it must
// run where Node can reach the data host (the insight-server box), NOT in the
// Claude sandbox (whose egress is allowlisted away from data.vtrader.in).
//
// Usage:
//   node research/optionReplay.mjs                 # last ~6 months, NIFTY
//   node research/optionReplay.mjs 2026-03-01 2026-09-05 NIFTY
//   GRID=15 DECIDE=30 node research/optionReplay.mjs   # tune step minutes
//
// Output: prints a comparison table and writes research/out/option-replay.json
import { analyseOptions as analyseV2, OPT_ENGINE_VERSION as VER_V2 } from '../src/optionEngineV2.bundle.js'
import { analyseOptions as analyseV3, OPT_ENGINE_VERSION as VER_V3 } from '../src/optionEngine.bundle.js'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.CANDLE_BASE_URL || 'https://data.vtrader.in'
const SYMBOL = process.argv[4] || 'NIFTY'
const GRID = Number(process.env.GRID || 15)     // snapshot/resolution step (min)
const DECIDE = Number(process.env.DECIDE || 30) // decision cadence (min)
const OPEN_MIN = 9 * 60 + 20, CLOSE_MIN = 15 * 60 + 15
const SQUAREOFF_MIN = 15 * 60 + 15

// ── date helpers ─────────────────────────────────────────────────────────────
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(d.getUTCDate() + n); return x }
function tradingDays(fromISO, toISO) {
  const out = []
  for (let d = new Date(fromISO + 'T00:00:00Z'); iso(d) <= toISO; d = addDays(d, 1)) {
    const wd = d.getUTCDay(); if (wd === 0 || wd === 6) continue // skip weekends (holidays drop out when the API returns nothing)
    out.push(iso(d))
  }
  return out
}
// epoch seconds for a given IST day + minute-of-day (09:15 = 555)
const tsFor = (dayISO, minOfDay) => Date.parse(`${dayISO}T00:00:00+05:30`) / 1000 + minOfDay * 60

// ── fetch (retry + tiny cache) ───────────────────────────────────────────────
const chainCache = new Map()
async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000)
      const r = await fetch(url, { signal: ctrl.signal }); clearTimeout(t)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (e) { if (i === tries - 1) throw e; await new Promise((s) => setTimeout(s, 400 * (i + 1))) }
  }
}
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
async function fetchChain(expiry, dayISO, min) {
  const key = `${SYMBOL}|${expiry}|${dayISO}|${min}`
  if (chainCache.has(key)) return chainCache.get(key)
  let j = null
  try { j = await getJSON(`${BASE}/data/option-chain?symbol=${SYMBOL}&expiry=${expiry}&date=${dayISO}&time=${hhmm(min)}`) } catch { j = null }
  chainCache.set(key, j); return j
}
async function fetchCandles(symbol, frequency, fromISO, toISO) {
  try {
    const j = await getJSON(`${BASE}/data/candle?symbol=${symbol}&from=${fromISO}&to=${toISO}&frequency=${frequency}`)
    return (Array.isArray(j?.candles) ? j.candles : [])
      .filter((c) => Number.isFinite(c?.close))
      .map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 }))
      .sort((a, b) => a.time - b.time)
  } catch { return [] }
}

// ── chain → engine input, and leg reader for resolution ─────────────────────
const toChainInput = (cj) => (cj?.chain || []).map((r) => {
  const leg = (o) => o ? { ltp: o.ltp, volume: o.volume ?? 0, bid: o.bid ?? 0, ask: o.ask ?? 0, symbol: o.symbol,
    delta: o.delta ?? null, gamma: o.gamma ?? null, theta: o.theta ?? null, vega: o.vega ?? null, iv: o.iv ?? null, oi: o.oi ?? null } : undefined
  return { strike: r.strike, ce: leg(r.call), pe: leg(r.put) }
})
function readLtp(cj, strike, side) {
  const row = (cj?.chain || []).find((r) => Number(r.strike) === Number(strike))
  if (!row) return null
  const leg = side === 'CE' ? row.call : row.put
  return leg?.ltp ?? null
}

// ── nearest expiry per day (front, ≥ day) ────────────────────────────────────
async function nearestExpiry(dayISO) {
  let j = null
  try { j = await getJSON(`${BASE}/data/expiries?symbol=${SYMBOL}&date=${dayISO}`) } catch { return null }
  const xs = (j?.expiries || []).map((e) => e.date).filter(Boolean).sort()
  return xs.find((d) => d >= dayISO) || xs[0] || null
}

// ── engine input builder at day+minute ──────────────────────────────────────
function istParts(dayISO, min) {
  const [y, m, d] = dayISO.split('-').map(Number)
  return { y, m: m - 1, d, hh: Math.floor(min / 60), mm: min % 60 }
}
function buildInput(dayISO, min, expiry, chainJson, candles, vixDaily) {
  const cut = tsFor(dayISO, min)
  const sl = (arr) => arr.filter((c) => c.time <= cut)
  return {
    index: SYMBOL, nowIst: istParts(dayISO, min), spot: chainJson.spot ?? null, spotTs: cut,
    vix: chainJson.india_vix ?? null, vixPrevClose: vixDaily.length >= 2 ? vixDaily[vixDaily.length - 2].close : null,
    daily: sl(candles.D), tf: { m3: sl(candles.m3), m5: sl(candles.m5), m15: sl(candles.m15), m30: sl(candles.m30) },
    expiries: [expiry], chain: toChainInput(chainJson), chainExpiry: expiry,
  }
}

// ── per-engine, per-day position manager (mirrors production: 1 position, hold
//    to SL/target, re-enter only on a genuine thesis change) ─────────────────
function resolveStep(pos, ltp) {
  if (ltp == null || !Number.isFinite(ltp)) return null
  const buy = pos.action === 'BUY'
  if (buy) {
    if (pos.t2 != null && ltp >= pos.t2) return { status: 'TARGET2', exit: pos.t2 }
    if (pos.t1 != null && ltp >= pos.t1) return { status: 'TARGET1', exit: pos.t1 }
    if (pos.sl != null && ltp <= pos.sl) return { status: 'SL', exit: pos.sl }
  } else {
    if (pos.t2 != null && ltp <= pos.t2) return { status: 'TARGET2', exit: pos.t2 }
    if (pos.t1 != null && ltp <= pos.t1) return { status: 'TARGET1', exit: pos.t1 }
    if (pos.sl != null && ltp >= pos.sl) return { status: 'SL', exit: pos.sl }
  }
  return null
}
function closeTrade(pos, exit, status, min) {
  const buy = pos.action === 'BUY'
  const pnl = buy ? exit - pos.entry : pos.entry - exit
  const risk = buy ? pos.entry - pos.sl : pos.sl - pos.entry
  const r = risk && risk > 0 ? pnl / risk : null
  return { ...pos, exit, status, pnl, r, minutes: (min - pos.openMin) }
}

async function replayDay(dayISO, analyse, engineName) {
  const expiry = await nearestExpiry(dayISO)
  if (!expiry) return { trades: [], noTrade: 0, decisions: 0, skipped: true }
  // candles once for the day (multi-day windows so ADX/EMA have history)
  const [m3, m5, m15, m30, D, vixDaily] = await Promise.all([
    fetchCandles(SYMBOL, '3', iso(addDays(new Date(dayISO), -6)), dayISO),
    fetchCandles(SYMBOL, '5', iso(addDays(new Date(dayISO), -8)), dayISO),
    fetchCandles(SYMBOL, '15', iso(addDays(new Date(dayISO), -14)), dayISO),
    fetchCandles(SYMBOL, '30', iso(addDays(new Date(dayISO), -22)), dayISO),
    fetchCandles(SYMBOL, 'D', iso(addDays(new Date(dayISO), -40)), dayISO),
    fetchCandles('INDIAVIX', 'D', iso(addDays(new Date(dayISO), -12)), dayISO),
  ])
  if (!D.length || !m5.length) return { trades: [], noTrade: 0, decisions: 0, skipped: true }
  const candles = { m3, m5, m15, m30, D }

  // pre-fetch the snapshot grid once (shared by decisions + resolution)
  const grid = []
  for (let min = OPEN_MIN; min <= SQUAREOFF_MIN; min += GRID) grid.push(min)
  const snaps = new Map()
  for (const min of grid) snaps.set(min, await fetchChain(expiry, dayISO, min))
  if (![...snaps.values()].some((s) => s?.chain?.length)) return { trades: [], noTrade: 0, decisions: 0, skipped: true }

  const trades = []; let noTrade = 0; let decisions = 0; let pos = null
  const memory = null // fresh per day (session continuity is intraday only)
  let mem = memory
  for (const min of grid) {
    const snap = snaps.get(min)
    // 1) resolve an open position at this snapshot
    if (pos) {
      const ltp = snap ? readLtp(snap, pos.strike, pos.side) : null
      const hit = resolveStep(pos, ltp)
      if (hit) { trades.push(closeTrade(pos, hit.exit, hit.status, min)); pos = null }
    }
    // 2) decision (only on the decide cadence, and while flat OR to detect thesis change)
    const onDecide = ((min - OPEN_MIN) % DECIDE) === 0 && min <= CLOSE_MIN - GRID
    if (onDecide && snap?.chain?.length && snap.spot != null) {
      let rep = null
      try { rep = analyse(buildInput(dayISO, min, expiry, snap, candles, vixDaily), mem) } catch { rep = null }
      if (rep) {
        mem = rep.memory
        const bt = rep.bestTrade
        const isTrade = rep.strategy.verdict !== 'NO TRADE' && bt && bt.entry != null && bt.strike != null
        if (!isTrade) { if (!pos) noTrade++ }
        else {
          const same = pos && pos.action === bt.action && pos.side === bt.side && Number(pos.strike) === Number(bt.strike)
          if (pos && !same) { // thesis change → close current at this ltp, open new
            const ltp = readLtp(snap, pos.strike, pos.side)
            trades.push(closeTrade(pos, ltp ?? pos.entry, 'INVALIDATED', min)); pos = null
          }
          if (!pos) {
            pos = { engine: engineName, day: dayISO, openMin: min, action: bt.action, side: bt.side,
              moneyness: bt.moneyness, strike: bt.strike, entry: bt.entry, sl: bt.stopLoss, t1: bt.target1, t2: bt.target2,
              vix: rep.vix.value, verdict: rep.strategy.verdict, conf: bt.confidencePct ?? rep.recommendation?.confidencePct ?? null }
          }
        }
      }
      decisions++
    }
  }
  // square off any open position at the LAST snapshot that actually has the leg
  // (walking back from 15:15 — fixes phantom break-even EOD exits when the close
  // snapshot lacks the strike). Real forward premium, still no look-ahead.
  if (pos) {
    let ltp = null, at = SQUAREOFF_MIN
    for (let i = grid.length - 1; i >= 0; i--) {
      const m = grid[i]; if (m < pos.openMin) break
      const v = snaps.get(m) ? readLtp(snaps.get(m), pos.strike, pos.side) : null
      if (v != null && Number.isFinite(v)) { ltp = v; at = m; break }
    }
    trades.push(closeTrade(pos, ltp ?? pos.entry, ltp == null ? 'NOFILL' : 'CLOSED', at))
  }
  return { trades, noTrade, decisions, skipped: false }
}

// ── stats ────────────────────────────────────────────────────────────────────
const rnd = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(d))
function statsFor(trades) {
  const n = trades.length; if (!n) return { trades: 0 }
  const pnls = trades.map((t) => t.pnl)
  const rs = trades.map((t) => t.r).filter((x) => x != null)
  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl <= 0)
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  const gW = sum(wins.map((t) => t.pnl)), gL = Math.abs(sum(losses.map((t) => t.pnl)))
  let eq = 0, peak = 0, dd = 0
  for (const p of pnls) { eq += p; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq) }
  return {
    trades: n, wins: wins.length, losses: losses.length,
    winRate: rnd((wins.length / n) * 100, 1),
    expectancy: rnd(sum(pnls) / n), avgR: rnd(rs.length ? sum(rs) / rs.length : null),
    profitFactor: gL > 0 ? rnd(gW / gL) : (gW > 0 ? 999 : null),
    netPnl: rnd(sum(pnls)), maxDD: rnd(dd),
    avgWin: rnd(wins.length ? sum(wins.map((t) => t.pnl)) / wins.length : null),
    avgLoss: rnd(losses.length ? sum(losses.map((t) => t.pnl)) / losses.length : null),
  }
}
const group = (trades, keyFn) => {
  const m = new Map()
  for (const t of trades) { const k = keyFn(t); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(t) }
  return [...m.entries()].map(([k, arr]) => ({ key: k, ...statsFor(arr) })).sort((a, b) => (b.expectancy ?? -1e9) - (a.expectancy ?? -1e9))
}
const vixB = (v) => v == null ? 'unknown' : v < 12 ? 'Low(<12)' : v < 16 ? 'Normal(12-16)' : v < 20 ? 'Elevated(16-20)' : 'High(20+)'

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const today = new Date()
  const from = process.argv[2] || iso(addDays(today, -183))
  const to = process.argv[3] || iso(addDays(today, -1))
  const days = tradingDays(from, to)
  console.log(`Replay ${SYMBOL}  ${from} → ${to}  (${days.length} weekdays)  grid ${GRID}m / decide ${DECIDE}m`)
  const acc = { v2: { trades: [], noTrade: 0, decisions: 0, daysTraded: 0 }, v3: { trades: [], noTrade: 0, decisions: 0, daysTraded: 0 } }
  let done = 0
  for (const day of days) {
    for (const [name, analyse] of [['v2', analyseV2], ['v3', analyseV3]]) {
      let res
      try { res = await replayDay(day, analyse, name) } catch (e) { res = { trades: [], noTrade: 0, decisions: 0, skipped: true, err: e.message } }
      if (!res.skipped) {
        acc[name].trades.push(...res.trades); acc[name].noTrade += res.noTrade; acc[name].decisions += res.decisions
        if (res.trades.length) acc[name].daysTraded++
      }
    }
    done++
    if (done % 10 === 0) process.stdout.write(`  …${done}/${days.length} days\n`)
  }

  const report = { symbol: SYMBOL, from, to, gridMin: GRID, decideMin: DECIDE, generatedAt: new Date().toISOString() }
  for (const name of ['v2', 'v3']) {
    const T = acc[name].trades
    report[name] = {
      decisions: acc[name].decisions, noTradeDecisions: acc[name].noTrade, tradesTaken: T.length,
      daysWithATrade: acc[name].daysTraded,
      overall: statsFor(T),
      buy: statsFor(T.filter((t) => t.action === 'BUY')),
      sell: statsFor(T.filter((t) => t.action === 'SELL')),
      byMoneyness: group(T, (t) => `${t.action} ${t.side} ${t.moneyness}`),
      byVix: group(T, (t) => vixB(t.vix)),
    }
  }
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true })
  writeFileSync(new URL('./out/option-replay.json', import.meta.url), JSON.stringify({ report, v2Trades: acc.v2.trades, v3Trades: acc.v3.trades }, null, 2))

  const pct = (n, d) => d ? `${((n / d) * 100).toFixed(0)}%` : '—'
  const line = (o) => `trades ${o.overall.trades}  win ${o.overall.winRate ?? '—'}%  exp ${o.overall.expectancy ?? '—'}  PF ${o.overall.profitFactor ?? '—'}  net ${o.overall.netPnl ?? '—'}  maxDD ${o.overall.maxDD ?? '—'}`
  console.log('\n════════ RESULT (premium points per unit) ════════')
  console.log(`decisions/engine ≈ ${report.v2.decisions}`)
  console.log(`\nBASE  v2 slot [${VER_V2}]:  ${line(report.v2)}`)
  console.log(`   sat out ${report.v2.noTradeDecisions} decisions (${pct(report.v2.noTradeDecisions, report.v2.decisions)})  ·  traded ${report.v2.daysWithATrade}/${days.length} days`)
  console.log(`   BUY  → ${line({ overall: report.v2.buy })}`)
  console.log(`   SELL → ${line({ overall: report.v2.sell })}`)
  console.log(`\nCAND  v3 slot [${VER_V3}]:  ${line(report.v3)}`)
  console.log(`   sat out ${report.v3.noTradeDecisions} decisions (${pct(report.v3.noTradeDecisions, report.v3.decisions)})  ·  traded ${report.v3.daysWithATrade}/${days.length} days`)
  console.log(`   BUY  → ${line({ overall: report.v3.buy })}`)
  console.log(`   SELL → ${line({ overall: report.v3.sell })}`)
  console.log(`\nFull breakdown (byMoneyness / byVix) → research/out/option-replay.json`)
}
main().catch((e) => { console.error(e); process.exit(1) })
