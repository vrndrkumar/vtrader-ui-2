import { axiosPrivate } from './axios'
import type {
  StrategyConfig,
  SubscribeStrategyPayload,
  EditStrategyPayload,
  UserStrategy,
} from '@/types/strategy'

function toArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    for (const key of ['data', 'result', 'records', 'items', 'strategies', 'configs', 'userStrategies']) {
      if (Array.isArray(obj[key])) return obj[key] as T[]
    }
  }
  return []
}

// GET /strategy/config-data — all strategy templates
export async function getStrategyConfigs(): Promise<StrategyConfig[]> {
  const { data } = await axiosPrivate.get('/strategy/config-data')
  return toArray<StrategyConfig>(data)
}

// GET /strategy/user-strategies — all subscribed strategies for current user
export async function getUserStrategies(): Promise<UserStrategy[]> {
  const { data } = await axiosPrivate.get('/strategy/user-strategies')
  return toArray<UserStrategy>(data)
}

// GET /strategy/user-strategies/:strategyCode — single user strategy by code
export async function getUserStrategyByCode(strategyCode: string): Promise<UserStrategy | null> {
  try {
    const { data } = await axiosPrivate.get(`/strategy/user-strategies/${encodeURIComponent(strategyCode)}`)
    return data ?? null
  } catch {
    return null
  }
}

// POST /strategy/subscribe
export async function subscribeStrategy(payload: SubscribeStrategyPayload): Promise<UserStrategy> {
  const { data } = await axiosPrivate.post('/strategy/subscribe', payload)
  return data
}

// POST /strategy/edit-strategy/:id — edit lots/broker/isEnabled on a subscribed strategy
export async function editStrategy(id: number, payload: EditStrategyPayload): Promise<UserStrategy> {
  const { data } = await axiosPrivate.post(`/strategy/edit-strategy/${id}`, payload)
  return data
}

// PUT /strategy/unsubscribe?brokerName=X&strategyCode=Y — fully remove a strategy
// No body sent — matches curl --data '' (empty body, no Content-Type)
export async function unsubscribeStrategy(brokerName: string, strategyCode: string): Promise<void> {
  await axiosPrivate({
    method: 'put',
    url: '/strategy/unsubscribe',
    params: { brokerName, strategyCode },
  })
}
