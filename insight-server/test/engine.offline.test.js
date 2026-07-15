// Offline engine test — no network, no DB.
// Builds synthetic OHLCV series (downtrend → accumulation base → breakout)
// and asserts the engine produces sane, well-shaped output.
import assert from 'node:assert'
import {
  explosionScore, historicalValidation, snapshot, technicalHealthScore, tradePlans,
} from '../src/engine.js'
import { srZones, yearContext, compression, analyseStructure } from '../src/structure.js'
import { rsi, ema, atr, macd, adx, bollinger } from '../src/indicators.js'

function synth(n = 600, seed = 42) {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const candles = []
  let px = 500
  let t = Math.floor(new Date('2020-01-01').getTime() / 1000)
  for (let i = 0; i < n; i++) {
    // regimes: 0-200 downtrend, 200-450 base (compressing), 450+ up expansion
    const drift = i < 200 ? -0.35 : i < 450 ? 0 : 0.9
    const vol = i < 200 ? 6 : i < 450 ? Math.max(1.2, 5 - (i - 200) * 0.015) : 5
    const chg = drift + (rnd() - 0.5) * vol
    const open = px
    const close = Math.max(20, px + chg)
    const high = Math.max(open, close) + rnd() * vol * 0.6
    const low = Math.min(open, close) - rnd() * vol * 0.6
    const volume = Math.round(1e6 * (i >= 440 && i < 460 ? 2.2 : i >= 300 && i < 450 ? 0.6 : 1) * (0.7 + rnd()))
    candles.push({ time: t, open, high, low, close, volume })
    px = close
    t += 86400
  }
  return candles
}

const daily = synth()
const weekly = []
for (let i = 0; i < daily.length; i += 5) {
  const chunk = daily.slice(i, i + 5)
  weekly.push({
    time: chunk[0].time,
    open: chunk[0].open,
    high: Math.max(...chunk.map((c) => c.high)),
    low: Math.min(...chunk.map((c) => c.low)),
    close: chunk[chunk.length - 1].close,
    volume: chunk.reduce((s, c) => s + c.volume, 0),
  })
}

// ── indicator sanity ─────────────────────────────────────────────────────────
const closesArr = daily.map((c) => c.close)
const r = rsi(closesArr, 14)
assert.ok(r.slice(-50).every((v) => v == null || (v >= 0 && v <= 100)), 'RSI in [0,100]')
const e = ema(closesArr, 20)
assert.ok(e[e.length - 1] > 0, 'EMA defined')
const a = atr(daily, 14)
assert.ok(a[a.length - 1] > 0, 'ATR positive')
const m = macd(closesArr)
assert.ok(m.hist.filter((v) => v != null).length > 100, 'MACD hist defined')
const ax = adx(daily, 14)
assert.ok(ax.adx.filter((v) => v != null).every((v) => v >= 0 && v <= 100), 'ADX in range')
const bb = bollinger(closesArr, 20, 2)
assert.ok(bb.upper[bb.upper.length - 1] > bb.lower[bb.lower.length - 1], 'BB upper > lower')

// ── structure / compression ─────────────────────────────────────────────────
const struct = analyseStructure(daily)
assert.ok(['UPTREND', 'DOWNTREND', 'RANGE', 'UNKNOWN'].includes(struct.trend), 'trend classified')
const baseSlice = daily.slice(250, 450)
const comp = compression(baseSlice)
assert.ok(comp.bbWidthPct != null, 'compression measured')
const zones = srZones(daily.slice(-260))
assert.ok(Array.isArray(zones), 'zones array')
zones.forEach((z) => assert.ok(z.lo <= z.hi && z.touches >= 2, 'zone shape'))
const yc = yearContext(daily)
assert.ok(yc.high52w >= yc.low52w, '52w context')

// ── snapshots & scores ───────────────────────────────────────────────────────
const snaps = {
  '15m': snapshot([], '15m'),
  '30m': snapshot([], '30m'),
  '1h': snapshot(daily.slice(-120), '1h'),
  '4h': snapshot(daily.slice(-180), '4h'),
  daily: snapshot(daily, 'daily'),
  weekly: snapshot(weekly, 'weekly'),
  monthly: snapshot([], 'monthly'),
  yearContext: yc,
}
assert.equal(snaps['15m'].available, false, 'empty tf flagged unavailable')
assert.equal(snaps.daily.available, true, 'daily available')

const th = technicalHealthScore(snaps)
assert.ok(th.score >= 0 && th.score <= 100, `tech health in range (got ${th.score})`)
assert.ok(th.components.length >= 4, 'health components present')

const hist = historicalValidation(daily)
assert.ok(hist.sampleSize >= 0, 'historical validation runs')
if (hist.sampleSize > 0) {
  assert.ok(hist.winRate >= 0 && hist.winRate <= 100, 'win rate in range')
  assert.ok(Math.abs(hist.avgDrawdownPct) < 100, 'drawdown sane')
}

const rsStub = { improving: true, outperforming20: true, outperforming60: false, slope20: 0.1, slope60: -0.05 }
const ex = explosionScore(snaps, rsStub, hist)
assert.ok(ex.score >= 0 && ex.score <= 100, `explosion in range (got ${ex.score})`)
assert.ok(Array.isArray(ex.evidence) && Array.isArray(ex.against), 'evidence lists')

const plans = tradePlans(snaps, zones)
assert.ok(plans.intraday && plans.swing && plans.longTerm, 'three plans')
for (const p of Object.values(plans)) {
  assert.ok(p.entryZone[0] <= p.entryZone[1], 'entry zone ordered')
  assert.ok(p.stopLoss < p.entryZone[1], 'stop below entry')
  assert.ok(p.targets[0] <= p.targets[1] && p.targets[1] <= p.targets[2], 'targets ordered')
}

console.log('✓ all offline engine assertions passed')
console.log(`  tech health: ${th.score}, explosion: ${ex.score}, hist samples: ${hist.sampleSize}${hist.sampleSize ? ` (win ${hist.winRate}%)` : ''}`)
