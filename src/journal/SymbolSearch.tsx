import { useCallback, useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SymbolResult {
  symbol: string
  name: string
  type: string
  underlying: string | null
  expiry: string | null
  optionType: string | null
  strike: number | null
}

// ── API ───────────────────────────────────────────────────────────────────────

async function searchSymbols(q: string): Promise<SymbolResult[]> {
  const res = await fetch(`https://data.vtrader.in/data/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error('search failed')
  const data = await res.json()
  // Direct array
  if (Array.isArray(data)) return data
  // Wrapped envelope — try common keys
  if (data && typeof data === 'object') {
    for (const key of ['data', 'result', 'results', 'symbols', 'items', 'records']) {
      if (Array.isArray((data as Record<string, unknown>)[key])) {
        return (data as Record<string, unknown>)[key] as SymbolResult[]
      }
    }
  }
  return []
}

// ── Badge config ──────────────────────────────────────────────────────────────

const TYPE_CLS: Record<string, string> = {
  INDEX:  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  OPTION: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  FUTURE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  FUT:    'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  EQ:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  EQUITY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
}
const OPT_CLS: Record<string, string> = {
  CE: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  PE: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
}

function Badge({ label, cls }: { label: string; cls?: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide shrink-0',
      cls ?? 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400',
    )}>
      {label}
    </span>
  )
}

// ── Highlight matched text ────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-brand-100 dark:bg-brand-500/30 text-brand-700 dark:text-brand-300 not-italic rounded-sm px-px">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({ result, query, active, onMouseEnter, onMouseDown }: {
  result: SymbolResult
  query: string
  active: boolean
  onMouseEnter: () => void
  onMouseDown: (e: React.MouseEvent) => void
}) {
  const typeCls = TYPE_CLS[result.type?.toUpperCase()] ?? ''
  const optCls  = OPT_CLS[result.optionType ?? ''] ?? ''

  return (
    <li
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      className={clsx(
        'flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none transition-colors duration-75',
        active ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]',
      )}
    >
      {/* Type badge — fixed width so names align */}
      <div className="w-14 shrink-0 flex justify-end">
        <Badge label={result.type} cls={typeCls} />
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate leading-snug">
          <Highlight text={result.name} query={query} />
        </p>

        {/* Secondary metadata */}
        {(result.underlying || result.expiry || result.strike || result.optionType) && (
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {result.underlying && (
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{result.underlying}</span>
            )}
            {result.expiry && (
              <>
                <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{result.expiry}</span>
              </>
            )}
            {result.strike && (
              <>
                <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{result.strike}</span>
              </>
            )}
            {result.optionType && (
              <>
                <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                <Badge label={result.optionType} cls={optCls} />
              </>
            )}
          </div>
        )}
      </div>

      {/* Active indicator */}
      <div className="w-5 shrink-0 flex justify-center">
        {active && (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-brand-500" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </li>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface SymbolSearchProps {
  value: string
  onChange: (symbol: string) => void
  onSelect?: (result: SymbolResult) => void   // full picked result (symbol + type + name)
  placeholder?: string
  className?: string
}

export function SymbolSearch({ value, onChange, onSelect, placeholder = 'Search symbol…', className }: SymbolSearchProps) {
  // `displayText` = what's shown in the input box
  // `value` (external) = the actual symbol sent to the API
  const [displayText, setDisplayText] = useState(value)
  const [results, setResults] = useState<SymbolResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [fetchError, setFetchError] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Sync display when external value changes (e.g. reset)
  useEffect(() => { setDisplayText(value) }, [value])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced search
  const triggerSearch = useCallback((q: string) => {
    clearTimeout(timerRef.current)
    if (!q.trim()) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setFetchError(false)
    timerRef.current = setTimeout(async () => {
      try {
        const data = await searchSymbols(q)
        setResults(data)
        setOpen(true)
        setActiveIdx(-1)
      } catch {
        setFetchError(true)
        setResults([])
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 250)
  }, [])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setDisplayText(v)
    onChange(v)          // allow free-text — parent gets whatever is typed
    triggerSearch(v)
  }

  const select = (r: SymbolResult) => {
    setDisplayText(r.name)     // show human-readable name
    onChange(r.symbol)         // store the symbol identifier
    onSelect?.(r)              // hand the full result to the parent (type/name/etc.)
    setOpen(false)
    setResults([])
  }

  const clear = () => {
    setDisplayText('')
    onChange('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIdx >= 0 && results[activeIdx]) select(results[activeIdx])
        else setOpen(false)
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        inputRef.current?.blur()
        break
    }
  }

  const showDropdown = open && (results.length > 0 || fetchError || (!loading && displayText.trim()))

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      {/* ── Input ── */}
      <div className="relative group">
        {/* Search icon */}
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-brand-500 transition-colors"
          fill="none" stroke="currentColor" strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={displayText}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={clsx(
            'w-full h-9 pl-9 pr-8 rounded-lg text-sm transition-all',
            'bg-slate-50 dark:bg-white/5',
            'border border-slate-200 dark:border-slate-700',
            'focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20',
            'placeholder:text-slate-400 dark:text-slate-100',
          )}
        />

        {/* Right accessory: spinner or clear */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
          {loading ? (
            <svg className="h-4 w-4 text-slate-400 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".2" />
              <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : displayText ? (
            <button
              type="button"
              onClick={clear}
              className="text-slate-300 hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Dropdown ── */}
      {showDropdown && (
        <div className={clsx(
          'absolute left-0 right-0 z-[60] mt-1.5 overflow-hidden',
          'rounded-xl border border-slate-200 dark:border-slate-700/80',
          'bg-white dark:bg-[#0d1117]',
          'shadow-2xl shadow-black/[0.12] dark:shadow-black/50',
          'animate-fade-in',
        )}>
          {fetchError ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-red-500 font-medium">Search failed</p>
              <p className="text-xs text-slate-400 mt-1">Check your connection and try again</p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" />
              </svg>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No symbols found</p>
              <p className="text-xs text-slate-400">You can still type a symbol manually</p>
            </div>
          ) : (
            <>
              <div className="px-3 pt-2 pb-1 border-b border-slate-100 dark:border-white/[0.06]">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </p>
              </div>
              <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04]">
                {results.map((r, i) => (
                  <ResultRow
                    key={r.symbol}
                    result={r}
                    query={displayText}
                    active={i === activeIdx}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={(e) => { e.preventDefault(); select(r) }}
                  />
                ))}
              </ul>
              <div className="px-3 py-1.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center gap-3">
                <span className="text-[9px] text-slate-400">↑↓ navigate</span>
                <span className="text-[9px] text-slate-400">↵ select</span>
                <span className="text-[9px] text-slate-400">Esc close</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
