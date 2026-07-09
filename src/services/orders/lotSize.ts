// ── Lot-size resolution (from the /trade/indices master) ─────────────────────
// The order quantity is always lots × lotSize. Lot sizes come from the index
// master API (cached app-wide); a small static map covers the window before it
// loads. Callers use lotSizeFor() synchronously after ensureLotSizes() resolves.

import { getIndexMaster } from '@/services/indexMasterCache'
import { parseLot, type IndexMaster } from '@/types/indexMaster'

// Fallback until the index master loads (or for anything it doesn't list).
const FALLBACK: Record<string, number> = {
  NIFTY: 75, BANKNIFTY: 35, FINNIFTY: 65, MIDCPNIFTY: 140, SENSEX: 20, BANKEX: 30,
}

let map: Record<string, number> = {}

function buildFrom(list: IndexMaster[]) {
  const m: Record<string, number> = {}
  for (const im of list) {
    const key = (im.symbolCode ?? im.symbol_code ?? im.symbolName ?? im.symbol_name ?? '').toUpperCase()
    if (key) m[key] = parseLot(im.lot)
  }
  if (Object.keys(m).length) map = m
}

/** Load lot sizes from the index master (no-op once populated). */
export async function ensureLotSizes(): Promise<void> {
  if (Object.keys(map).length) return
  try { buildFrom(await getIndexMaster()) } catch { /* keep fallback */ }
}

/** Synchronous lot size for an index; index master → static fallback → 1. */
export function lotSizeFor(index: string): number {
  const k = (index ?? '').toUpperCase()
  return map[k] ?? FALLBACK[k] ?? 1
}
