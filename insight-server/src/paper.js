// ── Paper-Portfolio Attribution ("Strategy Lab") ────────────────────────────
// Answers the trader's real question: WHICH dashboard category is worth acting
// on? Every cohort start, we paper-buy ₹10k of the top names in each category,
// then score forward returns at 1w/2w/1m/3m vs NIFTY, under different stop-loss
// rules. Survivorship-free (entries recorded before outcomes exist). No costs
// modelled (per product decision) — pure price attribution.
import { getPool } from './db.js'
import { getDashboard } from './analysisStore.js'
import { fetchDaily } from './candles.js'
import { config } from './config.js'
import { ENGINE_VERSION } from './engines.js'

const INVEST = 10000
const TOP_N = 20 // capture top-20 per category; UI slices to 5/10/20
// Calendar-anchored: every cohort is entered Monday 09:30 and evaluated at the
// FRIDAY close (15:30) of the target week — Monday & Friday both inclusive.
// value = how many Fridays ahead (0 = this week's Friday).
export const HORIZONS = { WEEKLY: 0, BIWEEKLY: 1, MONTHLY: 3 }
export const SL_SCENARIOS = [0, 5, 10] // %; 0 = no stop

const dateStr = (c) => new Date(c.time * 1000).toISOString().slice(0, 10)
const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)

/** The Friday date `weekOffset` weeks after the cohort's start week. */
export function targetFriday(startDate, weekOffset) {
  const d = new Date(startDate + 'T00:00:00Z')
  const dow = d.getUTCDay() // Mon=1 … Fri=5
  const t = new Date(d)
  t.setUTCDate(d.getUTCDate() + (5 - dow) + weekOffset * 7)
  return t.toISOString().slice(0, 10)
}
// dashboard keys we attribute (label → getDashboard field)
const CATEGORIES = {
  'Top Picks': 'topPicks',
  'Gems × Fundamentals': 'gemsWithFundamentals',
  'Top Hidden Gems': 'topHiddenGems',
  'Top Discovery': 'topDiscovery',
  'Biggest Improvers': 'biggestImprovers',
  'New Signals': 'newSignals',
  'Momentum Leaders': 'momentumLeaders',
  'Sector Leaders': 'sectorLeaders',
  'Highest Risk': 'highestRisk',
}

