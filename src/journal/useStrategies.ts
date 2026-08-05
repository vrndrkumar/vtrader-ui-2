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

// ── Known groups registry ─────────────────────────────────────────────────────
// Accumulates unique group_name values seen from the user's own trades (session).
// JournalPage feeds this after every trade fetch so the combobox can suggest them.

const knownGroupsSet = new Set<string>()
let knownGroupsVersion = 0  // incremented to trigger re-render in consumers
const knownGroupsListeners = new Set<() => void>()

export function registerKnownGroups(groups: string[]): void {
  let changed = false
  for (const g of groups) {
    if (g && !knownGroupsSet.has(g)) { knownGroupsSet.add(g); changed = true }
  }
  if (changed) {
    knownGroupsVersion++
    knownGroupsListeners.forEach((fn) => fn())
  }
}

export function useKnownGroups(): string[] {
  const [, setV] = useState(knownGroupsVersion)
  useEffect(() => {
    const notify = () => setV((v) => v + 1)
    knownGroupsListeners.add(notify)
    return () => { knownGroupsListeners.delete(notify) }
  }, [])
  return Array.from(knownGroupsSet)
}
