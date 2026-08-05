import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { searchSymbols, listAllSymbols, getSymbol } from './db.js'
import { buildReport } from './report.js'
import {
  ensureSchema, getLatestAnalysis, getHistory, queryUniverse, getFacets,
  getDashboard, getRankContext, getStandout, getFailures, getFailureSymbols, pruneOldSnapshots,
  queryTransitions, getTransitionFacets, backfillTransitions,
} from './analysisStore.js'
import { conviction as convictionOf } from './engines.js'
import { analyseSymbol, startBatch, stopBatch, jobStatus } from './batch.js'
import { fetchDaily } from './candles.js'
import { toWeekly, toMonthly } from './featureSnapshot.js'
import {
  ensureCriSchema, captureOutcomes, captureState as criCaptureState,
  weeklySummary, monthlyRegime, quarterlyChallenger, listRecommendations,
} from './cri.js'
const criState = () => ({ ...criCaptureState })
import { ensureFundamentalsSchema, getFundamentals, fundamentalsHealth, prefetchFundamentals, prefetchState } from './fundamentals.js'
import { ensurePaperSchema, capturePaperCohort, computeScorecard, getCohortHoldings, computeTransitionScorecard, computeTransitionOutcomes, transComputeState } from './paper.js'
import { srZones } from './structure.js'

const app = express()
app.use(express.json())
app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }))

// Feature manifest: /health always tells you WHICH code is live, killing the
// "edited but server not restarted" failure mode for good.
const STARTED_AT = new Date().toISOString()
const FEATURES = [
  'engine-v2.1', 'cri', 'nightly-batch', 'fundamentals-display',
  'fundamentals-filter', 'fundamentals-prefetch', 'gems-x-fundamentals',
]
app.get('/health', (_req, res) => res.json({ ok: true, service: 'insight-server', startedAt: STARTED_AT, features: FEATURES }))

// ── Symbols (kept from v1) ───────────────────────────────────────────────────
app.get('/symbols', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json({ symbols: [] })
  try {
    res.json({ symbols: await searchSymbols(q) })
  } catch (e) {
    console.error('symbol search failed:', e.code || '', e.message)
    res.status(502).json({ error: `Symbol search unavailable (DB: ${e.code || e.message})` })
  }
})

let allSymbolsCache = null
app.get('/symbols/all', async (_req, res) => {
  if (allSymbolsCache && Date.now() - allSymbolsCache.at < 10 * 60 * 1000) return res.json({ symbols: allSymbolsCache.data })
  try {
    const symbols = await listAllSymbols()
    allSymbolsCache = { at: Date.now(), data: symbols }
    res.json({ symbols })
  } catch (e) {
    res.status(502).json({ error: `Symbol list unavailable (DB: ${e.code || e.message})` })
  }
})

// ── Universe (paginated, filtered, sorted; latest stored analysis joined) ────
app.get('/universe', async (req, res) => {
  try {
    res.json(await queryUniverse(req.query))
  } catch (e) {
    console.error('universe query failed:', e.message)
    res.status(502).json({ error: `Universe unavailable (DB: ${e.code || e.message})` })
  }
})

