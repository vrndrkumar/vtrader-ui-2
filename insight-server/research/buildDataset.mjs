// ── Phase 1: labeled ML dataset from real option history ─────────────────────
// For every historical NIFTY session + decision time, run the engine to compute
// features, then for EVERY candidate strategy (the 12 the matrix evaluates)
// resolve its REAL forward outcome (R multiple) on premium snapshots — no
// look-ahead (bracket frozen at signal time; only later snapshots decide it).
// Emits a flat features+label CSV for model training.
//
//   node research/buildDataset.mjs                       # last 2 years, NIFTY
//   node research/buildDataset.mjs 2024-01-01 2026-09-09 NIFTY
//
// Output: research/out/dataset.csv  (+ dataset-meta.json)
import { analyseOptions, OPT_ENGINE_VERSION } from '../src/optionEngineV2.bundle.js'
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.CANDLE_BASE_URL || 'https://data.vtrader.in'
const SYMBOL = process.argv[4] || 'NIFTY'
const GRID = Number(process.env.GRID || 15)
const DECIDE = Number(process.env.DECIDE || 30)
const OPEN_MIN = 9 * 60 + 20, CLOSE_MIN = 15 * 60 + 15, SQUAREOFF_MIN = 15 * 60 + 15

const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(d.getUTCDate() + n); return x }
function tradingDays(f, t) { const o = []; for (let d = new Date(f + 'T00:00:00Z'); iso(d) <= t; d = addDays(d, 1)) { const w = d.getUTCDay(); if (w && w !== 6) o.push(iso(d)) } return o }
const tsFor = (day, m) => Date.parse(`${day}T00:00:00+05:30`) / 1000 + m * 60
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 25000); const r = await fetch(url, { signal: c.signal }); clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json() }
    catch (e) { if (i === tries - 1) throw e; await new Promise((s) => setTimeout(s, 400 * (i + 1))) }
  }
}
const chainCache = new Map()
async function fetchChain(exp, day, m) { const k = `${exp}|${day}|${m}`; if (chainCache.has(k)) return chainCache.get(k); let j = null; try { j = await getJSON(`${BASE}/data/option-chain?symbol=${SYMBOL}&expiry=${exp}&date=${day}&time=${hhmm(m)}`) } catch { j = null } chainCache.set(k, j); return j }
async function fetchCandles(sym, freq, f, t) { try { const j = await getJSON(`${BASE}/data/candle?symbol=${sym}&from=${f}&to=${t}&frequency=${freq}`); return (Array.isArray(j?.candles) ? j.candles : []).filter((c) => Number.isFinite(c?.close)).map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })).sort((a, b) => a.time - b.time) } catch { return [] } }
async function nearestExpiry(day) { let j = null; try { j = await getJSON(`${BASE}/data/expiries?symbol=${SYMBOL}&date=${day}`) } catch { return null } const xs = (j?.expiries || []).map((e) => e.date).filter(Boolean).sort(); return xs.find((d) => d >= day) || xs[0] || null }
const toChainInput = (cj) => (cj?.chain || []).map((r) => { const leg = (o) => o ? { ltp: o.ltp, volume: o.volume ?? 0, bid: o.bid ?? 0, ask: o.ask ?? 0, symbol: o.symbol, delta: o.delta ?? null, gamma: o.gamma ?? null, theta: o.theta ?? null, vega: o.vega ?? null, iv: o.iv ?? null, oi: o.oi ?? null } : undefined; return { strike: r.strike, ce: leg(r.call), pe: leg(r.put) } })
function leg(cj, strike, side) { const row = (cj?.chain || []).find((r) => Number(r.strike) === Number(strike)); if (!row) return null; const l = side === 'CE' ? row.call : row.put; return l ? { ltp: l.ltp ?? null, delta: l.delta ?? null, gamma: l.gamma ?? null, theta: l.theta ?? null, vega: l.vega ?? null, iv: l.iv ?? null, oi: l.oi ?? null } : null }

