// ── Order funnel (single entry point for ALL order placement) ────────────────
// Quick Trade ON  → submit directly across selected brokers with default qty.
// Quick Trade OFF → open the shared Order Window for review.
// Execution is simulated for now; real broker APIs map into submitOrder() later.

import toast from 'react-hot-toast'
import { resolveQty, useBrokerStore, type BrokerAccount } from '@/store/brokerStore'
import { useOrderStore, type BrokerExecResult, type OrderIntent } from '@/store/orderStore'

export interface BrokerQty { broker: BrokerAccount; qty: number }

/** Every Buy/Sell in the app funnels through here. */
export function placeOrder(intent: OrderIntent): void {
  const { accounts, selectedIds, quickTrade } = useBrokerStore.getState()
  const brokers = accounts.filter((a) => selectedIds.includes(a.id))
  if (!brokers.length) { toast.error('Select a broker first'); return }

  if (quickTrade) {
    submitOrder(intent, brokers.map((b) => ({ broker: b, qty: resolveQty(b, intent.underlying) })))
    toast.success(`${intent.side} ${intent.instrument} · ${brokers.length} broker${brokers.length > 1 ? 's' : ''} (Quick Trade)`)
  } else {
    useOrderStore.getState().openWindow(intent)
  }
}

/** Fan out across brokers, tracking per-broker execution status. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function submitOrder(_intent: OrderIntent, legs: BrokerQty[]): void {
  const sent: BrokerExecResult[] = legs.map((l) => ({ brokerId: l.broker.id, displayName: l.broker.displayName, qty: l.qty, status: 'sent' }))
  useOrderStore.getState().setResults(sent)

  // Simulated fills — real API responses replace this, preserving partial-failure handling.
  window.setTimeout(() => {
    const filled: BrokerExecResult[] = legs.map((l, i) => ({
      brokerId: l.broker.id, displayName: l.broker.displayName, qty: l.qty,
      status: i > 0 && i % 7 === 0 ? 'failed' : 'filled',
      message: i > 0 && i % 7 === 0 ? 'Margin shortfall' : undefined,
    }))
    useOrderStore.getState().setResults(filled)
  }, 650)
}
