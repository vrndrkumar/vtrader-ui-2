import { axiosSignal } from './axios'
import type {
  Signal,
  CreateSignalPayload,
  SignalsResponse,
  CreateSignalResponse,
} from '@/types/signal'

export async function getSignals(params?: {
  limit?: number
  strategyCode?: string
}): Promise<Signal[]> {
  const qp = new URLSearchParams()
  if (params?.limit != null) qp.set('limit', String(params.limit))
  if (params?.strategyCode) qp.set('strategyCode', params.strategyCode)
  const qs = qp.toString()
  const { data } = await axiosSignal.get<SignalsResponse>(
    `/api/signals${qs ? `?${qs}` : ''}`,
  )
  return data.signals ?? []
}

export async function createSignal(
  payload: CreateSignalPayload,
): Promise<CreateSignalResponse> {
  const { data } = await axiosSignal.post<CreateSignalResponse>(
    '/api/signals',
    payload,
  )
  if (data?.success === false) throw new Error((data as { message?: string }).message || 'Create failed')
  return data
}

export async function updateSignal(
  id: number,
  payload: CreateSignalPayload,
): Promise<void> {
  const { data } = await axiosSignal.put<{ success?: boolean; message?: string }>(
    `/api/signals/${id}`,
    payload,
  )
  if (data?.success === false) throw new Error(data.message || 'Update failed')
}

export async function deleteSignal(id: number): Promise<void> {
  const { data } = await axiosSignal.delete<{ success?: boolean; message?: string }>(
    `/api/signals/${id}`,
  )
  if (data?.success === false) throw new Error(data.message || 'Delete failed')
}

export async function toggleSignal(
  id: number,
  isActive: boolean,
): Promise<void> {
  const { data } = await axiosSignal.patch<{ success?: boolean; message?: string }>(
    `/api/signals/${id}/toggle`,
    { isActive },
  )
  if (data?.success === false) throw new Error(data.message || 'Toggle failed')
}