// ── encoders ─────────────────────────────────────────────────────────────────
const ordVix = (b) => ({ 'Very Low': 0, Low: 1, Normal: 2, Elevated: 3, High: 4, Extreme: 5 })[b] ?? ''
const ordGap = (g) => ({ 'Gap Down': -1, Flat: 0, 'Gap Up': 1 })[g] ?? ''
const ordOr = (s) => ({ 'Below OR': -1, 'Inside OR': 0, 'Above OR': 1 })[s] ?? ''
const ordTrend = (t) => ({ DOWN: -1, SIDEWAYS: 0, UP: 1 })[t] ?? ''
const ordLiq = (l) => ({ Poor: 0, Acceptable: 1, Good: 2, Unknown: '' })[l] ?? ''
const ordRich = (r) => ({ Cheap: -1, Fair: 0, Rich: 1, Unknown: '' })[r] ?? ''
const ordMoney = (m) => ({ ITM: 1, ATM: 0, OTM: -1 })[m] ?? ''
const b01 = (v) => v === true ? 1 : v === false ? 0 : ''
const nz = (v) => (v == null || !Number.isFinite(v) ? '' : +(+v).toFixed(4))

function marketFeatures(rep, mins, day) {
  const s = (i) => rep.structure[i] || {}
  const tf = (i, p) => nz(s(i)[p])
  const kl = rep.keyLevels, spot = rep.projection.current
  const rel = (lvl) => (spot != null && lvl != null && spot > 0) ? +(((spot - lvl) / spot) * 100).toFixed(4) : ''
  return {
    day, mins, dow: new Date(day + 'T00:00:00Z').getUTCDay(),
    dte: rep.expiry.dte ?? '', isExpiry: rep.expiry.isExpiryDay ? 1 : 0,
    vix: nz(rep.vix.value), vixChg: nz(rep.vix.changePct), vixBand: ordVix(rep.vix.band),
    gap: nz(rep.session.gapPct), gapType: ordGap(rep.session.gapType), orState: ordOr(rep.session.orState),
    upTfs: rep.structure.filter((x) => x.trend === 'UP').length, dnTfs: rep.structure.filter((x) => x.trend === 'DOWN').length,
    // per-TF (3m,5m,15m,30m)
    t3trend: ordTrend(s(0).trend), t3rsi: tf(0, 'rsi'), t3adx: tf(0, 'adx'), t3atr: tf(0, 'atrPts'), t3st: b01(s(0).supertrendUp), t3macd: b01(s(0).macdBull), t3vwap: b01(s(0).aboveVwap),
    t5trend: ordTrend(s(1).trend), t5rsi: tf(1, 'rsi'), t5adx: tf(1, 'adx'), t5atr: tf(1, 'atrPts'), t5st: b01(s(1).supertrendUp), t5macd: b01(s(1).macdBull),
    t15trend: ordTrend(s(2).trend), t15rsi: tf(2, 'rsi'), t15adx: tf(2, 'adx'), t15atr: tf(2, 'atrPts'), t15st: b01(s(2).supertrendUp), t15macd: b01(s(2).macdBull), t15e20: b01(s(2).ema20), t15e50: b01(s(2).ema50), t15e200: b01(s(2).ema200),
    t30trend: ordTrend(s(3).trend), t30adx: tf(3, 'adx'), t30st: b01(s(3).supertrendUp),
    bull: rep.probabilities.bullish, bear: rep.probabilities.bearish, range: rep.probabilities.rangebound, hv: rep.probabilities.highVol,
    sentConf: rep.sentiment.confidencePct, mqs: rep.quality.score ?? '',
    straddlePct: nz(rep.chain.straddlePctOfSpot), impRange: nz(rep.projection.expectedRangePts), pcr: nz(rep.chain.pcrVolume), atmSpread: nz(rep.chain.atmSpreadPct), liq: ordLiq(rep.chain.liquidity),
    relPivot: rel(kl.pivot), relS1: rel(kl.s1), relR1: rel(kl.r1),
  }
}

