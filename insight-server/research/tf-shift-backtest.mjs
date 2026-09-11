#!/usr/bin/env node
/**
 * TIMEFRAME-SHIFT BACKTEST  (research only — touches no production code/weights)
 * =============================================================================
 * Compares a 2x2 grid of timeframe wiring for ONE clean "constructive turn" rule
 * (long-term filter + a fresh turn + >=1 leading confirmation), so we can isolate
 * whether earlier detection comes from a faster BASE or a faster TURN:
 *
 *              turn=WEEKLY            turn=DAILY
 *   base=DAILY  CURRENT (live-like)   TURN-FAST
 *   base=4H     BASE-FAST             SHIFTED
 *
 * For each config it reports, on a common DAILY clock:
 *   - forward returns (+5/+10/+21 sessions): win rate, avg return, avg max gain/DD
 *   - LATENESS: of real >=MOVE%-in-<=WINDOW-session blasts, how many were flagged
 *     BEFORE the move started, and the median lead (the core metric).
 *
 * Changes NOTHING in production. Asserts NO outcome. Run it, read the grid, decide.
 *
 * USAGE (on the server; candle API + DB must be reachable):
 *   node research/tf-shift-backtest.mjs --n 40
 *   node research/tf-shift-backtest.mjs --n 40 --minturnover 100     # largecap-ish
 *   node research/tf-shift-backtest.mjs --symbols SBIN-EQ,TCS-EQ
 *   node research/tf-shift-backtest.mjs --demo                       # offline self-test
 *   flags: --n <int> --symbols <csv> --minturnover <cr> --move 20 --window 20 --from 2020-01-01
 */
import { config } from '../src/config.js'
import { ema, sma, obv, slope, closes } from '../src/indicators.js'
import { toWeekly } from '../src/featureSnapshot.js'

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const has = (name) => args.includes(`--${name}`)
const N = Number(flag('n', 40))
const SYMBOLS = flag('symbols', null)
const MINTO = Number(flag('minturnover', 0)) // min 20d avg daily turnover (₹ cr); 0 = no filter
const MOVE = Number(flag('move', 20))
const WINDOW = Number(flag('window', 20))
const FROM = flag('from', '2020-01-01')
const DEMO = has('demo')
const HORIZONS = [5, 10, 21]

const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(d))
const dstr = (t) => new Date(t * 1000).toISOString().slice(0, 10)

// ── The 2x2 grid of timeframe configs ────────────────────────────────────────
// baseKind/turnKind select which candle series feeds each role; lookback units
// are in TURN-TF bars, minGap in BASE-TF bars.
const CONFIGS = [
  { name: 'CURRENT  (base D / turn W)', baseKind: 'daily', turnKind: 'weekly', longMA: 200, turnLookback: 4, minGap: 10 },
  { name: 'TURN-FAST(base D / turn D)', baseKind: 'daily', turnKind: 'daily', longMA: 200, turnLookback: 5, minGap: 10 },
  { name: 'BASE-FAST(base 4H/ turn W)', baseKind: '4h', turnKind: 'weekly', longMA: 200, turnLookback: 4, minGap: 12 },
  { name: 'SHIFTED  (base 4H/ turn D)', baseKind: '4h', turnKind: 'daily', longMA: 200, turnLookback: 5, minGap: 12 },
  // Quality-gated variants: >=2 confirmations + RS line at a new high (+ turnover floor)
  { name: 'TURN-FAST+Q (D/D gated)', baseKind: 'daily', turnKind: 'daily', longMA: 200, turnLookback: 5, minGap: 10, quality: { minConfirms: 2, rsNewHigh: true, minTurnoverCr: 0 } },
  { name: 'SHIFTED+Q  (4H/D gated)', baseKind: '4h', turnKind: 'daily', longMA: 200, turnLookback: 5, minGap: 12, quality: { minConfirms: 2, rsNewHigh: true, minTurnoverCr: 0 } },
]

