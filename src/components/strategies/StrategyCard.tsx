import { useState } from 'react'
import { clsx } from 'clsx'
import type { StrategyConfig, UserStrategy, EditStrategyPayload } from '@/types/strategy'
import { getStrategyIndices, isUserStrategyDeployed } from '@/types/strategy'
import { editStrategy, unsubscribeStrategy } from '@/api/strategy'

export type TabContext = 'templates' | 'my' | 'deployed'

interface Props {
  strategy: StrategyConfig
  userStrategy?: UserStrategy
  tabContext: TabContext
  onSubscribe: (strategy: StrategyConfig) => void
  onEdit: (userStrategy: UserStrategy) => void
  onRefresh: () => void
}

// ── Accent palette ────────────────────────────────────────────────────────────
const ACCENTS: [string, string][] = [
  ['#3b82f6', '#6366f1'],
  ['#8b5cf6', '#a855f7'],
  ['#10b981', '#14b8a6'],
  ['#f97316', '#f59e0b'],
  ['#f43f5e', '#ec4899'],
  ['#06b6d4', '#0ea5e9'],
]
const accent = (id: number) => ACCENTS[id % ACCENTS.length]

// ── Status badge ──────────────────────────────────────────────────────────────
function statusBadge(subscribed: boolean, deployed: boolean) {
  if (!subscribed) return { label: 'Available',   cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' }
  if (deployed)   return { label: 'Deployed',    cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' }
  return           { label: 'Subscribed',  cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800' }
}

// ── Booking % display — read-only track in table cell (edit via modal) ────────
const BOOKING_STEPS = [25, 50, 75, 100]

function BookingCell({ pct }: { pct: number }) {
  const trackFill = ((pct - 25) / 75) * 100
  return (
    <div className="flex flex-col items-center gap-1 px-1">
      {/* Step dots track */}
      <div className="relative w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-200"
          style={{ width: `${trackFill}%`, background: 'linear-gradient(90deg,#3b82f6,#6366f1)' }}
        />
        {BOOKING_STEPS.map((v, i) => (
          <span
            key={v}
            className={clsx(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full border-2',
              pct >= v ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600',
            )}
            style={{ left: `${(i / 3) * 100}%` }}
          />
        ))}
      </div>
      <span className="text-[10px] font-bold tabular-nums text-blue-600 dark:text-blue-400">
        {pct}%
      </span>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────
export function StrategyCard({ strategy, userStrategy, tabContext, onSubscribe, onEdit, onRefresh }: Props) {
  const isSubscribed  = !!userStrategy
  const isDeployed    = isSubscribed && isUserStrategyDeployed(userStrategy!)
  const isTemplateTab = tabContext === 'templates'
  const [c1, c2]      = accent(strategy.id)
  const status        = statusBadge(isSubscribed, isDeployed)

  const [acting,       setActing]       = useState(false)
  const [confirmUnsub, setConfirmUnsub] = useState(false)

  // ── Undeploy: set isEnabled=false, stays in My Strategies ───────────────
  const handleUndeploy = async () => {
    if (!userStrategy || acting) return
    setActing(true)
    try {
      const payload: EditStrategyPayload = {
        strategyName:  (userStrategy.strategyName ?? '') as string,
        brokerName:    (userStrategy.brokerName   ?? '') as string,
        isEnabled:     false,
        executionRule: userStrategy.executionRule ?? [],
      }
      await editStrategy(userStrategy.id, payload)
      setConfirmUnsub(false)
      onRefresh()
    } catch { /* TODO: toast */ }
    finally { setActing(false) }
  }

  // ── Unsubscribe: fully remove strategy ──────────────────────────────────
  const handleUnsubscribe = async () => {
    if (!userStrategy || acting) return
    const brokerName   = userStrategy.brokerName ?? ''
    const strategyCode = (userStrategy.strategyName ?? userStrategy.strategyCode ?? '') as string
    setActing(true)
    try {
      await unsubscribeStrategy(brokerName, strategyCode)
      setConfirmUnsub(false)
      onRefresh()
    } catch { /* TODO: toast */ }
    finally { setActing(false) }
  }

  // ── Indices for template cards ──────────────────────────────────────────
  const expiryDays = (() => {
    const ed = strategy.configData?.expiry_days as Record<string, string> | undefined
    if (!ed) return {} as Record<string, string[]>
    const r: Record<string, string[]> = {}
    for (const [day, idx] of Object.entries(ed)) {
      if (!r[idx]) r[idx] = []
      r[idx].push(day.slice(0, 3))
    }
    return r
  })()

  const templateIndices = (() => {
    const fromExpiry = Object.keys(expiryDays)
    if (fromExpiry.length) return fromExpiry
    return getStrategyIndices(strategy)   // handles equity + crypto + dynamic detection
  })()

  const rules            = userStrategy?.executionRule ?? []
  const hasPartialBooking = rules.some((r) => r.partialBookingRule?.partialBookingPercentage != null)

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-card-dark overflow-hidden shadow-sm hover:shadow-md dark:hover:shadow-slate-900/50 transition-shadow duration-200">

      {/* ── Gradient header ── */}
      <div className="px-4 pt-4 pb-3" style={{ background: `linear-gradient(135deg, ${c1}14, ${c2}08)` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{strategy.strategyName}</h3>
            <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">{strategy.strategyCode}</p>
          </div>
          <span className={clsx('shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap', status.cls)}>
            {status.label}
          </span>
        </div>

        {/* Broker badge (subscribed) */}
        {isSubscribed && userStrategy?.brokerName && (
          <div className="flex items-center gap-1.5 mt-2.5">
            <span className="h-5 w-5 rounded-md flex items-center justify-center text-white text-[9px] font-bold shrink-0"
              style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
              {(userStrategy.brokerName as string)[0]}
            </span>
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{userStrategy.brokerName as string}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4 flex-1">

        {/* ── Subscribed: execution table ── */}
        {isSubscribed && rules.length > 0 ? (
          <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800">
            <table className="w-full border-collapse table-fixed">
              <colgroup>
                <col style={{ width: hasPartialBooking && !isTemplateTab ? '26%' : '32%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '17%' }} />
                {hasPartialBooking && !isTemplateTab && <col style={{ width: '26%' }} />}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.03] border-b border-slate-100 dark:border-slate-800">
                  <th className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 pl-3 pr-1 py-1.5 text-left">Symbol</th>
                  <th className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 px-1 py-1.5 text-center">Lots</th>
                  <th className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 px-1 py-1.5 text-center">Type</th>
                  <th className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 px-1 py-1.5 text-center">Mode</th>
                  {hasPartialBooking && !isTemplateTab && (
                    <th className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 px-1 py-1.5 text-center">Partial Book %</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, i) => (
                  <tr key={i} className={i < rules.length - 1 ? 'border-b border-slate-50 dark:border-slate-800/60' : ''}>
                    <td className="pl-3 pr-1 py-2 text-left">
                      <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-md text-white" style={{ background: `linear-gradient(90deg, ${c1}, ${c2})` }}>
                        {rule.symbol}
                      </span>
                    </td>
                    <td className="px-1 py-2 text-center text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                      {rule.number_lots}
                    </td>
                    <td className="px-1 py-2 text-center">
                      <span className={clsx('inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
                        rule.traderType === 'BUYER'  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' :
                        rule.traderType === 'SELLER' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
                        'bg-slate-100 dark:bg-slate-700 text-slate-400')}>
                        {rule.traderType ?? '—'}
                      </span>
                    </td>
                    <td className="px-1 py-2 text-center">
                      <span className={clsx('inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
                        rule.isRealTrading ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400')}>
                        {rule.isRealTrading ? 'Live' : 'Paper'}
                      </span>
                    </td>
                    {hasPartialBooking && !isTemplateTab && (
                      <td className="px-1 py-2">
                        {rule.partialBookingRule?.partialBookingPercentage != null ? (
                          <BookingCell pct={rule.partialBookingRule.partialBookingPercentage} />
                        ) : (
                          <span className="block text-center text-[10px] text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        ) : !isSubscribed ? (
          /* ── Available: index info from configData ── */
          <>
            <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800">
              {templateIndices.map((idx, i) => (
                <div key={idx} className={clsx('flex items-center justify-between px-3 py-2', i < templateIndices.length - 1 && 'border-b border-slate-50 dark:border-slate-800/60')}>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md text-white" style={{ background: `linear-gradient(90deg, ${c1}, ${c2})` }}>{idx}</span>
                  <div className="flex gap-1">
                    {(expiryDays[idx] ?? []).map((d) => (
                      <span key={d} className="text-[10px] text-slate-400 bg-slate-100 dark:bg-white/5 dark:text-slate-500 px-1.5 py-0.5 rounded">{d}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {strategy.configData?.start_time != null && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  🕐 {String(strategy.configData.start_time).slice(0,5)} – {String(strategy.configData.end_time ?? '').slice(0,5)}
                </span>
              )}
              {strategy.configData?.marginRequired && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">Margin required</span>
              )}
            </div>
          </>
        ) : null}

        {/* ── Action buttons ── */}
        <div className="mt-auto pt-1 flex flex-col gap-2">

          {/* TEMPLATE TAB: Subscribe if available, no-op badge if already subscribed */}
          {isTemplateTab ? (
            !isSubscribed ? (
              <button
                onClick={() => onSubscribe(strategy)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 active:scale-[0.98] transition-all"
                style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
              >
                Subscribe
              </button>
            ) : (
              <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-white/[0.02]">
                {isDeployed ? 'Manage in Deployed Strategies ↗' : 'Manage in My Strategies ↗'}
              </div>
            )

          ) : (
            /* MY STRATEGIES + DEPLOYED: full action set */
            <>
              {!confirmUnsub ? (
                /* Edit + Undeploy/Unsubscribe side by side */
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(userStrategy!)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmUnsub(true)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-200 dark:hover:border-red-800 transition-all"
                  >
                    {tabContext === 'deployed' ? 'Undeploy' : 'Unsubscribe'}
                  </button>
                </div>
              ) : (
                /* Confirm dialog */
                <div className="flex gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-3 py-2.5 items-center">
                  <span className="text-xs text-red-600 dark:text-red-400 flex-1">
                    {tabContext === 'deployed' ? 'Stop this strategy?' : 'Remove this strategy?'}
                  </span>
                  <button
                    onClick={() => setConfirmUnsub(false)}
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={tabContext === 'deployed' ? handleUndeploy : handleUnsubscribe}
                    disabled={acting}
                    className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {acting ? '…' : 'Confirm'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
