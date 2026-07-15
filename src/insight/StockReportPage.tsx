import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { useReportStore } from './reportStore'
import { WeeklyChart } from './components/WeeklyChart'
import {
  BadgeChip, ConvictionStars, LifecycleStepper, RankCaption, RiskChip, WarningTagChip,
} from './components/Badges'
import { ScoreRing, SectionCard } from './components/ReportWidgets'
import type { EngineEvidence, EvidenceItem, HistoryRow, RiskFactor } from './types'

// ── Evidence de-duplication: themes shared by ≥2 engines → "Overall evidence" ─
function splitEvidence(ev: { discovery: EngineEvidence; transition: EngineEvidence; momentum: EngineEvidence }) {
  const engines = ['discovery', 'transition', 'momentum'] as const
  const themeCount = new Map<string, number>()
  for (const k of engines) {
    for (const it of ev[k].items) themeCount.set(it.theme, (themeCount.get(it.theme) ?? 0) + 1)
  }
  const shared = new Set([...themeCount.entries()].filter(([, c]) => c >= 2).map(([t]) => t))
  const overall: EvidenceItem[] = []
  const seen = new Set<string>()
  const unique: Record<(typeof engines)[number], EvidenceItem[]> = { discovery: [], transition: [], momentum: [] }
  for (const k of engines) {
    for (const it of ev[k].items) {
      if (shared.has(it.theme)) {
        if (!seen.has(it.theme)) { overall.push(it); seen.add(it.theme) }
      } else {
        unique[k].push(it)
      }
    }
  }
  return { overall, unique }
}

function EvidenceLine({ it }: { it: EvidenceItem }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-px text-emerald-500 font-bold shrink-0">✓</span>
      <div>
        <span className="text-xs font-semibold text-slate-900 dark:text-white">{it.label}</span>
        <span className="ml-1.5 text-[10px] px-1 py-px rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">+{it.points}</span>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{it.detail}</p>
      </div>
    </div>
  )
}

function MissingLine({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-px text-amber-500 font-bold shrink-0">⚠</span>
      <div>
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">{detail}</p>
      </div>
    </div>
  )
}

