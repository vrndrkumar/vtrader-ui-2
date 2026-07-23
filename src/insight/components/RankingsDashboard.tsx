import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import type { DashboardData, RankingEntry } from '../types'
import { BadgeChip, ConvictionStars, RiskChip } from './Badges'

// ── Mini score bar ─────────────────────────────────────────────────────────────

function ScoreBar({ value, tone }: { value: number | null | undefined; tone: 'D' | 'T' | 'M' }) {
  const track = 'bg-slate-100 dark:bg-white/[0.08]'
  const fill = tone === 'D' ? 'bg-violet-500' : tone === 'T' ? 'bg-brand-500' : 'bg-emerald-500'
  const label = tone === 'D' ? 'text-violet-500' : tone === 'T' ? 'text-brand-500' : 'text-emerald-500'
  const valCls = tone === 'D' ? 'text-violet-700 dark:text-violet-300' : tone === 'T' ? 'text-brand-700 dark:text-brand-300' : 'text-emerald-700 dark:text-emerald-300'
  const pct = Math.min(100, Math.max(0, value ?? 0))
  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx('text-[9px] font-black w-3 shrink-0', label)}>{tone}</span>
      <div className={clsx('flex-1 h-[3px] rounded-full overflow-hidden', track)}>
        <div className={clsx('h-full rounded-full', fill)} style={{ width: `${pct}%` }} />
      </div>
      <span className={clsx('text-[9px] font-bold tabular-nums w-5 text-right shrink-0', valCls)}>
        {value ?? '—'}
      </span>
    </div>
  )
}

// ── Top Picks Hero ─────────────────────────────────────────────────────────────

