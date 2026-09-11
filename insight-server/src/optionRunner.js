// ── Headless Option-signal runner ────────────────────────────────────────────
// Runs the SAME engine as the UI (bundled from src/insight/options/engine.ts)
// on the server, on a schedule during market hours, and logs every decision to
// the Option Lab. This makes Option Lab self-sufficient like Stock Lab — no open
// browser tab required. Data source: the option-chain (Greeks) API + index candles.
import { analyseOptions, OPT_ENGINE_VERSION } from './optionEngine.bundle.js'
import { recordSignal, fetchOptionChain, marketOpenNow } from './optionLab.js'
import { config } from './config.js'

const memory = new Map() // per-index engine memory (session continuity)
export const runnerState = { lastRun: null, lastResult: {}, running: false }

const istDate = () => new Date(Date.now() + 5.5 * 3600e3)
const fmtDay = (d) => d.toISOString().slice(0, 10)
const istParts = () => { const d = istDate(); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() } }
const hhmm = () => { const d = istDate(); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` }

const expiryCache = new Map() // "index|day" -> nearest expiry ISO that returned a chain

/** Candidate near-term expiry dates (Tue/Wed/Thu weeklies within ~12 days, plus
 *  month-end Tue/Wed/Thu for monthlies) — nearest first. Rule-agnostic. */
function candidateExpiries() {
  const base = istDate()
  const set = new Set()
  for (let i = 0; i < 12; i++) {
    const d = new Date(base); d.setUTCDate(base.getUTCDate() + i)
    if ([2, 3, 4].includes(d.getUTCDay())) set.add(fmtDay(d))
  }
  for (const mo of [0, 1]) {
    const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + mo + 1, 0))
    for (let back = 0; back < 7; back++) {
      const x = new Date(last); x.setUTCDate(last.getUTCDate() - back)
      if ([2, 3, 4].includes(x.getUTCDay()) && x >= base) set.add(fmtDay(x))
    }
  }
  return [...set].sort()
}

/** Find (and cache per day) the nearest expiry that returns a real chain. */
async function discoverExpiry(index) {
  const day = fmtDay(istDate())
  const key = `${index}|${day}`
  if (expiryCache.has(key)) return expiryCache.get(key)
  for (const iso of candidateExpiries()) {
    try {
      const j = await fetchOptionChain(index, iso, day, hhmm())
      if (j?.chain?.length && j.spot != null) { expiryCache.set(key, iso); return iso }
    } catch { /* try next candidate */ }
  }
  expiryCache.set(key, null) // give up for the day (avoid re-probing every run)
  return null
}

async function fetchCandles(symbol, frequency, days) {
  const to = new Date()
  const from = new Date(to.getTime() - days * 864e5)
  const url = `${config.candleBaseUrl}/data/candle?symbol=${encodeURIComponent(symbol)}&from=${fmtDay(from)}&to=${fmtDay(to)}&frequency=${frequency}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`candle ${res.status}`)
    const j = await res.json()
    return (Array.isArray(j?.candles) ? j.candles : [])
      .filter((c) => Number.isFinite(c?.close))
      .map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 }))
      .sort((a, b) => a.time - b.time)
  } finally { clearTimeout(timer) }
}

function toChainInput(chainJson) {
  const leg = (o) => o ? {
    ltp: o.ltp, volume: o.volume ?? 0, bid: o.bid ?? 0, ask: o.ask ?? 0, symbol: o.symbol,
    delta: o.delta ?? null, gamma: o.gamma ?? null, theta: o.theta ?? null, vega: o.vega ?? null, iv: o.iv ?? null, oi: o.oi ?? null,
  } : undefined
  return (chainJson.chain || []).map((r) => ({ strike: r.strike, ce: leg(r.call), pe: leg(r.put) }))
}

