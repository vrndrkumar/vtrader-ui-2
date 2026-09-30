// ── Tiny DB-backed key/value store for Option Insight ────────────────────────
// The server's app directory is read-only in production, so settings and the
// current analysis are persisted in MySQL (which the process CAN write) instead
// of JSON files. Values are stored as JSON text.
import { getPool } from './db.js'

let ensured = false
async function ensureKvSchema() {
  if (ensured) return
  await getPool().query(`CREATE TABLE IF NOT EXISTS option_kv (
    k VARCHAR(64) PRIMARY KEY,
    v LONGTEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`)
  ensured = true
}

export async function kvGet(key) {
  await ensureKvSchema()
  const [rows] = await getPool().query('SELECT v FROM option_kv WHERE k = ? LIMIT 1', [key])
  if (!rows.length) return null
  try { return JSON.parse(rows[0].v) } catch { return null }
}

export async function kvSet(key, obj) {
  await ensureKvSchema()
  await getPool().query(
    'INSERT INTO option_kv (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [key, JSON.stringify(obj)],
  )
  return obj
}

export { ensureKvSchema }
