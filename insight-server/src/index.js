import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { searchSymbols, listAllSymbols, getSymbol } from './db.js'
import { buildReport } from './report.js'
import {
  ensureSchema, getLatestAnalysis, getHistory, queryUniverse, getFacets,
  getDashboard, getRankContext, getStandout, getFailures, getFailureSymbols,
} from './analysisStore.js'
import { conviction as convictionOf } from './engines.js'
import { analyseSymbol, startBatch, stopBatch, jobStatus } from './batch.js'
import { fetchDaily } from './candles.js'
import { toWeekly } from './featureSnapshot.js'
import { srZones } from './structure.js'

const app = express()
app.use(express.json())
app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }))

app.get('/health', (_req, res) => res.json({ ok: true, service: 'insight-server' }))

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

app.get('/universe/facets', async (_req, res) => {
  try {
    res.json(await getFacets())
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
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
    // chart context (cached candle fetch; cheap)
    let weeklyChart = null
    try {
      const daily = await fetchDaily(symbol, '2022-01-01')
      const weekly = toWeekly(daily)
      weeklyChart = { candles: weekly.slice(-110), keyZones: srZones(weekly.slice(-160), 3) }
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

app.listen(config.port, () => {
  console.log(`insight-server listening on :${config.port}`)
})
