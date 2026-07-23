// ── Continuous Research Intelligence (CRI) ───────────────────────────────────
// Per docs/INSIGHT_PHASE5_PROTOCOL.md §2. HARD RULES:
//   • CRI NEVER modifies production weights, scores, badges or schema behaviour.
//   • Output is research recommendations in the fixed CEO format.
//   • Findings below confidence thresholds are logged, never surfaced as claims.
import { getPool } from './db.js'
import { fetchDaily } from './candles.js'

const WINDOWS = [20, 40, 120, 250]
const LABEL_B = { bars: 40, gain: 20 } // primary label for forward lift

// Backtest-validated lifts (Phases 1-4) — divergence baseline for triggers.
// null = no backtest reference (monitor only).
const BACKTEST_LIFT = {
  priorAdvance: 1.28, dryUp: 1.03, obv: 1.02, weeklyTurn: 1.25, compression: 1.3,
  location: 1.05, reclaim: 1.38, weeklyState: 1.06, structure: 0.98, choch: 1.07,
  rs: 0.99, trend: 1.06, quietPullback: 1.1, extended: 1.07, rsiMid: 1.02,
  quality: 1.26, // grade-A vs all rest-after-run episodes (Phase-5b dev)
}
const DIVERGENCE_TRIGGER = 0.15
const MIN_N = 100