export async function ensurePaperSchema() {
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_cohort (
      id BIGINT NOT NULL AUTO_INCREMENT,
      cohort_key VARCHAR(20) NOT NULL,
      start_date DATE NOT NULL,
      engine_version VARCHAR(24) NULL,
      nifty_start DECIMAL(14,2) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_key (cohort_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_holding (
      id BIGINT NOT NULL AUTO_INCREMENT,
      cohort_id BIGINT NOT NULL,
      category VARCHAR(40) NOT NULL,
      rank_in_cat INT NOT NULL,
      symbol_code VARCHAR(50) NOT NULL,
      entry_price DECIMAL(14,2) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cohort_cat (cohort_id, category),
      KEY idx_symbol (symbol_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  // Locked results — once a horizon's Friday candle is OFFICIAL (final), we
  // snapshot the exits so the number can never move again (settlement drift).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_lock (
      cohort_id BIGINT NOT NULL,
      horizon VARCHAR(12) NOT NULL,
      exit_date DATE NULL,
      nifty_exit DECIMAL(14,2) NULL,
      locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cohort_id, horizon)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_exit (
      cohort_id BIGINT NOT NULL,
      horizon VARCHAR(12) NOT NULL,
      symbol_code VARCHAR(50) NOT NULL,
      exit_close DECIMAL(14,2) NULL,
      min_low DECIMAL(14,2) NULL,
      PRIMARY KEY (cohort_id, horizon, symbol_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  // Precomputed forward outcomes per transition (immutable once stored).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transition_outcome (
      transition_id BIGINT NOT NULL,
      horizon VARCHAR(12) NOT NULL,
      ret DECIMAL(10,2) NULL,
      excess DECIMAL(10,2) NULL,
      dd DECIMAL(10,2) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (transition_id, horizon),
      KEY idx_tid (transition_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

const isoWeekKey = (d = new Date()) => {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = (dt.getUTCDay() + 6) % 7
  dt.setUTCDate(dt.getUTCDate() - day + 3)
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((dt - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Capture one cohort: snapshot each category's top-N with entry prices. */
export async function capturePaperCohort(force = false) {
  const pool = getPool()
  const key = isoWeekKey()
  const [[exists]] = await pool.query('SELECT id FROM paper_cohort WHERE cohort_key = ?', [key])
  if (exists && !force) return { created: false, cohortKey: key, reason: 'cohort already exists for this week' }

  const dash = await getDashboard(TOP_N)
  const niftyDaily = await fetchDaily(config.benchmarkSymbol, '2024-01-01').catch(() => [])
  const niftyStart = niftyDaily.length ? niftyDaily[niftyDaily.length - 1].close : null
  const today = new Date().toISOString().slice(0, 10)

  const [res] = await pool.query(
    `INSERT INTO paper_cohort (cohort_key, start_date, engine_version, nifty_start)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE start_date = VALUES(start_date), engine_version = VALUES(engine_version), nifty_start = VALUES(nifty_start)`,
    [key, today, ENGINE_VERSION, niftyStart],
  )
  const [[row]] = await pool.query('SELECT id FROM paper_cohort WHERE cohort_key = ?', [key])
  const cohortId = row.id
  await pool.query('DELETE FROM paper_holding WHERE cohort_id = ?', [cohortId])

  let held = 0
  for (const [label, field] of Object.entries(CATEGORIES)) {
    const list = dash[field] ?? []
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      const entry = e.price != null ? Number(e.price) : null
      await pool.query(
        'INSERT INTO paper_holding (cohort_id, category, rank_in_cat, symbol_code, entry_price) VALUES (?, ?, ?, ?, ?)',
        [cohortId, label, i + 1, e.symbol_code, entry],
      )
      held++
    }
  }
  return { created: true, cohortKey: key, cohortId, categories: Object.keys(CATEGORIES).length, holdings: held }
}

// ── Scorecard computation ────────────────────────────────────────────────────

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const pct = (v, d = 2) => (v == null ? null : +v.toFixed(d))

/**
 * Evaluate one holding at each calendar horizon (this/next/4th Friday close).
 * Entry = cohort start price, exit = close on the target Friday (or the latest
 * available session if it's today and still forming → provisional). Price only;
 * benchmark excess is added by the caller.
 */
export function evalHolding(entryPrice, startDate, daily, today = istToday()) {
  if (!(entryPrice > 0) || !daily?.length) return null
  const out = {}
  for (const [hName, off] of Object.entries(HORIZONS)) {
    const fri = targetFriday(startDate, off)
    if (fri > today) { out[hName] = { status: 'in-progress', targetDate: fri }; continue }
    const win = daily.filter((c) => { const d = dateStr(c); return d > startDate && d <= fri })
    if (!win.length) { out[hName] = { status: 'in-progress', targetDate: fri }; continue }
    const exit = win[win.length - 1]
    const minLow = Math.min(...win.map((c) => c.low))
    const maxDD = ((minLow - entryPrice) / entryPrice) * 100
    const scen = {}
    for (const sl of SL_SCENARIOS) {
      let ret
      if (sl === 0) ret = ((exit.close - entryPrice) / entryPrice) * 100
      else {
        const stopPx = entryPrice * (1 - sl / 100)
        const hit = win.some((c) => c.low <= stopPx)
        ret = hit ? -sl : ((exit.close - entryPrice) / entryPrice) * 100
      }
      scen[sl] = +ret.toFixed(2)
    }
    out[hName] = { status: 'matured', provisional: fri === today, targetDate: fri, exitDate: dateStr(exit), scen, maxDD: +maxDD.toFixed(2) }
  }
  return out
}

// ── Transition attribution: which badge change (X→Y) pays, and how fast ──────
// Forward outcomes are precomputed ONCE per transition into transition_outcome
// (a background job), then the scorecard aggregates stored numbers instantly —
// never fetches candles in the request (that hung with 5k+ transitions).
const T_HZ = { '1W': 5, '2W': 10, '1M': 21 }
const _dateStr = (c) => new Date(c.time * 1000).toISOString().slice(0, 10)
function fwdReturn(daily, entryDate, entryPrice, bars) {
  const fwd = daily.filter((c) => _dateStr(c) > entryDate)
  if (fwd.length < bars) return null
  const win = fwd.slice(0, bars)
  const minLow = Math.min(...win.map((c) => c.low))
  return { ret: ((win[bars - 1].close - entryPrice) / entryPrice) * 100, dd: ((minLow - entryPrice) / entryPrice) * 100 }
}

export const transComputeState = { running: false, total: 0, done: 0, stored: 0, startedAt: null, finishedAt: null }

/** Background: compute + store forward outcomes for matured transitions. */
export async function computeTransitionOutcomes(maxSymbols = 2000) {
  if (transComputeState.running) return transComputeState
  const pool = getPool()
  const [trans] = await pool.query(`
    SELECT t.id, t.symbol_code, t.transition_date, t.price
      FROM stock_transition t
     WHERE t.price IS NOT NULL AND t.transition_date <= (CURDATE() - INTERVAL 5 DAY)
       AND (SELECT COUNT(*) FROM transition_outcome o WHERE o.transition_id = t.id) < 3
     ORDER BY t.transition_date ASC`)
  Object.assign(transComputeState, { running: true, total: trans.length, done: 0, stored: 0, startedAt: new Date().toISOString(), finishedAt: null })
  ;(async () => {
    const niftyDaily = await fetchDaily(config.benchmarkSymbol, '2025-01-01').catch(() => [])
    const bySym = new Map()
    for (const t of trans) { if (!bySym.has(t.symbol_code)) bySym.set(t.symbol_code, []); bySym.get(t.symbol_code).push(t) }
    let sdone = 0
    for (const [sym, list] of bySym) {
      if (sdone >= maxSymbols) break
      const daily = await fetchDaily(sym, '2025-01-01').catch(() => [])
      for (const t of list) {
        const entryDate = new Date(t.transition_date).toISOString().slice(0, 10)
        const entry = Number(t.price)
        if (!(entry > 0)) continue
        for (const [hName, bars] of Object.entries(T_HZ)) {
          const r = fwdReturn(daily, entryDate, entry, bars)
          if (!r) continue
          const nEntry = niftyDaily.filter((c) => _dateStr(c) <= entryDate).slice(-1)[0]?.close
          const nr = nEntry ? fwdReturn(niftyDaily, entryDate, nEntry, bars) : null
          await pool.query(
            'INSERT IGNORE INTO transition_outcome (transition_id, horizon, ret, excess, dd) VALUES (?, ?, ?, ?, ?)',
            [t.id, hName, +r.ret.toFixed(2), nr ? +(r.ret - nr.ret).toFixed(2) : null, +r.dd.toFixed(2)],
          ).then(() => transComputeState.stored++).catch(() => {})
        }
      }
      sdone++; transComputeState.done = sdone
      await new Promise((res) => setTimeout(res, 150))
    }
    transComputeState.running = false
    transComputeState.finishedAt = new Date().toISOString()
    console.log(`transition outcomes computed: ${transComputeState.stored} stored across ${sdone} symbols`)
  })()
  return transComputeState
}

/** Scorecard — aggregates STORED outcomes only (fast, no candle fetches). */
export async function computeTransitionScorecard() {
  const pool = getPool()
  const [rows] = await pool.query(`
    SELECT t.from_badge AS f, t.to_badge AS tb, o.horizon, o.ret, o.excess, o.dd, t.symbol_code AS sym
      FROM transition_outcome o JOIN stock_transition t ON t.id = o.transition_id`)
  const [[{ pending }]] = await pool.query(
    'SELECT COUNT(*) AS pending FROM stock_transition WHERE price IS NOT NULL AND transition_date <= (CURDATE() - INTERVAL 5 DAY) AND (SELECT COUNT(*) FROM transition_outcome o WHERE o.transition_id = stock_transition.id) < 3',
  )
  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  const pct = (v, d = 2) => (v == null ? null : +v.toFixed(d))
  const buckets = new Map()
  for (const r of rows) {
    const key = `${r.f}|${r.tb}|${r.horizon}`
    if (!buckets.has(key)) buckets.set(key, { rets: [], excess: [], dd: [], symbols: new Set() })
    const b = buckets.get(key)
    b.rets.push(Number(r.ret)); b.dd.push(Number(r.dd)); b.symbols.add(r.sym)
    if (r.excess != null) b.excess.push(Number(r.excess))
  }
  const out = []
  for (const [k, b] of buckets) {
    const [from, to, horizon] = k.split('|')
    out.push({
      from, to, pair: `${from} → ${to}`, horizon,
      n: b.rets.length, symbols: b.symbols.size,
      avgRet: pct(mean(b.rets)), medianRet: pct(median(b.rets)),
      hitRate: pct((b.rets.filter((r) => r > 0).length / (b.rets.length || 1)) * 100, 0),
      avgExcess: pct(mean(b.excess)),
      beatNiftyPct: b.excess.length ? pct((b.excess.filter((e) => e > 0).length / b.excess.length) * 100, 0) : null,
      avgMaxDD: pct(mean(b.dd)),
      confidence: b.symbols.size >= 25 ? 'High' : b.symbols.size >= 10 ? 'Moderate' : 'Low',
    })
  }
  return {
    horizons: Object.keys(T_HZ),
    pairs: [...new Set(out.map((r) => r.pair))],
    rows: out,
    pending,
    note: out.length === 0
      ? (pending > 0 ? `${pending} matured transitions await computing — click "Compute outcomes" to populate.` : 'No matured transitions yet (need 5+ sessions after the change).')
      : pending > 0 ? `${pending} more transitions await computing (click "Compute outcomes" to add them). Don't trust a pair below Moderate (10+ stocks).` : null,
  }
}

/** Holdings of one cohort with entry price, derived qty, and live return. */
export async function getCohortHoldings(cohortKey) {
  const pool = getPool()
  const [[cohort]] = await pool.query('SELECT * FROM paper_cohort WHERE cohort_key = ?', [cohortKey])
  if (!cohort) return { cohortKey, holdings: [], note: 'cohort not found' }
  const [holdings] = await pool.query(
    `SELECT h.category, h.rank_in_cat, h.symbol_code, h.entry_price, s.symbol_name
       FROM paper_holding h LEFT JOIN stock_mstr s ON s.symbol_code = h.symbol_code
      WHERE h.cohort_id = ? ORDER BY h.category, h.rank_in_cat`,
    [cohort.id],
  )
  const entryDate = new Date(cohort.start_date).toISOString().slice(0, 10)
  // live prices from cached candles (deduped)
  const symbols = [...new Set(holdings.map((h) => h.symbol_code))]
  const lastBySym = new Map()
  for (const sym of symbols) {
    const daily = await fetchDaily(sym, '2025-06-01').catch(() => [])
    const fwd = daily.filter((c) => new Date(c.time * 1000).toISOString().slice(0, 10) >= entryDate)
    if (fwd.length) {
      const lastC = fwd[fwd.length - 1]
      const minLow = Math.min(...fwd.map((c) => c.low))
      lastBySym.set(sym, { last: lastC.close, minLow })
    }
  }
  const rows = holdings.map((h) => {
    const entry = h.entry_price != null ? Number(h.entry_price) : null
    const live = lastBySym.get(h.symbol_code)
    // whole shares only (Indian equity), capped at ₹10k → actual invested ≤ ₹10k
    const qty = entry && entry <= INVEST ? Math.floor(INVEST / entry) : 0
    const invested = entry ? +(qty * entry).toFixed(2) : null
    const retPct = entry && live ? +(((live.last - entry) / entry) * 100).toFixed(2) : null
    const ddPct = entry && live ? +(((live.minLow - entry) / entry) * 100).toFixed(2) : null
    return {
      category: h.category, rank: h.rank_in_cat, symbol: h.symbol_code, name: h.symbol_name ?? h.symbol_code,
      entryPrice: entry, qty, invested, livePrice: live?.last ?? null, returnPct: retPct,
      pnl: entry && live && qty ? +((live.last - entry) * qty).toFixed(0) : null, maxDDPct: ddPct,
    }
  })
  return { cohortKey, startDate: entryDate, engine: cohort.engine_version, niftyStart: cohort.nifty_start, holdings: rows }
}

export async function computeScorecard(cohortKey = null) {
  const pool = getPool()
  const [allCohorts] = await pool.query('SELECT * FROM paper_cohort ORDER BY start_date')
  if (!allCohorts.length) return { cohorts: [], categories: [], rows: [], note: 'No cohorts yet — capture one to begin.' }
  // scope: one cohort, or all aggregated
  const cohorts = cohortKey ? allCohorts.filter((c) => c.cohort_key === cohortKey) : allCohorts
  if (!cohorts.length) return { cohorts: [], categories: [], rows: [], note: `Cohort ${cohortKey} not found.` }
  const idSet = new Set(cohorts.map((c) => c.id))
  const [allHoldings] = await pool.query('SELECT * FROM paper_holding')
  const holdings = allHoldings.filter((h) => idSet.has(h.cohort_id))

  const today = istToday()
  // fetch NIFTY once (benchmark for excess return, per target Friday)
  const niftyDaily = await fetchDaily(config.benchmarkSymbol, '2024-01-01').catch(() => [])

  // dedup symbol candle fetches
  const symbols = [...new Set(holdings.map((h) => h.symbol_code))]
  const candleBySym = new Map()
  for (const s of symbols) {
    candleBySym.set(s, await fetchDaily(s, '2025-06-01').catch(() => []))
  }

  // existing locks/exits (immutable once written)
  const [lockRows] = await pool.query('SELECT * FROM paper_lock')
  const [exitRows] = await pool.query('SELECT * FROM paper_exit')
  const lockMap = new Map(lockRows.map((l) => [`${l.cohort_id}|${l.horizon}`, l]))
  const exitMap = new Map(exitRows.map((e) => [`${e.cohort_id}|${e.horizon}|${e.symbol_code}`, e]))

  const windowExit = (daily, startDate, fri) => {
    const win = daily.filter((c) => { const d = dateStr(c); return d > startDate && d <= fri })
    if (!win.length) return null
    const exit = win[win.length - 1]
    return { close: exit.close, minLow: Math.min(...win.map((c) => c.low)), final: exit.final !== false }
  }

  const holdingsByCohort = new Map()
  for (const h of holdings) {
    if (!holdingsByCohort.has(h.cohort_id)) holdingsByCohort.set(h.cohort_id, [])
    holdingsByCohort.get(h.cohort_id).push(h)
  }

  const buckets = new Map() // "cat|horizon|topN|sl" -> {rets,excess,dd,cohorts,provisional}
  const push = (cat, hz, topN, sl, ret, excess, dd, cohortKey, provisional) => {
    const k = `${cat}|${hz}|${topN}|${sl}`
    if (!buckets.has(k)) buckets.set(k, { rets: [], excess: [], dd: [], cohorts: new Set(), provisional: false })
    const b = buckets.get(k)
    b.rets.push(ret); if (excess != null) b.excess.push(excess); if (dd != null) b.dd.push(dd); b.cohorts.add(cohortKey)
    if (provisional) b.provisional = true
  }

  for (const cohort of cohorts) {
    const entryDate = new Date(cohort.start_date).toISOString().slice(0, 10)
    const niftyStart = cohort.nifty_start != null ? Number(cohort.nifty_start) : null
    const cHold = holdingsByCohort.get(cohort.id) ?? []
    for (const [hName, off] of Object.entries(HORIZONS)) {
      const fri = targetFriday(entryDate, off)
      if (fri > today) continue // horizon not reached → in-progress

      const lockKey = `${cohort.id}|${hName}`
      let niftyExit = null
      let provisional = false
      const exitBySym = new Map()

      if (lockMap.has(lockKey)) {
        // LOCKED — use the immutable snapshot, no recompute
        niftyExit = lockMap.get(lockKey).nifty_exit != null ? Number(lockMap.get(lockKey).nifty_exit) : null
        for (const h of cHold) {
          const e = exitMap.get(`${cohort.id}|${hName}|${h.symbol_code}`)
          if (e) exitBySym.set(h.symbol_code, { close: Number(e.exit_close), minLow: Number(e.min_low) })
        }
      } else {
        // compute from candles; lock only when EVERY exit bar is official (final)
        const nE = windowExit(niftyDaily, entryDate, fri)
        niftyExit = nE?.close ?? null
        let allFinal = nE ? nE.final : false
        for (const h of cHold) {
          const we = windowExit(candleBySym.get(h.symbol_code) ?? [], entryDate, fri)
          if (we) { exitBySym.set(h.symbol_code, { close: we.close, minLow: we.minLow }); if (!we.final) allFinal = false }
          else allFinal = false
        }
        if (allFinal && niftyExit != null) {
          await pool.query('INSERT IGNORE INTO paper_lock (cohort_id, horizon, exit_date, nifty_exit) VALUES (?, ?, ?, ?)', [cohort.id, hName, fri, niftyExit]).catch(() => {})
          for (const [sym, e] of exitBySym) {
            await pool.query('INSERT IGNORE INTO paper_exit (cohort_id, horizon, symbol_code, exit_close, min_low) VALUES (?, ?, ?, ?, ?)', [cohort.id, hName, sym, e.close, e.minLow]).catch(() => {})
          }
        } else {
          provisional = true // still settling → LIVE, not yet locked
        }
      }

      const niftyRet = niftyStart && niftyExit ? +(((niftyExit - niftyStart) / niftyStart) * 100).toFixed(2) : null
      for (const h of cHold) {
        const entry = h.entry_price != null ? Number(h.entry_price) : null
        const e = exitBySym.get(h.symbol_code)
        if (!(entry > 0) || !e) continue
        const dd = +(((e.minLow - entry) / entry) * 100).toFixed(2)
        for (const topN of [5, 10, 20]) {
          if (h.rank_in_cat > topN) continue
          for (const sl of SL_SCENARIOS) {
            let ret
            if (sl === 0) ret = ((e.close - entry) / entry) * 100
            else { const stop = entry * (1 - sl / 100); ret = e.minLow <= stop ? -sl : ((e.close - entry) / entry) * 100 }
            ret = +ret.toFixed(2)
            push(h.category, hName, topN, sl, ret, niftyRet != null ? +(ret - niftyRet).toFixed(2) : null, dd, cohort.cohort_key, provisional)
          }
        }
      }
    }
  }

  const conf = (nCohorts) => (nCohorts >= 25 ? 'High' : nCohorts >= 10 ? 'Moderate' : 'Low')
  const rows = []
  for (const [k, b] of buckets) {
    const [category, horizon, topN, sl] = k.split('|')
    rows.push({
      category, horizon, topN: Number(topN), sl: Number(sl), provisional: b.provisional,
      n: b.rets.length, cohorts: b.cohorts.size, confidence: conf(b.cohorts.size),
      avgRet: pct(mean(b.rets)), medianRet: pct(median(b.rets)),
      hitRate: pct((b.rets.filter((r) => r > 0).length / (b.rets.length || 1)) * 100, 0),
      avgExcess: pct(mean(b.excess)), beatNiftyPct: b.excess.length ? pct((b.excess.filter((e) => e > 0).length / b.excess.length) * 100, 0) : null,
      avgMaxDD: pct(mean(b.dd)),
    })
  }
  return {
    // always list ALL cohorts (for the selector); rows are scoped to `scope`
    cohorts: allCohorts.map((c) => ({ key: c.cohort_key, startDate: new Date(c.start_date).toISOString().slice(0, 10), engine: c.engine_version, niftyStart: c.nifty_start })),
    scope: cohortKey ?? 'ALL',
    horizons: Object.keys(HORIZONS), slScenarios: SL_SCENARIOS, categories: Object.keys(CATEGORIES),
    rows,
    note: !cohortKey && allCohorts.length < 10 ? `Only ${allCohorts.length} cohort(s) so far — treat as illustrative (confidence rises at 10+ cohorts / ~2–3 months). Do NOT switch strategy yet.` : cohortKey ? `Single-cohort view (${cohortKey}) — one week is a data point, not a verdict.` : null,
  }
}
