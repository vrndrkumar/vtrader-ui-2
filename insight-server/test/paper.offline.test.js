// Offline test: calendar-anchored paper-portfolio evaluation (Mon→Fri weeks).
import assert from 'node:assert'
import { evalHolding, targetFriday, HORIZONS, SL_SCENARIOS } from '../src/paper.js'

const day = 86400
/** Build daily candles for consecutive dates from startDate (inclusive). */
function series(startDate, closes) {
  let t = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000)
  return closes.map((c, i) => {
    const bar = { time: t, open: c, high: c * 1.01, low: c * 0.99, close: c }
    t += day
    return bar
  })
}

// targetFriday: Monday 2026-08-03 → same-week Friday 2026-08-07
assert.equal(targetFriday('2026-08-03', 0), '2026-08-07', 'weekly Friday from Monday')
assert.equal(targetFriday('2026-08-03', 1), '2026-08-14', 'biweekly = next Friday')
assert.equal(targetFriday('2026-08-03', 3), '2026-08-28', 'monthly = 4th Friday')
// Tuesday start still ends that week's Friday
assert.equal(targetFriday('2026-07-28', 0), '2026-07-31', 'Tuesday cohort → same-week Friday')

// Mon 08-03 entry 100, rising to Fri 08-07; evaluate as-of a later "today"
{
  // dates: Mon03,Tue04,Wed05,Thu06,Fri07 = 100,102,104,106,110
  const daily = series('2026-08-03', [100, 102, 104, 106, 110])
  const ev = evalHolding(100, '2026-08-03', daily, '2026-08-10')
  assert.equal(ev.WEEKLY.status, 'matured', 'weekly matured after its Friday')
  assert.equal(ev.WEEKLY.exitDate, '2026-08-07', 'exits on the target Friday')
  assert.equal(ev.WEEKLY.scen[0], 10, 'Mon→Fri return = +10%')
  assert.equal(ev.WEEKLY.provisional, false, 'not provisional (Friday already passed)')
  assert.equal(ev.BIWEEKLY.status, 'in-progress', 'biweekly Friday not reached')
}

// provisional: today IS the target Friday (candle still forming)
{
  const daily = series('2026-07-28', [200, 198, 205, 210]) // Tue..Fri (28,29,30,31)
  const ev = evalHolding(200, '2026-07-28', daily, '2026-07-31')
  assert.equal(ev.WEEKLY.status, 'matured', 'matured on its Friday')
  assert.equal(ev.WEEKLY.provisional, true, 'provisional — target Friday is today')
  assert.equal(ev.WEEKLY.scen[0], 5, 'Tue→Fri provisional return +5%')
}

// SL trigger on intraday low + maxDD
{
  const daily = series('2026-08-03', [100, 95, 88, 96, 101]) // low on Wed = 88*0.99=87.12 < 90
  const ev = evalHolding(100, '2026-08-03', daily, '2026-08-10')
  assert.equal(ev.WEEKLY.scen[10], -10, '10% SL hit')
  assert.equal(ev.WEEKLY.scen[5], -5, '5% SL hit')
  assert.ok(ev.WEEKLY.scen[0] > 0, 'no-SL recovers to +1%')
  assert.ok(ev.WEEKLY.maxDD < -10, 'maxDD reflects deep low')
}

// future week → in-progress
{
  const ev = evalHolding(100, '2026-08-03', series('2026-08-03', [100, 101]), '2026-08-04')
  assert.equal(ev.WEEKLY.status, 'in-progress', 'weekly Friday not yet reached')
}
assert.equal(evalHolding(0, '2026-01-01', []), null, 'guards bad input')
assert.equal(evalHolding(100, '2026-01-01', null), null, 'guards missing candles')

assert.deepEqual(Object.keys(HORIZONS), ['WEEKLY', 'BIWEEKLY', 'MONTHLY'])
assert.deepEqual(SL_SCENARIOS, [0, 5, 10])

console.log('✓ paper-portfolio (calendar-anchored) evaluation tests passed')
