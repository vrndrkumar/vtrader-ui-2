import type { UserBroker } from '@/types/broker'

// Admin approval lifecycle for a user broker. `null`/empty = awaiting approval.
export interface BrokerStatusMeta { label: string; badge: string; dot: string }

export function brokerStatusMeta(status: string | null | undefined): BrokerStatusMeta {
  switch (String(status ?? '').toUpperCase()) {
    case 'APPROVED': return { label: 'Approved', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25' }
    case 'REJECTED': return { label: 'Rejected', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/25' }
    default:         return { label: 'Pending', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25' }
  }
}

export const isApproved = (b: UserBroker) => String(b.status ?? '').toUpperCase() === 'APPROVED'
export const masterBrokerId = (b: UserBroker) => b.brokerId ?? b.broker?.id ?? b.broker_id ?? 0
export const brokerDisplay = (b: UserBroker) => b.preferences?.displayName || b.brokerName
