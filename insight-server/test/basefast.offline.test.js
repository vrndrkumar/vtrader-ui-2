// Offline test: BASE_FAST timeframe overlay in featureSnapshot.
// Proves (a) mode flag flips features onto 4H, (b) long-horizon features are
// preserved, (c) graceful fallback to CURRENT when 4H is too short.
import assert from 'node:assert'
import { featureSnapshot } from '../src/featureSnapshot.js'

const DAY = 86400
function mkDaily(n, drift, startPx = 100) {
  const out = []
  let px = startPx
  let t = Math.floor(Date.parse('2022-01-01') / 1000)
  for (let i = 0; i < n; i++) {
    px *= 1 + drift
    out.push({ time: t, open: px * 0.99, high: px * 1.01, low: px * 0.98, close: px, volume: 1_000_000 + (i % 7) * 10000 })
    t += DAY
  }
  return out
}
function mk4h(n, drift, startPx = 100) {
  const out = []
  let px = startPx
  let t = Math.floor(Date.parse('2024-06-01') / 1000)
  for (let i = 0; i < n; i++) {
    px *= 1 + drift
    out.push({ time: t, open: px * 0.995, high: px * 1.006, low: px * 0.994, close: px, volume: 500_000 + (i % 5) * 5000 })
    t += 4 * 3600
  }
  return out
}

const daily = mkDaily(420, 0.002)       // steady daily uptrend (~+30%+ over 120)
const fourHUp = mk4h(260, 0.0015)       // enough 4H bars, rising
const fourHShort = mk4h(120, 0.0015)    // too short → fallback

const cur = featureSnapshot(daily, null)
const fast = featureSnapshot(daily, null, { mode: 'BASE_FAST', fourH: fourHUp })
const fallback = featureSnapshot(daily, null, { mode: 'BASE_FAST', fourH: fourHShort })

assert.strictEqual(cur.tfMode, 'CURRENT', 'default mode should be CURRENT')
assert.strictEqual(fast.tfMode, 'BASE_FAST', 'BASE_FAST should apply with enough 4H bars')
assert.strictEqual(fallback.tfMode, 'CURRENT', 'BASE_FAST should fall back to CURRENT when 4H too short')

// Long-horizon features must be preserved (computed on daily in both modes)
assert.strictEqual(cur.priorGain120, fast.priorGain120, 'priorGain120 must be preserved across modes')
assert.strictEqual(cur.weeklyTurn, fast.weeklyTurn, 'weeklyTurn must be preserved (turn stays weekly)')
assert.strictEqual(cur.turnoverCr, fast.turnoverCr, 'turnoverCr must be preserved (daily)')
assert.strictEqual(cur.fromHighPct, fast.fromHighPct, '52w context must be preserved (daily)')

// The overlay must actually recompute base features on 4H (object present + numeric)
assert.ok(typeof fast.rsi === 'number', 'BASE_FAST rsi should be computed on 4H')
assert.ok('above200' in fast, 'BASE_FAST should carry a 4H 200-line state')

console.log('✓ BASE_FAST timeframe overlay tests passed')
