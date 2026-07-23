// ── Fundamentals service (DISPLAY-ONLY — hard isolation guarantee) ───────────
// Source: Yahoo Finance via yahoo-finance2 (unofficial API; cached 24h in DB).
//
// ISOLATION RULE: nothing in this module is imported by engines.js,
// featureSnapshot.js, batch.js or the research suite. Fundamentals never
// affect scores, badges, rankings, conviction or CRI. Informational context
// for investors only. The outlook labels below are heuristic display aids
// derived from the shown metrics — they are NOT evaluated signals.
import { getPool } from './db.js'

const CACHE_TTL_H = 24
let yahoo = null // resolved instance (lazy so the server boots without the dep)
export const yahooDiag = { installedVersion: null, resolvedAs: null, error: null } // health visibility

import fs from 'node:fs'
import path from 'node:path'
function installedVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'node_modules/yahoo-finance2/package.json'), 'utf8')).version
  } catch { return 'unknown' }
}

async function getYahoo() {
  if (yahoo) return yahoo
  yahooDiag.installedVersion = installedVersion()
  const mod = await import('yahoo-finance2')
  let yf = mod.default ?? mod
  if (yf && typeof yf.quoteSummary !== 'function' && yf.default) yf = yf.default
  // DETERMINISTIC RULE — no heuristics on method presence:
  //   constructor export (v3/v4, typeof === 'function') → ALWAYS instantiate;
  //   the class carries a throwing guard-stub, so method-sniffing lies.
  //   object export (v2) → ready instance, use as-is.
  if (typeof yf === 'function') {
    try {
      yf = new yf({ suppressNotices: ['yahooSurvey'] })
      yahooDiag.resolvedAs = `class → new YahooFinance({suppressNotices}) [v${yahooDiag.installedVersion}]`
    } catch {
      yf = new yf() // if THIS throws, we want the raw error surfaced, not swallowed
      yahooDiag.resolvedAs = `class → new YahooFinance() [v${yahooDiag.installedVersion}]`
    }
  } else {
    yahooDiag.resolvedAs = `instance export (v2 style) [v${yahooDiag.installedVersion}]`
    try { yf.suppressNotices?.(['yahooSurvey']) } catch { /* optional */ }
  }
  if (typeof yf?.quoteSummary !== 'function') {
    yahooDiag.error = `resolved shape has no quoteSummary (version ${yahooDiag.installedVersion})`
    throw new Error(`yahoo-finance2 ${yahooDiag.error}`)
  }
  yahoo = yf
  console.log(`fundamentals: yahoo-finance2 resolved — ${yahooDiag.resolvedAs}`)
  return yahoo
}

/** Startup + on-demand self-check: proves the ENTIRE chain (import → resolve →
 *  live Yahoo fetch). GET /fundamentals/health exposes this. */
export async function fundamentalsHealth() {
  const out = { installedVersion: installedVersion(), resolved: false, resolvedAs: null, liveTest: null }
  try {
    const yf = await getYahoo()
    out.resolved = true
    out.resolvedAs = yahooDiag.resolvedAs
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const qs = await yf.quoteSummary('RELIANCE.NS', { modules: ['price'] }, { validateResult: false })
      out.liveTest = { ok: true, name: qs?.price?.longName ?? qs?.price?.shortName ?? 'ok' }
    } catch (e) {
      out.liveTest = { ok: false, error: String(e.message).slice(0, 200) }
    } finally { clearTimeout(t) }
  } catch (e) {
    out.error = String(e.message).slice(0, 200)
  }
  return out
}