// ── Candle fetch (wide ranges so 4H can go back years if the API allows) ──────
async function fetchTF(symbol, frequency, from, to) {
  const url = `${config.candleBaseUrl}/data/candle?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&frequency=${frequency}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`candle API ${res.status} for ${symbol} ${frequency}`)
    const json = await res.json()
    return (Array.isArray(json?.candles) ? json.candles : [])
      .filter((c) => c && Number.isFinite(c.open) && Number.isFinite(c.close))
      .map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: Number.isFinite(c.volume) ? c.volume : 0 }))
      .sort((a, b) => a.time - b.time)
  } finally { clearTimeout(timer) }
}

function resample4h(hourly) {
  const out = []
  let b = null
  for (const c of hourly) {
    const day = dstr(c.time)
    const idx = Math.floor(new Date(c.time * 1000).getUTCHours() / 4)
    const key = `${day}-${idx}`
    if (!b || b.key !== key) { if (b) out.push(b.c); b = { key, c: { ...c } } }
    else { b.c.high = Math.max(b.c.high, c.high); b.c.low = Math.min(b.c.low, c.low); b.c.close = c.close; b.c.volume += c.volume }
  }
  if (b) out.push(b.c)
  return out
}

// ── Signal engine ────────────────────────────────────────────────────────────
function turnUpArray(series) {
  const c = closes(series)
  const e = ema(c, 20)
  return series.map((_, i) => (i >= 1 && e[i] != null && e[i - 1] != null ? c[i] > e[i] && e[i] > e[i - 1] : null))
}

function buildRs(stockDaily, niftyDaily) {
  const nd = new Map(niftyDaily.map((c) => [dstr(c.time), c.close]))
  const ratio = []; const dates = []
  for (const c of stockDaily) { const b = nd.get(dstr(c.time)); if (b) { ratio.push(c.close / b); dates.push(dstr(c.time)) } }
  const idxByDate = new Map(dates.map((d, i) => [d, i]))
  return {
    improving: (dateStr) => {
      const j = idxByDate.get(dateStr)
      if (j == null || j < 60) return false
      const s20 = slope(ratio.slice(0, j + 1), 20)
      const s60 = slope(ratio.slice(0, j + 1), 60)
      return s20 != null && s60 != null && s20 > s60 && s20 > 0
    },
    // RS line at a new high over the trailing `win` sessions (early leadership tell)
    newHigh: (dateStr, win = 60) => {
      const j = idxByDate.get(dateStr)
      if (j == null || j < win) return false
      let mx = -Infinity
      for (let k = j - win; k < j; k++) if (ratio[k] > mx) mx = ratio[k]
      return ratio[j] >= mx
    },
  }
}

/** rolling 20d avg daily turnover (₹cr) keyed by daily date */
function buildTurnover(daily) {
  const m = new Map()
  for (let i = 0; i < daily.length; i++) {
    const s = Math.max(0, i - 19)
    let sum = 0; let n = 0
    for (let k = s; k <= i; k++) { sum += daily[k].close * daily[k].volume; n++ }
    m.set(dstr(daily[i].time), sum / n / 1e7)
  }
  return (dateStr) => m.get(dateStr) ?? 0
}

function volDryUpAt(vol, i) {
  if (i < 50) return false
  const a = (m) => vol.slice(i - m + 1, i + 1).reduce((x, y) => x + y, 0) / m
  const v50 = a(50)
  return v50 ? a(10) / v50 < 0.75 : false
}

function generateSignals(base, turnTF, rs, turnoverAt, cfg) {
  if (!base || base.length < cfg.longMA + 30 || !turnTF || turnTF.length < cfg.turnLookback + 5) return []
  const q = cfg.quality // undefined = baseline (>=1 confirm), else stricter gate
  const bc = closes(base)
  const bs200 = sma(bc, cfg.longMA)
  const bvol = base.map((x) => x.volume)
  const bobv = obv(base)
  const tUp = turnUpArray(turnTF)
  const turnTimes = turnTF.map((x) => x.time)
  let tptr = 0
  const sigs = []
  let lastSig = -1e9
  for (let i = cfg.longMA; i < base.length; i++) {
    const t = base[i].time
    const ds = dstr(t)
    while (tptr + 1 < turnTimes.length && turnTimes[tptr + 1] <= t) tptr++
    const j = tptr
    if (turnTimes[j] > t) continue
    if (!(bs200[i] != null && bc[i] > bs200[i])) continue
    if (j < cfg.turnLookback) continue
    if (!(tUp[j] === true && tUp[j - cfg.turnLookback] === false)) continue
    const dry = volDryUpAt(bvol, i)
    const obvUp = i >= 20 && slope(bobv.slice(0, i + 1).map((v) => v - bobv[0] + 1e9), 20) > 0
    const rsUp = rs ? rs.improving(ds) : false
    const confirms = (dry ? 1 : 0) + (obvUp ? 1 : 0) + (rsUp ? 1 : 0)
    if (!q) {
      if (confirms < 1) continue                          // baseline: >=1 confirmation
    } else {
      if (confirms < (q.minConfirms ?? 2)) continue        // stricter: >=2 confirmations
      if (q.rsNewHigh && !(rs && rs.newHigh(ds))) continue // RS line at a new high
      if (q.minTurnoverCr && turnoverAt(ds) < q.minTurnoverCr) continue
    }
    if (i - lastSig < cfg.minGap) continue
    lastSig = i
    sigs.push({ date: ds, time: t })
  }
  return sigs
}

// ── Outcomes / blasts / lateness (common daily clock) ────────────────────────
function dailyIndexByDate(daily) { return new Map(daily.map((c, i) => [dstr(c.time), i])) }

function evalSignal(daily, idxByDate, sig) {
  let di = idxByDate.get(sig.date)
  if (di == null) { for (let k = 0; k < daily.length; k++) if (dstr(daily[k].time) >= sig.date) { di = k; break } }
  if (di == null || di >= daily.length - 1) return null
  const entry = daily[di].close
  const out = {}
  for (const H of HORIZONS) {
    const fwd = daily.slice(di + 1, di + 1 + H)
    if (fwd.length < Math.min(3, H)) { out[H] = null; continue }
    const maxHigh = Math.max(...fwd.map((x) => x.high))
    const minLow = Math.min(...fwd.map((x) => x.low))
    const ret = ((daily[Math.min(di + H, daily.length - 1)].close - entry) / entry) * 100
    const maxGain = ((maxHigh - entry) / entry) * 100
    const maxDD = ((minLow - entry) / entry) * 100
    out[H] = { ret, maxGain, maxDD, win: maxGain >= 8 && maxGain > Math.abs(maxDD) }
  }
  return { di, entry, out }
}

function findBlasts(daily) {
  const blasts = []; let guard = -1e9
  for (let i = 0; i < daily.length - 1; i++) {
    if (i < guard) continue
    const entry = daily[i].close
    const end = Math.min(i + WINDOW, daily.length - 1)
    let hit = null
    for (let k = i + 1; k <= end; k++) if ((daily[k].high - entry) / entry * 100 >= MOVE) { hit = k; break }
    if (hit != null) { blasts.push({ i, date: dstr(daily[i].time) }); guard = hit }
  }
  return blasts
}

function lateness(idxByDate, sigs, blasts, lookback = 40) {
  let caught = 0; const leads = []
  for (const b of blasts) {
    let best = null
    for (const s of sigs) {
      const si = idxByDate.get(s.date)
      if (si == null) continue
      if (si <= b.i && si >= b.i - lookback && (best == null || si > best)) best = si
    }
    if (best != null) { caught++; leads.push(b.i - best) }
  }
  leads.sort((a, b) => a - b)
  return { blasts: blasts.length, caught, medianLead: leads.length ? leads[Math.floor(leads.length / 2)] : null }
}

// ── Aggregation across symbols, per config ───────────────────────────────────
function aggregate(perSymbolConfig) {
  const flat = []
  for (const arr of perSymbolConfig) for (const s of arr) if (s) flat.push(s)
  const agg = { signals: flat.length }
  for (const H of HORIZONS) {
    const xs = flat.map((s) => s.out[H]).filter(Boolean)
    const avg = (f) => xs.length ? round(xs.reduce((a, s) => a + f(s), 0) / xs.length, 2) : null
    agg[`h${H}`] = {
      n: xs.length,
      winRate: xs.length ? round(xs.filter((s) => s.win).length / xs.length * 100, 1) : null,
      avgRet: avg((s) => s.ret), avgMaxGain: avg((s) => s.maxGain), avgMaxDD: avg((s) => s.maxDD),
    }
  }
  return agg
}

// ── Per-symbol run over all configs ──────────────────────────────────────────
async function runSymbol(symbol, nifty) {
  const today = new Date().toISOString().slice(0, 10)
  const daily = DEMO ? nifty._stock[symbol].daily : await fetchTF(symbol, 'D', FROM, today)
  if (!daily || daily.length < 260) return { skip: 'insufficient daily history' }
  // turnover filter (largecap-ish): 20d avg daily turnover in ₹ crore
  if (MINTO > 0) {
    const tail = daily.slice(-20)
    const turnoverCr = tail.reduce((a, c) => a + c.close * c.volume, 0) / tail.length / 1e7
    if (turnoverCr < MINTO) return { skip: `turnover ₹${round(turnoverCr, 1)}cr < ${MINTO}` }
  }
  const weekly = toWeekly(daily)
  const h1 = DEMO ? nifty._stock[symbol].h1 : await fetchTF(symbol, '60', FROM, today).catch(() => [])
  const fourH = resample4h(h1)
  const rs = buildRs(daily, nifty.daily)
  const turnoverAt = buildTurnover(daily)
  const idxByDate = dailyIndexByDate(daily)
  const blasts = findBlasts(daily)
  const series = { daily, weekly, '4h': fourH }

  const configs = {}
  for (const cfg of CONFIGS) {
    const base = series[cfg.baseKind]
    const turnTF = series[cfg.turnKind]
    if (!base || base.length < cfg.longMA + 30) { configs[cfg.name] = { sigs: [], evals: [], late: lateness(idxByDate, [], blasts) }; continue }
    const sigs = generateSignals(base, turnTF, rs, turnoverAt, cfg)
    configs[cfg.name] = { sigs, evals: sigs.map((s) => evalSignal(daily, idxByDate, s)), late: lateness(idxByDate, sigs, blasts) }
  }
  return { symbol, dailyBars: daily.length, fourHBars: fourH.length, blasts: blasts.length, configs }
}

// ── Symbol selection ─────────────────────────────────────────────────────────
async function pickSymbols(limit) {
  if (SYMBOLS) return SYMBOLS.split(',').map((s) => s.trim()).filter(Boolean)
  if (DEMO) return null
  const { getPool } = await import('../src/db.js')
  const [rows] = await getPool().query(
    "SELECT symbol_code FROM stock_mstr WHERE is_active = 1 AND category = 'EQUITY' AND symbol_code IS NOT NULL ORDER BY RAND() LIMIT ?",
    [limit],
  )
  return rows.map((r) => r.symbol_code)
}

// ── Offline synthetic self-test ──────────────────────────────────────────────
function demoData(nSyms = 6) {
  const rnd = (() => { let s = 42; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff })()
  const mkDaily = (drift) => { const out = []; let px = 100; let t = Math.floor(Date.parse('2020-01-01') / 1000); for (let i = 0; i < 1500; i++) { px *= 1 + (rnd() - 0.5) * 0.03 + drift; out.push({ time: t, open: px, high: px * (1 + rnd() * 0.02), low: px * (1 - rnd() * 0.02), close: px, volume: Math.round(1e6 * (0.5 + rnd())) }); t += 86400 } return out }
  const mkH1 = (daily) => { const out = []; for (const d of daily) for (let k = 0; k < 6; k++) { const p = d.close * (1 + (rnd() - 0.5) * 0.01); out.push({ time: d.time + k * 3600, open: p, high: p * 1.005, low: p * 0.995, close: p, volume: Math.round(d.volume / 6) }) } return out }
  const nifty = { daily: mkDaily(0.0002), _stock: {} }; const syms = []
  for (let i = 0; i < nSyms; i++) { const sym = `DEMO${i}-EQ`; const dl = mkDaily(0.0004 + i * 0.0001); nifty._stock[sym] = { daily: dl, h1: mkH1(dl) }; syms.push(sym) }
  return { nifty, syms }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nTIMEFRAME-SHIFT BACKTEST  ${DEMO ? '(DEMO — SYNTHETIC DATA, NOT REAL RESULTS)' : ''}`)
  console.log(`blast: >=${MOVE}% within <=${WINDOW} sessions · horizons ${HORIZONS.join('/')} · from ${FROM}${MINTO > 0 ? ` · minturnover ₹${MINTO}cr` : ''}\n`)

  let nifty, candidates
  if (DEMO) { const d = demoData(6); nifty = d.nifty; candidates = d.syms }
  else {
    const poolSize = SYMBOLS ? 0 : (MINTO > 0 ? N * 8 : Math.ceil(N * 1.5))
    candidates = await pickSymbols(poolSize)
    const today = new Date().toISOString().slice(0, 10)
    nifty = { daily: await fetchTF(config.benchmarkSymbol, 'D', FROM, today) }
    if (!nifty.daily.length) { console.error('Could not fetch NIFTY daily — aborting.'); process.exit(1) }
  }

  const results = []
  for (const sym of candidates) {
    if (!DEMO && !SYMBOLS && results.length >= N) break
    try {
      const r = await runSymbol(sym, nifty)
      if (r.skip) { console.log(`  ${sym.padEnd(14)} skipped (${r.skip})`) }
      else { results.push(r); const g = CONFIGS.map((c) => `${c.name.slice(0, 4).trim()}=${r.configs[c.name].sigs.length}`).join(' '); console.log(`  ${sym.padEnd(14)} daily=${r.dailyBars} 4h=${r.fourHBars} blasts=${r.blasts} [${g}]`) }
    } catch (e) { console.log(`  ${sym.padEnd(14)} ERROR ${e.message}`) }
    if (!DEMO) await new Promise((r) => setTimeout(r, 120))
  }
  if (!results.length) { console.error('No usable symbols.'); process.exit(1) }

  const totalBlasts = results.reduce((a, r) => a + r.blasts, 0)
  console.log(`\nUsable symbols: ${results.length} · total blasts: ${totalBlasts}\n`)
  const out = { params: { N, SYMBOLS, MINTO, MOVE, WINDOW, FROM, HORIZONS }, symbols: results.length, totalBlasts, configs: {} }

  for (const cfg of CONFIGS) {
    const agg = aggregate(results.map((r) => r.configs[cfg.name].evals))
    const bl = results.reduce((a, r) => a + r.configs[cfg.name].late.blasts, 0)
    const ca = results.reduce((a, r) => a + r.configs[cfg.name].late.caught, 0)
    const leads = results.map((r) => r.configs[cfg.name].late.medianLead).filter((x) => x != null).sort((a, b) => a - b)
    const late = { blasts: bl, caught: ca, catchPct: bl ? round(ca / bl * 100, 1) : null, medLead: leads.length ? leads[Math.floor(leads.length / 2)] : null }
    out.configs[cfg.name] = { agg, late }
    console.log(`=== ${cfg.name} ===`)
    console.log(`  signals ${agg.signals} · early-catch ${late.caught}/${late.blasts} (${late.catchPct}%) · median lead ${late.medLead} sessions`)
    for (const H of HORIZONS) { const h = agg[`h${H}`]; console.log(`   +${H}d  win ${h.winRate}%  avgRet ${h.avgRet}%  maxGain ${h.avgMaxGain}%  maxDD ${h.avgMaxDD}%`) }
    console.log('')
  }

  console.log(`READ: compare CURRENT→TURN-FAST (isolates faster TURN) and CURRENT→BASE-FAST (isolates faster BASE).`)
  console.log(`If TURN-FAST captures most of SHIFTED's early-catch gain, the cheap win is just detecting the turn on daily.\n`)

  const fs = await import('node:fs')
  const path = new URL('./out-tf-shift.json', import.meta.url)
  fs.writeFileSync(path, JSON.stringify(out, null, 2))
  console.log(`Wrote ${path.pathname}`)
  if (!DEMO) { try { const { getPool } = await import('../src/db.js'); await getPool().end() } catch {} }
}

main().catch((e) => { console.error(e); process.exit(1) })
