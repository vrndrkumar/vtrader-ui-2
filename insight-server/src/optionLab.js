// ── Option Lab: persist every suggested (and would-be) option trade, then track
//    its real forward outcome from option-chain snapshots. Research/measurement
//    layer — it changes NO trading logic. It records what the engine decided and
//    what actually happened, so we can finally measure the methodology.
//
// A "signal" row is logged by the frontend each time the engine's best candidate
// changes (including NO-TRADE verdicts, tagged with the gates they failed — the
// rejection funnel). Outcomes are filled forward, server-side, with no look-ahead:
// entry/SL/target are frozen at signal time; only later premiums decide the result.
import { getPool } from './db.js'
import { config } from './config.js'

const dstrIST = (d = new Date()) => {
  const ist = new Date(d.getTime() + 5.5 * 3600e3)
  return ist.toISOString().slice(0, 10)
}
const hhmmIST = (d = new Date()) => {
  const ist = new Date(d.getTime() + 5.5 * 3600e3)
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`
}
const minsIST = () => { const ist = new Date(Date.now() + 5.5 * 3600e3); return ist.getUTCHours() * 60 + ist.getUTCMinutes() }
const MKT_OPEN = 9 * 60 + 15
const MKT_CLOSE = 15 * 60 + 30
export const marketOpenNow = () => { const m = minsIST(); return m >= MKT_OPEN && m <= MKT_CLOSE }

// ── schema ────────────────────────────────────────────────────────────────────
export async function ensureOptionLabSchema() {
  const pool = getPool()
  await pool.query(`CREATE TABLE IF NOT EXISTS option_signal (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    day_key VARCHAR(16) NOT NULL,
    time_block VARCHAR(24),
    index_sym VARCHAR(16) NOT NULL,
    verdict VARCHAR(16) NOT NULL,            -- 'Option Buying' | 'Option Selling' | 'NO TRADE'
    active TINYINT DEFAULT 0,                -- was this an ACTIVE (gates passed) trade?
    action VARCHAR(4),                       -- BUY | SELL
    side VARCHAR(4),                         -- CE | PE
    moneyness VARCHAR(4),
    strike DECIMAL(12,2),
    expiry VARCHAR(16),
    dte INT,
    entry_premium DECIMAL(12,2),
    sl_premium DECIMAL(12,2),
    t1_premium DECIMAL(12,2),
    t2_premium DECIMAL(12,2),
    rr DECIMAL(8,2),
    confidence INT,
    stars INT,
    reason TEXT,
    spot DECIMAL(12,2),
    vix DECIMAL(8,2),
    mqs INT,
    dir_prob INT,
    up_tfs INT,
    dn_tfs INT,
    adx15 DECIMAL(8,2),
    atr15 DECIMAL(10,2),
    pcr DECIMAL(8,2),
    liquidity VARCHAR(12),
    spread_pct DECIMAL(8,2),
    premium_richness VARCHAR(8),
    delta_proxy DECIMAL(6,3),
    failing_gates JSON,
    evidence JSON,
    greeks JSON,
    engine_version VARCHAR(64),
    dedup_key VARCHAR(160),
    UNIQUE KEY uq_dedup (dedup_key),
    KEY idx_day (day_key), KEY idx_index (index_sym), KEY idx_verdict (verdict), KEY idx_active (active)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS option_signal_outcome (
    signal_id BIGINT PRIMARY KEY,
    status VARCHAR(16) DEFAULT 'OPEN',       -- OPEN|TARGET1|TARGET2|SL|INVALIDATED|CLOSED|EXPIRED
    resolved TINYINT DEFAULT 0,
    first_hit VARCHAR(12),                   -- TARGET1|TARGET2|SL|NONE
    last_premium DECIMAL(12,2),
    mfe DECIMAL(12,2),                       -- max favourable excursion (premium, signed +)
    mae DECIMAL(12,2),                       -- max adverse excursion (premium, signed +)
    exit_premium DECIMAL(12,2),
    pnl_premium DECIMAL(12,2),               -- per-unit premium P&L (BUY: exit-entry; SELL: entry-exit)
    r_multiple DECIMAL(8,2),
    minutes_to_outcome INT,
    checks INT DEFAULT 0,
    resolved_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_status (status), KEY idx_resolved (resolved)
  )`)
  // Widen columns on pre-existing narrow tables (freeze-safe — table is tiny).
  try {
    const [cols] = await pool.query(
      "SELECT column_name, character_maximum_length AS len FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'option_signal' AND column_name IN ('engine_version','dedup_key')",
    )
    for (const c of cols) {
      const name = c.column_name || c.COLUMN_NAME
      const len = c.len ?? c.LEN
      if (name === 'engine_version' && len != null && len < 64) await pool.query('ALTER TABLE option_signal MODIFY engine_version VARCHAR(64)')
      if (name === 'dedup_key' && len != null && len < 160) await pool.query('ALTER TABLE option_signal MODIFY dedup_key VARCHAR(160)')
    }
  } catch { /* non-fatal */ }
}

// ── option-chain fetch (Greeks API) ──────────────────────────────────────────
export async function fetchOptionChain(symbol, expiry, dateStr, timeStr) {
  const url = `${config.candleBaseUrl}/data/option-chain?symbol=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(expiry)}&date=${encodeURIComponent(dateStr)}&time=${encodeURIComponent(timeStr)}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`option-chain API ${res.status} for ${symbol} ${expiry}`)
    return await res.json()
  } finally { clearTimeout(timer) }
}

