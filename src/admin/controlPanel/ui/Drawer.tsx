import { useEffect } from 'react'
import { clsx } from 'clsx'

// ── Right-side slide-over drawer ─────────────────────────────────────────────
// Reusable across control-panel modules: header (title/subtitle/close), scrollable
// body, optional sticky footer. Handles Esc + backdrop click.

interface Props {
  title: string
  subtitle?: React.ReactNode
  width?: string          // tailwind max-w-* class
  onClose: () => void
  footer?: React.ReactNode
  headerActions?: React.ReactNode
  children: React.ReactNode
}

export function Drawer({ title, subtitle, width = 'max-w-xl', onClose, footer, headerActions, children }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={clsx('relative w-full h-full bg-white dark:bg-[#0b1120] shadow-2xl flex flex-col border-l border-slate-200 dark:border-white/[0.08] animate-slide-in-right', width)}>
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 h-16 border-b border-slate-200 dark:border-white/[0.06]">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-black text-slate-900 dark:text-white truncate">{title}</h2>
            {subtitle && <p className="text-[12px] text-slate-400 dark:text-slate-500 font-mono truncate">{subtitle}</p>}
          </div>
          {headerActions}
          <button onClick={onClose} className="shrink-0 h-9 w-9 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-600 dark:hover:text-slate-300">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
        {/* Footer */}
        {footer && <div className="shrink-0 px-5 h-16 flex items-center border-t border-slate-200 dark:border-white/[0.06] bg-slate-50/60 dark:bg-white/[0.02]">{footer}</div>}
      </div>
    </div>
  )
}
