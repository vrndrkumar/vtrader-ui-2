import { axiosPrivate } from './axios'
import type { StrategyConfig, SubscribeStrategyPayload, UserStrategy } from '@/types/strategy'

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

// GET /strategy/config-data
export async function getStrategyConfigs(): Promise<StrategyConfig[]> {
  const { data } = await axiosPrivate.get('/strategy/config-data')
  return toArray<StrategyConfig>(data)
}

// GET /strategy/user-strategies
export async function getUserStrategies(): Promise<UserStrategy[]> {
  const { data } = await axiosPrivate.get('/strategy/user-strategies')
  return toArray<UserStrategy>(data)
}

// POST /strategy/subscribe  (body = subscribe payload)
// TODO: confirm endpoint when API is available
export async function subscribeStrategy(payload: SubscribeStrategyPayload): Promise<UserStrategy> {
  const { data } = await axiosPrivate.post('/strategy/subscribe', payload)
  return data
}

// POST /strategy/edit-strategy  (body = full UserStrategy shape)
// Used for: editing lots/broker, toggling deploy/undeploy (isEnabled)
export async function editStrategy(payload: Partial<UserStrategy>): Promise<UserStrategy> {
  const { data } = await axiosPrivate.post('/strategy/edit-strategy', payload)
  return data
}

// GET /strategy/unsubscribe?brokerName=X&strategyCode=Y
export async function unsubscribeStrategy(brokerName: string, strategyCode: string): Promise<void> {
  await axiosPrivate.get('/strategy/unsubscribe', {
    params: { brokerName, strategyCode },
  })
}
