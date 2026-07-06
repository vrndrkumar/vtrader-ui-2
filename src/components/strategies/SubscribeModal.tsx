import { useEffect, useMemo, useRef, useState } from 'react'
import { getUserBrokers } from '@/api/broker'
import { subscribeStrategy, editStrategy } from '@/api/strategy'
import { getIndexMaster } from '@/services/indexMasterCache'
import { parseLot } from '@/types/indexMaster'
import type { IndexMaster } from '@/types/indexMaster'
import type { UserBroker } from '@/types/broker'
import type { StrategyConfig, UserStrategy, IndexLots, ExecutionRule } from '@/types/strategy'
import { getStrategyIndices } from '@/types/strategy'
import { clsx } from 'clsx'

interface Props {
  strategy: StrategyConfig
  existing?: UserStrategy
  onClose: () => void
  onSuccess: () => void
}

// ── Lot count stepper — value = number of lots, min 0 ──────────────────────
function LotCountInput({
  label,
  lotSize,
  value,
  onChange,
}: {
  label: string
  lotSize: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
        {label}
      </span>

      <div className="flex items-stretch w-full rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          className="px-2.5 py-2 bg-slate-50 dark:bg-white/5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border-r border-slate-200 dark:border-slate-700 text-sm font-bold select-none transition-colors"
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            if (!isNaN(n) && n >= 0) onChange(n)
          }}
          className="flex-1 text-center text-sm font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-white/5 focus:outline-none py-2 w-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="px-2.5 py-2 bg-slate-50 dark:bg-white/5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 border-l border-slate-200 dark:border-slate-700 text-sm font-bold select-none transition-colors"
        >
          +
        </button>
      </div>

      {/* Show: X lots · qty Y  where Y = lots × lotSize */}
      <span className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
        {value} lot{value !== 1 ? 's' : ''} · qty {value * lotSize}
      </span>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function SubscribeModal({ strategy, existing, onClose, onSuccess }: Props) {
  const isEdit = !!existing

  // When editing, derive indices from the saved executionRule; otherwise from configData
  const indices = isEdit && existing?.executionRule?.length
    ? existing.executionRule.map((r) => r.symbol)
    : getStrategyIndices(strategy)

  const [brokers, setBrokers]         = useState<UserBroker[]>([])
  const [indexMaster, setIndexMaster] = useState<IndexMaster[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // lot COUNT per index (not qty) — 0 means opt-out
  // When editing: initialise from existing executionRule (number_lots per symbol)
  const [lots, setLots] = useState<IndexLots>(() => {
    const init: IndexLots = {}
    indices.forEach((idx) => {
      const rule = existing?.executionRule?.find((r) => r.symbol === idx)
      init[idx] = rule?.number_lots ?? existing?.lots?.[idx] ?? 1
    })
    return init
  })

  // multi-broker: array of selected brokerName strings
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>(
    existing?.brokerName ? [existing.brokerName] : [],
  )
  const [brokerOpen, setBrokerOpen] = useState(false)
  const brokerRef = useRef<HTMLDivElement>(null)

  // marginBenefitRequired lives inside executionRule; read from first rule when editing
  const [marginRequired, setMarginRequired] = useState(
    existing?.executionRule?.[0]?.marginBenefitRequired
      ?? existing?.marginRequired
      ?? (strategy.configData?.marginRequired ?? false),
  )

  // partialBookingPercentage per index — editable, discrete steps 25/50/75/100
  const [partialBooking, setPartialBooking] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    indices.forEach((idx) => {
      const rule = existing?.executionRule?.find((r) => r.symbol === idx)
      init[idx] = rule?.partialBookingRule?.partialBookingPercentage ?? 100
    })
    return init
  })
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  useEffect(() => {
    Promise.allSettled([getUserBrokers(), getIndexMaster()]).then(([b, im]) => {
      if (b.status === 'fulfilled') setBrokers(b.value)
      if (im.status === 'fulfilled') setIndexMaster(im.value)
      setDataLoading(false)
    })
  }, [])

  // Close broker dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (brokerRef.current && !brokerRef.current.contains(e.target as Node)) {
        setBrokerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Build lot-size lookup from index master — handles camelCase API + string lot
  const lotSizeMap = useMemo(() => {
    const map: Record<string, number> = {}
    indexMaster.forEach((im) => {
      // API returns symbolCode (camelCase); also fall back to symbol_code / symbol_name
      const key = (im.symbolCode ?? im.symbol_code ?? im.symbolName ?? im.symbol_name ?? '').toUpperCase()
      if (key) map[key] = parseLot(im.lot)
    })
    return map
  }, [indexMaster])

  const lotSizeFor = (idx: string) => lotSizeMap[idx.toUpperCase()] ?? 1

  const toggleBroker = (name: string) =>
    setSelectedBrokers((prev) =>
      prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name],
    )

  // Dropdown label
  const brokerLabel = selectedBrokers.length === 0
    ? 'Select broker'
    : selectedBrokers.length === 1
    ? (() => {
        const b = brokers.find((x) => x.brokerName === selectedBrokers[0])
        return b ? `${b.brokerName}${b.brokerInfo?.userId ? ` (${b.brokerInfo.userId})` : ''}` : selectedBrokers[0]
      })()
    : `${selectedBrokers.length} brokers selected`

  const canSubmit = selectedBrokers.length > 0 && termsAccepted && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      await Promise.all(
        selectedBrokers.map((brokerName) => {
          if (isEdit && existing) {
            // Build updated executionRule: merge new lot counts + marginBenefitRequired into existing rules
            const updatedRules: ExecutionRule[] = indices.map((idx) => {
              const existingRule = existing.executionRule?.find((r) => r.symbol === idx)
              return {
                symbol:               idx,
                number_lots:          lots[idx] ?? existingRule?.number_lots ?? 1,
                marginBenefitRequired: marginRequired,
                active:               existingRule?.active               ?? true,
                isRealTrading:        existingRule?.isRealTrading         ?? false,
                traderType:           existingRule?.traderType            ?? 'SELLER',
                lotChangeOnSL:        existingRule?.lotChangeOnSL         ?? { active: false, lotChangeQty: 1 },
                partialBookingRule:   { partialBookingPercentage: partialBooking[idx] ?? 100 },
              }
            })
            return editStrategy(existing.id, {
              strategyName:  (existing.strategyName ?? strategy.strategyCode) as string,
              brokerName,
              isEnabled:     existing.isEnabled,
              executionRule: updatedRules,
            })
          } else {
            // Build fresh executionRule for new subscription
            const executionRule: ExecutionRule[] = indices.map((idx) => ({
              symbol:               idx,
              number_lots:          lots[idx] ?? 1,
              marginBenefitRequired: marginRequired,
              active:               true,
              isRealTrading:        false,
              traderType:           'SELLER',
              lotChangeOnSL:        { active: false, lotChangeQty: 1 },
              partialBookingRule:   { partialBookingPercentage: partialBooking[idx] ?? 100 },
            }))
            return subscribeStrategy({
              strategyName:  strategy.strategyCode,
              brokerName,
              executionRule,
            })
          }
        }),
      )
      onSuccess()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isEdit ? 'Edit' : 'Deploy'}&nbsp;&nbsp;{strategy.strategyName}
            </h2>
            <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
              {strategy.strategyCode}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ── Lots per index ── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Lots per index
            </p>
            {dataLoading ? (
              <div className="flex justify-center py-6">
                <svg className="animate-spin h-5 w-5 text-brand-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : (
              <div className={clsx(
                'grid gap-4',
                indices.length <= 2 ? 'grid-cols-2' :
                indices.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' :
                'grid-cols-2 sm:grid-cols-3',
              )}>
                {indices.map((idx) => (
                  <LotCountInput
                    key={idx}
                    label={idx}
                    lotSize={lotSizeFor(idx)}
                    value={lots[idx] ?? 1}
                    onChange={(v) => setLots((prev) => ({ ...prev, [idx]: v }))}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Partial Booking % per index ── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Partial Booking %
            </p>
            <div className="space-y-3">
              {indices.map((idx) => {
                const pct = partialBooking[idx] ?? 100
                const trackPct = ((pct - 25) / 75) * 100
                return (
                  <div key={idx} className="bg-slate-50 dark:bg-white/[0.03] rounded-xl px-3 py-2.5 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{idx}</span>
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 tabular-nums">{pct}%</span>
                    </div>
                    {/* Segmented selector 25 / 50 / 75 / 100 */}
                    <div className="flex gap-1">
                      {[25, 50, 75, 100].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPartialBooking((prev) => ({ ...prev, [idx]: v }))}
                          className={clsx(
                            'flex-1 py-1 rounded-lg text-[10px] font-semibold transition-colors',
                            pct === v
                              ? 'bg-blue-500 text-white'
                              : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-500',
                          )}
                        >
                          {v}%
                        </button>
                      ))}
                    </div>
                    {/* Visual track */}
                    <div className="mt-2 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-200" style={{ width: `${trackPct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Broker Name (dropdown with multi-select checkboxes) ── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Broker Name
            </p>
            <div className="relative" ref={brokerRef}>
              <button
                type="button"
                onClick={() => setBrokerOpen((o) => !o)}
                disabled={dataLoading}
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors bg-white dark:bg-white/5',
                  brokerOpen
                    ? 'border-brand-500 ring-1 ring-brand-500'
                    : 'border-slate-200 dark:border-slate-700',
                  selectedBrokers.length === 0
                    ? 'text-slate-400 dark:text-slate-500'
                    : 'text-slate-900 dark:text-white',
                )}
              >
                <span>{dataLoading ? 'Loading brokers…' : brokerLabel}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className={clsx('h-4 w-4 text-slate-400 transition-transform shrink-0', brokerOpen && 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {brokerOpen && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                  {brokers.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">
                      No brokers connected. Add one first.
                    </p>
                  ) : (
                    brokers.map((b) => {
                      const checked = selectedBrokers.includes(b.brokerName)
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleBroker(b.brokerName)}
                          className={clsx(
                            'flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors',
                            checked
                              ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5',
                          )}
                        >
                          {/* Checkbox */}
                          <span className={clsx(
                            'h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors',
                            checked ? 'bg-brand-600 border-brand-600' : 'border-slate-300 dark:border-slate-600',
                          )}>
                            {checked && (
                              <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                                <path d="M1.5 5.5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <span className="font-medium">{b.brokerName}</span>
                          {b.brokerInfo?.userId && (
                            <span className="text-slate-400 dark:text-slate-500 text-xs">
                              ({b.brokerInfo.userId})
                            </span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Margin required — label LEFT, toggle RIGHT ── */}
          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-slate-800">
            {/* Text on the LEFT */}
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white leading-tight">
                Margin Required
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Enable if strategy needs margin funding
              </p>
            </div>
            {/* Toggle on the RIGHT — left-0.5 anchors the thumb so translate works correctly */}
            <button
              type="button"
              onClick={() => setMarginRequired((v) => !v)}
              className={clsx(
                'relative shrink-0 h-6 w-11 rounded-full transition-colors duration-200',
                marginRequired ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600',
              )}
            >
              <span className={clsx(
                'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
                marginRequired ? 'translate-x-5' : 'translate-x-0',
              )} />
            </button>
          </div>

          {/* ── Terms ── */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <span className={clsx(
              'mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors',
              termsAccepted
                ? 'bg-brand-600 border-brand-600'
                : 'border-slate-300 dark:border-slate-600 group-hover:border-brand-400',
            )}>
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="sr-only" />
              {termsAccepted && (
                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5.5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              I accept all the{' '}
              <a href="#" className="text-brand-600 dark:text-brand-400 underline underline-offset-2 hover:text-brand-700">
                terms &amp; conditions
              </a>
            </span>
          </label>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={clsx(
                'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors',
                canSubmit
                  ? 'bg-brand-600 hover:bg-brand-700'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed',
              )}
            >
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Deploy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