function TopPicks({ entries }: { entries: RankingEntry[] }) {
  const navigate = useNavigate()
  if (!entries.length) return null

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200/70 dark:border-amber-700/25 bg-gradient-to-br from-amber-50 via-white to-orange-50/30 dark:from-[#15100a] dark:via-card-dark dark:to-card-dark shadow-sm">
      {/* Background glows */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-amber-400/[0.12] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 left-10 h-48 w-48 rounded-full bg-orange-400/[0.08] blur-3xl" />

      {/* Header */}
      <div className="relative flex items-center gap-3 px-5 pt-5 pb-4">
        <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 text-lg shrink-0">
          🏆
        </div>
        <div>
          <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
            Top Picks — Highest Conviction
          </h2>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Ranked across the entire analysed universe, not this page
          </p>
        </div>
        {/* Decorative accent line */}
        <div className="ml-auto hidden sm:block h-[2px] w-24 rounded-full bg-gradient-to-r from-amber-400 to-transparent opacity-60" />
      </div>

      {/* Cards */}
      <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-2.5 px-4 pb-5">
        {entries.slice(0, 8).map((e, idx) => (
          <button
            key={e.symbol_code}
            onClick={() => navigate(`/insight/${encodeURIComponent(e.symbol_code)}`)}
            className="group text-left rounded-xl border border-slate-200/80 dark:border-slate-700/50 bg-white/95 dark:bg-white/[0.04] p-3.5 hover:border-amber-400/70 dark:hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-sm"
          >
            {/* Rank + Stars */}
            <div className="flex items-center justify-between mb-2.5">
              <span className="inline-flex items-center h-5 px-1.5 rounded-full text-[9px] font-extrabold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 tracking-wide">
                #{idx + 1}
              </span>
              {e.conviction != null && (
                <ConvictionStars conviction={{ stars: Math.max(1, Math.min(5, Math.round(e.conviction / 20))), label: '' }} />
              )}
            </div>

            {/* Symbol */}
            <div className="text-[13px] font-extrabold text-slate-900 dark:text-white leading-tight group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
              {e.symbol_code}
            </div>
            <div className="text-[10px] text-slate-400 truncate mt-0.5">{e.symbol_name}</div>
            {e.sector && (
              <div className="text-[9px] text-slate-400/70 truncate mt-0.5">{e.sector}</div>
            )}

            {/* Score bars */}
            <div className="mt-3 space-y-1.5">
              <ScoreBar value={e.discovery_score} tone="D" />
              <ScoreBar value={e.transition_score} tone="T" />
              <ScoreBar value={e.momentum_score} tone="M" />
            </div>

            {/* Badge + Risk */}
            <div className="mt-3 flex flex-wrap gap-1 min-h-[20px]">
              <BadgeChip badge={e.badge} />
              <RiskChip level={e.risk_level} />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Reusable ranked list panel ─────────────────────────────────────────────────

type RightRender = (e: RankingEntry) => React.ReactNode

interface ListProps {
  title: string
  subtitle: string
  entries: RankingEntry[]
  accent: string        // gradient CSS class(es) for the header band
  right: RightRender
  compact?: boolean
  icon?: string
}

function ListPanel({ title, subtitle, entries, accent, right, compact, icon }: ListProps) {
  const navigate = useNavigate()
  const limit = compact ? 5 : 6

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-hidden flex flex-col shadow-sm">
      {/* Header band */}
      <div className={clsx('px-4 py-3 flex items-center gap-2.5', accent)}>
        {icon && <span className="text-base shrink-0">{icon}</span>}
        <div>
          <div className="text-[12px] font-bold text-white leading-tight">{title}</div>
          <div className="text-[10px] text-white/70 mt-0.5">{subtitle}</div>
        </div>
      </div>

      {/* Rows */}
      {entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <span className="text-xs text-slate-400 dark:text-slate-600">Nothing here yet.</span>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-slate-50 dark:divide-slate-800/60">
          {entries.slice(0, limit).map((e, idx) => (
            <li key={e.symbol_code}>
              <button
                onClick={() => navigate(`/insight/${encodeURIComponent(e.symbol_code)}`)}
                className="group w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* Rank number */}
                  <span className="shrink-0 text-[10px] font-bold text-slate-300 dark:text-slate-700 tabular-nums w-3.5">
                    {idx + 1}
                  </span>

                  {/* Symbol + name */}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors leading-tight truncate">
                      {e.symbol_code}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {e.symbol_name}{e.sector ? ` · ${e.sector}` : ''}
                    </div>
                  </div>

                  {/* Right content */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    {right(e)}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Score number helpers ───────────────────────────────────────────────────────

const D = (v: number | null | undefined) => (
  <span className="text-[13px] font-extrabold tabular-nums text-violet-600 dark:text-violet-400">{v ?? '—'}</span>
)
const Msc = (v: number | null | undefined) => (
  <span className="text-[13px] font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">{v ?? '—'}</span>
)

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function RankingsDashboard({ dashboard }: { dashboard: DashboardData }) {
  const hasHistory =
    dashboard.biggestImprovers.length +
      dashboard.upgraded.length +
      dashboard.downgraded.length +
      dashboard.newSignals.length >
    0

  return (
    <div className="space-y-4">
      {/* ① Hero: Top Picks */}
      <TopPicks entries={dashboard.topPicks ?? []} />

      {/* ② Intelligence grid — 4 equal columns, no orphan */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ListPanel
          icon="💎"
          title="Gems × Solid Fundamentals"
          subtitle="Technically early AND fundamentally positive"
          entries={dashboard.gemsWithFundamentals ?? []}
          accent="bg-gradient-to-r from-violet-600 to-emerald-600"
          right={(e) => <>{D(e.discovery_score)}<RiskChip level={e.risk_level} /></>}
        />
        <ListPanel
          icon="🔍"
          title="Top Hidden Gems"
          subtitle="Early evidence, not yet recognised"
          entries={dashboard.topHiddenGems}
          accent="bg-gradient-to-r from-violet-700 to-violet-500"
          right={(e) => <>{D(e.discovery_score)}<RiskChip level={e.risk_level} /></>}
        />
        <ListPanel
          icon="📡"
          title="Top Discovery Scores"
          subtitle="Strongest early evidence market-wide"
          entries={dashboard.topDiscovery}
          accent="bg-gradient-to-r from-indigo-600 to-violet-500"
          right={(e) => <>{D(e.discovery_score)}<BadgeChip badge={e.badge} /></>}
        />
        <ListPanel
          icon="🚀"
          title="Momentum Leaders"
          subtitle="Established, later-stage trends"
          entries={dashboard.momentumLeaders}
          accent="bg-gradient-to-r from-emerald-600 to-teal-600"
          right={(e) => <>{Msc(e.momentum_score)}<RiskChip level={e.risk_level} /></>}
        />
      </div>

      {/* ③ Movement row — only shown when history data exists */}
      {hasHistory && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ListPanel
            compact
            icon="📈"
            title="Biggest Improvements"
            subtitle="Discovery score change since last run"
            entries={dashboard.biggestImprovers}
            accent="bg-gradient-to-r from-brand-700 to-brand-500"
            right={(e) => (
              <>
                {D(e.discovery_score)}
                {e.delta != null && (
                  <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/25 px-1.5 py-0.5 rounded-md">
                    +{e.delta}
                  </span>
                )}
              </>
            )}
          />
          <ListPanel
            compact
            icon="✨"
            title="New Discovery Signals"
            subtitle="Crossed into strong territory this run"
            entries={dashboard.newSignals}
            accent="bg-gradient-to-r from-indigo-700 to-violet-600"
            right={(e) => (
              <>
                {D(e.discovery_score)}
                <span className={clsx(
                  'text-[9px] font-extrabold px-1.5 py-0.5 rounded-md',
                  e.isNew
                    ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                    : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
                )}>
                  {e.isNew ? 'NEW' : 'CROSSED 55'}
                </span>
              </>
            )}
          />
          <ListPanel
            compact
            icon="⬆️"
            title="Recently Upgraded"
            subtitle="Badge improved since last analysis"
            entries={dashboard.upgraded}
            accent="bg-gradient-to-r from-emerald-700 to-emerald-600"
            right={(e) => <BadgeChip badge={e.badge} />}
          />
          <ListPanel
            compact
            icon="⬇️"
            title="Recently Downgraded"
            subtitle="Badge weakened since last analysis"
            entries={dashboard.downgraded}
            accent="bg-gradient-to-r from-red-700 to-rose-600"
            right={(e) => <BadgeChip badge={e.badge} />}
          />
        </div>
      )}

      {/* ④ Bottom row: Sector Leaders + Highest Risk — clean 2-col, no orphan */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ListPanel
          compact
          icon="🏭"
          title="Sector Leaders"
          subtitle="Best Discovery score in each sector"
          entries={dashboard.sectorLeaders}
          accent="bg-gradient-to-r from-slate-700 to-slate-600"
          right={(e) => (
            <>
              {D(e.discovery_score)}
              <span className="text-[10px] text-slate-400 max-w-[80px] truncate">{e.sector}</span>
            </>
          )}
        />
        <ListPanel
          compact
          icon="⚠️"
          title="Highest Risk Names"
          subtitle="Handle with care — risk shown, never hidden"
          entries={dashboard.highestRisk}
          accent="bg-gradient-to-r from-red-700 to-red-500"
          right={(e) => (
            <>
              <span className="text-[11px] font-extrabold text-red-500 dark:text-red-400">{e.risk_level}</span>
              <BadgeChip badge={e.badge} />
            </>
          )}
        />
      </div>
    </div>
  )
}