/** Current premium (ltp) + full greeks for a specific strike/side from a snapshot. */
function readLeg(chainJson, strike, side) {
  const rows = Array.isArray(chainJson?.chain) ? chainJson.chain : []
  const row = rows.find((r) => Number(r.strike) === Number(strike))
  if (!row) return null
  const leg = side === 'CE' ? row.call : row.put
  if (!leg) return null
  return {
    ltp: leg.ltp ?? null, bid: leg.bid ?? null, ask: leg.ask ?? null,
    delta: leg.delta ?? null, gamma: leg.gamma ?? null, theta: leg.theta ?? null,
    vega: leg.vega ?? null, iv: leg.iv ?? null, oi: leg.oi ?? null, oiChange: leg.oi_change ?? null,
    volume: leg.volume ?? null,
  }
}

// ── record a signal (idempotent per dedup_key) ───────────────────────────────
export async function recordSignal(p) {
  await ensureOptionLabSchema()
  const pool = getPool()
  const day = dstrIST()
  const dedup = p.dedupKey || `${p.index}|${day}|${p.action ?? 'NA'}|${p.side ?? 'NA'}|${p.strike ?? 'NA'}|${p.verdict}`
  // Enrich with authoritative Greeks/OI/IV from the chain snapshot at signal time
  // (the WS feed may not carry greeks). Best-effort — never block the log.
  let greeks = p.greeks ?? null
  if ((!greeks || !greeks.delta) && p.strike != null && p.side && p.expiry) {
    try {
      const chain = await fetchOptionChain(p.index, p.expiry, day, hhmmIST())
      const leg = readLeg(chain, p.strike, p.side)
      if (leg) greeks = { ...leg, snapVix: chain?.india_vix ?? null, snapSpot: chain?.spot ?? null }
    } catch { /* keep whatever the client sent */ }
  }
  p = { ...p, greeks }
  const [r] = await pool.query(
    `INSERT INTO option_signal
     (day_key, time_block, index_sym, verdict, active, action, side, moneyness, strike, expiry, dte,
      entry_premium, sl_premium, t1_premium, t2_premium, rr, confidence, stars, reason, spot, vix, mqs,
      dir_prob, up_tfs, dn_tfs, adx15, atr15, pcr, liquidity, spread_pct, premium_richness, delta_proxy,
      failing_gates, evidence, greeks, engine_version, dedup_key)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE id = id`, // keep the FIRST occurrence (earliest entry) — do not overwrite
    [
      day, p.timeBlock ?? null, p.index, p.verdict, p.active ? 1 : 0, p.action ?? null, p.side ?? null,
      p.moneyness ?? null, p.strike ?? null, p.expiry ?? null, p.dte ?? null,
      p.entryPremium ?? null, p.slPremium ?? null, p.t1Premium ?? null, p.t2Premium ?? null, p.rr ?? null,
      p.confidence ?? null, p.stars ?? null, p.reason ?? null, p.spot ?? null, p.vix ?? null, p.mqs ?? null,
      p.dirProb ?? null, p.upTfs ?? null, p.dnTfs ?? null, p.adx15 ?? null, p.atr15 ?? null, p.pcr ?? null,
      p.liquidity ?? null, p.spreadPct ?? null, p.premiumRichness ?? null, p.deltaProxy ?? null,
      JSON.stringify(p.failingGates ?? []), JSON.stringify(p.evidence ?? {}), JSON.stringify(p.greeks ?? {}),
      p.engineVersion ?? null, dedup,
    ],
  )
  const signalId = r.insertId || null
  // ── position lifecycle ───────────────────────────────────────────────────
  // A trade, once taken, is HELD and tracked to SL/target — we do NOT churn a
  // new position every tick. Rules:
  //   • Only ACTIVE (given) trades become tracked positions. NO-TRADE / would-be
  //     rows are logged (funnel/research) but never opened as trades.
  //   • At most ONE open position per index. While it's open we hold it.
  //   • A genuinely different active setup = thesis change → EXIT the current
  //     position (record its outcome) and open the new one.
  if (p.active && p.entryPremium != null && p.action && p.side && p.strike != null) {
    const [openRows] = await pool.query(
      `SELECT o.signal_id, o.last_premium, s.action, s.side, s.strike, s.entry_premium, s.sl_premium
         FROM option_signal_outcome o JOIN option_signal s ON s.id = o.signal_id
        WHERE o.resolved = 0 AND s.index_sym = ? ORDER BY o.signal_id DESC LIMIT 1`,
      [p.index],
    )
    const open = openRows[0]
    const same = open && open.action === p.action && open.side === p.side && Number(open.strike) === Number(p.strike)
    if (open && !same) {
      // thesis changed → exit current position at last-known premium, record outcome
      const exit = open.last_premium != null ? Number(open.last_premium) : Number(open.entry_premium)
      const isBuy = open.action === 'BUY'
      const pnl = open.entry_premium != null ? (isBuy ? exit - Number(open.entry_premium) : Number(open.entry_premium) - exit) : null
      const risk = open.sl_premium != null && open.entry_premium != null ? Math.abs(Number(open.entry_premium) - Number(open.sl_premium)) : null
      const rmult = risk && risk > 0 && pnl != null ? +(pnl / risk).toFixed(2) : null
      await pool.query(
        `UPDATE option_signal_outcome SET status='INVALIDATED', resolved=1, first_hit='NONE', exit_premium=?, pnl_premium=?, r_multiple=?, resolved_at=CURRENT_TIMESTAMP WHERE signal_id=?`,
        [exit, pnl, rmult, open.signal_id],
      )
    }
    if (signalId && (!open || !same)) {
      await pool.query(
        `INSERT IGNORE INTO option_signal_outcome (signal_id, status, last_premium, mfe, mae) VALUES (?, 'OPEN', ?, 0, 0)`,
        [signalId, p.entryPremium],
      )
    }
    // same open position → HOLD (do nothing; the evaluator keeps tracking it)
  }
  return { id: signalId, dedup, deduped: !r.insertId }
}

