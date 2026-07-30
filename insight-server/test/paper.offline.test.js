// Offline test: paper-portfolio holding evaluation (SL scenarios, horizons, DD).
import assert from 'node:assert'
import { evalHolding, HORIZONS, SL_SCENARIOS } from '../src/paper.js'

const day = 86400
function series(entryDate, closes) {
  // closes: array starting the day AFTER entryDate
  let t = Math.floor(new Date(entryDate + 'T00:00:00Z').getTime() / 1000)
  const out = [{ time: t, open: closes[0], high: closes[0], low: closes[0], close: closes[0] }] // entry-day bar
  for (let i = 1; i < closes.length; i++) {
    t += day
    const c = closes[i]
    out.push({ time: t, open: c, high: c * 1.01, low: c * 0.99, close: c })
  }
  return out
}

// 1) straight +10% winner over 5 bars, no SL hit
{
  const entry = 100
  const closes = [100, 102, 104, 106, 108, 110] // entry-day + 5 forward
  const daily = series('2026-01-01', closes)
  const ev = evalHolding(entry, '2026-01-01', daily)
  assert.equal(ev['1W'].status, 'matured', '1W matures with 5 forward bars')
  assert.equal(ev['1W'].scen[0], 10, 'no-SL return +10%')
  assert.equal(ev['1W'].scen[5], 10, '5% SL not hit → full return')
  assert.equal(ev['2W'].status, 'in-progress', '2W needs 10 bars')
}

// 2) SL triggers: drops 12% intraday then recovers
{
  const entry = 100
  // forward closes with a deep low on bar 2 (low = close*0.99, so close 89 → low 88.11 < 90)
  const daily = series('2026-02-01', [100, 95, 88, 96, 101, 103])
  const ev = evalHolding(entry, '2026-02-01', daily)
  assert.equal(ev['1W'].scen[10], -10, '10% SL hit (low pierced 90) → -10%')
  assert.equal(ev['1W'].scen[5], -5, '5% SL hit → -5%')
  assert.ok(ev['1W'].scen[0] > 0, 'no-SL recovers to positive close')
  assert.ok(ev['1W'].maxDD < -10, `maxDD reflects the deep low (${ev['1W'].maxDD})`)
}

// 3) not enough data → null-ish / in-progress
{
  const ev = evalHolding(100, '2026-03-01', series('2026-03-01', [100, 101, 102]))
  assert.equal(ev['1W'].status, 'in-progress', '3 bars < 5 → in-progress')
}
assert.equal(evalHolding(0, '2026-01-01', []), null, 'guards bad input')
assert.equal(evalHolding(100, '2026-01-01', null), null, 'guards missing candles')

// horizons + scenarios exported sanely
assert.deepEqual(Object.keys(HORIZONS), ['1W', '2W', '1M', '3M'])
assert.deepEqual(SL_SCENARIOS, [0, 5, 10])

console.log('✓ paper-portfolio evaluation tests passed')
