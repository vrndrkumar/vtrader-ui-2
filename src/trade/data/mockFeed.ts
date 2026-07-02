// ── Mock live-tick feed ──────────────────────────────────────────────────────
// Stand-in for the real Redis→WebSocket stream. Emits a gentle random walk
// seeded from the last historical close. Same callback signature the real
// WebSocketManager will use, so swapping is a one-line change in dataSource.ts.

import type { Quote } from '../types/market'

type QuoteCb = (q: Quote) => void

interface Sub {
  key: string
  price: number
  base: number       // reference (previous close) for chg%
  cb: QuoteCb
  timer: number
}

const subs = new Map<string, Sub>()

function tick(sub: Sub) {
  // Random walk: ±0.03% steps, occasional larger move.
  const drift = (Math.random() - 0.5) * sub.price * 0.0006
  const jump = Math.random() < 0.05 ? (Math.random() - 0.5) * sub.price * 0.0015 : 0
  sub.price = Math.max(0.05, sub.price + drift + jump)
  const chg = sub.price - sub.base
  sub.cb({
    key: sub.key,
    ltp: +sub.price.toFixed(2),
    chg: +chg.toFixed(2),
    chgPct: +((chg / sub.base) * 100).toFixed(2),
    bid: +(sub.price - 0.05).toFixed(2),
    ask: +(sub.price + 0.05).toFixed(2),
    ts: Date.now(),
  })
}

/** Subscribe to mock quotes for a key. Returns an unsubscribe fn. */
export function subscribeMockQuote(key: string, seedPrice: number, cb: QuoteCb, intervalMs = 500): () => void {
  // Ref-count-free simple model: one active sub per key for Phase 0.
  const existing = subs.get(key)
  if (existing) window.clearInterval(existing.timer)

  const sub: Sub = { key, price: seedPrice, base: seedPrice, cb, timer: 0 }
  sub.timer = window.setInterval(() => tick(sub), intervalMs)
  subs.set(key, sub)
  // Emit one immediately so the UI paints without waiting a full interval.
  tick(sub)

  return () => {
    const s = subs.get(key)
    if (s) {
      window.clearInterval(s.timer)
      subs.delete(key)
    }
  }
}
