// ── Dataset: universe selection + throttled candle download with disk cache ──
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool } from '../src/db.js'
import { config } from '../src/config.js'
import { RESEARCH } from './config.js'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')

export function dataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  return DATA_DIR
}

/**
 * Deterministic universe: all active equities ordered by MD5(symbol||seed),
 * take the first N. Reproducible and unbiased w.r.t. outcomes.
 */
export async function selectUniverse() {
  const [rows] = await getPool().query(
    `SELECT symbol_code, symbol_name, sector, sector_index_symbol
       FROM stock_mstr
      WHERE is_active = 1 AND category = 'EQUITY' AND symbol_code IS NOT NULL
      ORDER BY MD5(CONCAT(symbol_code, ?))
      LIMIT ?`,
    [String(RESEARCH.seed), RESEARCH.universeSize],
  )
  return rows
}

const fmt = (d) => d.toISOString().slice(0, 10)

async function fetchDailySeries(symbol) {
  const file = path.join(dataDir(), `${symbol.replace(/[^A-Za-z0-9_-]/g, '_')}.json`)
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  const url = `${config.candleBaseUrl}/data/candle?symbol=${encodeURIComponent(symbol)}&from=${RESEARCH.dataFrom}&to=${fmt(new Date())}&frequency=D`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`candle ${res.status} ${symbol}`)
  const json = await res.json()
  const candles = (json.candles ?? [])
    .filter((c) => Number.isFinite(c.close))
    .map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume: volume || 0 }))
    .sort((a, b) => a.time - b.time)
  fs.writeFileSync(file, JSON.stringify(candles))
  return candles
}

/** Throttled bulk download. Returns Map(symbol -> candles). Failures logged, not fatal. */
export async function downloadAll(symbols, log = console.log) {
  const out = new Map()
  const queue = [...symbols]
  let done = 0
  const failures = []
  async function worker() {
    while (queue.length) {
      const sym = queue.shift()
      try {
        const candles = await fetchDailySeries(sym)
        if (candles.length >= RESEARCH.warmupBars + RESEARCH.forwardBars + 50) out.set(sym, candles)
        else failures.push({ sym, reason: `only ${candles.length} bars` })
      } catch (e) {
        failures.push({ sym, reason: e.message })
      }
      done++
      if (done % 25 === 0) log(`  downloaded ${done}/${symbols.length}`)
      await new Promise((r) => setTimeout(r, RESEARCH.fetchGapMs))
    }
  }
  await Promise.all(Array.from({ length: RESEARCH.fetchConcurrency }, worker))
  return { series: out, failures }
}

/** Median daily turnover in ₹ crore over the whole series. */
export function medianTurnoverCr(candles) {
  const t = candles.map((c) => (c.close * c.volume) / 1e7).sort((a, b) => a - b)
  return t.length ? t[Math.floor(t.length / 2)] : 0
}
