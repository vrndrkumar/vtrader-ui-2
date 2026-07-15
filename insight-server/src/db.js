import mysql from 'mysql2/promise'
import { config } from './config.js'

let pool = null

export function getPool() {
  if (!pool) pool = mysql.createPool(config.db)
  return pool
}

/** Autocomplete search over stock_mstr (active rows). */
export async function searchSymbols(q, limit = 20) {
  const like = `%${q}%`
  const [rows] = await getPool().query(
    `SELECT symbol_code, symbol_name, exchange, sector, industry, category, sector_index_symbol
       FROM stock_mstr
      WHERE is_active = 1
        AND (symbol_code LIKE ? OR symbol_name LIKE ?)
      ORDER BY
        (symbol_code LIKE ?) DESC,          -- prefix matches on code first
        (symbol_name LIKE ?) DESC,
        CHAR_LENGTH(symbol_code) ASC
      LIMIT ?`,
    [like, like, `${q}%`, `${q}%`, Number(limit)],
  )
  return rows
}

/** Full active symbol universe (for list / multi-select UI). */
export async function listAllSymbols() {
  const [rows] = await getPool().query(
    `SELECT symbol_code, symbol_name, exchange, sector, industry, category, sector_index_symbol
       FROM stock_mstr
      WHERE is_active = 1 AND symbol_code IS NOT NULL
      ORDER BY symbol_name ASC`,
  )
  return rows
}

/** Full master row for one symbol code. */
export async function getSymbol(symbolCode) {
  const [rows] = await getPool().query(
    `SELECT id, exchange, symbol_code, symbol_name, description, sector, industry,
            category, sector_index_symbol, latest_update
       FROM stock_mstr
      WHERE symbol_code = ? AND is_active = 1
      LIMIT 1`,
    [symbolCode],
  )
  return rows[0] || null
}
