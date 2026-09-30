// ── Option Insight dry-run tracker (Stage 4) ─────────────────────────────────
// Paper-trades the analysis engine's decisions and tracks each to its exit,
// faithful to Option-Analysis/engine.py's position management:
//   • P&L is in RUPEES: (exit − entry) × lots × lot_size, buying-only.
//   • pnl_mode COMBINED → one total P&L across all legs (a straddle's two legs
//     are managed together); PERLEG → each leg checked on its own.
//   • Stop-loss: total P&L ≤ −max_loss (when sl_enabled).
//   • Target:    total P&L ≥ target_profit (when target_enabled).
//   • time_exit: square off at HH:MM IST (when time_exit_enabled).
//   • force_exit_time: always-on day-end square-off (default 15:15 IST).
// One open position per index; a changed decision closes the old one first.
// No execution — this only records what would have happened.
import { getPool } from './db.js'
import { fetchOptionChain, readLeg, marketOpenNow } from './optionLab.js'

const istNow = () => new Date(Date.now() + 5.5 * 3600e3)
const dstrIST = () => istNow().toISOString().slice(0, 10)
const hhmmIST = () => { const d = istNow(); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` }
const minsIST = () => { const d = istNow(); return d.getUTCHours() * 60 + d.getUTCMinutes() }
const parseHHMM = (s) => { const [h, m] = String(s || '').split(':').map(Number); return (Number.isFinite(h) ? h : 15) * 60 + (Number.isFinite(m) ? m : 15) }
const dteOf = (expiryIso) => { try { return Math.round((new Date(expiryIso + 'T00:00:00Z') - new Date(dstrIST() + 'T00:00:00Z')) / 864e5) } catch { return null } }

// ── schema ────────────────────────────────────────────────────────────────
export async function ensureDryRunSchema() {
  const pool = getPool()
  await pool.query(`CREATE TABLE IF NOT EXISTS option_dryrun (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    day_key VARCHAR(16) NOT NULL,
    index_sym VARCHAR(16) NOT NULL,
    decision VARCHAR(8) NOT NULL,          -- CALL | PUT | BOTH
    expiry VARCHAR(16),
    dte INT,
    spot_entry DECIMAL(12,2),
    vix DECIMAL(8,2),
    upside_prob DECIMAL(6,4),
    reason TEXT,
    lots INT,
    qty INT,                               -- per-leg quantity (lots × lot_size)
    lot_size INT,
    legs JSON,                             -- [{side,strike,entry}]
    entry_combined DECIMAL(12,2),          -- sum of leg entry premiums
    sl_enabled TINYINT, max_loss DECIMAL(12,2),
    target_enabled TINYINT, target_profit DECIMAL(12,2),
    pnl_mode VARCHAR(12), time_exit VARCHAR(8), force_exit_time VARCHAR(8),
    status VARCHAR(16) DEFAULT 'OPEN',     -- OPEN|TARGET|STOP_LOSS|TIME_EXIT|FORCE_EXIT|INVALIDATED
    resolved TINYINT DEFAULT 0,
    exit_reason VARCHAR(16),
    last_pnl DECIMAL(14,2),                -- rupees
    mfe DECIMAL(14,2), mae DECIMAL(14,2),  -- rupees (max favourable / adverse)
    legs_exit JSON,                        -- [{side,strike,exit}]
    exit_pnl DECIMAL(14,2),                -- rupees
    minutes_to_outcome INT,
    checks INT DEFAULT 0,
    resolved_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_day (day_key), KEY idx_index (index_sym), KEY idx_resolved (resolved)
  )`)
}

const parseJson = (v) => { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v) } catch { return null } }

// ── open dry-run positions from an analysis result ──────────────────────────
// Only opens during market hours. One open position per index; if the live
// decision differs from an already-open one, the old one is closed (thesis
// change) before the new one opens.
export async function openFromAnalysis(analysis) {
  if (!analysis?.byIndex) return { opened: [], skipped: 'no analysis' }
  if (!marketOpenNow()) return { opened: [], skipped: 'market closed' }
  await ensureDryRunSchema()
  const pool = getPool()
  const s = analysis.settings || {}
  const opened = []

  for (const [index, r] of Object.entries(analysis.byIndex)) {
    if (!r?.ok || !r.recommendation || r.decision === 'NO_TRADE') continue
    const legs = (r.recommendation.legs || []).filter((l) => l.entryPremium != null).map((l) => ({ side: l.side, strike: l.strike, entry: Number(l.entryPremium) }))
    if (!legs.length) continue

    const lotSize = Number(s.lot_sizes?.[index]) || 1
    const lots = Number(s.lots) || 1
    const qty = lots * lotSize
    const entryCombined = legs.reduce((a, l) => a + l.entry, 0)

    // existing open position for this index?
    const [openRows] = await pool.query('SELECT * FROM option_dryrun WHERE resolved = 0 AND index_sym = ? ORDER BY id DESC LIMIT 1', [index])
    const open = openRows[0]
    if (open) {
      const sameDecision = open.decision === r.decision
      const sameLegs = JSON.stringify((parseJson(open.legs) || []).map((l) => `${l.side}${l.strike}`).sort()) === JSON.stringify(legs.map((l) => `${l.side}${l.strike}`).sort())
      if (sameDecision && sameLegs) continue // hold the existing position
      // thesis changed → close old at its last-marked P&L, then open the new one
      await pool.query(
        `UPDATE option_dryrun SET status='INVALIDATED', resolved=1, exit_reason='THESIS_CHANGE', exit_pnl=last_pnl,
           minutes_to_outcome=TIMESTAMPDIFF(MINUTE, created_at, NOW()), resolved_at=CURRENT_TIMESTAMP WHERE id=?`,
        [open.id],
      )
    }

    const [ins] = await pool.query(
      `INSERT INTO option_dryrun
        (day_key, index_sym, decision, expiry, dte, spot_entry, vix, upside_prob, reason, lots, qty, lot_size,
         legs, entry_combined, sl_enabled, max_loss, target_enabled, target_profit, pnl_mode, time_exit, force_exit_time,
         status, resolved, last_pnl, mfe, mae)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'OPEN', 0, 0, 0, 0)`,
      [
        dstrIST(), index, r.decision, r.expiry, dteOf(r.expiry), r.spot ?? null, r.indiaVix ?? null,
        r.probability?.upside ?? null, r.reason ?? null, lots, qty, lotSize,
        JSON.stringify(legs), entryCombined,
        s.sl_enabled ? 1 : 0, s.max_loss ?? null, s.target_enabled ? 1 : 0, s.target_profit ?? null,
        s.pnl_mode || 'COMBINED', s.time_exit_enabled ? s.time_exit : null, s.force_exit_time || '15:15',
      ],
    )
    opened.push({ index, id: ins.insertId, decision: r.decision, legs })
  }
  return { opened }
}

// ── evaluate open dry-run positions (forward, no look-ahead) ────────────────
export const dryRunState = { running: false, lastRun: null, checked: 0, resolved: 0 }

export async function evaluateOpenDryRuns() {
  if (dryRunState.running) return dryRunState
  dryRunState.running = true; dryRunState.checked = 0; dryRunState.resolved = 0
  try {
    await ensureDryRunSchema()
    const pool = getPool()
    const [rows] = await pool.query('SELECT * FROM option_dryrun WHERE resolved = 0')
    const day = dstrIST()
    const time = hhmmIST()
    const nowMin = minsIST()

    // one chain snapshot per (index, expiry)
    const chains = new Map()
    for (const p of rows) {
      const key = `${p.index_sym}|${p.expiry}`
      if (!chains.has(key)) { try { chains.set(key, await fetchOptionChain(p.index_sym, p.expiry, day, time)) } catch { chains.set(key, null) } }
    }

    for (const p of rows) {
      dryRunState.checked++
      const chain = chains.get(`${p.index_sym}|${p.expiry}`)
      const legs = parseJson(p.legs) || []
      const qty = Number(p.qty) || 0

      // mark each leg to current premium
      const marked = legs.map((l) => {
        const leg = chain ? readLeg(chain, l.strike, l.side) : null
        const ltp = leg?.ltp != null && Number.isFinite(Number(leg.ltp)) ? Number(leg.ltp) : null
        const legPnl = ltp != null ? (ltp - Number(l.entry)) * qty : null // BUY: exit − entry
        return { ...l, ltp, legPnl }
      })
      const haveAll = marked.every((m) => m.ltp != null)
      const combinedPnl = marked.reduce((a, m) => a + (m.legPnl || 0), 0)

      let mfe = Number(p.mfe) || 0
      let mae = Number(p.mae) || 0
      if (haveAll) { mfe = Math.max(mfe, combinedPnl); mae = Math.min(mae, combinedPnl) }

      // ── exit rules (checked in Python's order) ──
      let status = 'OPEN'; let reason = null
      const forceMin = parseHHMM(p.force_exit_time)
      const timeMin = p.time_exit ? parseHHMM(p.time_exit) : null

      if (nowMin >= forceMin) { status = 'FORCE_EXIT'; reason = 'FORCE_EXIT_TIME' }
      else if (timeMin != null && nowMin >= timeMin) { status = 'TIME_EXIT'; reason = 'TIME_EXIT' }
      else if (haveAll) {
        if (p.pnl_mode === 'PERLEG') {
          const slHit = p.sl_enabled && marked.some((m) => m.legPnl <= -Math.abs(Number(p.max_loss)))
          const tgtHit = p.target_enabled && marked.some((m) => m.legPnl >= Math.abs(Number(p.target_profit)))
          if (slHit) { status = 'STOP_LOSS'; reason = 'STOP_LOSS' }
          else if (tgtHit) { status = 'TARGET'; reason = 'TARGET' }
        } else { // COMBINED
          if (p.sl_enabled && combinedPnl <= -Math.abs(Number(p.max_loss))) { status = 'STOP_LOSS'; reason = 'STOP_LOSS' }
          else if (p.target_enabled && combinedPnl >= Math.abs(Number(p.target_profit))) { status = 'TARGET'; reason = 'TARGET' }
        }
      }

      const resolved = status !== 'OPEN'
      let exitPnl = null; let minutes = null; let legsExit = null
      if (resolved) {
        exitPnl = combinedPnl
        legsExit = marked.map((m) => ({ side: m.side, strike: m.strike, exit: m.ltp }))
        minutes = Math.round((Date.now() - new Date(p.created_at).getTime()) / 60000)
        dryRunState.resolved++
      }
      await pool.query(
        `UPDATE option_dryrun SET last_pnl=?, mfe=?, mae=?, status=?, resolved=?, exit_reason=?, legs_exit=?,
           exit_pnl=?, minutes_to_outcome=?, checks=checks+1,
           resolved_at=${resolved ? 'CURRENT_TIMESTAMP' : 'resolved_at'} WHERE id=?`,
        [haveAll ? combinedPnl : p.last_pnl, mfe, mae, status, resolved ? 1 : 0, reason,
          legsExit ? JSON.stringify(legsExit) : null, exitPnl, minutes, p.id],
      )
    }
  } finally {
    dryRunState.running = false
    dryRunState.lastRun = new Date().toISOString()
  }
  return dryRunState
}

// ── reads ────────────────────────────────────────────────────────────────
export async function getDryRuns(filters = {}) {
  await ensureDryRunSchema()
  const where = []; const args = []
  if (filters.index) { where.push('index_sym = ?'); args.push(filters.index) }
  if (filters.open) where.push('resolved = 0')
  const [rows] = await getPool().query(
    `SELECT * FROM option_dryrun ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ${Math.min(1000, Number(filters.limit) || 300)}`,
    args,
  )
  return rows.map((r) => ({ ...r, legs: parseJson(r.legs), legs_exit: parseJson(r.legs_exit) }))
}

export async function getDryRunMetrics() {
  await ensureDryRunSchema()
  const [rows] = await getPool().query('SELECT * FROM option_dryrun')
  const resolved = rows.filter((r) => Number(r.resolved) === 1 && r.exit_pnl != null)
  const openNow = rows.filter((r) => Number(r.resolved) !== 1).length
  const pnls = resolved.map((r) => Number(r.exit_pnl))
  const wins = pnls.filter((p) => p > 0)
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(d))
  let eq = 0, peak = 0, maxDD = 0
  for (const p of pnls) { eq += p; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq) }
  const grossWin = sum(wins)
  const grossLoss = Math.abs(sum(pnls.filter((p) => p <= 0)))
  return {
    generatedAt: new Date().toISOString(),
    counts: { total: rows.length, resolved: resolved.length, openNow, wins: wins.length, losses: resolved.length - wins.length },
    netPnl: round(sum(pnls)), winRate: resolved.length ? round((wins.length / resolved.length) * 100, 1) : null,
    avgPnl: resolved.length ? round(sum(pnls) / resolved.length) : null,
    avgWin: wins.length ? round(grossWin / wins.length) : null,
    avgLoss: (resolved.length - wins.length) ? round(-grossLoss / (resolved.length - wins.length)) : null,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss) : (grossWin > 0 ? 999 : null),
    maxDrawdown: round(maxDD),
    byIndex: ['NIFTY', 'BANKNIFTY', 'SENSEX'].map((idx) => {
      const t = resolved.filter((r) => r.index_sym === idx)
      const w = t.filter((r) => Number(r.exit_pnl) > 0)
      return { index: idx, trades: t.length, winRate: t.length ? round((w.length / t.length) * 100, 1) : null, netPnl: round(sum(t.map((r) => Number(r.exit_pnl)))) }
    }),
  }
}

export async function wipeDryRun() {
  const pool = getPool()
  await ensureDryRunSchema()
  await pool.query('DELETE FROM option_dryrun')
  try { await pool.query('ALTER TABLE option_dryrun AUTO_INCREMENT = 1') } catch { /* non-fatal */ }
  return { wiped: true }
}
