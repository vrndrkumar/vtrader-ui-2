// ── Tick size ────────────────────────────────────────────────────────────────
// Broker rejects any order/limit/SL/trigger price that isn't a multiple of the
// tick size (0.05). Round every price to the nearest tick before it leaves the
// app. Applies to STRIKE order prices — index/spot levels are not rounded here.

export const TICK = 0.05

/** Round a price to the nearest 0.05 (0 and non-finite pass through). */
export function roundTick(n?: number | null): number {
  const v = Number(n)
  if (!Number.isFinite(v) || v === 0) return 0
  return +(Math.round(v / TICK) * TICK).toFixed(2)
}
