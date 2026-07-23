import { useBrokerStore } from '@/store/brokerStore'

/**
 * Returns true when the logged-in user has at least one registered broker.
 * Reads directly from the broker store (populated at login, cleared on logout)
 * so there are no extra API calls and the value is always in sync.
 */
export function useHasRegisteredBrokers(): boolean {
  return useBrokerStore((s) => s.accounts.length > 0)
}
