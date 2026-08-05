import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useJournalEntry, useJournalStore, type ReviewStatus } from './journalStore'
import { REVIEW_META } from './utils'

const REVIEWS: ReviewStatus[] = ['NEW', 'REVIEWED', 'FLAGGED']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</p>
      {children}
    </div>
  )
}

function TextArea({ value, onCommit, placeholder, rows = 3 }: { value: string; onCommit: (v: string) => void; placeholder: string; rows?: number }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <textarea
      value={v} rows={rows} placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v) }}
      className="w-full rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400 resize-y text-slate-700 dark:text-slate-200"
    />
  )
}

/** The diary. Sections are a registry — add one to extend (emotions/checklist/…). */
export function JournalMeta({ tradeId }: { tradeId: string }) {
  const entry = useJournalEntry(tradeId)
  const update = useJournalStore((s) => s.update)
  const setMeta = useJournalStore((s) => s.setMeta)

  const sections: { id: string; title: string; node: React.ReactNode }[] = [
    {
      id: 'review', title: 'Review',
      node: (
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-white/5">
            {REVIEWS.map((r) => (
              <button key={r} onClick={() => update(tradeId, { reviewStatus: r })} className={clsx('px-2.5 py-1 rounded-md text-xs font-medium', entry.reviewStatus === r ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500')}>{REVIEW_META[r].label}</button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => update(tradeId, { rating: entry.rating === n ? 0 : n })} title={`${n} star`}>
                <svg viewBox="0 0 24 24" className={clsx('h-4 w-4', n <= entry.rating ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600')} fill={n <= entry.rating ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6"><path d="M12 3l2.6 5.6 6.1.6-4.6 4 1.4 6-5.5-3.3L6 19.8l1.4-6L2.8 9.8l6.1-.6z" /></svg>
              </button>
            ))}
          </div>
        </div>
      ),
    },
    { id: 'notes', title: 'Notes', node: <TextArea value={entry.notes} onCommit={(v) => update(tradeId, { notes: v })} placeholder="What was the plan, entry reason, how it played out…" rows={4} /> },
    { id: 'lessons', title: 'Lessons learned', node: <TextArea value={entry.meta.lessons ?? ''} onCommit={(v) => setMeta(tradeId, 'lessons', v)} placeholder="What worked? What will you repeat?" /> },
    { id: 'mistakes', title: 'Mistakes', node: <TextArea value={entry.meta.mistakes ?? ''} onCommit={(v) => setMeta(tradeId, 'mistakes', v)} placeholder="What went wrong? What to avoid next time?" /> },
  ]

  return (
    <div>
      {sections.map((s) => <Section key={s.id} title={s.title}>{s.node}</Section>)}
      <p className="mt-3 text-[10px] text-slate-400">Journal notes are saved on this device until the journal API is connected.</p>
    </div>
  )
}
