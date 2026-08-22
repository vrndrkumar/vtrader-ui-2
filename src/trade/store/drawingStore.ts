// ── Drawing persistence (backend source of truth + local cache) ──────────────
// A drawing is a logical chart object (time+price DrawingDef with a stable UUID),
// not pixels — so it re-anchors across zoom/pan/timeframe and survives reload,
// logout, and other devices. The BACKEND is the source of truth (per user +
// symbol); localStorage is only an offline/perf cache.
//
// Writes are per-drawing and debounced: on each change we diff the new list
// against what we last synced (by id) and issue create / update / delete for the
// drawings that actually changed — never a whole-array rewrite. This is what
// makes "delete one" delete exactly one, and keeps the DB quiet during drags
// (the engine updates the screen in real time; we persist the final state).

import { create } from 'zustand'
import type { DrawingDef } from '../chart/ChartEngine'
import { getDrawings, createDrawing, updateDrawing, deleteDrawing } from '@/api/drawings'

const LS_KEY = 'vtrader_drawings_cache_v3' // cache only — backend is source of truth
const SYNC_DEBOUNCE_MS = 600

function loadCache(): Record<string, DrawingDef[]> {
  try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r) } catch { /* ignore */ }
  return {}
}
function writeCache(bySymbol: Record<string, DrawingDef[]>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(bySymbol)) } catch { /* ignore */ }
}

// Content signature for change detection (ignores id — identity is the key).
const sig = (d: DrawingDef) => JSON.stringify({ t: d.type, p: d.points, s: d.styles })

interface State {
  bySymbol: Record<string, DrawingDef[]>
  /** Cached list for a symbol (sync — for immediate restore). */
  get: (symbol: string) => DrawingDef[]
  /** Fetch the symbol's drawings from the backend, refresh the cache, return them. */
  load: (symbol: string) => Promise<DrawingDef[]>
  /** Record the new full list for a symbol; debounced per-drawing sync to backend. */
  save: (symbol: string, list: DrawingDef[]) => void
}

export const useDrawingStore = create<State>((set, getState) => {
  // What we've already synced to the backend, per symbol: id -> content signature.
  const synced: Record<string, Map<string, string>> = {}
  const timers: Record<string, ReturnType<typeof setTimeout>> = {}

  const flush = (symbol: string) => {
    const list = getState().bySymbol[symbol] ?? []
    const prev = synced[symbol] ?? new Map<string, string>()
    const next = new Map<string, string>()
    for (const d of list) { if (d.id) next.set(d.id, sig(d)) }

    // Creates + updates (only what changed).
    for (const d of list) {
      if (!d.id) continue
      const before = prev.get(d.id)
      if (before === undefined) void createDrawing(symbol, d).catch(() => { /* stays in cache; retried on next change */ })
      else if (before !== next.get(d.id)) void updateDrawing(d.id, d).catch(() => { /* keep local */ })
    }
    // Deletes — ids we had synced that are no longer present.
    for (const [id] of prev) { if (!next.has(id)) void deleteDrawing(id).catch(() => { /* keep trying next flush */ }) }

    synced[symbol] = next
  }

  return {
    bySymbol: loadCache(),
    get: (symbol) => getState().bySymbol[symbol] ?? [],

    load: async (symbol) => {
      const cache = getState().bySymbol[symbol] ?? []
      try {
        const list = await getDrawings(symbol)
        // First backend load for this symbol but we already have local drawings
        // (e.g. drawn before the table existed, or offline): MIGRATE them up and
        // keep showing them. Critically, this stops an empty backend response from
        // wiping the user's existing drawings on screen.
        if (list.length === 0 && cache.length > 0) {
          for (const d of cache) { if (d.id) void createDrawing(symbol, d).catch(() => { /* retried on next change */ }) }
          synced[symbol] = new Map(cache.filter((d) => d.id).map((d) => [d.id as string, sig(d)]))
          return cache
        }
        const bySymbol = { ...getState().bySymbol, [symbol]: list }
        set({ bySymbol }); writeCache(bySymbol)
        // Baseline for future diffs = exactly what the server holds.
        synced[symbol] = new Map(list.filter((d) => d.id).map((d) => [d.id as string, sig(d)]))
        return list
      } catch {
        return cache // offline / error → keep the cached drawings (never wipe)
      }
    },

    save: (symbol, list) => {
      const bySymbol = { ...getState().bySymbol, [symbol]: list }
      set({ bySymbol }); writeCache(bySymbol) // instant + offline cache
      clearTimeout(timers[symbol])
      timers[symbol] = setTimeout(() => flush(symbol), SYNC_DEBOUNCE_MS) // debounced backend write
    },
  }
})