function RiskLines({ factors }: { factors: RiskFactor[] }) {
  if (!factors.length) return <p className="text-xs text-slate-500 dark:text-slate-400">No elevated risk factors detected.</p>
  return (
    <div className="space-y-2">
      {factors.map((f, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className={clsx('mt-px font-bold shrink-0', f.level === 'high' ? 'text-red-500' : 'text-amber-500')}>⚠</span>
          <div>
            <span className="text-xs font-semibold text-slate-900 dark:text-white">{f.label}</span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{f.detail}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function TrendLine({ label, values, color }: { label: string; values: (number | null)[]; color: string }) {
  const defined = values.filter((v): v is number => v != null)
  if (defined.length < 2) return null
  const arrow = defined[defined.length - 1] > defined[0] ? '↑' : defined[defined.length - 1] < defined[0] ? '↓' : '→'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-slate-500 dark:text-slate-400">{label}</span>
      <span className={clsx('font-bold tabular-nums', color)}>{defined.join(' → ')}</span>
      <span className={clsx('font-bold', arrow === '↑' ? 'text-emerald-500' : arrow === '↓' ? 'text-red-500' : 'text-slate-400')}>{arrow}</span>
    </div>
  )
}

function HistoryTable({ history }: { history: HistoryRow[] }) {
  const asc = useMemo(() => [...history].reverse(), [history])
  if (history.length < 2) {
    return <p className="text-xs text-slate-400">History builds as analyses re-run — only one snapshot so far.</p>
  }
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <TrendLine label="Discovery" values={asc.map((h) => h.discovery_score)} color="text-violet-600 dark:text-violet-400" />
        <TrendLine label="Transition" values={asc.map((h) => h.transition_score)} color="text-brand-600 dark:text-brand-400" />
        <TrendLine label="Momentum" values={asc.map((h) => h.momentum_score)} color="text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
              <th className="py-1.5 pr-3 font-semibold">Date</th>
              <th className="py-1.5 pr-3 font-semibold">Price</th>
              <th className="py-1.5 pr-3 font-semibold">Discovery</th>
              <th className="py-1.5 pr-3 font-semibold">Transition</th>
              <th className="py-1.5 pr-3 font-semibold">Momentum</th>
              <th className="py-1.5 pr-3 font-semibold">Conviction</th>
              <th className="py-1.5 pr-3 font-semibold">Mkt rank</th>
              <th className="py-1.5 font-semibold">Badge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
            {history.map((h) => (
              <tr key={h.id}>
                <td className="py-1.5 pr-3 whitespace-nowrap">{String(h.analysis_date).slice(0, 10)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{h.price != null ? Number(h.price).toLocaleString('en-IN') : '—'}</td>
                <td className="py-1.5 pr-3 font-semibold">{h.discovery_score ?? '—'}</td>
                <td className="py-1.5 pr-3 font-semibold">{h.transition_score ?? '—'}</td>
                <td className="py-1.5 pr-3 font-semibold">{h.momentum_score ?? '—'}</td>
                <td className="py-1.5 pr-3">{h.conviction_label ?? '—'}</td>
                <td className="py-1.5 pr-3">{h.market_rank != null ? `#${h.market_rank}${h.market_total ? `/${h.market_total}` : ''}` : '—'}</td>
                <td className="py-1.5"><BadgeChip badge={h.badge} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function StockReportPage() {
  const { symbol } = useParams<{ symbol: string }>()
  const { data, loading, refreshing, error, load, refresh } = useReportStore()

  useEffect(() => {
    if (symbol) void load(symbol)
  }, [symbol, load])

  const a = data?.analysis
  const split = useMemo(() => (a?.evidence ? splitEvidence(a.evidence) : null), [a])
  const rc = data?.rankContext

  return (
    <div className="flex-1 min-h-screen bg-slate-50 dark:bg-surface-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link to="/insight" className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline">← Universe</Link>
            <Link to="/insight/guide" className="text-xs text-slate-500 dark:text-slate-400 font-semibold hover:underline">
              ⓘ How to read this report
            </Link>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={refreshing || loading}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50"
          >
            {refreshing ? 'Re-analysing…' : 'Re-analyse now'}
          </button>
        </div>

        {loading && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-10 flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading intelligence for {symbol}…</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-5 text-sm text-red-700 dark:text-red-400">{error}</div>
        )}

        {data && a && !loading && (
          <>
            {/* ── Executive summary ── */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-4 sm:p-6">
              <div className="flex flex-col xl:flex-row gap-5 justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">{data.meta.symbol_code}</h1>
                    <BadgeChip badge={a.badge} size="lg" />
                    <RiskChip level={a.riskLevel} size="lg" />
                    {a.tags?.map((t) => <WarningTagChip key={t} tag={t} />)}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {data.meta.symbol_name}
                    {data.meta.sector ? ` · ${data.meta.sector}` : ''}
                    {data.meta.industry ? ` · ${data.meta.industry}` : ''}
                    {a.features?.price != null && <> · ₹{a.features.price}</>}
                  </p>

                  <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Executive summary</div>
                    <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">{a.summary}</p>
                  </div>

                  {data.standout?.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Why this stock stands out today</div>
                      <ul className="space-y-1">
                        {data.standout.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                            <span className="text-violet-500 mt-px shrink-0">◆</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="shrink-0 space-y-4 xl:w-72">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Overall conviction</div>
                    <ConvictionStars conviction={data.conviction} size="lg" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Opportunity lifecycle</div>
                    <LifecycleStepper stage={a.phase} earliness={a.earliness} />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Analysed {a.features?.date ?? '—'}
                    {data.storedAt ? ` · stored ${new Date(data.storedAt).toLocaleDateString('en-IN')}` : ' · just now'}
                    {' · '}{a.engineVersion}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Scores with market context ── */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {([
                  ['discovery', 'Discovery', 'How early could this be?'],
                  ['transition', 'Transition', 'Is participation building?'],
                  ['momentum', 'Momentum', 'Already recognised?'],
                ] as const).map(([key, label, sub]) => (
                  <div key={key} className="flex items-center gap-3">
                    <ScoreRing
                      value={a.scores[key]}
                      label={label}
                      tone={a.scores[key] >= 55 ? 'good' : a.scores[key] >= 35 ? 'warn' : 'bad'}
                    />
                    <div className="space-y-0.5">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{sub}</div>
                      <div><RankCaption slot={rc?.[key]?.market} context="in market" /></div>
                      {rc?.[key]?.sector && rc.sectorName && (
                        <div><RankCaption slot={rc[key].sector} context={`in ${rc.sectorName}`} /></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Overall evidence + chart ── */}
            <div className="grid gap-5 lg:grid-cols-5">
              <SectionCard title="Overall evidence" className="lg:col-span-2" right={<span className="text-[10px] text-slate-400">signals shared across engines</span>}>
                {split && split.overall.length > 0 ? (
                  <div className="space-y-2.5">{split.overall.map((it, i) => <EvidenceLine key={i} it={it} />)}</div>
                ) : (
                  <p className="text-xs text-slate-400">No cross-engine signals — see engine-specific evidence below.</p>
                )}
              </SectionCard>
              <SectionCard title="Weekly chart" className="lg:col-span-3" right={<span className="text-[10px] text-slate-400">context only — no signals</span>}>
                {data.weeklyChart ? (
                  <WeeklyChart candles={data.weeklyChart.candles} keyZones={data.weeklyChart.keyZones} />
                ) : (
                  <p className="text-xs text-slate-400">Chart unavailable.</p>
                )}
              </SectionCard>
            </div>

            {/* ── Engine-specific evidence (deduplicated) ── */}
            {a.evidence && split && (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <SectionCard title={`Discovery · ${a.scores.discovery}`} right={<span className="text-[10px] text-violet-500 font-bold">EARLY</span>}>
                  <p className="text-[11px] text-slate-400 mb-3">Evidence unique to early discovery.</p>
                  <div className="space-y-2.5">
                    {split.unique.discovery.map((it, i) => <EvidenceLine key={i} it={it} />)}
                    {a.evidence.discovery.missing.map((m, i) => <MissingLine key={`m${i}`} label={m.label} detail={m.detail} />)}
                    {split.unique.discovery.length === 0 && a.evidence.discovery.missing.length === 0 && (
                      <p className="text-xs text-slate-400">All discovery signals appear in shared evidence above.</p>
                    )}
                  </div>
                </SectionCard>
                <SectionCard title={`Transition · ${a.scores.transition}`} right={<span className="text-[10px] text-brand-500 font-bold">BUILDING</span>}>
                  <p className="text-[11px] text-slate-400 mb-3">Evidence unique to the transition phase.</p>
                  <div className="space-y-2.5">
                    {split.unique.transition.map((it, i) => <EvidenceLine key={i} it={it} />)}
                    {a.evidence.transition.missing.map((m, i) => <MissingLine key={`m${i}`} label={m.label} detail={m.detail} />)}
                  </div>
                </SectionCard>
                <SectionCard title={`Momentum · ${a.scores.momentum}`} right={<span className="text-[10px] text-emerald-500 font-bold">ESTABLISHED</span>}>
                  <p className="text-[11px] text-slate-400 mb-3">Evidence unique to established leadership.</p>
                  <div className="space-y-2.5">
                    {split.unique.momentum.map((it, i) => <EvidenceLine key={i} it={it} />)}
                    {a.evidence.momentum.missing.map((m, i) => <MissingLine key={`m${i}`} label={m.label} detail={m.detail} />)}
                  </div>
                </SectionCard>
                <SectionCard title={`Risk · ${a.scores.risk} (${a.riskLevel})`} right={<span className="text-[10px] text-red-500 font-bold">SEPARATE</span>}>
                  <p className="text-[11px] text-slate-400 mb-3">What can go wrong — never blended into opportunity scores.</p>
                  <RiskLines factors={a.riskFactors} />
                </SectionCard>
              </div>
            )}

            {/* ── History ── */}
            <SectionCard title="Score history" right={<span className="text-[10px] text-slate-400">is the opportunity improving or fading?</span>}>
              <HistoryTable history={data.history} />
            </SectionCard>

            <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 px-1 pb-4">
              {a.honesty} Evidence weights were validated on 2020–2026 NSE history (survivorship-biased sample; absolute hit
              rates inflated). Fundamental and news data are not evaluated. This page never provides entries, stops, targets
              or buy/sell recommendations.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
