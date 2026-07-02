import { useCallback, useRef, useState } from 'react'
import { clsx } from 'clsx'
import type { StrategyConfig, UserStrategy, ExecutionRule } from '@/types/strategy'
import { getStrategyIndices, STANDARD_INDICES, isUserStrategyDeployed } from '@/types/strategy'
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

// ── Partial booking slider ────────────────────────────────────────────────────
function BookingSlider({ rules, userStrategy, onRefresh }: {
  rules: ExecutionRule[]
  userStrategy: UserStrategy
  onRefresh: () => void
}) {
  const initial   = rules[0]?.partialBookingRule?.partialBookingPercentage ?? 100
  const [pct, setPct]       = useState(initial)
  const [saving, setSaving] = useState(false)
  const timer               = useRef<ReturnType<typeof setTimeout>>()

  const handleChange = useCallback((val: number) => {
    setPct(val)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSaving(true)
      try {
        const updatedRules = rules.map((r) => ({
          ...r,
          partialBookingRule: { ...r.partialBookingRule, partialBookingPercentage: val },
        }))
        await editStrategy({ ...userStrategy, executionRule: updatedRules })
        onRefresh()
      } catch {
        setPct(initial)
      } finally {
        setSaving(false)
      }
    }, 600)
  }, [rules, userStrategy, initial, onRefresh])

  const trackPct = ((pct - 25) / 75) * 100

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Partial Booking</span>
        <span className={clsx('text-[11px] font-bold tabular-nums', saving ? 'text-slate-400' : 'text-slate-800 dark:text-slate-100')}>
          {saving ? '…' : `${pct}%`}
        </span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-150" style={{ width: `${trackPct}%`, background: 'linear-gradient(90deg,#3b82f6,#6366f1)' }} />
        </div>
        <input
          type="range" min={25} max={100} step={25} value={pct}
          onChange={(e) => handleChange(Number(e.target.value))}
          className="absolute inset-x-0 w-full opacity-0 cursor-pointer h-5"
        />
        <div className="absolute inset-x-0 flex justify-between pointer-events-none">
          {[25, 50, 75, 100].map((v) => (
            <div key={v} className={clsx('w-2 h-2 rounded-full border-2', pct >= v ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600')} />
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        {[25, 50, 75, 100].map((v) => (
          <span key={v} className={clsx('text-[9px] tabular-nums', pct === v ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-600')}>{v}%</span>
        ))}
      </div>
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
      await editStrategy({ ...userStrategy, isEnabled: false })
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
    const keys  = Object.keys(strategy.configData ?? {})
    const found = STANDARD_INDICES.filter((i) => keys.includes(i))
    return found.length ? found : getStrategyIndices(strategy)
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
          <>
            <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800">
              <div className="grid grid-cols-[1fr_36px_64px_52px] bg-slate-50 dark:bg-white/[0.03] px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                {['Symbol', 'Lots', 'Type', 'Mode'].map((h) => (
                  <span key={h} className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">{h}</span>
                ))}
              </div>
              {rules.map((rule, i) => (
                <div key={i} className={clsx('grid grid-cols-[1fr_36px_64px_52px] items-center px-3 py-2.5 gap-1', i < rules.length - 1 && 'border-b border-slate-50 dark:border-slate-800/60')}>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md text-white w-fit" style={{ background: `linear-gradient(90deg, ${c1}, ${c2})` }}>
                    {rule.symbol}
                  </span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">{rule.number_lots}</span>
                  <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-md w-fit',
                    rule.traderType === 'BUYER'  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' :
                    rule.traderType === 'SELLER' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
                    'bg-slate-100 dark:bg-slate-700 text-slate-400')}>
                    {rule.traderType ?? '—'}
                  </span>
                  <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-md w-fit',
                    rule.isRealTrading ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400')}>
                    {rule.isRealTrading ? 'Live' : 'Paper'}
                  </span>
                </div>
              ))}
            </div>

            {/* Partial booking slider — visible on My Strategies + Deployed, NOT templates */}
            {hasPartialBooking && !isTemplateTab && (
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2.5 bg-slate-50 dark:bg-white/[0.02]">
                <BookingSlider rules={rules} userStrategy={userStrategy!} onRefresh={onRefresh} />
              </div>
            )}
          </>

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
              {/* Edit */}
              <button
                onClick={() => onEdit(userStrategy!)}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                Edit
              </button>

              {/* Undeploy / Unsubscribe — different APIs, label + action by tab */}
              {!confirmUnsub ? (
                <button
                  onClick={() => setConfirmUnsub(true)}
                  className="w-full py-2 rounded-xl text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 border border-transparent hover:border-red-100 dark:hover:border-red-900/30 transition-all"
                >
                  {tabContext === 'deployed' ? 'Undeploy' : 'Unsubscribe'}
                </button>
              ) : (
                <div className="flex gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-3 py-2.5 items-center">
                  <span className="text-xs text-red-600 dark:text-red-400 flex-1">
                    {tabContext === 'deployed' ? 'Stop running this strategy?' : 'Remove this strategy?'}
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
