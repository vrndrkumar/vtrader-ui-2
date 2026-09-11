// ── Runtime settings (admin feature flags) ───────────────────────────────────
// Small key/value store for operational toggles. Currently holds the timeframe
// mode flag that lets an admin A/B the engine wiring in production.
//
//   timeframe_mode: 'CURRENT'  (default) — daily base + weekly turn (frozen behaviour)
//                   'BASE_FAST'          — 4H base + weekly turn (experimental)
//
// Weights in engines.js are NOT changed by this — only the timeframe the
// features are computed on. Default is CURRENT, so production is untouched until
// an admin flips it, and flipping back is instant.
import { getPool } from './db.js'

const VALID_MODES = ['CURRENT', 'BASE_FAST']
let cache = { mode: null, at: 0 }
const TTL_MS = 5000 // brief cache so a flip propagates within seconds

export async function ensureSettingsSchema() {
  await getPool().query(`CREATE TABLE IF NOT EXISTS app_setting (
    k VARCHAR(64) NOT NULL,
    v VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (k)
  )`)
}

export async function getSetting(key, fallback = null) {
  const [rows] = await getPool().query('SELECT v FROM app_setting WHERE k = ? LIMIT 1', [key])
  return rows.length ? rows[0].v : fallback
}

export async function setSetting(key, value) {
  await getPool().query(
    'INSERT INTO app_setting (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [key, String(value)],
  )
}

/** Active timeframe mode, defaulting to CURRENT. Cached for a few seconds. */
export async function getTimeframeMode() {
  if (cache.mode && Date.now() - cache.at < TTL_MS) return cache.mode
  let mode = 'CURRENT'
  try {
    const v = await getSetting('timeframe_mode', 'CURRENT')
    if (VALID_MODES.includes(v)) mode = v
  } catch { /* DB not ready → safe default */ }
  cache = { mode, at: Date.now() }
  return mode
}

export async function setTimeframeMode(mode) {
  if (!VALID_MODES.includes(mode)) throw new Error(`invalid mode ${mode}`)
  await setSetting('timeframe_mode', mode)
  cache = { mode, at: Date.now() }
  return mode
}