function bracket(cand, atr15, lg) {
  const prem = cand.premium
  if (prem == null || atr15 == null) return null
  if (cand.action === 'BUY') {
    const d = lg?.delta != null ? Math.abs(lg.delta) : (cand.moneyness === 'ATM' ? 0.5 : cand.moneyness === 'ITM' ? 0.65 : 0.35)
    return { sl: Math.max(0.05, prem - atr15 * 0.9 * d), t1: prem + atr15 * 1.8 * d, t2: prem + atr15 * 3 * d }
  }
  return { sl: prem * 1.35, t1: prem * 0.55, t2: prem * 0.3 } // sell (v2.3 stop)
}
// resolve a candidate forward on the grid; returns {R,pnl,status,mfe,mae,minutes}
function resolveForward(cand, br, snaps, grid, fromMin) {
  const buy = cand.action === 'BUY', entry = cand.premium
  let mfe = 0, mae = 0
  for (const m of grid) {
    if (m <= fromMin) continue
    const lg = snaps.get(m) ? leg(snaps.get(m), cand.strike, cand.side) : null
    const ltp = lg?.ltp
    if (ltp == null || !Number.isFinite(ltp)) continue
    const fav = buy ? ltp - entry : entry - ltp
    mfe = Math.max(mfe, fav); mae = Math.min(mae, fav)
    let status = null, exit = null
    if (buy) { if (ltp >= br.t2) { status = 'TARGET2'; exit = br.t2 } else if (ltp >= br.t1) { status = 'TARGET1'; exit = br.t1 } else if (ltp <= br.sl) { status = 'SL'; exit = br.sl } }
    else { if (ltp <= br.t2) { status = 'TARGET2'; exit = br.t2 } else if (ltp <= br.t1) { status = 'TARGET1'; exit = br.t1 } else if (ltp >= br.sl) { status = 'SL'; exit = br.sl } }
    if (status) { const pnl = buy ? exit - entry : entry - exit; const risk = buy ? entry - br.sl : br.sl - entry; return { R: risk > 0 ? +(pnl / risk).toFixed(4) : '', pnl: +pnl.toFixed(4), status, mfe: +mfe.toFixed(2), mae: +mae.toFixed(2), minutes: m - fromMin } }
  }
  // EOD square-off at last valid snapshot
  for (let i = grid.length - 1; i >= 0; i--) { const m = grid[i]; if (m <= fromMin) break; const lg = snaps.get(m) ? leg(snaps.get(m), cand.strike, cand.side) : null; const ltp = lg?.ltp; if (ltp != null && Number.isFinite(ltp)) { const pnl = buy ? ltp - entry : entry - ltp; const risk = buy ? entry - br.sl : br.sl - entry; return { R: risk > 0 ? +(pnl / risk).toFixed(4) : '', pnl: +pnl.toFixed(4), status: 'CLOSED', mfe: +mfe.toFixed(2), mae: +mae.toFixed(2), minutes: m - fromMin } } }
  return null
}

let HEADER = null
const OUT = new URL('./out/dataset.csv', import.meta.url)
function emit(rows) {
  if (!rows.length) return
  if (!HEADER) { HEADER = Object.keys(rows[0]); writeFileSync(OUT, HEADER.join(',') + '\n') }
  const body = rows.map((r) => HEADER.map((h) => r[h] ?? '').join(',')).join('\n') + '\n'
  appendFileSync(OUT, body)
}

