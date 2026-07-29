import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { useUniverseStore } from './universeStore'
import { useAuth } from '@/hooks/useAuth'
import { RankingsDashboard } from './components/RankingsDashboard'
import { BadgeChip, ConvictionStars, FundamentalChip, RiskChip, ScoreCell } from './components/Badges'

function FailuresPanel() {
  const { failures, showFailures, toggleFailures, job, retryFailed } = useUniverseStore()
  const { user } = useAuth()
  if (user?.role !== 'ADMIN') return null // operational detail — admins only
  const failCount = job?.failed ?? failures?.total ?? 0
  if (!failCount && !failures?.total) return null
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark">
      <button
        onClick={toggleFailures}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
      >
        <span className="text-red-500">
          {failures?.total ?? failCount} stocks failed analysis {failures?.runLabel ? `(${failures.runLabel})` : ''}
        </span>
        <span className="text-slate-400">{showFailures ? 'Hide details ▲' : 'View reasons & names ▼'}</span>
      </button>
      {showFailures && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
          {!failures && <p className="text-xs text-slate-400">Loading failure details…</p>}
          {failures?.groups.length === 0 && (
            <p className="text-xs text-slate-400">No stored failure details for the last run (details are recorded from this version onward — re-run the analysis to capture names and reasons).</p>
          )}
          {failures?.groups.map((g) => (
            <div key={g.reason}>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {g.reason} <span className="text-slate-400 font-medium">— {g.count} stocks</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {g.symbols.map((s) => (
                  <span key={s} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 dark:text-slate-400">{s}</span>
                ))}
                {g.count > g.symbols.length && (
                  <span className="text-[10px] text-slate-400">+{g.count - g.symbols.length} more</span>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-slate-400">
              "Insufficient history" failures show the actual bar count — 0 bars usually means the candle source has no
              data for that symbol (backfilled data is picked up fresh; empty responses are never cached). Network
              failures are retried automatically once.
            </p>
            <button
              onClick={() => void retryFailed()}
              disabled={job?.running === true}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Retry all failed
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BatchBar() {
  const { job, stopBatch } = useUniverseStore()
  if (!job || (!job.running && !job.finishedAt)) return null
  const done = job.completed + job.failed
  const pct = job.total ? Math.round((done / job.total) * 100) : 0
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {job.running && (
            <svg className="animate-spin h-3.5 w-3.5 text-brand-500 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <span className="font-semibold text-slate-900 dark:text-white truncate">
            {job.running ? `Analysing ${job.label}` : `Analysis finished (${job.label})`}
            {job.current ? ` — ${job.current}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-slate-500 dark:text-slate-400">
          <span>{job.completed} done</span>
          {job.failed > 0 && <span className="text-red-500">{job.failed} failed</span>}
          <span>{job.remaining} left of {job.total}</span>
          {job.running && (
            <button onClick={() => void stopBatch()} className="px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 font-semibold">
              Stop
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const selectCls =
  'px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 max-w-[180px]'

function FilterBar() {
  const { filters, setFilter, resetFilters, facets } = useUniverseStore()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
        <input
          value={filters.q}
          onChange={(e) => setFilter('q', e.target.value)}
          placeholder="Search symbol / name…"
          className={clsx(selectCls, 'pl-8 w-52 max-w-none')}
        />
      </div>
      <select value={filters.sector} onChange={(e) => setFilter('sector', e.target.value)} className={selectCls}>
        <option value="">All sectors</option>
        {facets?.sectors.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filters.industry} onChange={(e) => setFilter('industry', e.target.value)} className={selectCls}>
        <option value="">All industries</option>
        {facets?.industries.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filters.badge} onChange={(e) => setFilter('badge', e.target.value)} className={selectCls}>
        <option value="">All badges</option>
        {['HIDDEN GEM CANDIDATE', 'EARLY DISCOVERY', 'QUIET ACCUMULATION', 'TRANSITION STARTED', 'BUILDING STRENGTH', 'LEADERSHIP EMERGING', 'MOMENTUM ESTABLISHED', 'WATCHLIST', 'QUIET'].map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <select value={filters.riskLevel} onChange={(e) => setFilter('riskLevel', e.target.value)} className={selectCls}>
        <option value="">Any risk</option>
        <option value="LOW">Low risk</option>
        <option value="MEDIUM">Medium risk</option>
        <option value="HIGH">High risk</option>
      </select>
      <select value={filters.minDiscovery} onChange={(e) => setFilter('minDiscovery', e.target.value)} className={selectCls}>
        <option value="">Any discovery score</option>
        <option value="40">Discovery ≥ 40</option>
        <option value="55">Discovery ≥ 55</option>
        <option value="70">Discovery ≥ 70</option>
      </select>
      <select value={filters.fundamentals} onChange={(e) => setFilter('fundamentals', e.target.value as never)} className={selectCls}>
        <option value="">Any fundamentals</option>
        <option value="positive">Overall: Positive</option>
        <option value="quality">💎 Quality (strong + profitable)</option>
        <option value="undervalued">Undervalued</option>
        <option value="highgrowth">High growth</option>
        <option value="dividend">Dividend payers</option>
        <option value="strongbalance">Strong balance sheet</option>
        <option value="covered">Has fundamental data</option>
      </select>
      <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value as never)} className={selectCls}>
        <option value="discovery">Sort: Hidden gem score</option>
        <option value="transition">Sort: Transition score</option>
        <option value="momentum">Sort: Momentum score</option>
        <option value="conviction">Sort: Conviction</option>
        <option value="recent">Sort: Recently analysed</option>
        <option value="name">Sort: Name</option>
      </select>
      <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 px-1 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.analyzed}
          onChange={(e) => setFilter('analyzed', e.target.checked)}
          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/40"
        />
        Analysed only
      </label>
      <button onClick={resetFilters} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1.5">
        Reset
      </button>
    </div>
  )
}

export default function UniversePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const {
    rows, total, page, pageSize, loading, error, dashboard, dashboardError, selection, job,
    load, loadFacets, loadDashboard, toggleSelect, clearSelection, analyzeSelected, analyzeAll, pollJob,
  } = useUniverseStore()

  useEffect(() => {
    void load(1)
    void loadFacets()
    void loadDashboard()
    void pollJob() // resume progress display if a batch is already running
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const busy = job?.running === true

  return (
    <div className="flex-1 min-h-screen bg-slate-50 dark:bg-surface-dark">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Stock Insight</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Research intelligence — which stocks deserve investigation because they may be early. Not trading advice.{' '}
              <Link to="/insight/guide" className="text-brand-600 dark:text-brand-400 font-semibold hover:underline">
                How to read the reports →
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selection.length > 0 && (
              <>
                <button
                  onClick={() => void analyzeSelected()}
                  disabled={busy}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Analyse {selection.length} selected
                </button>
                <button onClick={clearSelection} className="px-2 py-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  Clear
                </button>
              </>
            )}
            {isAdmin ? (
              <button
                onClick={() => void analyzeAll()}
                disabled={busy}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Analysis running…' : 'Analyse Entire Universe'}
              </button>
            ) : (
              <span className="text-[10px] text-slate-400 px-1" title="Full-universe analysis runs automatically every night">
                {busy ? 'Nightly analysis running…' : 'Universe refreshed automatically every night'}
              </span>
            )}
          </div>
        </div>

        <BatchBar />
        <FailuresPanel />

        {/* Market intelligence dashboard */}
        {dashboardError && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            Top-picks dashboard unavailable: {dashboardError}
          </div>
        )}
        {dashboard && dashboard.analyzedCount > 0 && <RankingsDashboard dashboard={dashboard} />}
        {dashboard && dashboard.analyzedCount === 0 && !dashboardError && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
            No analysed stocks yet — run "Analyse Entire Universe" to populate the intelligence dashboard.
          </div>
        )}

        {/* Filters */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-3.5">
          <FilterBar />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-xs text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1060px]">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-white/[0.025] border-b border-slate-200 dark:border-slate-800">
                  <th className="w-10 px-3 py-3" />
                  <th className="px-4 py-3 text-left">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">Stock</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">Sector / Industry</span>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">Price</span>
                  </th>
                  <th className="px-4 py-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-500 dark:text-violet-400">Discovery</span>
                  </th>
                  <th className="px-4 py-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-brand-500 dark:text-brand-400">Transition</span>
                  </th>
                  <th className="px-4 py-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-500 dark:text-emerald-400">Momentum</span>
                  </th>
                  <th className="px-4 py-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">Conviction</span>
                  </th>
                  <th className="px-4 py-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">Fundamentals</span>
                  </th>
                  <th className="px-4 py-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">Risk</span>
                  </th>
                  <th className="px-4 py-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">Badge</span>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">Analysed</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && rows.length === 0 && (
                  <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-400">Loading universe…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-400">No stocks match these filters. (Fundamental filters only match stocks whose fundamentals are loaded — run the nightly or open reports to build coverage.)</td></tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={r.symbol_code}
                    onClick={() => navigate(`/insight/${encodeURIComponent(r.symbol_code)}`)}
                    className="group cursor-pointer hover:bg-brand-50/40 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-3 py-0 align-middle" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selection.includes(r.symbol_code)}
                        onChange={() => toggleSelect(r.symbol_code)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/40"
                      />
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <div className="text-[13px] font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors leading-tight">
                        {r.symbol_code}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-white/30 truncate max-w-[160px] mt-0.5 leading-none">
                        {r.symbol_name ?? ''}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[148px] leading-tight">
                        {r.sector ?? '—'}
                      </div>
                      {r.industry && (
                        <div className="text-[10px] text-slate-400 dark:text-white/25 truncate max-w-[148px] mt-0.5 leading-none">
                          {r.industry}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-middle text-right">
                      <span className="text-[12px] font-semibold tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {r.price != null ? Number(r.price).toLocaleString('en-IN') : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 align-middle"><ScoreCell value={r.discovery_score} tone="discovery" /></td>
                    <td className="px-4 py-3.5 align-middle"><ScoreCell value={r.transition_score} tone="transition" /></td>
                    <td className="px-4 py-3.5 align-middle"><ScoreCell value={r.momentum_score} tone="momentum" /></td>
                    <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                      {r.conviction != null ? (
                        <ConvictionStars conviction={{ stars: Math.max(1, Math.min(5, Math.round(r.conviction / 20))), label: r.conviction_label ?? '' }} />
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-middle"><FundamentalChip outlook={r.fundamental_outlook} /></td>
                    <td className="px-4 py-3.5 align-middle"><RiskChip level={r.risk_level} /></td>
                    <td className="px-4 py-3.5 align-middle"><BadgeChip badge={r.badge} /></td>
                    <td className="px-4 py-3.5 align-middle text-right whitespace-nowrap">
                      <span className="text-[10px] text-slate-400 dark:text-white/25">
                        {r.analysis_date
                          ? new Date(String(r.analysis_date)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                          : 'never'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{total.toLocaleString('en-IN')}</span> stocks · page{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{page}</span> of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{pages}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void load(page - 1)}
                disabled={page <= 1 || loading}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => void load(page + 1)}
                disabled={page >= pages || loading}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1">
          Scores rank research interest from price/volume evidence validated on 2020–2026 history. Historically ~32% of
          top-decile Discovery candidates advanced +50% within ~6 months — most candidates will not. No buy/sell signals,
          entries, stops or targets are provided. Not investment advice.
        </p>
      </div>
    </div>
  )
}
