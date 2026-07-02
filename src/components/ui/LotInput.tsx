interface LotInputProps {
  label: string
  lotSize: number
  value: number
  onChange: (value: number) => void
}

export function LotInput({ label, lotSize, value, onChange }: LotInputProps) {
  const lots = Math.max(1, Math.round(value / lotSize))

  const decrement = () => onChange(Math.max(lotSize, (lots - 1) * lotSize))
  const increment = () => onChange((lots + 1) * lotSize)

  const handleChange = (raw: string) => {
    const n = Number(raw)
    if (!isNaN(n) && n > 0) onChange(n)
  }

  const handleBlur = (raw: string) => {
    const n = Number(raw)
    if (!isNaN(n) && n > 0) {
      // snap to nearest multiple of lotSize
      onChange(Math.max(lotSize, Math.round(n / lotSize) * lotSize))
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Symbol label */}
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
        {label}
      </span>

      {/* +/- input */}
      <div className="flex items-stretch w-full rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        <button
          type="button"
          onClick={decrement}
          disabled={lots <= 1}
          className="px-2.5 py-2 bg-slate-50 dark:bg-white/5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border-r border-slate-200 dark:border-slate-700 text-sm font-bold select-none transition-colors"
        >
          −
        </button>

        <input
          type="number"
          value={value || ''}
          min={lotSize}
          step={lotSize}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={(e) => handleBlur(e.target.value)}
          className="flex-1 text-center text-sm font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-white/5 focus:outline-none py-2 w-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />

        <button
          type="button"
          onClick={increment}
          className="px-2.5 py-2 bg-slate-50 dark:bg-white/5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 border-l border-slate-200 dark:border-slate-700 text-sm font-bold select-none transition-colors"
        >
          +
        </button>
      </div>

      {/* Lot size hint */}
      <span className="text-[10px] text-slate-400 dark:text-slate-500">
        {lots} lot{lots !== 1 ? 's' : ''} · size {lotSize}
      </span>
    </div>
  )
}