async function processDay(day) {
  const expiry = await nearestExpiry(day); if (!expiry) return 0
  const [m3, m5, m15, m30, D, vixD] = await Promise.all([
    fetchCandles(SYMBOL, '3', iso(addDays(new Date(day), -6)), day), fetchCandles(SYMBOL, '5', iso(addDays(new Date(day), -8)), day),
    fetchCandles(SYMBOL, '15', iso(addDays(new Date(day), -14)), day), fetchCandles(SYMBOL, '30', iso(addDays(new Date(day), -22)), day),
    fetchCandles(SYMBOL, 'D', iso(addDays(new Date(day), -40)), day), fetchCandles('INDIAVIX', 'D', iso(addDays(new Date(day), -12)), day),
  ])
  if (!D.length || !m5.length) return 0
  const grid = []; for (let m = OPEN_MIN; m <= SQUAREOFF_MIN; m += GRID) grid.push(m)
  const snaps = new Map(); for (const m of grid) snaps.set(m, await fetchChain(expiry, day, m))
  if (![...snaps.values()].some((s) => s?.chain?.length)) return 0
  const rows = []
  for (const min of grid) {
    if ((min - OPEN_MIN) % DECIDE !== 0 || min > CLOSE_MIN - GRID) continue
    const snap = snaps.get(min); if (!snap?.chain?.length || snap.spot == null) continue
    const cut = tsFor(day, min), sl = (a) => a.filter((c) => c.time <= cut)
    let rep = null
    try { rep = analyseOptions({ index: SYMBOL, nowIst: { y: +day.slice(0, 4), m: +day.slice(5, 7) - 1, d: +day.slice(8, 10), hh: Math.floor(min / 60), mm: min % 60 }, spot: snap.spot, spotTs: cut, vix: snap.india_vix ?? null, vixPrevClose: vixD.length >= 2 ? vixD[vixD.length - 2].close : null, daily: sl(D), tf: { m3: sl(m3), m5: sl(m5), m15: sl(m15), m30: sl(m30) }, expiries: [expiry], chain: toChainInput(snap), chainExpiry: expiry }) } catch { rep = null }
    if (!rep) continue
    const mf = marketFeatures(rep, min, day)
    const atr15 = rep.structure[2]?.atrPts ?? null
    for (const cand of rep.strategyMatrix.ranked) {
      if (cand.premium == null || cand.strike == null) continue
      const lg = leg(snap, cand.strike, cand.side)
      const br = bracket(cand, atr15, lg); if (!br) continue
      const out = resolveForward(cand, br, snaps, grid, min); if (!out) continue
      rows.push({
        ...mf,
        action: cand.action === 'BUY' ? 1 : 0, side: cand.side === 'CE' ? 1 : 0, moneyness: ordMoney(cand.moneyness),
        premium: nz(cand.premium), delta: nz(lg?.delta != null ? Math.abs(lg.delta) : null), gamma: nz(lg?.gamma), theta: nz(lg?.theta), vega: nz(lg?.vega), civ: nz(lg?.iv), coi: nz(lg?.oi),
        cspread: nz(cand.spreadPct), rich: ordRich(cand.premiumRichness), rr: nz(cand.rr), trendConf: b01(cand.trendConfirm), volConf: b01(cand.volumeConfirm), stars: cand.stars, v2score: cand.score, v2prob: cand.probPct,
        rejected: cand.rejected ? 1 : 0,
        // ── labels ──
        y_R: out.R, y_pnl: out.pnl, y_status: out.status, y_win: (out.pnl > 0 ? 1 : 0), y_mfe: out.mfe, y_mae: out.mae, y_min: out.minutes,
      })
    }
  }
  emit(rows); return rows.length
}

async function main() {
  const today = new Date()
  const from = process.argv[2] || iso(addDays(today, -730))
  const to = process.argv[3] || iso(addDays(today, -1))
  const days = tradingDays(from, to)
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true })
  console.log(`Dataset ${SYMBOL} ${from}→${to} (${days.length} weekdays) via ${OPT_ENGINE_VERSION}`)
  let total = 0, done = 0, withData = 0
  for (const day of days) {
    let n = 0; try { n = await processDay(day) } catch (e) { /* skip bad day */ }
    total += n; if (n) withData++; done++
    if (done % 10 === 0) process.stdout.write(`  …${done}/${days.length} days · ${total} rows\n`)
  }
  writeFileSync(new URL('./out/dataset-meta.json', import.meta.url), JSON.stringify({ symbol: SYMBOL, from, to, weekdays: days.length, daysWithData: withData, rows: total, engine: OPT_ENGINE_VERSION, gridMin: GRID, decideMin: DECIDE, generatedAt: new Date().toISOString() }, null, 2))
  console.log(`\nDONE · ${total} rows from ${withData} sessions → research/out/dataset.csv`)
}
main().catch((e) => { console.error(e); process.exit(1) })
