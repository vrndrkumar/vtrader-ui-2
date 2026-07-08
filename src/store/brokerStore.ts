// ── Global broker context (single source of truth) ───────────────────────────
// Hydrated from the login response `preferences.BROKER[]`. Every trading module
// (order placement, quick trade, order window, positions, holdings, order book,
// trade book) reads the current broker context from here — nothing re-implements
// broker selection. App-level on purpose (not Trade-scoped).

import { useMemo } from 'react'
import { create } from 'zustand'

export interface BrokerAccount {
  id: number
  brokerName: string          // "FINVASIA"
  displayName: string         // "FINVASIA[FA30962]"
  isDefault: boolean
  quantity: Record<string, number> // { nifty, banknifty, sensex, stocks }
}

/** Raw shape from login `preferences.BROKER[]`. */
export interface BrokerPreference {
  id: number
  default: boolean
  brokerName: string
  displayName: string
  quantity: Record<string, number>
}

const LS_ACCOUNTS = 'vtrader_brokers'
const LS_UI = 'vtrader_broker_ui'

// Demo seed from the login sample — used until a real login hydrates the store.
const SEED: BrokerAccount[] = [
  { id: 4, brokerName: 'FINVASIA', displayName: 'FINVASIA[FA30962]', isDefault: true, quantity: { nifty: 225, sensex: 60, stocks: 10, banknifty: 70 } },
  { id: 11, brokerName: 'ANGELONE', displayName: 'ANGELONE[S2110038]', isDefault: false, quantity: { nifty: 225, sensex: 60, stocks: 10, banknifty: 70 } },
]

function fromPreferences(prefs: BrokerPreference[]): BrokerAccount[] {
  return prefs.map((p) => ({
    id: p.id, brokerName: p.brokerName, displayName: p.displayName,
    isDefault: !!p.default, quantity: p.quantity ?? {},
  }))
}

function loadAccounts(): BrokerAccount[] {
  try {
    const raw = localStorage.getItem(LS_ACCOUNTS)
    if (raw) { const a = JSON.parse(raw); if (Array.isArray(a) && a.length) return a }
  } catch { /* ignore */ }
  return SEED
}

interface UiPrefs { selectedIds: number[]; quickTrade: boolean; confirmOrders: boolean }
function loadUi(): UiPrefs {
  try { const raw = localStorage.getItem(LS_UI); if (raw) return { confirmOrders: true, quickTrade: false, selectedIds: [], ...JSON.parse(raw) } } catch { /* ignore */ }
  return { selectedIds: [], quickTrade: false, confirmOrders: true }
}
function saveUi(u: UiPrefs) { try { localStorage.setItem(LS_UI, JSON.stringify(u)) } catch { /* ignore */ } }
function saveAccounts(a: BrokerAccount[]) { try { localStorage.setItem(LS_ACCOUNTS, JSON.stringify(a)) } catch { /* ignore */ } }

/** Ensure the selection is valid; fall back to the default (never empty). */
function reconcile(accounts: BrokerAccount[], selected: number[]): number[] {
  const ids = new Set(accounts.map((a) => a.id))
  const valid = selected.filter((id) => ids.has(id))
  if (valid.length) return valid
  const def = accounts.find((a) => a.isDefault) ?? accounts[0]
  return def ? [def.id] : []
}

interface BrokerState {
  accounts: BrokerAccount[]
  selectedIds: number[]
  quickTrade: boolean
  confirmOrders: boolean
  hydrate: (prefs: BrokerPreference[]) => void
  setSelected: (ids: number[]) => void
  toggleSelected: (id: number) => void
  selectOnly: (id: number) => void
  setQuickTrade: (v: boolean) => void
  setConfirmOrders: (v: boolean) => void
  reset: () => void
}

const initialAccounts = loadAccounts()
const initialUi = loadUi()

export const useBrokerStore = create<BrokerState>((set, get) => ({
  accounts: initialAccounts,
  selectedIds: reconcile(initialAccounts, initialUi.selectedIds),
  quickTrade: initialUi.quickTrade,
  confirmOrders: initialUi.confirmOrders,

  hydrate: (prefs) => {
    const accounts = fromPreferences(prefs)
    saveAccounts(accounts)
    const selectedIds = reconcile(accounts, get().selectedIds)
    saveUi({ selectedIds, quickTrade: get().quickTrade, confirmOrders: get().confirmOrders })
    set({ accounts, selectedIds })
  },
  setSelected: (ids) => {
    const selectedIds = reconcile(get().accounts, ids)
    saveUi({ selectedIds, quickTrade: get().quickTrade, confirmOrders: get().confirmOrders })
    set({ selectedIds })
  },
  toggleSelected: (id) => {
    const cur = get().selectedIds
    get().setSelected(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  },
  selectOnly: (id) => get().setSelected([id]),
  setQuickTrade: (quickTrade) => { saveUi({ selectedIds: get().selectedIds, quickTrade, confirmOrders: get().confirmOrders }); set({ quickTrade }) },
  setConfirmOrders: (confirmOrders) => { saveUi({ selectedIds: get().selectedIds, quickTrade: get().quickTrade, confirmOrders }); set({ confirmOrders }) },
  reset: () => {
    try { localStorage.removeItem(LS_ACCOUNTS); localStorage.removeItem(LS_UI) } catch { /* ignore */ }
    set({ accounts: SEED, selectedIds: reconcile(SEED, []), quickTrade: false, confirmOrders: true })
  },
}))

// ── Pure helpers (shared everywhere) ─────────────────────────────────────────

export type InstrumentClass = 'nifty' | 'banknifty' | 'sensex' | 'stocks'

/** Map an underlying to its quantity class. BANKNIFTY checked before NIFTY. */
export function classifyInstrument(underlying: string): InstrumentClass {
  const u = underlying.toUpperCase()
  if (u.includes('BANKNIFTY')) return 'banknifty'
  if (u.includes('NIFTY')) return 'nifty'
  if (u.includes('SENSEX')) return 'sensex'
  return 'stocks'
}

export function resolveQty(account: BrokerAccount, underlying: string): number {
  const cls = classifyInstrument(underlying)
  return account.quantity[cls] ?? account.quantity.stocks ?? 1
}

/** Currently selected broker accounts (respecting reconciliation). */
export function useSelectedBrokers(): BrokerAccount[] {
  // Select stable slices, derive with useMemo — never return a fresh array
  // straight from the store selector (breaks useSyncExternalStore).
  const accounts = useBrokerStore((s) => s.accounts)
  const selectedIds = useBrokerStore((s) => s.selectedIds)
  return useMemo(() => accounts.filter((a) => selectedIds.includes(a.id)), [accounts, selectedIds])
}