export async function ensureFundamentalsSchema() {
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_fundamentals (
      symbol_code VARCHAR(50) NOT NULL,
      yahoo_symbol VARCHAR(50) NULL,
      data JSON NULL,
      error VARCHAR(300) NULL,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (symbol_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  // queryable grade columns (extracted from the display-only outlook, so the
  // universe can FILTER by fundamentals — filtering never alters scores)
  const cols = [
    ['overall_grade', 'VARCHAR(12) NULL'],
    ['fin_strength', 'VARCHAR(12) NULL'],
    ['profitability_grade', 'VARCHAR(12) NULL'],
    ['valuation_grade', 'VARCHAR(16) NULL'],
    ['growth_grade', 'VARCHAR(12) NULL'],
    ['dividend_grade', 'VARCHAR(12) NULL'],
  ]
  const [existing] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_fundamentals'`,
  )
  const have = new Set(existing.map((r) => r.COLUMN_NAME))
  for (const [name, def] of cols) {
    if (!have.has(name)) await pool.query(`ALTER TABLE stock_fundamentals ADD COLUMN ${name} ${def}`)
  }
  await backfillGrades()
}

/** Rows fetched before grade columns existed have data JSON but NULL grades —
 *  extract and populate them so filters see the full coverage. Idempotent. */
async function backfillGrades() {
  const pool = getPool()
  const [rows] = await pool.query(
    'SELECT symbol_code, data FROM stock_fundamentals WHERE data IS NOT NULL AND overall_grade IS NULL LIMIT 1000',
  )
  let fixed = 0
  for (const r of rows) {
    try {
      const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data
      const g = extractGrades(data?.outlook)
      if (!g.overall_grade && !g.fin_strength && !g.valuation_grade) continue // genuinely all-N/A
      await pool.query(
        `UPDATE stock_fundamentals SET overall_grade=?, fin_strength=?, profitability_grade=?,
                valuation_grade=?, growth_grade=?, dividend_grade=? WHERE symbol_code=?`,
        [g.overall_grade, g.fin_strength, g.profitability_grade, g.valuation_grade, g.growth_grade, g.dividend_grade, r.symbol_code],
      )
      fixed++
    } catch { /* skip malformed row */ }
  }
  if (fixed) console.log(`fundamentals: backfilled grades for ${fixed} existing rows`)
}

/** Extract filterable grade columns from the outlook array. Pure. */
export function extractGrades(outlook) {
  const g = (label) => outlook?.find((o) => o.label === label)?.level ?? null
  const clean = (v) => (v === 'N/A' ? null : v)
  return {
    overall_grade: clean(g('Overall Fundamental Outlook')),
    fin_strength: clean(g('Financial Strength')),
    profitability_grade: clean(g('Profitability')),
    valuation_grade: clean(g('Valuation')),
    growth_grade: clean(g('Growth')),
    dividend_grade: clean(g('Dividend')),
  }
}

/** NSE code like "SBIN-EQ" → Yahoo "SBIN.NS" (fallback ".BO" tried on failure). */
export function toYahooSymbols(symbolCode) {
  const base = String(symbolCode).replace(/-(EQ|BE|BZ|SM|ST|XT|RE|N\d)$/i, '').trim()
  return [`${base}.NS`, `${base}.BO`]
}

// ── formatting helpers (server formats display strings; UI stays dumb) ──────
const NA = 'N/A'
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const fmtX = (v, d = 2) => (isNum(v) ? `${v.toFixed(d)}×` : NA)
const fmtNum = (v, d = 2) => (isNum(v) ? v.toLocaleString('en-IN', { maximumFractionDigits: d }) : NA)
const fmtPct = (v, d = 1) => (isNum(v) ? `${(v * 100).toFixed(d)}%` : NA) // 0.234 → 23.4%
const fmtPctRaw = (v, d = 1) => (isNum(v) ? `${v.toFixed(d)}%` : NA) // already in %
const fmtCr = (v) => (isNum(v) ? `₹${(v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 0 })} cr` : NA)
const fmtShares = (v) => (isNum(v) ? `${(v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} cr` : NA)
const fmtDate = (v) => {
  if (!v) return NA
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? NA : d.toISOString().slice(0, 10)
}

/** Map a quoteSummary result into display sections. Pure — unit-testable. */
export function mapFundamentals(qs, yahooSymbol) {
  const ap = qs?.assetProfile ?? {}
  const sd = qs?.summaryDetail ?? {}
  const ks = qs?.defaultKeyStatistics ?? {}
  const fd = qs?.financialData ?? {}
  const pr = qs?.price ?? {}
  const cal = qs?.calendarEvents ?? {}

  const metrics = {
    // raw numbers kept for the outlook derivation (display-only heuristics)
    trailingPE: sd.trailingPE ?? null,
    pegRatio: ks.pegRatio ?? null,
    priceToBook: ks.priceToBook ?? null,
    roe: fd.returnOnEquity ?? null,
    netMargin: fd.profitMargins ?? null,
    debtToEquity: fd.debtToEquity ?? null, // percent (e.g. 41.2)
    currentRatio: fd.currentRatio ?? null,
    revenueGrowth: fd.revenueGrowth ?? null,
    earningsGrowth: fd.earningsGrowth ?? null,
    dividendYield: sd.dividendYield ?? null,
  }

  const sections = [
    {
      title: 'Company Snapshot',
      rows: [
        { label: 'Company', value: pr.longName ?? pr.shortName ?? NA },
        { label: 'Sector', value: ap.sector ?? NA },
        { label: 'Industry', value: ap.industry ?? NA },
        { label: 'Country', value: ap.country ?? NA },
        { label: 'Exchange', value: pr.exchangeName ?? NA },
        { label: 'Market Cap', value: fmtCr(pr.marketCap ?? sd.marketCap) },
        { label: 'Enterprise Value', value: fmtCr(ks.enterpriseValue) },
        { label: 'Employees', value: fmtNum(ap.fullTimeEmployees, 0) },
      ],
    },
    {
      title: 'Valuation',
      rows: [
        { label: 'P/E (trailing)', value: fmtX(sd.trailingPE) },
        { label: 'Forward P/E', value: fmtX(sd.forwardPE ?? ks.forwardPE) },
        { label: 'PEG Ratio', value: fmtX(ks.pegRatio) },
        { label: 'Price / Book', value: fmtX(ks.priceToBook) },
        { label: 'Price / Sales', value: fmtX(sd.priceToSalesTrailing12Months) },
        { label: 'EV / EBITDA', value: fmtX(ks.enterpriseToEbitda) },
      ],
    },
    {
      title: 'Profitability',
      rows: [
        { label: 'EPS (trailing)', value: fmtNum(ks.trailingEps) },
        { label: 'ROE', value: fmtPct(fd.returnOnEquity) },
        { label: 'ROA', value: fmtPct(fd.returnOnAssets) },
        { label: 'ROIC', value: NA }, // not provided by Yahoo quoteSummary
        { label: 'Gross Margin', value: fmtPct(fd.grossMargins) },
        { label: 'Operating Margin', value: fmtPct(fd.operatingMargins) },
        { label: 'Net Margin', value: fmtPct(fd.profitMargins) },
      ],
    },
    {
      title: 'Financial Health',
      rows: [
        { label: 'Debt / Equity', value: isNum(fd.debtToEquity) ? fmtX(fd.debtToEquity / 100) : NA },
        { label: 'Current Ratio', value: fmtX(fd.currentRatio) },
        { label: 'Quick Ratio', value: fmtX(fd.quickRatio) },
        { label: 'Interest Coverage', value: NA }, // not provided by Yahoo quoteSummary
        { label: 'Cash per Share', value: fmtNum(fd.totalCashPerShare) },
        { label: 'Total Cash', value: fmtCr(fd.totalCash) },
        { label: 'Total Debt', value: fmtCr(fd.totalDebt) },
      ],
    },
    {
      title: 'Growth',
      rows: [
        { label: 'Revenue Growth (yoy)', value: fmtPct(fd.revenueGrowth) },
        { label: 'Earnings Growth (yoy)', value: fmtPct(fd.earningsGrowth) },
        { label: 'FCF Growth', value: NA }, // needs statement history; future extension
        { label: 'Free Cash Flow', value: fmtCr(fd.freeCashflow) },
        { label: 'Operating Cash Flow', value: fmtCr(fd.operatingCashflow) },
      ],
    },
    {
      title: 'Dividends',
      rows: [
        { label: 'Dividend Yield', value: fmtPct(sd.dividendYield) },
        { label: 'Dividend Rate (₹/sh)', value: fmtNum(sd.dividendRate) },
        { label: 'Payout Ratio', value: fmtPct(sd.payoutRatio) },
        { label: 'Ex-Dividend Date', value: fmtDate(cal.exDividendDate ?? sd.exDividendDate) },
      ],
    },
    {
      title: 'Ownership',
      rows: [
        { label: 'Shares Outstanding', value: fmtShares(ks.sharesOutstanding) },
        { label: 'Float', value: fmtShares(ks.floatShares) },
        { label: 'Insider Ownership', value: fmtPct(ks.heldPercentInsiders) },
        { label: 'Institutional Ownership', value: fmtPct(ks.heldPercentInstitutions) },
      ],
    },
    {
      title: 'Risk & Performance',
      rows: [
        { label: '52-Week High', value: fmtNum(sd.fiftyTwoWeekHigh) },
        { label: '52-Week Low', value: fmtNum(sd.fiftyTwoWeekLow) },
        { label: 'Beta', value: fmtNum(sd.beta ?? ks.beta) },
        { label: 'Average Volume (3m)', value: fmtNum(sd.averageVolume, 0) },
        { label: 'Book Value (₹/sh)', value: fmtNum(ks.bookValue) },
      ],
    },
  ]

  return {
    yahooSymbol,
    currency: pr.currency ?? sd.currency ?? null,
    name: pr.longName ?? pr.shortName ?? null,
    sections,
    outlook: deriveOutlook(metrics),
  }
}

/**
 * Display-only heuristic labels derived from the shown metrics.
 * NOT signals. NOT used anywhere in scoring, ranking or CRI.
 */
export function deriveOutlook(m) {
  const grade = (label, level, tone) => ({ label, level, tone })
  const out = []

  // Financial Strength: D/E (Yahoo gives percent) + current ratio
  if (isNum(m.debtToEquity) || isNum(m.currentRatio)) {
    const de = isNum(m.debtToEquity) ? m.debtToEquity / 100 : null
    const strong = (de == null || de < 0.5) && (m.currentRatio == null || m.currentRatio >= 1.5)
    const weak = (de != null && de > 2) || (m.currentRatio != null && m.currentRatio < 1)
    out.push(grade('Financial Strength', strong ? 'Strong' : weak ? 'Weak' : 'Moderate', strong ? 'good' : weak ? 'bad' : 'mid'))
  } else out.push(grade('Financial Strength', NA, 'na'))

  // Profitability: ROE + net margin
  if (isNum(m.roe) || isNum(m.netMargin)) {
    const excellent = (m.roe ?? 0) >= 0.18 && (m.netMargin ?? 0) >= 0.10
    const poor = (isNum(m.roe) && m.roe < 0.08) || (isNum(m.netMargin) && m.netMargin < 0.03)
    out.push(grade('Profitability', excellent ? 'Excellent' : poor ? 'Poor' : 'Good', excellent ? 'good' : poor ? 'bad' : 'mid'))
  } else out.push(grade('Profitability', NA, 'na'))

  // Valuation: crude P/E + PEG banding (display aid only)
  if (isNum(m.trailingPE)) {
    const cheap = m.trailingPE < 15 || (isNum(m.pegRatio) && m.pegRatio > 0 && m.pegRatio < 1)
    const rich = m.trailingPE > 40 || (isNum(m.pegRatio) && m.pegRatio > 2.5)
    out.push(grade('Valuation', cheap ? 'Undervalued' : rich ? 'Overvalued' : 'Fairly Valued', cheap ? 'good' : rich ? 'bad' : 'mid'))
  } else out.push(grade('Valuation', NA, 'na')) // missing or loss-making → N/A, never guessed

  // Growth
  if (isNum(m.revenueGrowth) || isNum(m.earningsGrowth)) {
    const g = Math.max(m.revenueGrowth ?? -1, m.earningsGrowth ?? -1)
    out.push(grade('Growth', g >= 0.2 ? 'High' : g >= 0.08 ? 'Medium' : 'Low', g >= 0.2 ? 'good' : g >= 0.08 ? 'mid' : 'bad'))
  } else out.push(grade('Growth', NA, 'na'))

  // Dividend
  if (isNum(m.dividendYield) && m.dividendYield > 0) {
    out.push(grade('Dividend', m.dividendYield >= 0.02 ? 'Attractive' : 'Average', m.dividendYield >= 0.02 ? 'good' : 'mid'))
  } else out.push(grade('Dividend', 'None', 'na'))

  // Overall: majority of good vs bad tones among defined grades
  const defined = out.filter((o) => o.tone !== 'na')
  const good = defined.filter((o) => o.tone === 'good').length
  const bad = defined.filter((o) => o.tone === 'bad').length
  const overall = defined.length === 0 ? NA : good >= bad + 2 ? 'Positive' : bad >= good + 2 ? 'Weak' : 'Mixed'
  out.push(grade('Overall Fundamental Outlook', overall, overall === 'Positive' ? 'good' : overall === 'Weak' ? 'bad' : overall === NA ? 'na' : 'mid'))
  return out
}

const MODULES = ['assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'calendarEvents', 'price']
const ERROR_CACHE_TTL_MIN = 10 // failures are retried soon; successes cache 24h

// Yahoo is strict about request rates: serialize all calls with a polite gap.
let queueTail = Promise.resolve()
const GAP_MS = 1500
function enqueue(job) {
  const run = queueTail.then(async () => {
    const result = await job()
    await new Promise((r) => setTimeout(r, GAP_MS))
    return result
  })
  queueTail = run.catch(() => {})
  return run
}

const isRateLimit = (e) => /too many requests|429/i.test(e?.message ?? '')

export async function getFundamentals(symbolCode, { refresh = false } = {}) {
  const pool = getPool()
  if (!refresh) {
    const [[cached]] = await pool.query(
      `SELECT data, error, yahoo_symbol, fetched_at FROM stock_fundamentals
        WHERE symbol_code = ?
          AND fetched_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
          AND (data IS NOT NULL OR fetched_at > DATE_SUB(NOW(), INTERVAL ? MINUTE))`,
      [symbolCode, CACHE_TTL_H, ERROR_CACHE_TTL_MIN],
    )
    if (cached) {
      const data = typeof cached.data === 'string' ? JSON.parse(cached.data) : cached.data
      return { available: !!data, ...(data ?? {}), error: cached.error ?? undefined, fetchedAt: cached.fetched_at, cached: true }
    }
  }

  const yf = await getYahoo()
  let lastErr = null
  for (const ySym of toYahooSymbols(symbolCode)) {
    try {
      let qs
      try {
        qs = await enqueue(() => yf.quoteSummary(ySym, { modules: MODULES }, { validateResult: false }))
      } catch (e1) {
        if (!isRateLimit(e1)) throw e1
        // one polite retry after a pause, then give up cleanly
        await new Promise((r) => setTimeout(r, 8000))
        qs = await enqueue(() => yf.quoteSummary(ySym, { modules: MODULES }, { validateResult: false }))
      }
      const data = mapFundamentals(qs, ySym)
      const gr = extractGrades(data.outlook)
      await pool.query(
        `INSERT INTO stock_fundamentals
           (symbol_code, yahoo_symbol, data, error, overall_grade, fin_strength, profitability_grade, valuation_grade, growth_grade, dividend_grade, fetched_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE yahoo_symbol = VALUES(yahoo_symbol), data = VALUES(data), error = NULL,
           overall_grade = VALUES(overall_grade), fin_strength = VALUES(fin_strength),
           profitability_grade = VALUES(profitability_grade), valuation_grade = VALUES(valuation_grade),
           growth_grade = VALUES(growth_grade), dividend_grade = VALUES(dividend_grade), fetched_at = NOW()`,
        [symbolCode, ySym, JSON.stringify(data), gr.overall_grade, gr.fin_strength, gr.profitability_grade, gr.valuation_grade, gr.growth_grade, gr.dividend_grade],
      ).catch(() => {})
      return { available: true, ...data, fetchedAt: new Date().toISOString(), cached: false }
    } catch (e) {
      lastErr = e
      if (isRateLimit(e)) break // don't hammer the .BO fallback while throttled
    }
  }
  const msg = isRateLimit(lastErr)
    ? `Yahoo is rate-limiting requests right now — this usually clears within a few minutes. It will retry automatically (error cached only ${ERROR_CACHE_TTL_MIN} min).`
    : `Fundamentals unavailable for ${symbolCode} (${lastErr?.message ?? 'unknown error'})`
  await pool.query(
    `INSERT INTO stock_fundamentals (symbol_code, yahoo_symbol, data, error, fetched_at)
     VALUES (?, NULL, NULL, ?, NOW())
     ON DUPLICATE KEY UPDATE data = NULL, error = VALUES(error), fetched_at = NOW()`,
    [symbolCode, msg.slice(0, 290)],
  ).catch(() => {})
  return { available: false, error: msg }
}

// ── Candidate prefetch (coverage for universe filtering) ─────────────────────
// Fetches fundamentals for stocks the engines flagged as investigable
// (any engine score ≥ 40) whose fundamentals are missing or stale (>3 days).
// Runs through the same serialized queue → Yahoo-polite by construction.

export const prefetchState = { running: false, total: 0, done: 0, ok: 0, failed: 0, startedAt: null, finishedAt: null }

export async function prefetchFundamentals(maxSymbols = 600) {
  if (prefetchState.running) return prefetchState
  const pool = getPool()
  const [rows] = await pool.query(`
    SELECT a.symbol_code
      FROM stock_analysis_reports a
      LEFT JOIN stock_fundamentals f ON f.symbol_code = a.symbol_code
     WHERE a.is_latest = 1
       AND GREATEST(COALESCE(a.discovery_score,0), COALESCE(a.transition_score,0), COALESCE(a.momentum_score,0)) >= 40
       AND (f.symbol_code IS NULL OR f.data IS NULL OR f.fetched_at < DATE_SUB(NOW(), INTERVAL 3 DAY))
     ORDER BY a.discovery_score DESC
     LIMIT ?`, [maxSymbols])
  Object.assign(prefetchState, { running: true, total: rows.length, done: 0, ok: 0, failed: 0, startedAt: new Date().toISOString(), finishedAt: null })
  ;(async () => {
    for (const r of rows) {
      try {
        const res = await getFundamentals(r.symbol_code) // queued + cached internally
        res.available ? prefetchState.ok++ : prefetchState.failed++
      } catch { prefetchState.failed++ }
      prefetchState.done++
    }
    prefetchState.running = false
    prefetchState.finishedAt = new Date().toISOString()
    console.log(`fundamentals prefetch done: ${prefetchState.ok} ok, ${prefetchState.failed} failed of ${prefetchState.total}`)
  })()
  return prefetchState
}
