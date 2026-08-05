// ── TagCombobox ─────────────────────────────────────────────────────────────
// Inline token input: chips + text input live together inside one container.
// Dropdown appears below with server-tag suggestions + create-new option.

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import type { UserTag } from '@/api/tags'

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const FALLBACK_PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6',
]
export function tagFallbackColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length]
}

// ── TagChip ───────────────────────────────────────────────────────────────────

export function TagChip({ name, color, onRemove, size = 'md' }: {
  name: string
  color?: string
  onRemove?: () => void
  size?: 'sm' | 'md'
}) {
  const c = color ?? tagFallbackColor(name)
  const px = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap leading-none ${px}`}
      style={{ background: hexToRgba(c, 0.12), color: c, border: `1px solid ${hexToRgba(c, 0.28)}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c }} />
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 leading-none opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: c }}
        >
          <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </span>
  )
}

// ── TagCombobox ───────────────────────────────────────────────────────────────

interface Props {
  value: string[]
  onChange: (names: string[]) => void
  allTags: UserTag[]
  placeholder?: string
  className?: string
  /** Render with dark-panel styles (white/5 bg, slate borders) instead of the default light card style */
  dark?: boolean
}

export function TagCombobox({ value, onChange, allTags, placeholder = 'Add tags…', className, dark }: Props) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIdx(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const colorOf = (name: string) =>
    allTags.find((t) => t.name === name)?.metadata.colorCode ?? tagFallbackColor(name)

  const filtered = allTags.filter(
    (t) => t.name.toLowerCase().includes(input.toLowerCase()) && !value.includes(t.name),
  )
  const showCreate =
    input.trim() !== '' &&
    !allTags.some((t) => t.name.toLowerCase() === input.trim().toLowerCase()) &&
    !value.includes(input.trim())
  const totalItems = filtered.length + (showCreate ? 1 : 0)

  const add = (name: string) => {
    const n = name.trim()
    if (n && !value.includes(n)) onChange([...value, n])
    setInput('')
    setOpen(filtered.length + (showCreate ? 1 : 0) > 1)
    setActiveIdx(-1)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const remove = (name: string) => onChange(value.filter((n) => n !== name))

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setOpen(true)
      setActiveIdx((i) => Math.min(i + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && activeIdx < filtered.length) add(filtered[activeIdx].name)
      else if (activeIdx === filtered.length && showCreate) add(input.trim())
      else if (input.trim()) add(input.trim())
    } else if (e.key === 'Escape') {
      setOpen(false); setActiveIdx(-1)
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      remove(value[value.length - 1])
    }
  }

  return (
    <div ref={rootRef} className={className}>
      {/* ── Token container — chips + input inline ── */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={clsx(
          'flex flex-wrap items-center gap-1.5 min-h-[42px] px-3 py-2 rounded-xl cursor-text transition-colors',
          dark
            ? 'border border-slate-700 bg-white/5 focus-within:border-brand-500'
            : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5 focus-within:border-brand-400 dark:focus-within:border-brand-500',
        )}
      >
        {value.map((name) => (
          <TagChip key={name} name={name} color={colorOf(name)} onRemove={() => remove(name)} />
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); setActiveIdx(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={value.length ? '' : placeholder}
          autoComplete="off"
          spellCheck={false}
          className={clsx('flex-1 min-w-[100px] bg-transparent outline-none text-sm placeholder:text-slate-400', dark ? 'text-slate-200' : 'text-slate-700 dark:text-slate-200')}
        />
      </div>

      {/* ── Suggestions dropdown ── */}
      {open && totalItems > 0 && (
        <div className="relative z-50">
          <div className="absolute left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">

            {filtered.length > 0 && (
              <>
                <p className="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Your tags</p>
                {filtered.map((tag, i) => (
                  <button
                    key={tag.name}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); add(tag.name) }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i === activeIdx ? 'bg-slate-50 dark:bg-white/[0.08]' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: tag.metadata.colorCode }} />
                    <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 truncate">{tag.name}</span>
                    {i === activeIdx && (
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </>
            )}

            {showCreate && (
              <>
                {filtered.length > 0 && <div className="h-px bg-slate-100 dark:bg-slate-700/50 mx-3 my-0.5" />}
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); add(input.trim()) }}
                  onMouseEnter={() => setActiveIdx(filtered.length)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 mb-0.5 text-left transition-colors ${activeIdx === filtered.length ? 'bg-slate-50 dark:bg-white/[0.08]' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                >
                  <span className="h-5 w-5 rounded-md bg-brand-100 dark:bg-brand-900/40 grid place-items-center shrink-0">
                    <svg viewBox="0 0 24 24" className="h-3 w-3 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Create <span className="font-semibold text-slate-800 dark:text-slate-100">"{input.trim()}"</span>
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