// ── outcome evaluation (forward, no look-ahead) ──────────────────────────────
export const outcomeState = { running: false, lastRun: null, checked: 0, resolved: 0 }

export async function evaluateOpenOutcomes() {
  if (outcomeState.running) return outcomeState
  outcomeState.running = true; outcomeState.checked = 0; outcomeState.resolved = 0
  try {
    await ensureOptionLabSchema()
    const pool = getPool()
    const [rows] = await pool.query(
      `SELECT s.*, o.status, o.mfe, o.mae, o.checks
         FROM option_signal s JOIN option_signal_outcome o ON o.signal_id = s.id
        WHERE o.resolved = 0`,
    )
    const day = dstrIST()
    const time = hhmmIST()
    const afterClose = minsIST() > (15 * 60 + 15) // square-off by 15:15 IST
    // group by (index, expiry) to reuse one chain snapshot per group
    const groups = new Map()
    for (const s of rows) { const k = `${s.index_sym}|${s.expiry}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s) }

    for (const [k, sigs] of groups) {
      const [index, expiry] = k.split('|')
      let chain = null
      try { chain = await fetchOptionChain(index, expiry, day, time) } catch { chain = null }
      for (const s of sigs) {
        outcomeState.checked++
        const leg = chain ? readLeg(chain, s.strike, s.side) : null
        const ltp = leg?.ltp ?? null
        const isBuy = s.action === 'BUY'
        const entry = Number(s.entry_premium)
        let mfe = Number(s.mfe) || 0
        let mae = Number(s.mae) || 0
        if (ltp != null && Number.isFinite(ltp)) {
          const fav = isBuy ? ltp - entry : entry - ltp   // favourable move (premium terms)
          mfe = Math.max(mfe, fav)
          mae = Math.min(mae, fav) // most negative favourable = worst adverse
        }
        // resolution: premium-based target/SL
        let status = 'OPEN'; let firstHit = 'NONE'; let exit = ltp
        if (ltp != null && Number.isFinite(ltp)) {
          if (isBuy) {
            if (s.t2_premium != null && ltp >= Number(s.t2_premium)) { status = 'TARGET2'; firstHit = 'TARGET2'; exit = Number(s.t2_premium) }
            else if (s.t1_premium != null && ltp >= Number(s.t1_premium)) { status = 'TARGET1'; firstHit = 'TARGET1'; exit = Number(s.t1_premium) }
            else if (s.sl_premium != null && ltp <= Number(s.sl_premium)) { status = 'SL'; firstHit = 'SL'; exit = Number(s.sl_premium) }
          } else { // SELL: profit when premium falls
            if (s.t2_premium != null && ltp <= Number(s.t2_premium)) { status = 'TARGET2'; firstHit = 'TARGET2'; exit = Number(s.t2_premium) }
            else if (s.t1_premium != null && ltp <= Number(s.t1_premium)) { status = 'TARGET1'; firstHit = 'TARGET1'; exit = Number(s.t1_premium) }
            else if (s.sl_premium != null && ltp >= Number(s.sl_premium)) { status = 'SL'; firstHit = 'SL'; exit = Number(s.sl_premium) }
          }
        }
        // end-of-day / expiry square-off if still open
        const expired = s.dte != null && Number(s.dte) < 0
        if (status === 'OPEN' && (afterClose || expired) && ltp != null) { status = expired ? 'EXPIRED' : 'CLOSED'; exit = ltp }

        const resolved = status !== 'OPEN'
        let pnl = null; let r = null; let minutes = null
        if (resolved && exit != null) {
          pnl = isBuy ? exit - entry : entry - exit
          const risk = isBuy ? entry - Number(s.sl_premium) : Number(s.sl_premium) - entry
          r = risk && risk > 0 ? +(pnl / risk).toFixed(2) : null
          minutes = Math.round((Date.now() - new Date(s.created_at).getTime()) / 60000)
          outcomeState.resolved++
        }
        await pool.query(
          `UPDATE option_signal_outcome SET status=?, resolved=?, first_hit=?, last_premium=?, mfe=?, mae=?,
             exit_premium=?, pnl_premium=?, r_multiple=?, minutes_to_outcome=?, checks=checks+1,
             resolved_at=${resolved ? 'CURRENT_TIMESTAMP' : 'resolved_at'}
           WHERE signal_id=?`,
          [status, resolved ? 1 : 0, firstHit, ltp, mfe, mae, resolved ? exit : null, pnl, r, minutes, s.id],
        )
      }
    }
  } finally {
    outcomeState.running = false
    outcomeState.lastRun = new Date().toISOString()
  }
  return outcomeState
}

// ── reads ────────────────────────────────────────────────────────────────────
export async function getLiveSignals() {
  await ensureOptionLabSchema()
  const [rows] = await getPool().query(
    `SELECT s.*, o.status, o.last_premium, o.mfe, o.mae, o.pnl_premium, o.r_multiple
       FROM option_signal s JOIN option_signal_outcome o ON o.signal_id = s.id
      WHERE o.resolved = 0 ORDER BY s.created_at DESC LIMIT 200`,
  )
  return rows
}

export async function getSignals(filters = {}) {
  await ensureOptionLabSchema()
  const where = []
  const args = []
  if (filters.index) { where.push('s.index_sym = ?'); args.push(filters.index) }
  if (filters.action) { where.push('s.action = ?'); args.push(filters.action) }
  if (filters.day) { where.push('s.day_key = ?'); args.push(filters.day) }
  const [rows] = await getPool().query(
    `SELECT s.*, o.status, o.first_hit, o.pnl_premium, o.r_multiple, o.mfe, o.mae, o.minutes_to_outcome, o.resolved
       FROM option_signal s LEFT JOIN option_signal_outcome o ON o.signal_id = s.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY s.created_at DESC LIMIT ${Math.min(1000, Number(filters.limit) || 500)}`,
    args,
  )
  return rows
}

// ── metrics ──────────────────────────────────────────────────────────────────
const num = (v) => (v == null ? null : Number(v))
const parseJson = (v) => { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v) } catch { return null } }

/** Aggregate performance stats for an array of resolved trades. */
function statsFor(trades) {
  const n = trades.length
  if (!n) return { trades: 0 }
  const pnls = trades.map((t) => num(t.pnl_premium) ?? 0)
  const rs = trades.map((t) => num(t.r_multiple)).filter((x) => x != null)
  const wins = trades.filter((t) => (num(t.pnl_premium) ?? 0) > 0)
  const losses = trades.filter((t) => (num(t.pnl_premium) ?? 0) <= 0)
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  const grossWin = sum(wins.map((t) => num(t.pnl_premium) ?? 0))
  const grossLoss = Math.abs(sum(losses.map((t) => num(t.pnl_premium) ?? 0)))
  const avg = (a) => (a.length ? sum(a) / a.length : null)
  // equity curve + drawdown (in premium points)
  let eq = 0; let peak = 0; let maxDD = 0; const dds = []
  for (const p of pnls) { eq += p; peak = Math.max(peak, eq); const dd = peak - eq; dds.push(dd); maxDD = Math.max(maxDD, dd) }
  // streaks
  let winStreak = 0; let loseStreak = 0; let curW = 0; let curL = 0
  for (const p of pnls) {
    if (p > 0) { curW++; curL = 0 } else { curL++; curW = 0 }
    winStreak = Math.max(winStreak, curW); loseStreak = Math.max(loseStreak, curL)
  }
  const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(d))
  return {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    winRate: round((wins.length / n) * 100, 1),
    avgWin: round(avg(wins.map((t) => num(t.pnl_premium)))),
    avgLoss: round(avg(losses.map((t) => num(t.pnl_premium)))),
    avgPnl: round(avg(pnls)),
    expectancy: round(avg(pnls)), // per-trade expected premium points
    avgR: round(avg(rs)),
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss) : (grossWin > 0 ? 999 : null),
    grossWin: round(grossWin),
    grossLoss: round(grossLoss),
    netPnl: round(sum(pnls)),
    maxDrawdown: round(maxDD),
    avgDrawdown: round(avg(dds)),
    maxWinStreak: winStreak,
    maxLoseStreak: loseStreak,
    avgMfe: round(avg(trades.map((t) => num(t.mfe)).filter((x) => x != null))),
    avgMae: round(avg(trades.map((t) => num(t.mae)).filter((x) => x != null))),
    avgMinutes: round(avg(trades.map((t) => num(t.minutes_to_outcome)).filter((x) => x != null)), 0),
  }
}

function groupStats(trades, keyFn, minN = 1) {
  const groups = new Map()
  for (const t of trades) { const k = keyFn(t); if (k == null) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t) }
  const out = []
  for (const [k, arr] of groups) if (arr.length >= minN) out.push({ key: k, ...statsFor(arr) })
  return out.sort((a, b) => (b.expectancy ?? -1e9) - (a.expectancy ?? -1e9))
}

const confBucket = (c) => (c == null ? 'unknown' : c >= 80 ? '80-100' : c >= 70 ? '70-79' : c >= 60 ? '60-69' : c >= 50 ? '50-59' : '<50')
const vixBucket = (v) => (v == null ? 'unknown' : v < 12 ? 'Low(<12)' : v < 16 ? 'Normal(12-16)' : v < 20 ? 'Elevated(16-20)' : 'High(20+)')
const mqsBucket = (m) => (m == null ? 'unknown' : m >= 80 ? '80+' : m >= 70 ? '70-79' : m >= 60 ? '60-69' : '<60')

export async function getMetrics(filters = {}) {
  await ensureOptionLabSchema()
  const where = []
  const args = []
  if (filters.index) { where.push('s.index_sym = ?'); args.push(filters.index) }
  if (filters.from) { where.push('s.day_key >= ?'); args.push(filters.from) }
  const [rows] = await getPool().query(
    `SELECT s.*, o.status, o.resolved, o.first_hit, o.pnl_premium, o.r_multiple, o.mfe, o.mae, o.minutes_to_outcome
       FROM option_signal s LEFT JOIN option_signal_outcome o ON o.signal_id = s.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
    args,
  )
  const totalSignals = rows.length
  const noTrade = rows.filter((r) => r.verdict === 'NO TRADE')
  const given = rows.filter((r) => Number(r.active) === 1)
  const withEntry = rows.filter((r) => r.entry_premium != null)
  const resolved = rows.filter((r) => Number(r.resolved) === 1)
  const openNow = withEntry.filter((r) => Number(r.resolved) !== 1).length

  // rejection funnel: which gate blocked the NO-TRADE signals
  const funnel = {}
  for (const r of noTrade) {
    const gates = parseJson(r.failing_gates) || []
    const list = Array.isArray(gates) ? gates : []
    if (!list.length) { funnel['(no reason logged)'] = (funnel['(no reason logged)'] || 0) + 1; continue }
    for (const g of list) { const key = String(g).split(':')[0].trim(); funnel[key] = (funnel[key] || 0) + 1 }
  }

  // confidence calibration — does higher stated confidence => better outcome?
  const calibration = groupStats(resolved, (t) => confBucket(num(t.confidence)))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)))

  const bySetup = groupStats(resolved, (t) => `${t.action ?? '?'} ${t.side ?? '?'} ${t.moneyness ?? '?'}`)
  const byConfidence = calibration
  const byMarket = groupStats(resolved, (t) => vixBucket(num(t.vix)))
  const byQuality = groupStats(resolved, (t) => mqsBucket(num(t.mqs)))
  const byTimeBlock = groupStats(resolved, (t) => t.time_block)
  const bySide = groupStats(resolved, (t) => t.action) // BUY vs SELL

  // best / worst conditions (require a small minimum sample to be meaningful)
  const ranked = groupStats(resolved, (t) => `${t.action} ${t.side} ${t.moneyness} · VIX ${vixBucket(num(t.vix))}`, 3)

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      totalSignals,
      givenTrades: given.length,
      wouldBeTrades: withEntry.length - given.length,
      noTrade: noTrade.length,
      resolved: resolved.length,
      openNow,
    },
    overall: statsFor(resolved),
    buy: statsFor(resolved.filter((r) => r.action === 'BUY')),
    sell: statsFor(resolved.filter((r) => r.action === 'SELL')),
    bySetup,
    byConfidence,
    byMarket,
    byQuality,
    byTimeBlock,
    bySide,
    calibration,
    rejectionFunnel: Object.entries(funnel).sort((a, b) => b[1] - a[1]).map(([gate, count]) => ({ gate, count })),
    bestConditions: ranked.slice(0, 5),
    worstConditions: ranked.slice(-5).reverse(),
    note: resolved.length < 30
      ? `Only ${resolved.length} resolved trades — too few for firm conclusions. ~30 for a first read, ~100 to trust win-rate, ~500 to slice reliably.`
      : `${resolved.length} resolved trades.`,
  }
}

export { readLeg }
