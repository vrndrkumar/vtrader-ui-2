import { useState } from 'react'
import { clsx } from 'clsx'

// ── Read-only collapsible JSON viewer ────────────────────────────────────────
// Renders arbitrary JSON as an expandable tree with type-coloured values.
// Purely presentational — used in the detail drawer.

type Json = unknown

function valueMeta(v: Json): { text: string; cls: string } {
  if (v === null) return { text: 'null', cls: 'text-slate-400 dark:text-slate-500 italic' }
  switch (typeof v) {
    case 'string': return { text: `"${v}"`, cls: 'text-emerald-600 dark:text-emerald-400' }
    case 'number': return { text: String(v), cls: 'text-blue-600 dark:text-blue-400' }
    case 'boolean': return { text: String(v), cls: 'text-purple-600 dark:text-purple-400 font-semibold' }
    default: return { text: String(v), cls: 'text-slate-600 dark:text-slate-300' }
  }
}

function Node({ k, value, depth, defaultOpen }: { k?: string; value: Json; depth: number; defaultOpen: boolean }) {
  const isObj = value !== null && typeof value === 'object'
  const isArr = Array.isArray(value)
  const [open, setOpen] = useState(depth < 1 ? true : defaultOpen)

  if (!isObj) {
    const m = valueMeta(value)
    return (
      <div className="flex items-baseline gap-1.5 py-0.5" style={{ paddingLeft: depth * 14 }}>
        {k !== undefined && <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 font-mono">{k}:</span>}
        <span className={clsx('text-[12px] font-mono break-all', m.cls)}>{m.text}</span>
      </div>
    )
  }

  const entries = isArr ? (value as Json[]).map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, Json>)
  const count = entries.length
  const brace = isArr ? ['[', ']'] : ['{', '}']

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="group flex items-center gap-1 py-0.5 w-full text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] rounded" style={{ paddingLeft: depth * 14 }}>
        <svg viewBox="0 0 24 24" className={clsx('h-3 w-3 shrink-0 text-slate-400 transition-transform', open && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
        {k !== undefined && <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 font-mono">{k}:</span>}
        <span className="text-[12px] font-mono text-slate-400">{brace[0]}{!open && <span className="text-slate-400 dark:text-slate-500"> {count} {isArr ? 'items' : 'keys'} </span>}{!open && brace[1]}</span>
      </button>
      {open && (
        <div>
          {entries.map(([ck, cv]) => <Node key={ck} k={ck} value={cv} depth={depth + 1} defaultOpen={depth < 1} />)}
          <div className="text-[12px] font-mono text-slate-400" style={{ paddingLeft: depth * 14 + 4 }}>{brace[1]}</div>
        </div>
      )}
    </div>
  )
}

export function JsonTree({ data }: { data: Json }) {
  if (data === null || data === undefined || (typeof data === 'object' && Object.keys(data as object).length === 0)) {
    return <p className="text-[12px] text-slate-400 dark:text-slate-500 italic font-mono">empty</p>
  }
  return <div className="font-mono"><Node value={data} depth={0} defaultOpen /></div>
}
