// ── IndexedDB persistence for the realtime snapshot ──────────────────────────
// Keeps the last option-chain + index-tick snapshot so the app shows data
// instantly after reload or outside market hours. Newer live messages overwrite
// by timestamp; a day stamp lets consumers know if the snapshot is from today.

import type { OptionContract } from './optionChainCache'

const DB_NAME = 'vtrader_rt'
const STORE = 'snapshots'
const KEY = 'latest'

export interface RtSnapshot {
  day: string                                   // YYYY-MM-DD
  savedAt: number
  contracts: OptionContract[]
  ticks: Record<string, { ltp: number; ts: number }>
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    let req: IDBOpenDBRequest
    try { req = indexedDB.open(DB_NAME, 1) } catch { return resolve(null) }
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

export async function loadSnapshot(): Promise<RtSnapshot | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as RtSnapshot) ?? null)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

export async function saveSnapshot(snap: RtSnapshot): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(snap, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch { resolve() }
  })
}

export const todayStamp = () => new Date().toISOString().slice(0, 10)
