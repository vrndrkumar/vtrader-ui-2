import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useStrategies, useKnownGroups } from './useStrategies'

// ── StrategySelect (filter dropdown — unchanged) ──────────────────────────────

/** Strategy/Group selector — driven by the Master Strategy Template.
 *  Used only for the JournalFilters bar (dropdown, not free-text). */
export function StrategySelect({ value, onChange, className, includeAll, includeManual = true, disabled }: {
  value: string
  onChange: (code: string) => void
  className?: string
  includeAll?: boolean
  includeManual?: boolean
  disabled?: boolean
}) {
  const strategies = useStrategies()

  if (disabled) {
    return (
      <select value="MANUAL" disabled className={clsx(className, 'opacity-50 cursor-not-allowed')}>
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

// ── GroupsFilterSelect (filter bar — shows distinct groups from user's trades) ─

/** Dropdown showing all distinct group names seen from the user's actual trades.
 *  Used in the JournalFilters bar to replace the template-only StrategySelect. */
export function GroupsFilterSelect({ value, onChange, className }: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const knownGroups = useKnownGroups()
  const strategies = useStrategies()

  /** Friendly label: template name if known, else raw code */
  const labelOf = (code: string) => {
    if (!code || code.toUpperCase() === 'MANUAL') return 'Manual'
    return strategies.find((s) => s.strategyCode === code)?.strategyName ?? code
  }

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">All strategies</option>
      {knownGroups.map((g) => (
        <option key={g} value={g}>{labelOf(g)}</option>
      ))}
    </select>
  )
}

// ── GroupCombobox (free-text + suggestions — used in edit modals & drawer) ────

interface SugItem {
  code: string
  label: string
  kind: 'template' | 'custom' | 'manual'
}

/**
 * Free-text input with autocomplete suggestions for strategy / group.
 *
 * • Calls onChange on EVERY keystroke so parent state is always current.
 *   (Fixes the timing issue where clicking Apply before blur sent stale value.)
 * • On blur / Enter: resolves typed label → template code if an exact match is found.
 * • Suggestions:
 *     1. "Manual" built-in
 *     2. Strategy templates from /strategy/config-data
 *     3. Custom group names the user has used in past trades (from registerKnownGroups)
 * • "Use as new group" hint when the user types something with no match.
 */
export function GroupCombobox({
  value,
  onChange,
  className,
  disabled,
  placeholder = 'Type or select…',
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  disabled?: boolean
  placeholder?: string
}) {
  const strategies = useStrategies()
  const knownGroups = useKnownGroups()

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Prevents the value-sync useEffect from overwriting input while user types
  const isTypingRef = useRef(false)

  /** Resolve a code to its human display label. */
  const toDisplay = useCallback(
    (code: string): string => {
      if (!code || code.toUpperCase() === 'MANUAL') return 'Manual'
      const t = strategies.find((s) => s.strategyCode === code)
      return t ? t.strategyName : code
    },
    [strategies],
  )

  const [inputVal, setInputVal] = useState(() => toDisplay(value))
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)

  // Sync display when external value changes (e.g. drawer opens with a different trade).
  // Skip while user is actively typing to avoid overwriting mid-input.
  useEffect(() => {
    if (!isTypingRef.current) {
      setInputVal(toDisplay(value))
    }
  }, [value, toDisplay])

  // ── Suggestions ─────────────────────────────────────────────────────────────
  const allSuggestions = useMemo((): SugItem[] => {
    const items: SugItem[] = [{ code: 'MANUAL', label: 'Manual', kind: 'manual' }]
    for (const s of strategies) {
      items.push({ code: s.strategyCode, label: s.strategyName, kind: 'template' })
    }
    const templateCodes = new Set(strategies.map((s) => s.strategyCode))
    for (const g of knownGroups) {
      if (g && g !== 'MANUAL' && !templateCodes.has(g)) {
        items.push({ code: g, label: g, kind: 'custom' })
      }
    }
    return items
  }, [strategies, knownGroups])

  const filtered = useMemo((): SugItem[] => {
    const q = inputVal.trim().toLowerCase()
    if (!q) return allSuggestions
    return allSuggestions.filter(
      (s) => s.label.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    )
  }, [allSuggestions, inputVal])

  // ── Click-outside ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  // ── Commit (blur / Enter) ─────────────────────────────────────────────────
  // Resolves the typed display label to a template code if there's an exact match.
  // Parent already has the raw typed string from the onChange-on-keystroke calls;
  // this corrects it to the canonical code when possible.
  const commit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) {
        onChange('MANUAL')
        setInputVal('Manual')
        return
      }
      const match = allSuggestions.find(
        (s) =>
          s.label.toLowerCase() === trimmed.toLowerCase() ||
          s.code.toLowerCase() === trimmed.toLowerCase(),
      )
      if (match) {
        setInputVal(match.label)
        onChange(match.code)
      }
      // No match → custom group. Parent already has `trimmed` from keystroke onChange.
    },
    [allSuggestions, onChange],
  )

  // ── Event handlers ───────────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isTypingRef.current = true
    const newVal = e.target.value
    setInputVal(newVal)
    onChange(newVal)   // ← immediate propagation: fixes Apply-button timing issue
    setOpen(true)
    setActiveIdx(-1)
  }

  const handleFocus = () => {
    isTypingRef.current = true
    setOpen(true)
    setActiveIdx(-1)
  }

  const handleSelect = (item: SugItem) => {
    isTypingRef.current = false
    setInputVal(item.label)
    onChange(item.code)
    setOpen(false)
    setActiveIdx(-1)
  }

  const handleBlur = () => {
    isTypingRef.current = false
    setTimeout(() => {
      if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
        commit(inputVal)
        setOpen(false)
      }
    }, 160)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setOpen(true)
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && filtered[activeIdx]) {
        handleSelect(filtered[activeIdx])
      } else {
        commit(inputVal)
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      isTypingRef.current = false
      setInputVal(toDisplay(value))
      onChange(value)  // revert parent too
      setOpen(false)
      setActiveIdx(-1)
    }
  }

  // ── Disabled state ────────────────────────────────────────────────────────
  if (disabled) {
    return (
      <input value="Manual" disabled readOnly className={clsx(className, 'opacity-50 cursor-not-allowed')} />
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const showDropdown = open && filtered.length > 0
  const isNew =
    inputVal.trim() !== '' &&
    !allSuggestions.some(
      (s) =>
        s.label.toLowerCase() === inputVal.trim().toLowerCase() ||
        s.code.toLowerCase() === inputVal.trim().toLowerCase(),
    )

  const templateItems = filtered.filter((s) => s.kind === 'template' || s.kind === 'manual')
  const customItems   = filtered.filter((s) => s.kind === 'custom')

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        value={inputVal}
        placeholder={placeholder}
        onFocus={handleFocus}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
        className={className}
      />

      {showDropdown && (
        <div
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl"
          style={{ top: '100%' }}
        >
          {/* Strategy Templates section */}
          {templateItems.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Strategy Templates
                </span>
              </div>
              {templateItems.map((item) => {
                const idx = filtered.indexOf(item)
                return (
                  <button
                    key={item.code}
                    type="button"
                    data-idx={idx}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(item) }}
                    className={clsx(
                      'w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors',
                      idx === activeIdx
                        ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200',
                    )}
                  >
                    <span className="text-sm font-medium truncate">{item.label}</span>
                    {item.kind === 'template' && (
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                        {item.code}
                      </span>
                    )}
                  </button>
                )
              })}
            </>
          )}

          {/* Custom groups section */}
          {customItems.length > 0 && (
            <>
              <div className={clsx('border-t border-slate-100 dark:border-slate-700/60 mx-2', templateItems.length > 0 && 'mt-1')} />
              <div className="px-3 pt-1.5 pb-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Your Groups
                </span>
              </div>
              {customItems.map((item) => {
                const idx = filtered.indexOf(item)
                return (
                  <button
                    key={item.code}
                    type="button"
                    data-idx={idx}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(item) }}
                    className={clsx(
                      'w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors',
                      idx === activeIdx
                        ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200',
                    )}
                  >
                    <span className="text-sm truncate">{item.label}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">custom</span>
                  </button>
                )
              })}
            </>
          )}

          {/* "Use as new group" row for truly new text */}
          {isNew && (
            <>
              <div className="border-t border-slate-100 dark:border-slate-700/60 mx-2 mt-1" />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  isTypingRef.current = false
                  onChange(inputVal.trim())
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors mb-1"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Use{' '}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    "{inputVal.trim()}"
                  </span>{' '}
                  as new group
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
