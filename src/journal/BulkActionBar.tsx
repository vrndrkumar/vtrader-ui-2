// ── BulkActionBar ──────────────────────────────────────────────────────────────
// Floating dark pill that appears when ≥1 trade is selected.
// Strategy panel: GroupCombobox → apply to all selected trades' orders.
// Tags panel: TagCombobox (inline token input) + Add / Replace mode.

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { getTradeOrders, setOrdersGroup } from '@/api/reports'
import { updateTradeTags } from '@/api/tags'
import type { Trade } from '@/types/reports'
import type { UserTag } from '@/api/tags'
import { TagCombobox } from './TagCombobox'
import { GroupCombobox } from './StrategySelect'

type Status = 'idle' | 'loading' | 'done' | 'error'
type TagMode = 'add' | 'replace'

interface Props {
  count: number
  trades: Trade[]           // the selected trade objects
  allTags: UserTag[]
  onClear: () => void
  onDone: () => void        // trigger parent refetch after applying
}

function ApplyButton({ status, count, onClick }: { status: Status; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={status === 'loading' || status === 'done'}
      className="mt-3 w-full h-9 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
      style={{ background: '#f59e0b', color: '#fff' }}
    >
      {status === 'loading' && (
        <>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6-8.49" />
          </svg>
          Applying…
        </>
      )}
      {status === 'done' && (
        <>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Done!
        </>
      )}
      {(status === 'idle' || status === 'error') && `Apply to ${count} trade${count !== 1 ? 's' : ''}`}
    </button>
  )
}

export function BulkActionBar({ count, trades, allTags, onClear, onDone }: Props) {
  const [panel, setPanel] = useState<'none' | 'strategy' | 'tags'>('none')

  // Strategy state
  const [bulkGroup, setBulkGroup] = useState('MANUAL')
  const [strategyStatus, setStrategyStatus] = useState<Status>('idle')

  // Tags state
  const [bulkTagNames, setBulkTagNames] = useState<string[]>([])
  const [tagMode, setTagMode] = useState<TagMode>('add')
  const [tagsStatus, setTagsStatus] = useState<Status>('idle')

  const barRef = useRef<HTMLDivElement>(null)

  // Close panels when selection is cleared
  useEffect(() => { if (count === 0) setPanel('none') }, [count])

  // Click-outside closes panels
  useEffect(() => {
    if (panel === 'none') return
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setPanel('none')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [panel])

  const applyStrategy = async () => {
    setStrategyStatus('loading')
    try {
      const results = await Promise.allSettled(trades.map((t) => getTradeOrders(t.trade_id)))
      const allOrders = results.flatMap((r) => r.status === 'fulfilled' ? r.value : [])
      if (!allOrders.length) {
        toast.error('No orders found for selected trades')
        setStrategyStatus('idle')
        return
      }
      await setOrdersGroup(allOrders, bulkGroup || 'MANUAL')
      toast.success(`Strategy updated for ${trades.length} trade${trades.length !== 1 ? 's' : ''}`)
      setStrategyStatus('done')
      onDone()
      setTimeout(() => { setStrategyStatus('idle'); setPanel('none') }, 1500)
    } catch {
      toast.error('Failed to update strategy')
      setStrategyStatus('error')
      setTimeout(() => setStrategyStatus('idle'), 2000)
    }
  }

  const applyTags = async () => {
    if (tagMode === 'add' && !bulkTagNames.length) return
    setTagsStatus('loading')
    try {
      await Promise.all(
        trades.map((t) => {
          const existing = (t.tags ?? []).map((tag) => tag.name)
          const next = tagMode === 'add'
            ? [...new Set([...existing, ...bulkTagNames])]
            : bulkTagNames
          return updateTradeTags(t.trade_id, next)
        }),
      )
      toast.success(`Tags updated for ${trades.length} trade${trades.length !== 1 ? 's' : ''}`)
      setTagsStatus('done')
      onDone()
      setTimeout(() => { setTagsStatus('idle'); setPanel('none'); setBulkTagNames([]) }, 1500)
    } catch {
      toast.error('Failed to update tags')
      setTagsStatus('error')
      setTimeout(() => setTagsStatus('idle'), 2000)
    }
  }

  if (count === 0) return null

  return (
    <div ref={barRef} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
      {/* ── Strategy panel ── */}
      {panel === 'strategy' && (
        <div className="mb-3 w-64 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-4 animate-fade-in">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Update strategy · {count} trade{count !== 1 ? 's' : ''}
          </p>
          <GroupCombobox
            value={bulkGroup}
            onChange={setBulkGroup}
            className="w-full h-9 px-2.5 rounded-lg bg-white/5 border border-slate-700 text-slate-200 text-sm outline-none focus:border-brand-400"
          />
          <ApplyButton status={strategyStatus} count={count} onClick={applyStrategy} />
        </div>
      )}

      {/* ── Tags panel ── */}
      {panel === 'tags' && (
        <div className="mb-3 w-72 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Update tags · {count} trade{count !== 1 ? 's' : ''}
            </p>
            {/* Add / Replace toggle */}
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/5 border border-slate-700">
              {(['add', 'replace'] as TagMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setTagMode(m)}
                  className={clsx(
                    'px-2.5 py-0.5 rounded-md text-[10px] font-semibold capitalize transition-colors',
                    tagMode === m ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-slate-300',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mb-2.5">
            {tagMode === 'add'
              ? 'Adds to existing tags — nothing removed.'
              : 'Replaces all tags on each selected trade.'}
          </p>
          <TagCombobox
            value={bulkTagNames}
            onChange={setBulkTagNames}
            allTags={allTags}
            placeholder="Pick tags to apply…"
            dark
          />
          <ApplyButton
            status={tagsStatus}
            count={count}
            onClick={applyTags}
          />
        </div>
      )}

      {/* ── The bar ── */}
      <div className="flex items-center gap-1 h-11 px-2 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl">
        {/* Count badge */}
        <div className="flex items-center gap-2 px-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ background: '#f59e0b' }}>
            {count}
          </span>
          <span className="text-[13px] font-medium text-slate-300 whitespace-nowrap">selected</span>
        </div>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        {/* Strategy */}
        <button
          onClick={() => setPanel((p) => p === 'strategy' ? 'none' : 'strategy')}
          className={clsx(
            'flex items-center gap-1.5 h-8 px-3 rounded-xl text-[13px] font-medium transition-colors',
            panel === 'strategy' ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white',
          )}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Strategy
        </button>

        {/* Tags */}
        <button
          onClick={() => setPanel((p) => p === 'tags' ? 'none' : 'tags')}
          className={clsx(
            'flex items-center gap-1.5 h-8 px-3 rounded-xl text-[13px] font-medium transition-colors',
            panel === 'tags' ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white',
          )}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 7h10M7 12h6M4 3h16v14a2 2 0 01-2 2H6a2 2 0 01-2-2V3z" />
          </svg>
          Tags
        </button>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        {/* Clear */}
        <button
          onClick={() => { onClear(); setPanel('none') }}
          className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[13px] text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          Clear
        </button>
      </div>
    </div>
  )
}
