// ── Batch analysis runner (in-process job, non-blocking, progress-reporting) ─
import { getPool } from './db.js'
import { fetchDaily } from './candles.js'
import { featureSnapshot } from './featureSnapshot.js'
import { analyse } from './engines.js'
import { saveAnalysis, saveFailure } from './analysisStore.js'
import { config } from './config.js'

const CONCURRENCY = 3
const GAP_MS = 250
const DATA_FROM = '2022-01-01' // ~900 daily bars: enough for 200SMA + 250 window + prior-advance

const job = {
  running: false,
  label: null,
  runId: null,
  total: 0,
  completed: 0,
  failed: 0,
  current: null,
  startedAt: null,
  finishedAt: null,
  errors: [], // last few
}

export const jobStatus = () => ({ ...job, errors: job.errors.slice(-5), remaining: Math.max(0, job.total - job.completed - job.failed) })

let niftyCache = { at: 0, data: null }
async function getNifty() {
  if (niftyCache.data && Date.now() - niftyCache.at < 30 * 60 * 1000) return niftyCache.data
  const data = await fetchDaily(config.benchmarkSymbol, DATA_FROM)
  niftyCache = { at: Date.now(), data }
  return data
}

/** Analyse one stock end-to-end and persist. Returns the analysis. */
export async function analyseSymbol(stockRow) {
  const nifty = await getNifty().catch(() => null)
  const daily = await fetchDaily(stockRow.symbol_code, DATA_FROM)
  const f = featureSnapshot(daily, nifty)
  if (!f) throw Object.assign(new Error(`insufficient candle history for ${stockRow.symbol_code} (${daily.length} bars, need 30)`), { status: 422 })
  const analysis = analyse(f)
  await saveAnalysis(stockRow, analysis).catch((e) => {
    // storage failure should not hide the analysis from the caller
    console.error('saveAnalysis failed:', e.message)
  })
  return analysis
}

async function getStockRows(symbols = null) {
  const pool = getPool()
  if (symbols?.length) {
    const [rows] = await pool.query(
      `SELECT id, symbol_code, symbol_name, sector, industry, category FROM stock_mstr
        WHERE is_active = 1 AND symbol_code IN (${symbols.map(() => '?').join(',')})`,
      symbols,
    )
    return rows
  }
  const [rows] = await pool.query(
    "SELECT id, symbol_code, symbol_name, sector, industry, category FROM stock_mstr WHERE is_active = 1 AND symbol_code IS NOT NULL AND category = 'EQUITY'",
  )
  return rows
}

/** Start a batch job. Returns false if one is already running. */
export async function startBatch(symbols = null, label = 'batch') {
  if (job.running) return false
  const rows = await getStockRows(symbols)
  job.running = true
  job.label = label
  job.runId = `${label} @ ${new Date().toISOString().slice(0, 16)}`
  job.total = rows.length
  job.completed = 0
  job.failed = 0
  job.current = null
  job.errors = []
  job.startedAt = new Date().toISOString()
  job.finishedAt = null

  const queue = [...rows]
  const isPermanent = (e) => e.status === 422 || /insufficient candle history|candle API 4/.test(e.message)
  const classify = (e) => {
    if (/insufficient candle history/.test(e.message)) {
      const bars = e.message.match(/\((\d+) bars/)?.[1] ?? '?'
      return `Insufficient history (${bars} daily bars, minimum 30 — very recent listing or a candle-API data gap)`
    }
    if (/candle API 4/.test(e.message)) return 'Candle API rejected the symbol (possibly delisted/suspended/renamed)'
    if (/candle API 5/.test(e.message)) return 'Candle API server error'
    if (/fetch failed|network|timeout|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(e.message)) return 'Network error/timeout (retried once)'
    return `Other: ${e.message}`
  }
  const worker = async () => {
    while (queue.length && job.running) {
      const row = queue.shift()
      job.current = row.symbol_code
      try {
        await analyseSymbol(row)
        job.completed++
      } catch (e1) {
        // one retry for transient (network/server) errors
        if (!isPermanent(e1)) {
          await new Promise((r) => setTimeout(r, 1200))
          try {
            await analyseSymbol(row)
            job.completed++
            await new Promise((r) => setTimeout(r, GAP_MS))
            continue
          } catch (e2) {
            job.failed++
            job.errors.push({ symbol: row.symbol_code, error: e2.message })
            await saveFailure(job.runId, row.symbol_code, classify(e2))
            await new Promise((r) => setTimeout(r, GAP_MS))
            continue
          }
        }
        job.failed++
        job.errors.push({ symbol: row.symbol_code, error: e1.message })
        await saveFailure(job.runId, row.symbol_code, classify(e1))
      }
      await new Promise((r) => setTimeout(r, GAP_MS))
    }
  }
  Promise.all(Array.from({ length: CONCURRENCY }, worker))
    .catch((e) => console.error('batch crashed:', e))
    .finally(() => {
      job.running = false
      job.current = null
      job.finishedAt = new Date().toISOString()
      console.log(`batch "${job.label}" done: ${job.completed} ok, ${job.failed} failed of ${job.total}`)
    })
  return true
}

export function stopBatch() {
  if (!job.running) return false
  job.running = false
  return true
}
