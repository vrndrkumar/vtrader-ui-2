import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import type { DashboardData, RankingEntry } from '../types'
import { BadgeChip, ConvictionStars, RiskChip } from './Badges'

/** Top Picks: most convincing stocks from the WHOLE analysed universe. */
function TopPicks({ entries }: { entries: RankingEntry[] }) {
  const navigate = useNavigate()
  if (!entries.length) return null
  return (
    <div className="rounded-2xl border-2 border-amber-300/60 dark:border-amber-600/40 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-900/10 dark:to-card-dark overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">🏆 Top Picks — Highest Conviction</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">Ranked across the entire analysed universe, not this page</div>
        </div>
      </div>
      <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-4">
        {entries.slice(0, 8).map((e) => (
          <button
            key={e.symbol_code}
            onClick={() => navigate(`/insight/${encodeURIComponent(e.symbol_code)}`)}
            className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark p-3 hover:border-amber-400 dark:hover:border-amber-500 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">{e.symbol_code}</span>
              {e.conviction != null && (
                <ConvictionStars conviction={{ stars: Math.max(1, Math.min(5, Math.round(e.conviction / 20))), label: '' }} />
              )}
            </div>
            <div className="text-[10px] text-slate-400 truncate mt-0.5">{e.symbol_name}{e.sector ? ` · ${e.sector}` : ''}</div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <BadgeChip badge={e.badge} />
              <RiskChip level={e.risk_level} />
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
              <span>D <b className="text-violet-600 dark:text-violet-400">{e.discovery_score ?? '—'}</b></span>
              <span>T <b className="text-brand-600 dark:text-brand-400">{e.transition_score ?? '—'}</b></span>
              <span>M <b className="text-emerald-600 dark:text-emerald-400">{e.momentum_score ?? '—'}</b></span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

type RightRender = (e: RankingEntry) => React.ReactNode

function List({ title, subtitle, entries, accent, right, compact }: {
  title: string
  subtitle: string
  entries: RankingEntry[]
  accent: string
  right: RightRender
  compact?: boolean
}) {
  const navigate = useNavigate()
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-hidden">
      <div className={`px-4 py-2.5 ${accent}`}>
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="text-[10px] text-white/80">{subtitle}</div>
      </div>
      {entries.length === 0 ? (
        <div className="p-4 text-xs text-slate-400">Nothing here yet.</div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {entries.slice(0, compact ? 5 : 6).map((e) => (
            <li key={e.symbol_code}>
              <button
                onClick={() => navigate(`/insight/${encodeURIComponent(e.symbol_code)}`)}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{e.symbol_code}</div>
                    <div className="text-[10px] text-slate-400 truncate">{e.symbol_name}{e.sector ? ` · ${e.sector}` : ''}</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">{right(e)}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const score = (v: number | null | undefined) => (
  <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{v ?? '—'}</span>
)

export function RankingsDashboard({ dashboard }: { dashboard: DashboardData }) {
  const hasHistory = dashboard.biggestImprovers.length + dashboard.upgraded.length + dashboard.downgraded.length + dashboard.newSignals.length > 0
  return (
    <div className="space-y-4">
      {/* Top Picks — whole-universe conviction ranking */}
      <TopPicks entries={dashboard.topPicks ?? []} />

      {/* Primary intelligence row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <List
          title="Top Hidden Gems"
          subtitle="Early evidence, not yet recognised"
          entries={dashboard.topHiddenGems}
          accent="bg-violet-600"
          right={(e) => <>{score(e.discovery_score)}<RiskChip level={e.risk_level} /></>}
        />
        <List
          title="Top Discovery Scores"
          subtitle="Strongest early evidence market-wide"
          entries={dashboard.topDiscovery}
          accent="bg-violet-500"
          right={(e) => <>{score(e.discovery_score)}<BadgeChip badge={e.badge} /></>}
        />
        <List
          title="Momentum Leaders"
          subtitle="Established, later-stage trends"
          entries={dashboard.momentumLeaders}
          accent="bg-emerald-600"
          right={(e) => <>{score(e.momentum_score)}<RiskChip level={e.risk_level} /></>}
        />
        <List
          title="Sector Leaders"
          subtitle="Best Discovery score in each sector"
          entries={dashboard.sectorLeaders}
          accent="bg-slate-700"
          right={(e) => <>{score(e.discovery_score)}<span className="text-[10px] text-slate-400 max-w-[80px] truncate">{e.sector}</span></>}
        />
      </div>

      {/* Movement row (needs ≥2 snapshots per stock) */}
      {hasHistory && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <List
            compact
            title="Biggest Improvements"
            subtitle="Discovery score change since last run"
            entries={dashboard.biggestImprovers}
            accent="bg-brand-600"
            right={(e) => (
              <>
                {score(e.discovery_score)}
                <span className="text-[10px] font-bold text-emerald-500">+{e.delta}</span>
              </>
            )}
          />
          <List
            compact
            title="New Discovery Signals"
            subtitle="Crossed into strong territory this run"
            entries={dashboard.newSignals}
            accent="bg-indigo-600"
            right={(e) => (
              <>
                {score(e.discovery_score)}
                <span className={clsx('text-[10px] font-bold', e.isNew ? 'text-violet-400' : 'text-emerald-500')}>
                  {e.isNew ? 'NEW' : 'CROSSED 55'}
                </span>
              </>
            )}
          />
          <List
            compact
            title="Recently Upgraded"
            subtitle="Badge improved since last analysis"
            entries={dashboard.upgraded}
            accent="bg-emerald-700"
            right={(e) => <BadgeChip badge={e.badge} />}
          />
          <List
            compact
            title="Recently Downgraded"
            subtitle="Badge weakened since last analysis"
            entries={dashboard.downgraded}
            accent="bg-red-700"
            right={(e) => <BadgeChip badge={e.badge} />}
          />
        </div>
      )}

      {/* Risk awareness */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <List
          compact
          title="Highest Risk Names"
          subtitle="Handle with care — risk shown, never hidden"
          entries={dashboard.highestRisk}
          accent="bg-red-600"
          right={(e) => <><span className="text-sm font-bold text-red-500 tabular-nums">{e.risk_level}</span><BadgeChip badge={e.badge} /></>}
        />
      </div>
    </div>
  )
}
