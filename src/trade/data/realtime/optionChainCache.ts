// ── Normalized real-time option-chain cache ──────────────────────────────────
// O(1) access keyed Index → Expiry → Strike → OptionType. Incremental updates
// mutate exactly one contract (immutably), with exchange_timestamp dedup and
// out-of-order protection. Writes are coalesced per animation frame; only
// affected expiry subscribers are notified. Bindable via useSyncExternalStore.

import type { OptionChainPayload } from '../ws/messages'
import { istParts } from '../../utils/marketStatus'

export interface OptionContract {
  index: string
  expiry: string
  strike: number
  optionType: 'CE' | 'PE'
  symbol: string
  ltp: number
  openLtp: number       // first ltp seen this session → drives live change%
  volume: number
  bidPrice: number
  askPrice: number
  buyQty: number
  sellQty: number
  ts: number            // exchange_timestamp
  // Extensible: populated when the feed/backend provides them (no refactor).
  oi?: number
  oiChg?: number
  iv?: number
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number }
}

export interface StrikeRow {
  strike: number
  CE?: OptionContract
  PE?: OptionContract
}

interface ExpiryBook {
  strikes: Map<number, StrikeRow>
  sorted: number[]
  sortedDirty: boolean
  version: number
}

type IndexBook = Map<string, ExpiryBook> // expiry -> book

const books = new Map<string, IndexBook>() // index -> IndexBook

// ── Subscriptions + batching ─────────────────────────────────────────────────

const expiryListeners = new Map<string, Set<() => void>>() // "index|expiry" -> listeners
const indexListeners = new Map<string, Set<() => void>>()   // "index" -> listeners (expiry set changed)
const pending = new Set<string>()                            // "index|expiry" dirty this frame
const pendingIndex = new Set<string>()
let frame: number | null = null

const ek = (index: string, expiry: string) => `${index}|${expiry}`

function scheduleFlush() {
  if (frame != null) return
  const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16)
  frame = raf(flush) as unknown as number
}

function flush() {
  frame = null
  for (const key of pending) {
    const [index, expiry] = key.split('|')
    const book = books.get(index)?.get(expiry)
    if (book) {
      if (book.sortedDirty) {
        book.sorted = [...book.strikes.keys()].sort((a, b) => a - b)
        book.sortedDirty = false
      }
      book.version++
    }
    expiryListeners.get(key)?.forEach((l) => l())
  }
  pending.clear()
  for (const index of pendingIndex) indexListeners.get(index)?.forEach((l) => l())
  pendingIndex.clear()
}

// ── Writes ───────────────────────────────────────────────────────────────────

function getExpiryBook(index: string, expiry: string, create: boolean): ExpiryBook | undefined {
  let ib = books.get(index)
  if (!ib) { if (!create) return undefined; ib = new Map(); books.set(index, ib) }
  let eb = ib.get(expiry)
  if (!eb) {
    if (!create) return undefined
    eb = { strikes: new Map(), sorted: [], sortedDirty: false, version: 0 }
    ib.set(expiry, eb)
    pendingIndex.add(index)
  }
  return eb
}

export function applyOptionUpdate(p: OptionChainPayload): void {
  // Validate — never crash on a bad frame.
  if (!p || (p.optionType !== 'CE' && p.optionType !== 'PE')) return
  const strike = Number(p.strikePrice)
  if (!Number.isFinite(strike) || !Number.isFinite(p.ltp)) return
  const ts = Number(p.exchange_timestamp) || 0

  const book = getExpiryBook(p.index, p.expiry, true)!
  let row = book.strikes.get(strike)
  if (!row) { row = { strike }; book.strikes.set(strike, row); book.sortedDirty = true }

  const prev = row[p.optionType]
  if (prev && prev.ts >= ts) return // dedup / out-of-order guard

  row[p.optionType] = {
    index: p.index, expiry: p.expiry, strike, optionType: p.optionType,
    symbol: p.symbol, ltp: p.ltp,
    openLtp: prev?.openLtp ?? p.ltp,
    volume: p.volume ?? 0, bidPrice: p.bidPrice ?? 0, askPrice: p.askPrice ?? 0,
    buyQty: p.buyQty ?? 0, sellQty: p.sellQty ?? 0, ts,
    oi: prev?.oi, oiChg: prev?.oiChg, iv: prev?.iv, greeks: prev?.greeks,
  }

  pending.add(ek(p.index, p.expiry))
  scheduleFlush()
}

// ── Selectors (stable references for useSyncExternalStore) ───────────────────

export function subscribeExpiry(index: string, expiry: string, cb: () => void): () => void {
  const key = ek(index, expiry)
  let set = expiryListeners.get(key)
  if (!set) { set = new Set(); expiryListeners.set(key, set) }
  set.add(cb)
  return () => { set!.delete(cb); if (set!.size === 0) expiryListeners.delete(key) }
}

export function getExpiryVersion(index: string, expiry: string): number {
  return books.get(index)?.get(expiry)?.version ?? 0
}

export function subscribeIndex(index: string, cb: () => void): () => void {
  let set = indexListeners.get(index)
  if (!set) { set = new Set(); indexListeners.set(index, set) }
  set.add(cb)
  return () => { set!.delete(cb); if (set!.size === 0) indexListeners.delete(index) }
}

export function getSortedStrikes(index: string, expiry: string): number[] {
  return books.get(index)?.get(expiry)?.sorted ?? EMPTY
}
const EMPTY: number[] = []

export function getStrikeRow(index: string, expiry: string, strike: number): StrikeRow | undefined {
  return books.get(index)?.get(expiry)?.strikes.get(strike)
}

// Chronological ordering for feed expiries like "28JUL26" (nearest first).
const EXP_MONS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 }
function expiryOrder(s: string): number {
  const m = /^(\d{2})([A-Z]{3})(\d{2})$/.exec(s.trim().toUpperCase())
  if (!m) return Number.MAX_SAFE_INTEGER
  const mon = EXP_MONS[m[2]]
  if (!mon) return Number.MAX_SAFE_INTEGER
  return (2000 + Number(m[3])) * 10000 + mon * 100 + Number(m[1])
}

export function getExpiries(index: string): string[] {
  const ib = books.get(index)
  if (!ib) return []
  const t = istParts()
  const todayOrder = t.y * 10000 + (t.m + 1) * 100 + t.d
  return [...ib.keys()]
    .filter((e) => expiryOrder(e) >= todayOrder) // never show expired expiries
    .sort((a, b) => expiryOrder(a) - expiryOrder(b))
}

export function hasLiveData(index: string, expiry: string): boolean {
  const eb = books.get(index)?.get(expiry)
  return !!eb && eb.strikes.size > 0
}

// ── Snapshot (persistence) ───────────────────────────────────────────────────

export function exportSnapshot(): OptionContract[] {
  const out: OptionContract[] = []
  for (const ib of books.values())
    for (const eb of ib.values())
      for (const row of eb.strikes.values()) {
        if (row.CE) out.push(row.CE)
        if (row.PE) out.push(row.PE)
      }
  return out
}

export function importSnapshot(contracts: OptionContract[]): void {
  for (const c of contracts) {
    if (!c || (c.optionType !== 'CE' && c.optionType !== 'PE')) continue
    const book = getExpiryBook(c.index, c.expiry, true)!
    let row = book.strikes.get(c.strike)
    if (!row) { row = { strike: c.strike }; book.strikes.set(c.strike, row); book.sortedDirty = true }
    if (!row[c.optionType] || row[c.optionType]!.ts < c.ts) row[c.optionType] = c
    pending.add(ek(c.index, c.expiry))
  }
  scheduleFlush()
}
