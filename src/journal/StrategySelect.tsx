import { clsx } from 'clsx'
import { useStrategies } from './useStrategies'

/** Strategy/Group selector — driven by the Master Strategy Template. */
export function StrategySelect({ value, onChange, className, includeAll, includeManual = true, disabled }: {
  value: string
  onChange: (code: string) => void
  className?: string
  includeAll?: boolean
  includeManual?: boolean
  /** When true: locked to Manual, no other options shown, HTML disabled applied. */
  disabled?: boolean
}) {
  const strategies = useStrategies()

  if (disabled) {
    return (
      <select
        value="MANUAL"
        disabled
        className={clsx(className, 'opacity-50 cursor-not-allowed')}
      >
        <option value="MANUAL">Manual</option>
      </select>
    )
  }

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {includeAll && <option value="">All strategies</option>}
      {includeManual && <option value="MANUAL">Manual</option>}
      {strategies.map((s) => <option key={s.strategyCode} value={s.strategyCode}>{s.strategyName}</option>)}
    </select>
  )
}
