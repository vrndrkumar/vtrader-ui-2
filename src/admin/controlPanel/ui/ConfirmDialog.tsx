import { useEffect } from 'react'
import { clsx } from 'clsx'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary' | 'warning'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const TONES = {
  danger:  { btn: 'bg-red-600 hover:bg-red-700', ring: 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400' },
  warning: { btn: 'bg-amber-500 hover:bg-amber-600', ring: 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  primary: { btn: 'bg-brand-600 hover:bg-brand-700', ring: 'bg-brand-100 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400' },
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', busy, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, busy, onCancel])

  if (!open) return null
  const t = TONES[tone]
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !busy && onCancel()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0e1526] border border-slate-200 dark:border-white/[0.08] shadow-2xl p-5 animate-fade-in">
        <div className="flex items-start gap-3.5">
          <span className={clsx('shrink-0 h-10 w-10 grid place-items-center rounded-xl', t.ring)}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">{title}</h3>
            <div className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{message}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} disabled={busy} className="flex-1 h-9 rounded-lg border border-slate-200 dark:border-white/10 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50">{cancelLabel}</button>
          <button onClick={onConfirm} disabled={busy} className={clsx('flex-1 h-9 rounded-lg text-[13px] font-semibold text-white shadow-sm flex items-center justify-center gap-2 disabled:opacity-60', t.btn)}>
            {busy && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6-8.49" /></svg>}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
