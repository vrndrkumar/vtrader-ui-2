// ── Per-tool default styles ──────────────────────────────────────────────────
// Remembers the last style you chose for each drawing TOOL (line color, width,
// line style, fill+opacity, fib config, …), so the next time you pick that tool
// the new drawing starts with those settings instead of resetting to defaults —
// and it stays that way until you change it again. Per-device preference, so it
// lives in localStorage (no server round-trip, no sync bugs).

const LS_KEY = 'vtrader_draw_defaults_v1'

// toolName -> accumulated style object (klinecharts overlay `styles` shape,
// e.g. { line:{color,size,style}, polygon:{color}, fib:{...} }).
type Defaults = Record<string, Record<string, unknown>>

function load(): Defaults {
  try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r) as Defaults } catch { /* ignore */ }
  return {}
}

let cache: Defaults = load()

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// Deep-merge for plain objects; arrays and primitives are REPLACED (so e.g. a new
// fib `levels` array or a new color fully overrides the old one).
function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target }
  for (const k of Object.keys(patch)) {
    const pv = patch[k]
    const tv = out[k]
    out[k] = isObj(pv) ? deepMerge(isObj(tv) ? tv : {}, pv) : pv
  }
  return out
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** The saved default style for a tool, or undefined if it's never been styled. */
export function getToolDefault(name: string): Record<string, unknown> | undefined {
  const d = cache[name]
  return d ? clone(d) : undefined
}

/** Merge a style change into a tool's saved default (called whenever the user
 *  restyles a drawing of that type). */
export function setToolDefault(name: string, patch: Record<string, unknown>): void {
  if (!name || !patch) return
  cache = { ...cache, [name]: deepMerge(cache[name] ?? {}, patch) }
  try { localStorage.setItem(LS_KEY, JSON.stringify(cache)) } catch { /* ignore */ }
}
