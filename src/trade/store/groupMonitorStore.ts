// ── Group protect store ──────────────────────────────────────────────────────
// Drives the "combined SL/Target" flow: multi-select positions of ONE index,
// open the Protect modal (create or edit), and keep the list of the user's
// active group monitors for the manager panel. Live combined P&L is computed in
// the components from the tick feed — not held here.

import { create } from 'zustand'
import toast from 'react-hot-toast'
import {
  listGroupMonitors, createGroupMonitor, updateGroupMonitor, cancelGroupMonitor,
  type GroupMonitor, type GroupLeg, type GroupPayload,
} from '@/api/groupMonitors'

/** Minimal shape the selection needs from a position row. */
export interface SelectablePosition {
  id: string
  indexName: string
}

interface GroupState {
  groups: GroupMonitor[]
  loading: boolean

  // Selection (Positions tab) — constrained to a single index.
  selectedIds: string[]
  selIndex: string | null

  // Modal (create or edit).
  modalOpen: boolean
  editing: GroupMonitor | null
  draftLegs: GroupLeg[]     // legs to protect when creating
  draftIndex: string
  draftArmPnl: number       // running P&L at the moment Protect was opened (anchor)

  managerOpen: boolean

  load: () => Promise<void>
  toggleSelect: (p: SelectablePosition) => void
  isSelected: (id: string) => boolean
  clearSelection: () => void

  openCreate: (legs: GroupLeg[], indexName: string, armPnl: number) => void
  openEdit: (g: GroupMonitor) => void
  closeModal: () => void
  setManagerOpen: (v: boolean) => void

  submitCreate: (payload: GroupPayload) => Promise<boolean>
  submitEdit: (id: number, patch: Partial<GroupPayload>) => Promise<boolean>
  cancel: (id: number) => Promise<void>
}

export const useGroupMonitorStore = create<GroupState>((set, get) => ({
  groups: [],
  loading: false,
  selectedIds: [],
  selIndex: null,
  modalOpen: false,
  editing: null,
  draftLegs: [],
  draftIndex: '',
  draftArmPnl: 0,
  managerOpen: false,

  load: async () => {
    set({ loading: true })
    try { set({ groups: await listGroupMonitors() }) }
    catch { /* keep last known */ }
    finally { set({ loading: false }) }
  },

  toggleSelect: (p) => set((s) => {
    const on = s.selectedIds.includes(p.id)
    if (on) {
      const selectedIds = s.selectedIds.filter((x) => x !== p.id)
      return { selectedIds, selIndex: selectedIds.length ? s.selIndex : null }
    }
    // Enforce single-index selection.
    if (s.selIndex && p.indexName !== s.selIndex) {
      toast.error(`Group protects one index at a time — clear the ${s.selIndex} selection first`)
      return s
    }
    return { selectedIds: [...s.selectedIds, p.id], selIndex: p.indexName }
  }),
  isSelected: (id) => get().selectedIds.includes(id),
  clearSelection: () => set({ selectedIds: [], selIndex: null }),

  openCreate: (legs, indexName, armPnl) => set({ modalOpen: true, editing: null, draftLegs: legs, draftIndex: indexName, draftArmPnl: armPnl }),
  openEdit: (g) => set({ modalOpen: true, editing: g, draftLegs: g.legs, draftIndex: g.indexName }),
  closeModal: () => set({ modalOpen: false, editing: null }),
  setManagerOpen: (managerOpen) => set({ managerOpen }),

  submitCreate: async (payload) => {
    try {
      const g = await createGroupMonitor(payload)
      set((s) => ({ groups: [g, ...s.groups.filter((x) => x.id !== g.id)], modalOpen: false, editing: null, selectedIds: [], selIndex: null, managerOpen: true }))
      toast.success('Combined protect armed')
      return true
    } catch (e) { toast.error(errMsg(e)); return false }
  },
  submitEdit: async (id, patch) => {
    try {
      const g = await updateGroupMonitor(id, patch)
      set((s) => ({ groups: s.groups.map((x) => (x.id === id ? g : x)), modalOpen: false, editing: null }))
      toast.success('Protect updated')
      return true
    } catch (e) { toast.error(errMsg(e)); return false }
  },
  cancel: async (id) => {
    try {
      await cancelGroupMonitor(id)
      set((s) => ({ groups: s.groups.filter((x) => x.id !== id) }))
      toast.success('Protect cancelled')
    } catch (e) { toast.error(errMsg(e)) }
  },
}))

/**
 * Combined OPEN P&L (unrealized) on the LOCKED legs — the exact basis the group
 * monitor triggers on: Σ (ltp − lockedAvg) × lockedQty × valueFactor.
 * `ltpOf` resolves a live price per symbol; when it returns nothing the leg
 * contributes 0 (priced at its own locked avg) rather than a bogus number.
 */
export function combinedOpenPnl(legs: GroupLeg[], ltpOf: (sym: string) => number | undefined): number {
  return legs.reduce((a, l) => {
    const t = ltpOf(l.symbolName)
    const ltp = t != null && Number.isFinite(t) ? t : l.lockedAvg
    return a + (ltp - l.lockedAvg) * l.lockedQty * (l.valueFactor || 1)
  }, 0)
}

/**
 * Combined RUNNING P&L — the actual live P&L of the legs exactly as shown in the
 * Positions table (realized + unrealized). `netMap` is keyed by `symbol|broker`
 * and holds each live position's running P&L; legs with no live match fall back
 * to their open MTM. This is what the user sees and decides thresholds against;
 * the monitor then triggers on the CHANGE from the value at arm time.
 */
export function combinedRunningPnl(
  legs: GroupLeg[],
  netMap: Record<string, number>,
  ltpOf: (sym: string) => number | undefined,
): number {
  return legs.reduce((a, l) => {
    const net = netMap[`${l.symbolName}|${l.brokerLabel ?? l.brokerName}`]
    if (net != null && Number.isFinite(net)) return a + net
    const t = ltpOf(l.symbolName)
    const ltp = t != null && Number.isFinite(t) ? t : l.lockedAvg
    return a + (ltp - l.lockedAvg) * l.lockedQty * (l.valueFactor || 1)
  }, 0)
}

function errMsg(e: unknown): string {
  const anyE = e as { response?: { data?: { message?: string } }; message?: string }
  return anyE?.response?.data?.message || anyE?.message || 'Request failed'
}
