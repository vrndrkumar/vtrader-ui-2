// ── Persistent analysis storage + market ranking context (MySQL) ─────────────
import { getPool } from './db.js'
import { conviction as convictionOf } from './engines.js'

export async function ensureSchema() {
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_analysis_reports (
      id BIGINT NOT NULL AUTO_INCREMENT,
      stock_id BIGINT NULL,
      symbol_code VARCHAR(50) NOT NULL,
      analysis_date DATE NOT NULL,
      price DECIMAL(14,2) NULL,
      discovery_score INT NULL,
      transition_score INT NULL,
      momentum_score INT NULL,
      risk_score INT NULL,
      risk_level VARCHAR(10) NULL,
      current_phase VARCHAR(20) NULL,
      badge VARCHAR(40) NULL,
      feature_evidence JSON NULL,
      risk_factors JSON NULL,
      summary VARCHAR(1200) NULL,
      engine_version VARCHAR(24) NULL,
      is_latest TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_symbol_latest (symbol_code, is_latest),
      KEY idx_scores (is_latest, discovery_score),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  // v3 columns (rank + conviction snapshots for future performance studies)
  const v3Cols = [
    ['conviction', 'INT NULL'],
    ['conviction_label', 'VARCHAR(16) NULL'],
    ['market_rank', 'INT NULL'],
    ['market_total', 'INT NULL'],
    ['sector_rank', 'INT NULL'],
    ['sector_total', 'INT NULL'],
    ['industry_rank', 'INT NULL'],
    ['industry_total', 'INT NULL'],
  ]
  const [existing] = await pool.query(
    `SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_analysis_reports'`,
  )
  const have = new Set(existing.map((r) => r.COLUMN_NAME))
  const lenOf = new Map(existing.map((r) => [r.COLUMN_NAME, r.len]))
  for (const [name, def] of v3Cols) {
    if (!have.has(name)) await pool.query(`ALTER TABLE stock_analysis_reports ADD COLUMN ${name} ${def}`)
  }
  // widen summary ONLY if still narrow (old v2 = 600). Running MODIFY every
  // startup rebuilds the whole (now large) table and locks all reads — avoid.
  const sumLen = lenOf.get('summary')
  if (sumLen != null && sumLen < 1200) {
    await pool.query('ALTER TABLE stock_analysis_reports MODIFY summary VARCHAR(1200) NULL').catch(() => {})
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_analysis_failures (
      id BIGINT NOT NULL AUTO_INCREMENT,
      run_label VARCHAR(80) NULL,
      symbol_code VARCHAR(50) NOT NULL,
      reason VARCHAR(400) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_run (run_label),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  // Transition log — ONE row per badge change, written incrementally at save
  // time. Small + indexed → instant queries (never scans analysis history).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_transition (
      id BIGINT NOT NULL AUTO_INCREMENT,
      symbol_code VARCHAR(50) NOT NULL,
      transition_date DATE NOT NULL,
      from_badge VARCHAR(40) NULL,
      to_badge VARCHAR(40) NULL,
      from_discovery INT NULL,
      to_discovery INT NULL,
      price DECIMAL(14,2) NULL,
      engine_version VARCHAR(24) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_change (symbol_code, transition_date, from_badge, to_badge),
      KEY idx_date (transition_date),
      KEY idx_badges (from_badge, to_badge)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

// ── Failure tracking ─────────────────────────────────────────────────────────

export async function saveFailure(runLabel, symbolCode, reason) {
  await getPool().query(
    'INSERT INTO stock_analysis_failures (run_label, symbol_code, reason) VALUES (?, ?, ?)',
    [runLabel, symbolCode, String(reason).slice(0, 390)],
  ).catch((e) => console.error('saveFailure:', e.message))
}

/** ALL failed symbols of the most recent run (for retry — no display truncation). */
export async function getFailureSymbols(runLabel = null) {
  const pool = getPool()
  let label = runLabel
  if (!label) {
    const [[latest]] = await pool.query(
      'SELECT run_label FROM stock_analysis_failures ORDER BY created_at DESC LIMIT 1',
    )
    label = latest?.run_label ?? null
  }
  if (!label) return []
  const [rows] = await pool.query(
    'SELECT DISTINCT symbol_code FROM stock_analysis_failures WHERE run_label = ?',
    [label],
  )
  return rows.map((r) => r.symbol_code)
}

/** Failures of the most recent run (or a given run_label), grouped by reason. */
export async function getFailures(runLabel = null) {
  const pool = getPool()
  let label = runLabel
  if (!label) {
    const [[latest]] = await pool.query(
      'SELECT run_label FROM stock_analysis_failures ORDER BY created_at DESC LIMIT 1',
    )
    label = latest?.run_label ?? null
  }
  if (!label) return { runLabel: null, total: 0, groups: [] }
  const [rows] = await pool.query(
    'SELECT symbol_code, reason FROM stock_analysis_failures WHERE run_label = ? ORDER BY id',
    [label],
  )
  const groups = new Map()
  for (const r of rows) {
    if (!groups.has(r.reason)) groups.set(r.reason, [])
    groups.get(r.reason).push(r.symbol_code)
  }
  return {
    runLabel: label,
    total: rows.length,
    groups: [...groups.entries()]
      .map(([reason, symbols]) => ({ reason, count: symbols.length, symbols: symbols.slice(0, 100) }))
      .sort((a, b) => b.count - a.count),
  }
}

// ── Latest-score universe cache (for ranks/percentiles) ──────────────────────

let latestCache = { at: 0, rows: null }
const LATEST_TTL_MS = 60 * 1000

export async function getAllLatestScores(force = false) {
  if (!force && latestCache.rows && Date.now() - latestCache.at < LATEST_TTL_MS) return latestCache.rows
  const [rows] = await getPool().query(
    `SELECT a.symbol_code, s.sector, s.industry,
            a.discovery_score AS discovery, a.transition_score AS transition, a.momentum_score AS momentum
       FROM stock_analysis_reports a
       JOIN stock_mstr s ON s.symbol_code = a.symbol_code AND s.is_active = 1
      WHERE a.is_latest = 1`,
  )
  latestCache = { at: Date.now(), rows }
  return rows
}

function rankWithin(rows, symbol, engine) {
  const mine = rows.find((r) => r.symbol_code === symbol)
  if (!mine || mine[engine] == null) return null
  const scored = rows.filter((r) => r[engine] != null)
  const better = scored.filter((r) => r[engine] > mine[engine]).length
  const tied = scored.filter((r) => r[engine] === mine[engine]).length // includes self
  const rank = better + 1
  const total = scored.length
  // floor at 0.1 so "#1 of 2350" never renders as a meaningless "Top 0%"
  const topPct = total ? Math.max(0.1, +(((rank / total) * 100).toFixed(1))) : null
  return { rank, total, topPct, tied }
}

/** Market/sector/industry rank + percentile for every engine score. */
export async function getRankContext(symbolCode) {
  const rows = await getAllLatestScores()
  if (!rows.length) return null
  const mine = rows.find((r) => r.symbol_code === symbolCode)
  if (!mine) return null
  const ctx = {}
  for (const engine of ['discovery', 'transition', 'momentum']) {
    const market = rankWithin(rows, symbolCode, engine)
    const sector = mine.sector ? rankWithin(rows.filter((r) => r.sector === mine.sector), symbolCode, engine) : null
    const industry = mine.industry ? rankWithin(rows.filter((r) => r.industry === mine.industry), symbolCode, engine) : null
    ctx[engine] = { market, sector, industry }
  }
  ctx.sectorName = mine.sector
  ctx.industryName = mine.industry
  return ctx
}

export async function saveAnalysis(stockRow, analysis) {
  const pool = getPool()

  // conviction snapshot vs the current latest universe (best-effort)
  let conv = null
  let ranks = {}
  try {
    const rows = await getAllLatestScores()
    const engine = analysis.family ?? 'discovery'
    const scored = rows.filter((r) => r.symbol_code !== stockRow.symbol_code && r[engine] != null)
    const myScore = analysis.scores[engine] ?? 0
    const better = scored.filter((r) => r[engine] > myScore).length
    const total = scored.length + 1
    const pctile = total > 1 ? (1 - better / total) * 100 : 50
    conv = convictionOf(analysis.scores, pctile, analysis.scores.risk)
    ranks = { market_rank: better + 1, market_total: total }
  } catch { /* ranks optional at save time */ }

  // read the previous latest (indexed lookup) to detect a badge transition
  let prev = null
  try {
    const [[p]] = await pool.query(
      'SELECT badge, discovery_score FROM stock_analysis_reports WHERE symbol_code = ? AND is_latest = 1 LIMIT 1',
      [stockRow.symbol_code],
    )
    prev = p ?? null
  } catch { /* non-fatal */ }

  await pool.query('UPDATE stock_analysis_reports SET is_latest = 0 WHERE symbol_code = ? AND is_latest = 1', [stockRow.symbol_code])
  await pool.query(
    `INSERT INTO stock_analysis_reports
      (stock_id, symbol_code, analysis_date, price, discovery_score, transition_score, momentum_score,
       risk_score, risk_level, current_phase, badge, feature_evidence, risk_factors, summary, engine_version,
       conviction, conviction_label, market_rank, market_total, is_latest)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      stockRow.id ?? null,
      stockRow.symbol_code,
      analysis.features.date,
      analysis.features.price,
      analysis.scores.discovery,
      analysis.scores.transition,
      analysis.scores.momentum,
      analysis.scores.risk,
      analysis.riskLevel,
      analysis.phase,
      analysis.badge,
      JSON.stringify({ evidence: analysis.evidence, features: analysis.features, tags: analysis.tags, family: analysis.family, earliness: analysis.earliness }),
      JSON.stringify(analysis.riskFactors),
      analysis.summary,
      analysis.engineVersion,
      conv?.score ?? null,
      conv?.label ?? null,
      ranks.market_rank ?? null,
      ranks.market_total ?? null,
    ],
  )
  latestCache.at = 0 // invalidate

  // log the transition when the badge actually changed (one small row)
  if (prev && prev.badge && analysis.badge && prev.badge !== analysis.badge) {
    await pool.query(
      `INSERT IGNORE INTO stock_transition
         (symbol_code, transition_date, from_badge, to_badge, from_discovery, to_discovery, price, engine_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [stockRow.symbol_code, analysis.features.date, prev.badge, analysis.badge,
       prev.discovery_score ?? null, analysis.scores.discovery ?? null, analysis.features.price ?? null, analysis.engineVersion],
    ).catch(() => {})
  }
}

// ── Transition log queries (small, indexed → fast) ───────────────────────────

const TSORTS = {
  date: 't.transition_date DESC, t.id DESC',
  date_asc: 't.transition_date ASC, t.id ASC',
  discovery: 't.to_discovery IS NULL, t.to_discovery DESC',
  name: 's.symbol_name ASC',
}

export async function queryTransitions(q) {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25))
  const where = ['1=1']
  const params = []
  if (q.fromBadge) { where.push('t.from_badge = ?'); params.push(q.fromBadge) }
  if (q.toBadge) { where.push('t.to_badge = ?'); params.push(q.toBadge) }
  if (q.from) { where.push('t.transition_date >= ?'); params.push(q.from) }
  if (q.to) { where.push('t.transition_date <= ?'); params.push(q.to) }
  if (q.symbol) { where.push('t.symbol_code = ?'); params.push(q.symbol) }
  const base = `FROM stock_transition t LEFT JOIN stock_mstr s ON s.symbol_code = t.symbol_code WHERE ${where.join(' AND ')}`
  const orderBy = TSORTS[q.sort] ?? TSORTS.date
  const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total ${base}`, params)
  const [rows] = await getPool().query(
    `SELECT t.symbol_code, s.symbol_name, s.sector, t.transition_date, t.from_badge, t.to_badge,
            t.from_discovery, t.to_discovery, t.price, t.engine_version
       ${base} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  )
  return { rows, total, page, pageSize }
}

/**
 * One-time back-fill of the transition log from RECENT history only.
 * Bounded to `days` (uses idx_created) so it never full-scans the big table.
 * Safe to run manually; idempotent (INSERT IGNORE on the unique change key).
 */
export async function backfillTransitions(days = 21) {
  const pool = getPool()
  const [rows] = await pool.query(`
    WITH recent AS (
      SELECT symbol_code, analysis_date, badge, discovery_score, price, created_at,
             ROW_NUMBER() OVER (PARTITION BY symbol_code, analysis_date ORDER BY created_at DESC) AS rn_day
        FROM stock_analysis_reports
       WHERE created_at >= NOW() - INTERVAL ? DAY
    ),
    days AS ( SELECT * FROM recent WHERE rn_day = 1 ),
    seq AS (
      SELECT symbol_code, analysis_date, badge, discovery_score, price,
             LAG(badge) OVER (PARTITION BY symbol_code ORDER BY analysis_date) AS prev_badge,
             LAG(discovery_score) OVER (PARTITION BY symbol_code ORDER BY analysis_date) AS prev_disc
        FROM days
    )
    SELECT symbol_code, analysis_date, prev_badge, badge, prev_disc, discovery_score, price
      FROM seq
     WHERE prev_badge IS NOT NULL AND prev_badge <> badge
  `, [days])
  let inserted = 0
  for (const r of rows) {
    const [res] = await pool.query(
      `INSERT IGNORE INTO stock_transition
         (symbol_code, transition_date, from_badge, to_badge, from_discovery, to_discovery, price, engine_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'backfill')`,
      [r.symbol_code, r.analysis_date, r.prev_badge, r.badge, r.prev_disc, r.discovery_score, r.price],
    ).catch(() => [{ affectedRows: 0 }])
    inserted += res.affectedRows
  }
  console.log(`transition back-fill: scanned ${rows.length} changes over ${days}d, inserted ${inserted}`)
  return { scanned: rows.length, inserted, days }
}

export async function getTransitionFacets() {
  const pool = getPool()
  const [froms] = await pool.query("SELECT DISTINCT from_badge FROM stock_transition WHERE from_badge IS NOT NULL ORDER BY from_badge")
  const [tos] = await pool.query("SELECT DISTINCT to_badge FROM stock_transition WHERE to_badge IS NOT NULL ORDER BY to_badge")
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM stock_transition')
  return { fromBadges: froms.map((r) => r.from_badge), toBadges: tos.map((r) => r.to_badge), total }
}

export async function getLatestAnalysis(symbolCode) {
  const [rows] = await getPool().query(
    'SELECT * FROM stock_analysis_reports WHERE symbol_code = ? AND is_latest = 1 LIMIT 1',
    [symbolCode],
  )
  return rows[0] ?? null
}

export async function getHistory(symbolCode, limit = 30) {
  const [rows] = await getPool().query(
    `SELECT id, analysis_date, price, discovery_score, transition_score, momentum_score,
            risk_score, risk_level, badge, conviction, conviction_label, market_rank, market_total,
            engine_version, created_at
       FROM stock_analysis_reports
      WHERE symbol_code = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [symbolCode, Number(limit)],
  )
  return rows
}

// ── Universe query ───────────────────────────────────────────────────────────

const SORTS = {
  discovery: 'a.discovery_score IS NULL, a.discovery_score DESC',
  transition: 'a.transition_score IS NULL, a.transition_score DESC',
  momentum: 'a.momentum_score IS NULL, a.momentum_score DESC',
  conviction: 'a.conviction IS NULL, a.conviction DESC',
  recent: 'a.created_at IS NULL, a.created_at DESC',
  name: 's.symbol_name ASC',
}

export async function queryUniverse(q) {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25))
  const where = ['s.is_active = 1']
  const params = []
  if (q.q) {
    where.push('(s.symbol_code LIKE ? OR s.symbol_name LIKE ?)')
    params.push(`%${q.q}%`, `%${q.q}%`)
  }
  if (q.sector) { where.push('s.sector = ?'); params.push(q.sector) }
  if (q.industry) { where.push('s.industry = ?'); params.push(q.industry) }
  if (q.category) { where.push('s.category = ?'); params.push(q.category) }
  if (q.badge) { where.push('a.badge = ?'); params.push(q.badge) }
  if (q.riskLevel) { where.push('a.risk_level = ?'); params.push(q.riskLevel) }
  if (q.minDiscovery) { where.push('a.discovery_score >= ?'); params.push(Number(q.minDiscovery)) }
  if (q.analyzed === '1') where.push('a.id IS NOT NULL')

  // Fundamental filter presets — read-only screening over the display-only
  // fundamentals grades. Filtering NEVER alters technical scores/rankings.
  const FUND_PRESETS = {
    positive: "f.overall_grade = 'Positive'",
    quality: "f.fin_strength = 'Strong' AND f.profitability_grade IN ('Excellent','Good')",
    undervalued: "f.valuation_grade = 'Undervalued'",
    highgrowth: "f.growth_grade = 'High'",
    dividend: "f.dividend_grade IN ('Attractive','Average')",
    strongbalance: "f.fin_strength = 'Strong'",
    covered: 'f.data IS NOT NULL',
  }
  if (q.fundamentals && FUND_PRESETS[q.fundamentals]) where.push(`(${FUND_PRESETS[q.fundamentals]})`)

  const base = `
    FROM stock_mstr s
    LEFT JOIN stock_analysis_reports a ON a.symbol_code = s.symbol_code AND a.is_latest = 1
    LEFT JOIN stock_fundamentals f ON f.symbol_code = s.symbol_code
    WHERE ${where.join(' AND ')}`

  const orderBy = SORTS[q.sort] ?? SORTS.discovery
  const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total ${base}`, params)
  const [rows] = await getPool().query(
    `SELECT s.id, s.symbol_code, s.symbol_name, s.sector, s.industry, s.category,
            a.analysis_date, a.price, a.discovery_score, a.transition_score, a.momentum_score,
            a.risk_score, a.risk_level, a.badge, a.conviction, a.conviction_label,
            a.summary, a.created_at AS analyzed_at,
            f.overall_grade AS fundamental_outlook, f.valuation_grade AS fundamental_valuation
       ${base}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  )
  return { rows, total, page, pageSize }
}

export async function getFacets() {
  const pool = getPool()
  const [sectors] = await pool.query(
    "SELECT DISTINCT sector FROM stock_mstr WHERE is_active = 1 AND sector IS NOT NULL AND sector != '' ORDER BY sector",
  )
  const [industries] = await pool.query(
    "SELECT DISTINCT industry FROM stock_mstr WHERE is_active = 1 AND industry IS NOT NULL AND industry != '' ORDER BY industry LIMIT 300",
  )
  const [badges] = await pool.query(
    'SELECT DISTINCT badge FROM stock_analysis_reports WHERE is_latest = 1 AND badge IS NOT NULL',
  )
  return {
    sectors: sectors.map((r) => r.sector),
    industries: industries.map((r) => r.industry),
    badges: badges.map((r) => r.badge),
  }
}

// ── Market intelligence dashboard ────────────────────────────────────────────

const BADGE_ORDER = {
  QUIET: 0, WATCHLIST: 1, 'QUIET ACCUMULATION': 2, 'EARLY DISCOVERY': 3,
  'HIDDEN GEM CANDIDATE': 4, 'TRANSITION STARTED': 5, 'BUILDING STRENGTH': 5,
  'LEADERSHIP EMERGING': 6, 'MOMENTUM ESTABLISHED': 7,
}

/** Latest + previous snapshot per symbol, joined with names. */
async function latestVsPrevious() {
  // CRITICAL: window ONLY over recent rows (uses idx_created), never the whole
  // history table — a full-table ROW_NUMBER scan froze the DB. 21 days is more
  // than enough to have latest + previous per symbol.
  const [rows] = await getPool().query(`
    WITH recent AS (
      SELECT * FROM stock_analysis_reports WHERE created_at >= NOW() - INTERVAL 21 DAY
    ),
    ranked AS (
      SELECT r.*, ROW_NUMBER() OVER (PARTITION BY symbol_code ORDER BY created_at DESC) AS rn
        FROM recent r
    )
    SELECT cur.symbol_code, s.symbol_name, s.sector,
           cur.price, cur.discovery_score, cur.transition_score, cur.momentum_score,
           cur.risk_score, cur.risk_level, cur.badge, cur.conviction, cur.conviction_label,
           cur.summary, cur.created_at,
           prev.discovery_score AS prev_discovery, prev.transition_score AS prev_transition,
           prev.momentum_score AS prev_momentum, prev.badge AS prev_badge,
           f.overall_grade AS fundamental_outlook
      FROM ranked cur
      JOIN stock_mstr s ON s.symbol_code = cur.symbol_code AND s.is_active = 1
      LEFT JOIN ranked prev ON prev.symbol_code = cur.symbol_code AND prev.rn = 2
      LEFT JOIN stock_fundamentals f ON f.symbol_code = cur.symbol_code
     WHERE cur.rn = 1
  `)
  return rows
}

let dashboardCache = { at: 0, limit: 0, data: null }
export async function getDashboard(limit = 6) {
  // cache 5 min — the dashboard runs a window query and is hit on every page load
  if (dashboardCache.data && dashboardCache.limit === limit && Date.now() - dashboardCache.at < 5 * 60 * 1000) {
    return dashboardCache.data
  }
  const rows = await latestVsPrevious()
  const entry = (r, extra = {}) => ({
    symbol_code: r.symbol_code,
    symbol_name: r.symbol_name,
    sector: r.sector,
    price: r.price,
    discovery_score: r.discovery_score,
    transition_score: r.transition_score,
    momentum_score: r.momentum_score,
    risk_level: r.risk_level,
    badge: r.badge,
    conviction: r.conviction,
    conviction_label: r.conviction_label,
    fundamental_outlook: r.fundamental_outlook ?? null,
    summary: r.summary,
    ...extra,
  })
  const by = (key, filter = () => true) =>
    rows.filter((r) => r[key] != null && filter(r)).sort((a, b) => b[key] - a[key]).slice(0, limit).map((r) => entry(r))

  const gems = rows
    .filter((r) => ['HIDDEN GEM CANDIDATE', 'EARLY DISCOVERY', 'QUIET ACCUMULATION'].includes(r.badge))
    .sort((a, b) => (b.discovery_score ?? 0) - (a.discovery_score ?? 0))
    .slice(0, limit).map((r) => entry(r))

  // the user's exact ask: technically early AND fundamentally sound —
  // an intersection of independent dimensions, never a blended score
  const gemsWithFundamentals = rows
    .filter((r) => ['HIDDEN GEM CANDIDATE', 'EARLY DISCOVERY', 'QUIET ACCUMULATION', 'TRANSITION STARTED'].includes(r.badge)
      && r.fundamental_outlook === 'Positive')
    .sort((a, b) => (b.discovery_score ?? 0) - (a.discovery_score ?? 0))
    .slice(0, limit).map((r) => entry(r))

  const improvers = rows
    .filter((r) => r.prev_discovery != null && r.discovery_score != null)
    .map((r) => ({ r, delta: r.discovery_score - r.prev_discovery }))
    .filter((x) => x.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit).map(({ r, delta }) => entry(r, { delta }))

  const newSignals = rows
    .filter((r) => (r.discovery_score ?? 0) >= 55 && (r.prev_discovery == null || r.prev_discovery < 55))
    .sort((a, b) => (b.discovery_score ?? 0) - (a.discovery_score ?? 0))
    .slice(0, limit).map((r) => entry(r, { isNew: r.prev_discovery == null }))

  const badgeMoves = rows
    .filter((r) => r.prev_badge && r.badge && r.prev_badge !== r.badge)
    .map((r) => ({ r, move: (BADGE_ORDER[r.badge] ?? 0) - (BADGE_ORDER[r.prev_badge] ?? 0) }))
  const upgraded = badgeMoves.filter((x) => x.move > 0).sort((a, b) => b.move - a.move)
    .slice(0, limit).map(({ r }) => entry(r, { fromBadge: r.prev_badge }))
  const downgraded = badgeMoves.filter((x) => x.move < 0).sort((a, b) => a.move - b.move)
    .slice(0, limit).map(({ r }) => entry(r, { fromBadge: r.prev_badge }))

  // sector leaders: best discovery per sector, ranked by that score
  const bySector = new Map()
  for (const r of rows) {
    if (!r.sector || r.discovery_score == null) continue
    const cur = bySector.get(r.sector)
    if (!cur || r.discovery_score > cur.discovery_score) bySector.set(r.sector, r)
  }
  const sectorLeaders = [...bySector.values()]
    .sort((a, b) => (b.discovery_score ?? 0) - (a.discovery_score ?? 0))
    .slice(0, limit + 2).map((r) => entry(r))

  // Top Picks: most convincing across the WHOLE analysed universe.
  // conviction (0-100) when stored; fallback = best engine score minus risk drag.
  const pickScore = (r) => r.conviction ?? Math.max(r.discovery_score ?? 0, r.transition_score ?? 0, r.momentum_score ?? 0) - (r.risk_score ?? 50) * 0.2
  const topPicks = rows
    .filter((r) => Math.max(r.discovery_score ?? 0, r.transition_score ?? 0, r.momentum_score ?? 0) >= 40)
    .sort((a, b) => pickScore(b) - pickScore(a))
    .slice(0, 8).map((r) => entry(r))

  const data = {
    analyzedCount: rows.length,
    topPicks,
    gemsWithFundamentals,
    topHiddenGems: gems,
    topDiscovery: by('discovery_score'),
    biggestImprovers: improvers,
    newSignals,
    momentumLeaders: by('momentum_score'),
    highestRisk: by('risk_score'),
    sectorLeaders,
    upgraded,
    downgraded,
  }
  dashboardCache = { at: Date.now(), limit, data }
  return data
}

/**
 * Prune old snapshots to keep the table small and fast. Deletes non-latest
 * rows older than `keepDays` in bounded batches (never locks the table long).
 * Latest snapshots (is_latest=1) are ALWAYS kept.
 */
export async function pruneOldSnapshots(keepDays = 90) {
  const pool = getPool()
  let total = 0
  for (let i = 0; i < 200; i++) { // hard cap on batches per run
    const [res] = await pool.query(
      'DELETE FROM stock_analysis_reports WHERE is_latest = 0 AND created_at < NOW() - INTERVAL ? DAY LIMIT 5000',
      [keepDays],
    )
    total += res.affectedRows
    if (res.affectedRows < 5000) break
    await new Promise((r) => setTimeout(r, 250)) // breathe between batches
  }
  if (total) console.log(`pruned ${total} old analysis snapshots (kept latest + last ${keepDays} days)`)
  return total
}

/** Standout bullets for one stock: rank context + history trends. */
export async function getStandout(symbolCode, rankCtx, history) {
  const lines = []
  const m = rankCtx?.discovery?.market
  if (m?.rank === 1) {
    lines.push(m.tied > 1
      ? `Joint-highest Discovery score in the analysed market (tied with ${m.tied - 1} others of ${m.total})`
      : `Highest Discovery score in the entire analysed market (#1 of ${m.total})`)
  } else if (m?.topPct != null && m.topPct <= 10) {
    lines.push(`Top ${m.topPct}% of the analysed market on Discovery (#${m.rank} of ${m.total})`)
  }
  const sec = rankCtx?.discovery?.sector
  if (sec?.rank != null && sec.rank <= 3 && rankCtx.sectorName) {
    lines.push(sec.rank === 1 && sec.tied > 1
      ? `Joint-top Discovery score in ${rankCtx.sectorName} (tied with ${sec.tied - 1} of ${sec.total} peers)`
      : `#${sec.rank} Discovery score in ${rankCtx.sectorName} (${sec.total} peers)`)
  }
  if (rankCtx?.momentum?.market?.topPct != null && rankCtx.momentum.market.topPct <= 5) {
    lines.push(`Top ${rankCtx.momentum.market.topPct}% on Momentum — already among recognised leaders`)
  }
  // rising streak from history (oldest → newest)
  if (history?.length >= 3) {
    const asc = [...history].reverse()
    let streak = 0
    for (let i = 1; i < asc.length; i++) {
      if ((asc[i].discovery_score ?? 0) > (asc[i - 1].discovery_score ?? 0)) streak++
      else streak = 0
    }
    if (streak >= 2) lines.push(`Discovery score rising for ${streak + 1} consecutive analyses`)
    const first = asc[0]
    const lastRow = asc[asc.length - 1]
    if ((first.discovery_score ?? 0) < 40 && (lastRow.discovery_score ?? 0) >= 55) {
      lines.push('First strong discovery signal after a quiet period')
    }
  } else if (history?.length === 1) {
    lines.push('First analysis snapshot — no trend history yet')
  }
  return lines
}
