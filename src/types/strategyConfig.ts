// ── Strategy master-data model (Admin Control Panel) ─────────────────────────
// Backed by GET/POST/PUT/DELETE  /strategy-config  (admin only).
// NOTE: configData is intentionally an open record — its shape differs per
// strategy and must never be assumed. The JSON editor treats it generically.

export interface StrategyMaster {
  id: number
  strategyName: string
  strategyCode: string
  configData: Record<string, unknown> | null
  status: StrategyStatus | string
  description: string | null
  createdAt?: string
  updatedAt?: string
}

/** Known lifecycle statuses. Backend may add more — UI degrades gracefully. */
export type StrategyStatus = 'PUBLISHED' | 'READY' | 'DRAFT' | 'INACTIVE' | 'ARCHIVED'

export const STRATEGY_STATUSES: StrategyStatus[] = ['DRAFT', 'READY', 'PUBLISHED', 'INACTIVE', 'ARCHIVED']

export interface StatusMeta {
  label: string
  /** Tailwind classes for the badge chrome. */
  badge: string
  /** Solid dot colour. */
  dot: string
  /** True when the strategy is considered "live/active". */
  active: boolean
  description: string
}

const STATUS_META: Record<string, StatusMeta> = {
  PUBLISHED: { label: 'Published', active: true, dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25', description: 'Live and available to users.' },
  READY:     { label: 'Ready',     active: false, dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/25', description: 'Configured and ready to publish.' },
  DRAFT:     { label: 'Draft',     active: false, dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25', description: 'Work in progress, not yet finalised.' },
  INACTIVE:  { label: 'Inactive',  active: false, dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:border-white/10', description: 'Disabled and hidden from users.' },
  ARCHIVED:  { label: 'Archived',  active: false, dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/[0.04] dark:text-slate-400 dark:border-white/10', description: 'Retired; kept for reference only.' },
}

export function statusMeta(status: string | undefined | null): StatusMeta {
  const key = String(status ?? '').toUpperCase()
  return STATUS_META[key] ?? {
    label: key ? key.charAt(0) + key.slice(1).toLowerCase() : 'Unknown',
    active: false, dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/[0.04] dark:text-slate-400 dark:border-white/10',
    description: 'Custom status.',
  }
}

export function isStrategyActive(s: StrategyMaster): boolean {
  return statusMeta(s.status).active
}

/** Best-effort list of indices/symbols referenced inside configData (top-level ALL-CAPS object keys). */
export function configSymbols(cfg: Record<string, unknown> | null | undefined): string[] {
  if (!cfg) return []
  const skip = new Set(['timeWindow', 'slTrailingRule', 'strike', 'sl', 'lotChangeOnSL', 'entryCondition', 'tradeRules', 'indices', 'expiry_days', 'indexDays'])
  return Object.keys(cfg).filter((k) => {
    if (skip.has(k)) return false
    if (k !== k.toUpperCase()) return false
    const v = (cfg as Record<string, unknown>)[k]
    return v !== null && typeof v === 'object' && !Array.isArray(v)
  })
}

/** Payload for create/update — mirrors the record the API round-trips. */
export interface StrategyUpsertPayload {
  strategyName: string
  strategyCode: string
  status: string
  description: string | null
  configData: Record<string, unknown>
}
