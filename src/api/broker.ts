import { axiosPrivate } from './axios'
import type {
  AddBrokerPayload,
  ApproveBrokerPayload,
  BrokerMaster,
  UpdateBrokerPayload,
  UserBroker,
  ValidateBrokerPayload,
  ValidateBrokerResponse,
} from '@/types/broker'

/** Unwrap common API envelope shapes → plain array */
function toArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (raw && typeof raw === 'object') {
    for (const key of ['data', 'result', 'records', 'items', 'brokers']) {
      const v = (raw as Record<string, unknown>)[key]
      if (Array.isArray(v)) return v as T[]
    }
  }
  return []
}

export const getBrokerMasterList = async (): Promise<BrokerMaster[]> => {
  const res = await axiosPrivate.get('/broker-mstr')
  return toArray<BrokerMaster>(res.data)
}

export const getUserBrokers = async (): Promise<UserBroker[]> => {
  const res = await axiosPrivate.get('/broker')
  return toArray<UserBroker>(res.data)
}

export const addBroker = async (payload: AddBrokerPayload): Promise<UserBroker> => {
  const res = await axiosPrivate.post<UserBroker>('/broker', payload)
  return res.data
}

export const updateBroker = async (id: number, payload: UpdateBrokerPayload): Promise<UserBroker> => {
  const res = await axiosPrivate.put<UserBroker>(`/broker/${id}`, payload)
  return res.data
}

export const deleteBroker = async (id: number): Promise<void> => {
  await axiosPrivate.delete(`/broker/${id}`)
}

export const validateBroker = async (payload: ValidateBrokerPayload): Promise<ValidateBrokerResponse> => {
  const res = await axiosPrivate.post<ValidateBrokerResponse>('/broker/validate-broker-info', payload)
  return res.data
}

// ── Admin: manage all users' brokers ─────────────────────────────────────────

/** GET /broker/admin → every user's broker (admin only). */
export const getAdminBrokers = async (): Promise<UserBroker[]> => {
  const res = await axiosPrivate.get('/broker/admin')
  return toArray<UserBroker>(res.data)
}

/** POST /broker/admin/approve/:id → approve/reject with admin-set ipType + IPAddress. */
export const approveBroker = async (id: number, payload: ApproveBrokerPayload): Promise<unknown> => {
  const res = await axiosPrivate.post(`/broker/admin/approve/${id}`, payload)
  return res.data
}
