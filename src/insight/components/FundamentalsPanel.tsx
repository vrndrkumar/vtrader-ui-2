import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { fetchFundamentals } from '../api'
import type { FundamentalsResponse } from '../types'
import { SectionCard } from './ReportWidgets'

/**
 * Fundamentals — DISPLAY-ONLY investor context.
 * Never feeds scores, badges, rankings or conviction (backend-enforced too).
 */
export function FundamentalsPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<FundamentalsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      setData(await fetchFundamentals(symbol, refresh))
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Failed to load fundamentals')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setData(null)
    void load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  return (
    <SectionCard
      title="Fundamentals"
      right={
        <span className="flex items-center gap-2.5">
          <span className="text-[10px] text-slate-400 hidden sm:inline">
            informational only — does not affect scores
          </span>
          <button
            onClick={() => void load(true)}
            disabled={loading || refreshing}
            className="px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </span>
      }
    >
      {loading && <FundamentalsSkeleton />}

      {!loading && (error || (data && !data.available)) && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fundamental data unavailable for this stock right now
            {data?.error ? ` — ${data.error}` : error ? ` — ${error}` : ''}.
            Technical analysis above is unaffected.
          </p>
        </div>
      )}

      {!loading && data?.available && (
        <div className="space-y-4">
          {/* Fundamental Health Summary */}
          {data.outlook && data.outlook.length > 0 && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-3.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">
                Fundamental health summary
              </div>
              <div className="flex flex-wrap gap-2">
                {data.outlook.map((o) => (
                  <span
                    key={o.label}
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold',
                      o.tone === 'good' && 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
                      o.tone === 'bad' && 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
                      o.tone === 'mid' && 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
                      o.tone === 'na' && 'border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark text-slate-400',
                    )}
                  >
                    <span className="text-slate-500 dark:text-slate-400 font-medium">{o.label}:</span> {o.level}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                Heuristic labels derived from the metrics below — investor context, not signals. The engines never read these.
              </p>
            </div>
          )}

          {/* Metric sections */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.sections?.map((sec) => (
              <div key={sec.title} className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                  {sec.title}
                </div>
                <div className="px-3.5 py-1.5">
                  {sec.rows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{r.label}</span>
                      <span className={clsx('text-[11px] font-semibold text-right tabular-nums',
                        r.value === 'N/A' ? 'text-slate-300 dark:text-slate-600' : 'text-slate-900 dark:text-white')}>
                        {r.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-400">
            Source: Yahoo Finance ({data.yahooSymbol ?? '—'}){data.currency ? ` · ${data.currency}` : ''} · cached up to 24h
            {data.fetchedAt ? ` · fetched ${new Date(data.fetchedAt).toLocaleString('en-IN')}` : ''} · unofficial data —
            verify against exchange filings before decisions.
          </p>
        </div>
      )}
    </SectionCard>
  )
}

function FundamentalsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-100 dark:border-slate-800 p-3.5 space-y-2.5">
            <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800" />
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="flex justify-between gap-4">
                <div className="h-2.5 w-20 rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-2.5 w-12 rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