function mapPayload(rep, expiryIso, chainJson) {
  const bt = rep.bestTrade
  const dirProb = Math.max(rep.probabilities.bullish, rep.probabilities.bearish)
  const up = rep.structure.filter((s) => s.trend === 'UP').length
  const dn = rep.structure.filter((s) => s.trend === 'DOWN').length
  const s15 = rep.structure.find((s) => s.tf === '15m')
  // greeks of the chosen leg, straight from the snapshot
  let greeks = null
  if (bt?.strike != null) {
    const row = (chainJson.chain || []).find((r) => Number(r.strike) === Number(bt.strike))
    const o = row ? (bt.side === 'CE' ? row.call : row.put) : null
    if (o) greeks = { delta: o.delta, gamma: o.gamma, theta: o.theta, vega: o.vega, iv: o.iv, oi: o.oi, snapVix: chainJson.india_vix, snapSpot: chainJson.spot }
  }
  return {
    index: rep.index, verdict: rep.strategy.verdict, active: rep.strategy.verdict !== 'NO TRADE',
    action: bt?.action ?? null, side: bt?.side ?? null, moneyness: bt?.moneyness ?? null, strike: bt?.strike ?? null,
    expiry: expiryIso, expiryLabel: rep.expiry.current, dte: rep.expiry.dte,
    entryPremium: bt?.entry ?? null, slPremium: bt?.stopLoss ?? null, t1Premium: bt?.target1 ?? null, t2Premium: bt?.target2 ?? null,
    rr: bt?.rr ?? null, confidence: bt?.confidencePct ?? rep.recommendation?.confidencePct ?? Math.round((rep.quality.score ?? 50) * 0.5 + dirProb * 0.35),
    stars: bt?.stars ?? null, reason: rep.strategyMatrix.whyBest ?? rep.strategy.reasons.join('; '),
    spot: rep.projection.current, vix: rep.vix.value, mqs: rep.quality.score,
    dirProb, upTfs: up, dnTfs: dn, adx15: s15?.adx ?? null, atr15: s15?.atrPts ?? null,
    pcr: rep.chain.pcrVolume, liquidity: rep.chain.liquidity, spreadPct: rep.chain.atmSpreadPct,
    premiumRichness: bt?.premiumRichness ?? null, deltaProxy: bt?.deltaProxy ?? null,
    failingGates: rep.strategy.gates.filter((g) => g.pass !== true).map((g) => `${g.gate}: ${g.detail}`),
    greeks, engineVersion: rep.engineVersion || OPT_ENGINE_VERSION,
    timeBlock: rep.timeBlocks.find((b) => b.current)?.block ?? null,
    evidence: {
      bullish: rep.probabilities.bullish, bearish: rep.probabilities.bearish, rangebound: rep.probabilities.rangebound,
      orState: rep.session.orState, gapType: rep.session.gapType, sentiment: rep.sentiment.label, vixBand: rep.vix.band,
      thetaPressure: rep.expiry.thetaPressure, whyNotSecond: rep.strategyMatrix.whyNotSecond,
    },
  }
}

async function runOne(index) {
  const expiry = await discoverExpiry(index)
  if (!expiry) return { index, skip: 'no expiry with a live chain' }
  const day = fmtDay(istDate())
  const chainJson = await fetchOptionChain(index, expiry, day, hhmm())
  if (!chainJson?.chain?.length || chainJson.spot == null) return { index, skip: 'no chain/spot' }
  const [m3, m5, m15, m30, daily, vixDaily] = await Promise.all([
    fetchCandles(index, '3', 5).catch(() => []),
    fetchCandles(index, '5', 7).catch(() => []),
    fetchCandles(index, '15', 12).catch(() => []),
    fetchCandles(index, '30', 20).catch(() => []),
    fetchCandles(index, 'D', 30).catch(() => []),
    fetchCandles('INDIAVIX', 'D', 10).catch(() => []),
  ])
  if (!daily.length || !m5.length) return { index, skip: 'no candles' }
  const input = {
    index, nowIst: istParts(), spot: chainJson.spot, spotTs: Math.floor(Date.now() / 1000),
    vix: chainJson.india_vix ?? null, vixPrevClose: vixDaily.length >= 2 ? vixDaily[vixDaily.length - 2].close : null,
    daily, tf: { m3, m5, m15, m30 }, expiries: [expiry], chain: toChainInput(chainJson), chainExpiry: expiry,
  }
  const rep = analyseOptions(input, memory.get(index) ?? null)
  memory.set(index, rep.memory)
  const r = await recordSignal(mapPayload(rep, expiry, chainJson))
  return { index, verdict: rep.strategy.verdict, best: rep.bestTrade ? `${rep.bestTrade.action} ${rep.bestTrade.strike} ${rep.bestTrade.side}` : null, logged: !r.deduped }
}

export async function runOptionSignals(indices = ['NIFTY', 'BANKNIFTY', 'SENSEX']) {
  if (runnerState.running) return runnerState
  runnerState.running = true
  const out = {}
  try {
    for (const idx of indices) {
      try { out[idx] = await runOne(idx) } catch (e) { out[idx] = { index: idx, error: e.message } }
    }
  } finally {
    runnerState.running = false
    runnerState.lastRun = new Date().toISOString()
    runnerState.lastResult = out
  }
  return runnerState
}

export { marketOpenNow }
