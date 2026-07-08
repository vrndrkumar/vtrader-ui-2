import { useEffect, useState } from 'react'
import { getStrategyConfigs } from '@/api/strategy'
import type { StrategyConfig } from '@/types/strategy'

// Master Strategy Template list (GET /strategy/config-data), cached module-level.
let cache: StrategyConfig[] | null = null
let inFlight: Promise<StrategyConfig[]> | null = null

export function useStrategies(): StrategyConfig[] {
  const [list, setList] = useState<StrategyConfig[]>(cache ?? [])
  useEffect(() => {
    if (cache) { setList(cache); return }
    inFlight ??= getStrategyConfigs().then((s) => { cache = s; return s }).catch(() => [] as StrategyConfig[])
    inFlight.then(setList)
  }, [])
  return list
}

/** Human label for a strategy code (falls back to the code / Manual). */
export function useStrategyLabel(): (code?: string) => string {
  const list = useStrategies()
  return (code) => {
    if (!code || code.toUpperCase() === 'MANUAL') return 'Manual'
    return list.find((s) => s.strategyCode === code)?.strategyName ?? code
  }
}
