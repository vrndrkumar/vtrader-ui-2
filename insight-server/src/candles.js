import { config } from './config.js'

// ── Candle fetching, caching, resampling ─────────────────────────────────────
// API: GET {base}/data/candle?symbol=SBIN-EQ&from=YYYY-MM-DD&to=YYYY-MM-DD&frequency=15|30|60|D|1W|1M
// Response: { candles: [{ time(epoch s), open, high, low, close, volume, oi, n, final }] }

const cache = new Map() // key -> { at, data }
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 600 // bound memory during full-universe batch runs

const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => fmt(new Date(Date.now() - n * 864e5))
const today = () => fmt(new Date())

async function fetchRaw(symbol, frequency, from, to) {
  const key = `${symbol}|${frequency}|${from}|${to}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data

  const url = `${config.candleBaseUrl}/data/candle?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&frequency=${frequency}`
  // Hard timeout: a hung connection must FAIL (and be retried/reported), never
  // silently stall the whole batch at "0 done".
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  let res
  try {
    res = await fetch(url, { signal: ctrl.signal })
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? `candle API timeout (25s) for ${symbol} ${frequency}` : `candle API network error for ${symbol}: ${e.message}`)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`candle API ${res.status} for ${symbol} ${frequency}`)
  const json = await res.json()
  const raw = Array.isArray(json?.candles) ? json.candles : []
  const data = raw
    .filter((c) => c && Number.isFinite(c.open) && Number.isFinite(c.close))
    .map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: Number.isFinite(c.volume) ? c.volume : 0,
      final: c.final !== false, // preserve settlement flag; missing → treat as final
    }))
    .sort((a, b) => a.time - b.time)
  // NEVER cache empty results — data may be backfilled at the source at any
  // time, and a cached empty answer would hide it until TTL/restart.
  if (data.length) {
    if (cache.size >= CACHE_MAX_ENTRIES) {
      // evict oldest entry (Map preserves insertion order)
      cache.delete(cache.keys().next().value)
    }
    cache.set(key, { at: Date.now(), data })
  }
  return data
}

/** Resample 1h candles into 4h buckets (per trading day). */
function resample4h(hourly) {
  const out = []
  let bucket = null
  for (const c of hourly) {
    const day = new Date(c.time * 1000).toISOString().slice(0, 10)
    const idx = Math.floor(new Date(c.time * 1000).getUTCHours() / 4)
    const key = `${day}-${idx}`
    if (!bucket || bucket.key !== key) {
      if (bucket) out.push(bucket.c)
      bucket = { key, c: { ...c } }
    } else {
      bucket.c.high = Math.max(bucket.c.high, c.high)
      bucket.c.low = Math.min(bucket.c.low, c.low)
      bucket.c.close = c.close
      bucket.c.volume += c.volume
    }
  }
  if (bucket) out.push(bucket.c)
  return out
}

/**
 * Fetch every timeframe the engine needs.
 * Daily goes back to 2020 for historical validation.
 */
export async function fetchAllTimeframes(symbol) {
  const [m15, m30, h1, daily, weekly, monthly] = await Promise.all([
    fetchRaw(symbol, '15', daysAgo(30), today()).catch(() => []),
    fetchRaw(symbol, '30', daysAgo(45), today()).catch(() => []),
    fetchRaw(symbol, '60', daysAgo(120), today()).catch(() => []),
    fetchRaw(symbol, 'D', '2020-01-01', today()),
    fetchRaw(symbol, '1W', '2019-01-01', today()).catch(() => []),
    fetchRaw(symbol, '1M', '2015-01-01', today()).catch(() => []),
  ])
  return { '15m': m15, '30m': m30, '1h': h1, '4h': resample4h(h1), daily, weekly, monthly }
}

/** Daily candles for a benchmark / sector index. */
export function fetchDaily(symbol, fromDate = '2023-01-01') {
  return fetchRaw(symbol, 'D', fromDate, today())
}
