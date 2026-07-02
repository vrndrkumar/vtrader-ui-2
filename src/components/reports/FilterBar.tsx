import { useState } from 'react'
import { clsx } from 'clsx'
import type { TradeFilters } from '@/types/reports'

interface StrategyOption {
  groupName: string
  label: string
}

interface Props {
  filters: TradeFilters
  onChange: (f: Partial<TradeFilters>) => void
  brokerOptions: string[]
  strategyOptions: StrategyOption[]
}

const inputBase =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5 ' +
  'text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 ' +
  'focus:ring-brand-500/50 focus:border-brand-500 placeholder:text-slate-400 dark:placeholder:text-slate-500 ' +
  'transition-colors dark:[color-scheme:dark]'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
      {children}
    </label>
  )
}

// Count active filters (excluding status=ALL which is default)
function countActive(filters: TradeFilters): number {
  let c = 0
  if (filters.brokerName)   c++
  if (filters.groupName)    c++
  if (filters.status !== 'ALL') c++
  if (filters.symbolSearch) c++
  if (filters.dateFrom)     c++
  if (filters.dateTo)       c++
  return c
}

export function FilterBar({ filters, onChange, brokerOptions, strategyOptions }: Props) {
  const [expanded, setExpanded] = useState(true)
  const activeCount = countActive(filters)

  const clearAll = () => onChange({
    brokerName: '', groupName: '', status: 'ALL',
    symbolSearch: '', dateFrom: '', dateTo: '',
  })

  return (
    <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">

      {/* Filter bar toggle header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Filters</span>
          {activeCount > 0 && (
            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); clearAll() }}
              className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              Clear all
            </button>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={clsx('h-4 w-4 text-slate-400 transition-transform duration-200', expanded ? 'rotate-180' : '')}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Active filter chips */}
      {!expanded && activeCount > 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          {filters.brokerName && <Chip label={`Broker: ${filters.brokerName}`} onRemove={() => onChange({ brokerName: '' })} />}
          {filters.groupName  && <Chip label={`Strategy: ${filters.groupName}`} onRemove={() => onChange({ groupName: '' })} />}
          {filters.status !== 'ALL' && <Chip label={`Status: ${filters.status}`} onRemove={() => onChange({ status: 'ALL' })} />}
          {filters.symbolSearch && <Chip label={`Symbol: ${filters.symbolSearch}`} onRemove={() => onChange({ symbolSearch: '' })} />}
          {filters.dateFrom   && <Chip label={`From: ${filters.dateFrom}`} onRemove={() => onChange({ dateFrom: '' })} />}
          {filters.dateTo     && <Chip label={`To: ${filters.dateTo}`} onRemove={() => onChange({ dateTo: '' })} />}
        </div>
      )}

      {/* Expanded filter fields */}
      {expanded && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">

            {/* Symbol */}
            <div className="col-span-2 sm:col-span-1">
              <Label>Symbol</Label>
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  className={`${inputBase} pl-8`}
                  placeholder="NIFTY…"
                  value={filters.symbolSearch}
                  onChange={(e) => onChange({ symbolSearch: e.target.value })}
                />
              </div>
            </div>

            {/* Broker */}
            <div>
              <Label>Broker</Label>
              <select className={inputBase} value={filters.brokerName} onChange={(e) => onChange({ brokerName: e.target.value })}>
                <option value="">All brokers</option>
                {brokerOptions.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            {/* Strategy */}
            <div>
              <Label>Strategy</Label>
              <select className={inputBase} value={filters.groupName} onChange={(e) => onChange({ groupName: e.target.value })}>
                <option value="">All strategies</option>
                <option value="Manual">Manual</option>
                {strategyOptions.map((s) => (
                  <option key={s.groupName} value={s.groupName}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <Label>Status</Label>
              <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden h-[38px]">
                {(['ALL', 'OPEN', 'CLOSED'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => onChange({ status: s })}
                    className={clsx(
                      'flex-1 text-[11px] font-bold transition-colors',
                      filters.status === s
                        ? 'bg-brand-600 text-white'
                        : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/10',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Date from */}
            <div>
              <Label>From</Label>
              <input type="date" className={inputBase} value={filters.dateFrom} onChange={(e) => onChange({ dateFrom: e.target.value })} />
            </div>

            {/* Date to */}
            <div>
              <Label>To</Label>
              <input type="date" className={inputBase} value={filters.dateTo} onChange={(e) => onChange({ dateTo: e.target.value })} />
            </div>
          </div>

          {/* Active chips inside expanded */}
          {activeCount > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              {filters.brokerName && <Chip label={`Broker: ${filters.brokerName}`} onRemove={() => onChange({ brokerName: '' })} />}
              {filters.groupName  && <Chip label={`Strategy: ${filters.groupName}`} onRemove={() => onChange({ groupName: '' })} />}
              {filters.status !== 'ALL' && <Chip label={`Status: ${filters.status}`} onRemove={() => onChange({ status: 'ALL' })} />}
              {filters.symbolSearch && <Chip label={`Symbol: ${filters.symbolSearch}`} onRemove={() => onChange({ symbolSearch: '' })} />}
              {filters.dateFrom   && <Chip label={`From: ${filters.dateFrom}`} onRemove={() => onChange({ dateFrom: '' })} />}
              {filters.dateTo     && <Chip label={`To: ${filters.dateTo}`} onRemove={() => onChange({ dateTo: '' })} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-800">
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:text-brand-900 dark:hover:text-brand-200 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  )
}
