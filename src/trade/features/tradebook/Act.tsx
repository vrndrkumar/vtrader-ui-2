import { clsx } from 'clsx'

type Tone = 'slate' | 'red' | 'brand' | 'green'

const TONE: Record<Tone, string> = {
  slate: 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10',
  red: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30',
  brand: 'text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30',
  green: 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30',
}

/** Compact icon action button with a built-in hover tooltip. */
export function ActBtn({ title, onClick, tone = 'slate', children }: {
  title: string; onClick: () => void; tone?: Tone; children: React.ReactNode
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={clsx('group/tip relative h-7 w-7 grid place-items-center rounded-md transition-all duration-150 active:scale-90', TONE[tone])}
    >
      <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
      <span className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded bg-slate-800 dark:bg-black text-white text-[10px] font-medium opacity-0 group-hover/tip:opacity-100 transition-opacity z-30 shadow">
        {title}
      </span>
    </button>
  )
}

/** Numeric stepper used inside inline editors. Holds a string for free typing. */
export function Stepper({ value, onChange, step = 1, autoFocus }: {
  value: string; onChange: (v: string) => void; step?: number; autoFocus?: boolean
}) {
  const n = Number(value) || 0
  const set = (x: number) => onChange(String(Math.max(0, +x.toFixed(2))))
  return (
    <div className="flex items-center h-8 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button onClick={() => set(n - step)} className="h-full w-7 grid place-items-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">−</button>
      <input
        autoFocus={autoFocus} value={value} inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        className="w-16 h-full text-center text-sm tabular-nums bg-transparent outline-none border-x border-slate-200 dark:border-slate-700"
      />
      <button onClick={() => set(n + step)} className="h-full w-7 grid place-items-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">+</button>
    </div>
  )
}

// ── Icon glyphs (single-line SVG children) ───────────────────────────────────
export const Icons = {
  add: <path d="M12 5v14M5 12h14" />,
  reduce: <path d="M5 12h14" />,
  reverse: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  power: <><path d="M12 4v8" /><path d="M6.3 6.3a8 8 0 1011.4 0" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></>,
  cancel: <path d="M6 6l12 12M18 6L6 18" />,
}

/** Inline editor row (full-width, expands under the row). */
export function InlineEditor({ colSpan, tone = 'brand', confirmLabel, onConfirm, onCancel, children }: {
  colSpan: number; tone?: 'brand' | 'red' | 'green'; confirmLabel: string
  onConfirm: () => void; onCancel: () => void; children: React.ReactNode
}) {
  const cta = { brand: 'bg-brand-600 hover:bg-brand-700', red: 'bg-red-600 hover:bg-red-700', green: 'bg-green-600 hover:bg-green-700' }[tone]
  const accent = { brand: 'border-brand-400', red: 'border-red-400', green: 'border-green-400' }[tone]
  return (
    <tr className="bg-slate-50 dark:bg-white/[0.03]">
      <td colSpan={colSpan} className={clsx('px-3 py-2 border-l-2', accent)}>
        <div
          className="flex items-center gap-3 flex-wrap animate-fade-in"
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel() }}
        >
          {children}
          <div className="flex-1" />
          <button onClick={onCancel} className="h-8 px-3 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10">Cancel</button>
          <button onClick={onConfirm} className={clsx('h-8 px-4 rounded-lg text-white text-xs font-semibold', cta)}>{confirmLabel}</button>
        </div>
      </td>
    </tr>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}

/** Row "Manage" trigger — a recognizable sliders/tune control that fills with
 *  brand colour while its action deck is open. */
export function ManageButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title="Manage — actions"
      className={clsx('h-7 w-7 grid place-items-center rounded-lg transition-all duration-150 active:scale-90',
        active
          ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
          : 'bg-slate-100 text-slate-500 hover:bg-brand-50 hover:text-brand-600 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-brand-900/30 dark:hover:text-brand-400')}
    >
      <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" />
        <line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" />
        <line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" />
        <line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" />
      </svg>
    </button>
  )
}
