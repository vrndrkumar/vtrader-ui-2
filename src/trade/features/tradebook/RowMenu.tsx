import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

export interface MenuItem { label: string; onClick: () => void; danger?: boolean; icon?: string }

/** Kebab (⋯) menu for row quick-actions. Closes on outside-click / Escape. */
export function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" title="More">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-40 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-xl animate-fade-in">
          {items.map((it) => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick() }} className={clsx('w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/5', it.danger ? 'text-red-600' : 'text-slate-600 dark:text-slate-300')}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
