// ── Fibonacci retracement config (TradingView-style) ─────────────────────────
// The config lives inside the overlay's `styles.fib`, so it persists through the
// normal drawing pipeline (styles → backend `props`) with no schema change. The
// custom `fibRetracement` overlay reads it to render; the settings panel writes
// it via engine.styleDrawing(id, { fib }).

export interface FibLevel {
  r: number        // ratio, e.g. 0.618
  on: boolean      // shown?
  color: string
}

export interface FibConfig {
  levels: FibLevel[]
  extend: 'none' | 'right' | 'left' | 'both'
  reverse: boolean
  showPrice: boolean
  showRatio: boolean
  trend: { on: boolean; color: string }
}

// TradingView-like default palette per level; extensions off by default.
export const DEFAULT_FIB: FibConfig = {
  levels: [
    { r: 0, on: true, color: '#787b86' },
    { r: 0.236, on: true, color: '#f23645' },
    { r: 0.382, on: true, color: '#ff9800' },
    { r: 0.5, on: true, color: '#4caf50' },
    { r: 0.618, on: true, color: '#089981' },
    { r: 0.786, on: true, color: '#00bcd4' },
    { r: 1, on: true, color: '#787b86' },
    { r: 1.272, on: false, color: '#2962ff' },
    { r: 1.414, on: false, color: '#2962ff' },
    { r: 1.618, on: false, color: '#2962ff' },
    { r: 2, on: false, color: '#9c27b0' },
    { r: 2.618, on: false, color: '#9c27b0' },
    { r: 3.618, on: false, color: '#9c27b0' },
    { r: 4.236, on: false, color: '#9c27b0' },
  ],
  extend: 'right',
  reverse: false,
  showPrice: true,
  showRatio: true,
  trend: { on: false, color: '#787b86' },
}

const clone = (c: FibConfig): FibConfig => ({ ...c, levels: c.levels.map((l) => ({ ...l })), trend: { ...c.trend } })

/** Merge a persisted (possibly partial) config over the defaults. */
export function readFib(styles: unknown): FibConfig {
  const f = ((styles ?? {}) as { fib?: Partial<FibConfig> }).fib
  if (!f) return clone(DEFAULT_FIB)
  return {
    levels: Array.isArray(f.levels) && f.levels.length ? f.levels.map((l) => ({ r: Number(l.r), on: l.on !== false, color: String(l.color ?? '#787b86') })) : clone(DEFAULT_FIB).levels,
    extend: f.extend ?? DEFAULT_FIB.extend,
    reverse: f.reverse ?? DEFAULT_FIB.reverse,
    showPrice: f.showPrice ?? DEFAULT_FIB.showPrice,
    showRatio: f.showRatio ?? DEFAULT_FIB.showRatio,
    trend: { on: f.trend?.on ?? DEFAULT_FIB.trend.on, color: f.trend?.color ?? DEFAULT_FIB.trend.color },
  }
}

/** Pretty ratio label (0.618, 1, 0.5 …). */
export const fibRatioLabel = (r: number) => String(r)
