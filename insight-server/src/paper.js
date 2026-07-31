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
  // fetch NIFTY once; return = start → close on the target Friday
  const niftyDaily = await fetchDaily(config.benchmarkSymbol, '2024-01-01').catch(() => [])
  const niftyReturn = (startClose, startDate, off) => {
    if (startClose == null) return null
    const fri = targetFriday(startDate, off)
    if (fri > today) return null
    const win = niftyDaily.filter((c) => { const d = dateStr(c); return d > startDate && d <= fri })
    if (!win.length) return null
    return +(((win[win.length - 1].close - startClose) / startClose) * 100).toFixed(2)
  }

  // dedup symbol candle fetches
  const symbols = [...new Set(holdings.map((h) => h.symbol_code))]
  const candleBySym = new Map()
  for (const s of symbols) {
    candleBySym.set(s, await fetchDaily(s, '2025-06-01').catch(() => []))
  }

  const cohortById = new Map(cohorts.map((c) => [c.id, c]))
  // accumulate per category × horizon × topN × SL
  const buckets = new Map() // key "cat|horizon|topN|sl" -> {rets:[], excess:[], dd:[], cohortsSet:Set}
  const bk = (cat, h, topN, sl) => `${cat}|${h}|${topN}|${sl}`
  const push = (cat, h, topN, sl, ret, excess, dd, cohortKey, provisional) => {
    const k = bk(cat, h, topN, sl)
    if (!buckets.has(k)) buckets.set(k, { rets: [], excess: [], dd: [], cohorts: new Set(), provisional: false })
    const b = buckets.get(k)
    b.rets.push(ret); if (excess != null) b.excess.push(excess); if (dd != null) b.dd.push(dd); b.cohorts.add(cohortKey)
    if (provisional) b.provisional = true
  }

  for (const h of holdings) {
    const cohort = cohortById.get(h.cohort_id)
    if (!cohort || h.entry_price == null) continue
    const entryDate = new Date(cohort.start_date).toISOString().slice(0, 10)
    const daily = candleBySym.get(h.symbol_code)
    const ev = evalHolding(Number(h.entry_price), entryDate, daily, today)
    if (!ev) continue
    for (const [hName, off] of Object.entries(HORIZONS)) {
      const cell = ev[hName]
      if (!cell || cell.status !== 'matured') continue
      const nRet = niftyReturn(cohort.nifty_start != null ? Number(cohort.nifty_start) : null, entryDate, off)
      for (const topN of [5, 10, 20]) {
        if (h.rank_in_cat > topN) continue
        for (const sl of SL_SCENARIOS) {
          const ret = cell.scen[sl]
          push(h.category, hName, topN, sl, ret, nRet != null ? +(ret - nRet).toFixed(2) : null, cell.maxDD, cohort.cohort_key, cell.provisional)
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