// Transition log — browse badge changes (X→Y) by date/params. Small table.
app.get('/transitions', async (req, res) => {
  try { res.json(await queryTransitions(req.query)) } catch (e) { res.status(502).json({ error: `Transitions unavailable (${e.code || e.message})` }) }
})
app.get('/transitions/facets', async (_req, res) => {
  try { res.json(await getTransitionFacets()) } catch (e) { res.status(502).json({ error: e.message }) }
})
// One-time back-fill from recent history (bounded, safe). Populates the log
// with badge changes that already happened before logging was deployed.
app.post('/transitions/backfill', async (req, res) => {
  try { res.json(await backfillTransitions(Number(req.query.days) || 21)) } catch (e) { res.status(502).json({ error: e.message }) }
})
// Transition attribution for Strategy Lab (reads precomputed outcomes — fast)
app.get('/paper/transition-scorecard', async (_req, res) => {
  try { res.json(await computeTransitionScorecard()) } catch (e) { res.status(502).json({ error: e.message }) }
})
// Background: precompute forward outcomes for matured transitions
app.post('/paper/transition-compute', async (_req, res) => {
  try { res.json(await computeTransitionOutcomes()) } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get('/paper/transition-compute/status', (_req, res) => res.json({ ...transComputeState }))

app.get('/universe/facets', async (_req, res) => {
  try {
    res.json(await getFacets())
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// Maintenance: prune old snapshots (keeps latest + recent history)
app.post('/admin/prune', async (req, res) => {
  try { res.json({ pruned: await pruneOldSnapshots(Number(req.query.keepDays) || 90) }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/dashboard', async (_req, res) => {
  try {
    res.json(await getDashboard(6))
  } catch (e) {
    console.error('dashboard failed:', e.message)
    res.status(502).json({ error: `Dashboard unavailable (DB: ${e.code || e.message})` })
  }
})

// ── Per-stock intelligence ───────────────────────────────────────────────────
// GET /stock/:symbol/insight        → latest stored analysis (+chart, +history)
// GET /stock/:symbol/insight?refresh=1 → recompute now, store, return
app.get('/stock/:symbol/insight', async (req, res) => {
  const symbol = String(req.params.symbol || '').trim()
  if (!symbol) return res.status(400).json({ error: 'symbol required' })
  try {
    const master = await getSymbol(symbol).catch(() => null)
    let stored = req.query.refresh === '1' ? null : await getLatestAnalysis(symbol).catch(() => null)
    let analysis = null
    if (!stored) {
      analysis = await analyseSymbol(master ?? { symbol_code: symbol })
      stored = await getLatestAnalysis(symbol).catch(() => null)
    }
    // chart context (cached candle fetch; daily/weekly/monthly from one series)
    let weeklyChart = null
    let charts = null
    try {
      const daily = await fetchDaily(symbol, '2022-01-01')
      const weekly = toWeekly(daily)
      const monthly = toMonthly(daily)
      charts = {
        daily: { candles: daily.slice(-130), keyZones: srZones(daily.slice(-260), 3) },
        weekly: { candles: weekly.slice(-110), keyZones: srZones(weekly.slice(-160), 3) },
        monthly: { candles: monthly.slice(-60), keyZones: srZones(monthly, 3) },
      }
      weeklyChart = charts.weekly // backward compatibility
    } catch { /* chart optional */ }
    const history = await getHistory(symbol, 30).catch(() => [])
    const rankContext = await getRankContext(symbol).catch(() => null)
    const finalAnalysis = analysis ?? unpackStored(stored)
    // live conviction from current market percentile of the strongest engine
    let conviction = null
    if (finalAnalysis) {
      const fam = finalAnalysis.family ?? 'discovery'
      const pct = rankContext?.[fam]?.market?.topPct != null ? 100 - rankContext[fam].market.topPct : null
      conviction = convictionOf(finalAnalysis.scores, pct, finalAnalysis.scores.risk)
    }
    const standout = await getStandout(symbol, rankContext, history).catch(() => [])
    res.json({
      meta: master ?? { symbol_code: symbol, symbol_name: symbol },
      analysis: finalAnalysis,
      storedAt: stored?.created_at ?? null,
      history,
      weeklyChart,
      charts,
      rankContext,
      conviction,
      standout,
    })
  } catch (e) {
    console.error(`insight failed for ${symbol}:`, e.message)
    res.status(e.status || 500).json({ error: e.message })
  }
})

function unpackStored(row) {
  if (!row) return null
  const packed = typeof row.feature_evidence === 'string' ? JSON.parse(row.feature_evidence) : row.feature_evidence
  const riskFactors = typeof row.risk_factors === 'string' ? JSON.parse(row.risk_factors) : row.risk_factors
  return {
    engineVersion: row.engine_version,
    features: packed?.features ?? null,
    scores: {
      discovery: row.discovery_score,
      transition: row.transition_score,
      momentum: row.momentum_score,
      risk: row.risk_score,
    },
    riskLevel: row.risk_level,
    badge: row.badge,
    tags: packed?.tags ?? [],
    family: packed?.family ?? 'discovery',
    phase: row.current_phase,
    earliness: packed?.earliness ?? null,
    evidence: packed?.evidence ?? null,
    riskFactors: riskFactors ?? [],
    summary: row.summary,
    honesty:
      'Historically ~32% of top-decile Discovery candidates advanced +50% within ~6 months (median detection lead ~7 months). Most candidates will NOT make a major move. This is research ranking, not a prediction or trading advice.',
  }
}

// One-URL end-to-end diagnostic: installed version, resolution path, live fetch.
app.get('/fundamentals/health', async (_req, res) => {
  res.json(await fundamentalsHealth())
})

// Prefetch fundamentals for engine candidates (score ≥40) so universe
// filtering has coverage. Throttled internally; also chained after nightly.
app.post('/fundamentals/prefetch', async (_req, res) => {
  try {
    res.json(await prefetchFundamentals())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
app.get('/fundamentals/prefetch/status', (_req, res) => res.json({ ...prefetchState }))

// Fundamentals — DISPLAY-ONLY (never touches engines/scores/rankings/CRI).
// Cached 24h; ?refresh=1 forces a re-fetch.
app.get('/stock/:symbol/fundamentals', async (req, res) => {
  try {
    res.json(await getFundamentals(String(req.params.symbol).trim(), { refresh: req.query.refresh === '1' }))
  } catch (e) {
    res.json({ available: false, error: `Fundamentals service error: ${e.message}` })
  }
})

app.get('/stock/:symbol/history', async (req, res) => {
  try {
    res.json({ history: await getHistory(String(req.params.symbol), Number(req.query.limit) || 30) })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// ── Analysis jobs ────────────────────────────────────────────────────────────
app.post('/analyze', async (req, res) => {
  const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols.filter(Boolean) : []
  if (!symbols.length) return res.status(400).json({ error: 'symbols[] required' })
  try {
    const started = await startBatch(symbols, `selection (${symbols.length})`)
    if (!started) return res.status(409).json({ error: 'A batch job is already running', status: jobStatus() })
    res.json({ ok: true, status: jobStatus() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/analyze/all', async (_req, res) => {
  try {
    const started = await startBatch(null, 'entire universe')
    if (!started) return res.status(409).json({ error: 'A batch job is already running', status: jobStatus() })
    res.json({ ok: true, status: jobStatus() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/analyze/stop', (_req, res) => res.json({ stopped: stopBatch(), status: jobStatus() }))
app.get('/analyze/status', (_req, res) => res.json(jobStatus()))

// Failures of the latest (or given) batch run, grouped by reason with symbol names
app.get('/analyze/failures', async (req, res) => {
  try {
    res.json(await getFailures(req.query.run ? String(req.query.run) : null))
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// Re-run analysis ONLY for the failed stocks of the latest run (fresh fetches;
// empty candle responses are no longer cached)
app.post('/analyze/retry-failed', async (_req, res) => {
  try {
    const symbols = await getFailureSymbols(null)
    if (!symbols.length) return res.status(404).json({ error: 'No recorded failures to retry' })
    const started = await startBatch(symbols, `retry failed (${symbols.length})`)
    if (!started) return res.status(409).json({ error: 'A batch job is already running', status: jobStatus() })
    res.json({ ok: true, retrying: symbols.length, status: jobStatus() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Strategy Lab: paper-portfolio category attribution (admin analysis) ──────
app.post('/paper/capture', async (req, res) => {
  try { res.json(await capturePaperCohort(req.query.force === '1')) } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get('/paper/cohort/:key/holdings', async (req, res) => {
  try { res.json(await getCohortHoldings(String(req.params.key))) } catch (e) { res.status(502).json({ error: e.message }) }
})
const scorecardCacheByScope = new Map() // scope -> { at, data }
app.get('/paper/scorecard', async (req, res) => {
  const scope = req.query.cohort ? String(req.query.cohort) : 'ALL'
  try {
    const hit = scorecardCacheByScope.get(scope)
    if (hit && Date.now() - hit.at < 15 * 60 * 1000) return res.json(hit.data)
    const data = await computeScorecard(scope === 'ALL' ? null : scope)
    scorecardCacheByScope.set(scope, { at: Date.now(), data })
    res.json(data)
  } catch (e) { res.status(502).json({ error: e.message }) }
})

// ── Continuous Research Intelligence (research recommendations ONLY) ─────────
// Governance: these endpoints never modify scores, weights or badges.
app.post('/cri/capture', async (_req, res) => {
  try {
    if (criState().running) return res.status(409).json({ error: 'capture already running', state: criState() })
    void captureOutcomes() // async; poll GET /cri/state
    res.json({ ok: true, started: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
app.get('/cri/state', (_req, res) => res.json(criState()))
app.get('/cri/summary/weekly', async (_req, res) => {
  try { res.json(await weeklySummary()) } catch (e) { res.status(502).json({ error: e.message }) }
})
app.get('/cri/summary/monthly', async (_req, res) => {
  try { res.json(await monthlyRegime()) } catch (e) { res.status(502).json({ error: e.message }) }
})
app.get('/cri/summary/quarterly', async (_req, res) => {
  try { res.json(await quarterlyChallenger()) } catch (e) { res.status(502).json({ error: e.message }) }
})
app.get('/cri/recommendations', async (req, res) => {
  try { res.json({ recommendations: await listRecommendations(Number(req.query.limit) || 50) }) } catch (e) { res.status(502).json({ error: e.message }) }
})

// ── Legacy v1 deep-dive report (kept for compatibility; not used by new UI) ──
const reportCache = new Map()
app.get('/report', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim()
  if (!symbol) return res.status(400).json({ error: 'symbol query param required' })
  const hit = reportCache.get(symbol)
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return res.json(hit.data)
  try {
    const report = await buildReport(symbol)
    reportCache.set(symbol, { at: Date.now(), data: report })
    res.json(report)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
})

// ── Startup ──────────────────────────────────────────────────────────────────
ensureSchema()
  .then(() => console.log('analysis schema ready'))
  .catch((e) => console.error('⚠ schema init failed (DB down?):', e.message))

// Nightly full-universe analysis (self-sustaining snapshots for CRI + dashboard
// movement lists). Configure with NIGHTLY_TIME (HH:MM server-local, default
// 21:00) or disable with NIGHTLY_BATCH=0. Skips if a batch is already running.
function scheduleNightly() {
  if (!config.nightly.enabled) {
    console.log('nightly batch disabled (NIGHTLY_BATCH=0)')
    return
  }
  const [hh, mm] = config.nightly.time.split(':').map(Number)
  const next = new Date()
  next.setHours(hh, mm || 0, 0, 0)
  if (next <= new Date()) next.setDate(next.getDate() + 1)
  const waitMs = next.getTime() - Date.now()
  console.log(`nightly batch scheduled for ${next.toLocaleString()} (every 24h)`)
  setTimeout(async () => {
    try {
      const started = await startBatch(null, 'nightly')
      console.log(started ? 'nightly batch started' : 'nightly batch skipped — a batch is already running')
      // capture forward outcomes ~2h later (after the batch has finished),
      // then prefetch fundamentals for the fresh candidate set
      setTimeout(() => captureOutcomes().catch((e) => console.error('post-nightly CRI capture:', e.message)), 2 * 60 * 60 * 1000)
      setTimeout(() => prefetchFundamentals().catch((e) => console.error('post-nightly fundamentals prefetch:', e.message)), 2.5 * 60 * 60 * 1000)
      setTimeout(() => pruneOldSnapshots(90).catch((e) => console.error('post-nightly prune:', e.message)), 3 * 60 * 60 * 1000)
      setTimeout(() => computeTransitionOutcomes().catch((e) => console.error('post-nightly transition outcomes:', e.message)), 3.5 * 60 * 60 * 1000)
    } catch (e) {
      console.error('nightly batch failed to start:', e.message)
    }
    scheduleNightly() // schedule the next night
  }, waitMs)
}
scheduleNightly()

ensureFundamentalsSchema()
  .then(() => console.log('fundamentals schema ready'))
  .catch((e) => console.error('⚠ fundamentals schema init failed:', e.message))

// Strategy Lab: seed this week's cohort now (Wednesday start), then capture a
// fresh cohort every Monday 09:30 IST when the market has settled.
ensurePaperSchema()
  .then(() => {
    console.log('paper-portfolio schema ready')
    setTimeout(() => capturePaperCohort(false).then((r) => console.log('paper cohort:', JSON.stringify(r))).catch((e) => console.error('paper capture:', e.message)), 90 * 1000)
    schedulePaperCapture()
  })
  .catch((e) => console.error('⚠ paper schema init failed:', e.message))

function schedulePaperCapture() {
  // Precise timer to the next Monday 09:30 IST (reliable across restarts, unlike
  // polling). ISO-week keying prevents duplicate cohorts if it double-fires.
  const nowIst = new Date(Date.now() + 5.5 * 3600e3)
  const target = new Date(nowIst)
  const daysToMon = (8 - nowIst.getUTCDay()) % 7 || 7 // next Monday (never today→0)
  target.setUTCDate(nowIst.getUTCDate() + daysToMon)
  target.setUTCHours(9, 30, 0, 0)
  const waitMs = target.getTime() - nowIst.getTime()
  console.log(`weekly paper cohort scheduled for ${target.toUTCString().replace('GMT', 'IST')} (${Math.round(waitMs / 3600000)}h away)`)
  setTimeout(() => {
    capturePaperCohort(false).then((r) => console.log('weekly paper cohort:', JSON.stringify(r))).catch((e) => console.error('weekly paper capture:', e.message))
    schedulePaperCapture() // re-arm for the following Monday
  }, waitMs)
}

// Startup self-check: the console ALWAYS states whether fundamentals work,
// which lib version is live, and the exact failure if not. No more guessing.
setTimeout(() => {
  fundamentalsHealth()
    .then((h) => {
      if (h.resolved && h.liveTest?.ok) console.log(`✓ fundamentals READY — v${h.installedVersion}, live test OK (${h.liveTest.name})`)
      else console.error(`⚠ fundamentals NOT working — version ${h.installedVersion}, resolved: ${h.resolved} (${h.resolvedAs ?? '—'}), live: ${JSON.stringify(h.liveTest)}, error: ${h.error ?? '—'}`)
    })
    .catch((e) => console.error('⚠ fundamentals self-check crashed:', e.message))
}, 3000)

// CRI daily capture: instrumentation only (protocol §2.2 — starts immediately).
ensureCriSchema()
  .then(() => {
    console.log('CRI schema ready')
    setTimeout(() => captureOutcomes().catch((e) => console.error('CRI capture:', e.message)), 60 * 1000)
    setInterval(() => captureOutcomes().catch((e) => console.error('CRI capture:', e.message)), 24 * 60 * 60 * 1000)
  })
  .catch((e) => console.error('⚠ CRI schema init failed:', e.message))

app.listen(config.port, () => {
  console.log(`insight-server listening on :${config.port}`)
})
