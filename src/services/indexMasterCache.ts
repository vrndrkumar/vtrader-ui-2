import { axiosPublic } from '@/api/axios'
import type { IndexMaster } from '@/types/indexMaster'

// Module-level singleton — survives re-renders, cleared on page reload
let cache: IndexMaster[] | null = null
let inFlight: Promise<IndexMaster[]> | null = null

/**
 * Recursively unwrap common API envelope shapes until we find an array.
 * Handles: raw array, { data:[...] }, { result:[...] }, { indices:[...] },
 *          { data: { indices:[...] } }, etc.
 */
function extractArray<T>(raw: unknown, depth = 0): T[] {
  if (depth > 3) return []
  if (Array.isArray(raw)) return raw as T[]
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    for (const key of ['data', 'result', 'records', 'items', 'indices', 'list']) {
      const val = obj[key]
      if (Array.isArray(val)) return val as T[]
      if (val && typeof val === 'object') {
        const nested = extractArray<T>(val, depth + 1)
        if (nested.length > 0) return nested
      }
    }
  }
  return []
}

export async function getIndexMaster(): Promise<IndexMaster[]> {
  if (cache && cache.length > 0) return cache
  if (inFlight) return inFlight

  inFlight = axiosPublic
    .get('/trade/indices')
    .then((res) => {
      const data = extractArray<IndexMaster>(res.data)
      cache = data
      return data
    })
    .catch(() => {
      // Don't cache failures — allow retry
      return [] as IndexMaster[]
    })
    .finally(() => { inFlight = null })

  return inFlight
}

export function clearIndexMasterCache() {
  cache = null
  inFlight = null
}