export async function ensureCriSchema() {
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS snapshot_outcomes (
      id BIGINT NOT NULL AUTO_INCREMENT,
      report_id BIGINT NOT NULL,
      symbol_code VARCHAR(50) NOT NULL,
      analysis_date DATE NOT NULL,
      window_bars INT NOT NULL,
      max_gain_pct DECIMAL(10,2) NULL,
      max_dd_pct DECIMAL(10,2) NULL,
      ret_close_pct DECIMAL(10,2) NULL,
      win_b TINYINT(1) NULL,
      regime_up TINYINT(1) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_report_window (report_id, window_bars),
      KEY idx_symbol (symbol_code),
      KEY idx_window (window_bars)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cri_recommendations (
      id BIGINT NOT NULL AUTO_INCREMENT,
      cadence VARCHAR(12) NOT NULL,
      observation VARCHAR(200) NULL,
      pattern VARCHAR(300) NULL,
      finding VARCHAR(400) NULL,
      confidence VARCHAR(12) NULL,
      suggested_research VARCHAR(500) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'RESEARCH REQUIRED',
      evidence_theme VARCHAR(40) NULL,
      sample_n INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_created (created_at),
      KEY idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

// ── Daily: forward-outcome capture (idempotent, throttled) ───────────────────

export const captureState = { running: false, lastRun: null, captured: 0, pending: 0, errors: 0 }

/**
 * For every stored snapshot whose forward window has completed and has no
 * outcome row yet, compute and store outcomes. One candle fetch per symbol.
 */
export async function captureOutcomes(limitSymbols = 200) {
  if (captureState.running) return captureState
  captureState.running = true
  captureState.captured = 0
  captureState.errors = 0
  try {
    const pool = getPool()
    // pending = snapshots old enough for at least the 20-bar window (~30 calendar days)
    const [pending] = await pool.query(`
      SELECT r.id, r.symbol_code, r.analysis_date, r.price,
             JSON_EXTRACT(r.feature_evidence, '$.features.regimeUp') AS regime_up
        FROM stock_analysis_reports r
       WHERE r.analysis_date <= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         AND EXISTS (SELECT 1 FROM stock_mstr s WHERE s.symbol_code = r.symbol_code AND s.is_active = 1)
         AND (SELECT COUNT(*) FROM snapshot_outcomes o WHERE o.report_id = r.id) < ${WINDOWS.length}
       ORDER BY r.analysis_date ASC
       LIMIT 5000
    `)
    captureState.pending = pending.length
    const bySymbol = new Map()
    for (const row of pending) {
      if (!bySymbol.has(row.symbol_code)) bySymbol.set(row.symbol_code, [])
      bySymbol.get(row.symbol_code).push(row)
    }
    let symbolsDone = 0
    for (const [symbol, rows] of bySymbol) {
      if (symbolsDone >= limitSymbols) break
      symbolsDone++
      let daily
      try {
        daily = await fetchDaily(symbol, '2022-01-01')
      } catch { captureState.errors++; continue }
      const idxByDate = new Map(daily.map((c, i) => [new Date(c.time * 1000).toISOString().slice(0, 10), i]))
      for (const row of rows) {
        const d = String(row.analysis_date).slice(0, 10)
        let i = idxByDate.get(d)
        if (i == null) { // nearest bar ≤ analysis date
          i = daily.findLastIndex((c) => new Date(c.time * 1000).toISOString().slice(0, 10) <= d)
          if (i < 0) continue
        }
        const entry = daily[i].close
        for (const w of WINDOWS) {
          if (i + w >= daily.length) continue // window not complete yet
          let hi = -Infinity, lo = Infinity
          for (let k = 1; k <= w; k++) { hi = Math.max(hi, daily[i + k].high); lo = Math.min(lo, daily[i + k].low) }
          const maxGain = ((hi - entry) / entry) * 100
          const maxDD = ((lo - entry) / entry) * 100
          const retClose = ((daily[i + w].close - entry) / entry) * 100
          const winB = w === LABEL_B.bars ? (maxGain >= LABEL_B.gain && maxGain > Math.abs(maxDD) ? 1 : 0) : null
          await pool.query(
            `INSERT IGNORE INTO snapshot_outcomes
               (report_id, symbol_code, analysis_date, window_bars, max_gain_pct, max_dd_pct, ret_close_pct, win_b, regime_up)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [row.id, symbol, d, w, maxGain.toFixed(2), maxDD.toFixed(2), retClose.toFixed(2), winB,
             row.regime_up === true || row.regime_up === 'true' ? 1 : row.regime_up === false || row.regime_up === 'false' ? 0 : null],
          ).then(() => captureState.captured++).catch(() => captureState.errors++)
        }
      }
      await new Promise((r) => setTimeout(r, 200)) // throttle candle API
    }
    captureState.lastRun = new Date().toISOString()
  } finally {
    captureState.running = false
  }
  return captureState
}

// ── Weekly: per-evidence forward lift + pre-registered triggers ──────────────

function confidence(n, regimes = 1, stableWindows = 1) {
  if (n < 100) return 'Insufficient'
  if (n < 300 || regimes < 2) return n < 300 ? 'Low' : stableWindows >= 2 ? (regimes >= 2 ? 'High' : 'Moderate') : 'Low'
  if (n >= 1000 && stableWindows >= 2 && regimes >= 2) return 'High'
  return stableWindows >= 2 ? 'Moderate' : 'Low'
}

/** Join 40-bar outcomes with the evidence themes present at snapshot time. */
async function evidenceForwardRows(sinceDays = 120) {
  const [rows] = await getPool().query(`
    SELECT o.win_b, o.regime_up, o.analysis_date,
           JSON_EXTRACT(r.feature_evidence, '$.evidence') AS ev
      FROM snapshot_outcomes o
      JOIN stock_analysis_reports r ON r.id = o.report_id
     WHERE o.window_bars = ? AND o.win_b IS NOT NULL
       AND o.analysis_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
  `, [LABEL_B.bars, sinceDays])
  return rows.map((r) => {
    const ev = typeof r.ev === 'string' ? JSON.parse(r.ev) : r.ev
    const themes = new Set()
    for (const eng of ['discovery', 'transition', 'momentum']) {
      for (const it of ev?.[eng]?.items ?? []) if (it.theme) themes.add(it.theme)
    }
    return { win: r.win_b === 1, regimeUp: r.regime_up, date: r.analysis_date, themes }
  })
}

export async function weeklySummary() {
  const rows = await evidenceForwardRows(120)
  const base = rows.length ? rows.filter((r) => r.win).length / rows.length : null
  const perTheme = []
  const themes = new Set(rows.flatMap((r) => [...r.themes]))
  for (const theme of themes) {
    const on = rows.filter((r) => r.themes.has(theme))
    if (!on.length) continue
    const p = on.filter((r) => r.win).length / on.length
    const lift = base ? +(p / base).toFixed(2) : null
    const regimes = new Set(on.map((r) => r.regimeUp)).size
    const backtest = BACKTEST_LIFT[theme] ?? null
    const divergence = backtest != null && lift != null ? +(lift - backtest).toFixed(2) : null
    perTheme.push({
      theme, n: on.length, forwardWinPct: +(p * 100).toFixed(1), forwardLift: lift,
      backtestLift: backtest, divergence,
      confidence: confidence(on.length, regimes),
      triggered: divergence != null && Math.abs(divergence) > DIVERGENCE_TRIGGER && on.length >= MIN_N,
    })
  }
  perTheme.sort((a, b) => (b.n ?? 0) - (a.n ?? 0))

  // raise recommendations for triggered themes (dedupe: one open rec per theme)
  const created = []
  for (const t of perTheme.filter((x) => x.triggered)) {
    const [[exists]] = await getPool().query(
      `SELECT id FROM cri_recommendations WHERE evidence_theme = ? AND status IN ('RESEARCH REQUIRED','MONITORING')
        AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) LIMIT 1`, [t.theme])
    if (exists) continue
    const rec = {
      cadence: 'weekly',
      observation: `During the last ~120 trading days (forward, survivorship-free)`,
      pattern: `Evidence line: ${t.theme}`,
      finding: `Forward lift ${t.forwardLift}× vs backtest-validated ${t.backtestLift}× (divergence ${t.divergence > 0 ? '+' : ''}${t.divergence}; forward win ${t.forwardWinPct}% vs base ${(base * 100).toFixed(1)}%)`,
      confidence: t.confidence,
      suggested_research: t.divergence > 0
        ? `Investigate whether ${t.theme} deserves higher evidence confidence; check regime dependence before any challenger inclusion.`
        : `Investigate decay of ${t.theme}: regime-conditional split and sequence context (Phase-5 motifs) before any weight discussion.`,
      status: 'RESEARCH REQUIRED',
      evidence_theme: t.theme,
      sample_n: t.n,
    }
    await getPool().query(
      `INSERT INTO cri_recommendations (cadence, observation, pattern, finding, confidence, suggested_research, status, evidence_theme, sample_n)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [rec.cadence, rec.observation, rec.pattern, rec.finding, rec.confidence, rec.suggested_research, rec.status, rec.evidence_theme, rec.sample_n],
    )
    created.push(rec)
  }

  return {
    generatedAt: new Date().toISOString(),
    windowDays: 120,
    outcomes: rows.length,
    baseWinPct: base != null ? +(base * 100).toFixed(1) : null,
    perTheme,
    recommendationsCreated: created.length,
    note: rows.length < 500
      ? 'Forward sample still small — findings are provisional; silence is the correct output until data accumulates.'
      : null,
    governance: 'Research recommendations only. Production weights are frozen; changes require the research protocol + explicit CEO approval.',
  }
}

// ── Monthly: regime analysis ─────────────────────────────────────────────────

export async function monthlyRegime() {
  const rows = await evidenceForwardRows(365)
  const split = (flag) => {
    const set = rows.filter((r) => r.regimeUp === flag)
    const base = set.length ? set.filter((r) => r.win).length / set.length : null
    return { n: set.length, baseWinPct: base != null ? +(base * 100).toFixed(1) : null, set, base }
  }
  const up = split(1)
  const down = split(0)
  const themes = new Set(rows.flatMap((r) => [...r.themes]))
  const table = []
  for (const theme of themes) {
    const liftIn = (grp) => {
      const on = grp.set.filter((r) => r.themes.has(theme))
      if (on.length < 50 || !grp.base) return { n: on.length, lift: null }
      return { n: on.length, lift: +((on.filter((r) => r.win).length / on.length) / grp.base).toFixed(2) }
    }
    const u = liftIn(up)
    const d = liftIn(down)
    table.push({
      theme, nUp: u.n, liftRegimeUp: u.lift, nDown: d.n, liftRegimeDown: d.lift,
      divergent: u.lift != null && d.lift != null && ((u.lift > 1 && d.lift < 1) || (u.lift < 1 && d.lift > 1)),
    })
  }
  return {
    generatedAt: new Date().toISOString(),
    windowDays: 365,
    regimeUp: { n: up.n, baseWinPct: up.baseWinPct },
    regimeDown: { n: down.n, baseWinPct: down.baseWinPct },
    perTheme: table.sort((a, b) => (b.nUp + b.nDown) - (a.nUp + a.nDown)),
    note: down.n < 300 ? 'Regime-down sample thin — divergences are observations, not conclusions (protocol requires ≥2 regime episodes).' : null,
  }
}

// ── Quarterly: challenger evaluation (gated stub until data suffices) ────────

export async function quarterlyChallenger() {
  const [[{ n }]] = await getPool().query(
    'SELECT COUNT(*) AS n FROM snapshot_outcomes WHERE window_bars = ? AND win_b IS NOT NULL', [LABEL_B.bars])
  if (n < 3000) {
    return {
      status: 'INSUFFICIENT FORWARD DATA',
      outcomes: n,
      required: 3000,
      note: 'Challenger evaluation activates once ≥3000 forward-labelled outcomes exist (~1 quarter of regular batches). Champion (frozen v2) remains sole production model.',
    }
  }
  return {
    status: 'READY FOR REVIEW',
    outcomes: n,
    note: 'Sufficient forward data. Per protocol, challenger candidates come from VALIDATED Phase-5 findings; evaluation is a manual research step with CEO sign-off — this endpoint reports readiness only and never promotes anything.',
  }
}

export async function listRecommendations(limit = 50) {
  const [rows] = await getPool().query(
    'SELECT * FROM cri_recommendations ORDER BY created_at DESC LIMIT ?', [Number(limit)])
  return rows
}
