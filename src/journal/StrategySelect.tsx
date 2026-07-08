import { useStrategies } from './useStrategies'

/** Strategy/Group selector — driven by the Master Strategy Template. */
export function StrategySelect({ value, onChange, className, includeAll, includeManual = true }: {
  value: string
  onChange: (code: string) => void
  className?: string
  includeAll?: boolean
  includeManual?: boolean
}) {
  const strategies = useStrategies()
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {includeAll && <option value="">All strategies</option>}
      {includeManual && <option value="MANUAL">Manual</option>}
      {strategies.map((s) => <option key={s.strategyCode} value={s.strategyCode}>{s.strategyName}</option>)}
    </select>
  )
}
