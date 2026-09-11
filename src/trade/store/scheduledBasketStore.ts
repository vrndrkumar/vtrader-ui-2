// ── Scheduled basket store ───────────────────────────────────────────────────
// Holds the user's active scheduled baskets + the schedule modal / manager state.
// The modal is fed a snapshot of legs + brokers captured when "Schedule" is opened.

import { create } from 'zustand'
import toast from 'react-hot-toast'
import {
  listScheduledBaskets, createScheduledBasket, updateScheduledBasket, cancelScheduledBasket,
  type ScheduledBasket, type ScheduledLeg, type ScheduledPayload,
} from '@/api/scheduledBaskets'

interface State {
  baskets: ScheduledBasket[]
  loading: boolean

  // Modal (create or edit).
  modalOpen: boolean
  editing: ScheduledBasket | null
  draftLegs: ScheduledLeg[]
  draftBrokers: string[]
  draftIndex: string

  managerOpen: boolean

  load: () => Promise<void>
  openCreate: (legs: ScheduledLeg[], brokers: string[], indexName: string) => void
  openEdit: (b: ScheduledBasket) => void
  closeModal: () => void
  setManagerOpen: (v: boolean) => void

  submitCreate: (payload: ScheduledPayload) => Promise<boolean>
  submitEdit: (id: number, patch: Partial<ScheduledPayload>) => Promise<boolean>
  cancel: (id: number) => Promise<void>
}

function errMsg(e: unknown): string {
  const a = e as { response?: { data?: { message?: string } }; message?: string }
  return a?.response?.data?.message || a?.message || 'Request failed'
}

export const useScheduledBasketStore = create<State>((set) => ({
  baskets: [],
  loading: false,
  modalOpen: false,
  editing: null,
  draftLegs: [],
  draftBrokers: [],
  draftIndex: '',
  managerOpen: false,

  load: async () => {
    set({ loading: true })
    try { set({ baskets: await listScheduledBaskets() }) } catch { /* keep */ } finally { set({ loading: false }) }
  },

  openCreate: (legs, brokers, indexName) => set({ modalOpen: true, editing: null, draftLegs: legs, draftBrokers: brokers, draftIndex: indexName }),
  openEdit: (b) => set({ modalOpen: true, editing: b, draftLegs: b.legs, draftBrokers: b.brokers, draftIndex: b.indexName }),
  closeModal: () => set({ modalOpen: false, editing: null }),
  setManagerOpen: (managerOpen) => set({ managerOpen }),

  submitCreate: async (payload) => {
    try {
      const b = await createScheduledBasket(payload)
      set((s) => ({ baskets: [b, ...s.baskets.filter((x) => x.id !== b.id)], modalOpen: false, editing: null, managerOpen: true }))
      toast.success('Basket scheduled')
      return true
    } catch (e) { toast.error(errMsg(e)); return false }
  },
  submitEdit: async (id, patch) => {
    try {
      const b = await updateScheduledBasket(id, patch)
      set((s) => ({ baskets: s.baskets.map((x) => (x.id === id ? b : x)), modalOpen: false, editing: null }))
      toast.success('Schedule updated')
      return true
    } catch (e) { toast.error(errMsg(e)); return false }
  },
  cancel: async (id) => {
    try {
      await cancelScheduledBasket(id)
      set((s) => ({ baskets: s.baskets.filter((x) => x.id !== id) }))
      toast.success('Schedule removed')
    } catch (e) { toast.error(errMsg(e)) }
  },
}))
