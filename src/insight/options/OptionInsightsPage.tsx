import { useState } from 'react'
import { clsx } from 'clsx'
import { useOptionInsights, type OptIndex } from './useOptionInsights'
import { SectionCard } from '../components/ReportWidgets'
import type { TfStructure } from './engine'

const INDICES: OptIndex[] = ['NIFTY', 'BANKNIFTY', 'SENSEX']

const fmtN = (v: number | null | undefined, d = 2) =>
  v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: d })

function Chip({ tone, children }: { tone: 'good' | 'bad' | 'mid' | 'na'; children: React.ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold',
      tone === 'good' && 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
      tone === 'bad' && 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
      tone === 'mid' && 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
      tone === 'na' && 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400')}>
      {children}
    </span>
  )
}

function StructRow({ s }: { s: TfStructure }) {
  const yn = (v: boolean | null) => (v == null ? <span className="text-slate-300 dark:text-slate-600">—</span> : v ? <span className="text-emerald-500 font-bold">✓</span> : <span className="text-red-500 font-bold">✗</span>)
  return (
    <tr className="text-slate-700 dark:text-slate-300">
      <td className="py-1.5 pr-3 font-bold text-slate-900 dark:text-white">{s.tf}</td>
      <td className="py-1.5 pr-3">
        <Chip tone={s.trend === 'UP' ? 'good' : s.trend === 'DOWN' ? 'bad' : 'na'}>{s.trend}</Chip>
      </td>
      <td className="py-1.5 pr-3">{yn(s.ema20)}</td>
      <td className="py-1.5 pr-3">{yn(s.ema50)}</td>
      <td className="py-1.5 pr-3">{yn(s.ema200)}</td>
      <td className="py-1.5 pr-3">{s.rsi ?? '—'}</td>
      <td className="py-1.5 pr-3">{yn(s.macdBull)}</td>
      <td className="py-1.5 pr-3">{s.adx ?? '—'}</td>
      <td className="py-1.5 pr-3">{yn(s.supertrendUp)}</td>
      <td className="py-1.5">{s.atrPts ?? '—'}</td>
    </tr>
  )
}

/** Signal-readiness arc: how many entry gates are green (0–100%). */
function ReadinessGauge({ passed, total, active }: { passed: number; total: number; active: boolean }) {
  const pct = total ? passed / total : 0
  const R = 54
  const C = 2 * Math.PI * R
  const color = active ? '#34d399' : pct >= 0.75 ? '#fbbf24' : pct >= 0.5 ? '#818cf8' : '#64748b'
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 128 128" className="h-36 w-36 -rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="10" stroke="rgba(148,163,184,0.15)" />
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
          stroke={color} strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s' }} />
        {Array.from({ length: total }).map((_, i) => {
          const a = (i / total) * 2 * Math.PI
          return <circle key={i} cx={64 + (R + 0) * Math.cos(a)} cy={64 + R * Math.sin(a)} r="2.2"
            fill={i < passed ? color : 'rgba(148,163,184,0.35)'} />
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{passed}<span className="text-slate-400 text-base">/{total}</span></span>
        <span className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400">gates green</span>
        {active && <span className="mt-0.5 text-[9px] font-bold text-emerald-500 dark:text-emerald-400 animate-pulse">SIGNAL LIVE</span>}
      </div>
    </div>
  )
}

/** Probability spectrum — one stacked bar instead of four floating numbers. */
function ProbSpectrum({ p }: { p: { bullish: number; bearish: number; rangebound: number; highVol: number } }) {
  const seg = [
    { v: p.bullish, c: 'bg-emerald-500', l: 'Bull' },
    { v: p.rangebound, c: 'bg-slate-500', l: 'Range' },
    { v: p.highVol, c: 'bg-amber-500', l: 'Vol' },
    { v: p.bearish, c: 'bg-rose-500', l: 'Bear' },
  ]
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
        {seg.map((s) => s.v > 0 && (
          <div key={s.l} className={clsx(s.c, 'transition-all duration-700')} style={{ width: `${s.v}%` }} />
        ))}
      </div>
      <div className="flex justify-between mt-1.5">
        {seg.map((s) => (
          <span key={s.l} className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <span className={clsx('h-1.5 w-1.5 rounded-sm', s.c)} />{s.l} <b className="text-slate-800 dark:text-slate-200 tabular-nums">{s.v}%</b>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function OptionInsightsPage() {
  const [index, setIndex] = useState<OptIndex>('NIFTY')
  const { report, loading, candleError } = useOptionInsights(index)
  const r = report

  return (
    <div className="flex-1 min-h-screen bg-slate-50 dark:bg-surface-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Option Insights</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live intraday index-options research — recomputed on every tick. Educational, not advice.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {INDICES.map((ix) => (
                <button key={ix} onClick={() => setIndex(ix)}
                  className={clsx('px-3 py-1.5 text-xs font-bold transition-colors',
                    index === ix ? 'bg-brand-600 text-white' : 'bg-white dark:bg-card-dark text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5')}>
                  {ix}
                </button>
              ))}
            </span>
            {r && (
              <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className={clsx('h-1.5 w-1.5 rounded-full', r.session.marketOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400')} />
                {r.session.marketOpen ? 'LIVE' : 'CLOSED'} · {new Date(r.generatedAt).toLocaleTimeString('en-IN')}
              </span>
            )}
          </div>
        </div>

        {loading && !r && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Waiting for live data ({index})… candles, ticks and option chain are loading.
            {candleError && <div className="mt-2 text-xs text-red-500">Candle fetch: {candleError}</div>}
          </div>
        )}

        {r && (
          <>
            {/* ── HERO: trading command deck ── */}
            {(() => {
              const gatesPassed = r.strategy.gates.filter((g) => g.pass === true).length
              const gatesTotal = r.strategy.gates.length
              const isActive = r.trader.decision !== 'NO TRADE'
              return (
                <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-transparent bg-gradient-to-br from-white via-indigo-50/50 to-emerald-50/40 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 shadow-lg dark:shadow-xl">
                  {/* ambient background */}
                  <div className="absolute inset-0 pointer-events-none dark:opacity-100 opacity-70" style={{
                    background: isActive
                      ? 'radial-gradient(700px 280px at 15% 0%, rgba(16,185,129,0.14), transparent), radial-gradient(500px 240px at 90% 100%, rgba(59,130,246,0.10), transparent)'
                      : 'radial-gradient(700px 280px at 15% 0%, rgba(99,102,241,0.10), transparent), radial-gradient(500px 240px at 90% 100%, rgba(245,158,11,0.07), transparent)',
                  }} />
                  <div className="absolute inset-0 opacity-[0.25] dark:opacity-[0.35] pointer-events-none" style={{ backgroundImage: 'radial-gradient(rgba(100,116,139,0.18) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

                  <div className="relative p-5 sm:p-7">
                    <div className="flex flex-col xl:flex-row gap-7">
                      {/* Decision */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                          <span className={clsx('h-1.5 w-1.5 rounded-full', r.session.marketOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400')} />
                          {r.index} · {r.session.phase}{r.expiry.isExpiryDay && <span className="text-rose-500 dark:text-rose-400 font-bold tracking-normal">· EXPIRY DAY</span>}
                        </div>
                        <div className={clsx('mt-2 text-3xl sm:text-4xl font-black tracking-tight leading-none',
                          isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white')}>
                          {isActive ? r.trader.decision : 'NO TRADE'}
                          {!isActive && <span className="block text-sm font-bold text-slate-500 dark:text-slate-400 mt-1.5 tracking-normal">capital preservation mode — waiting for edge</span>}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 max-w-xl leading-relaxed">{r.trader.reason}</p>
                        <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-900/[0.04] dark:bg-white/5 ring-1 ring-slate-900/10 dark:ring-white/10 px-3.5 py-2.5 max-w-xl">
                          <span className="text-indigo-500 dark:text-indigo-300 mt-px">⟳</span>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300">
                            <span className="text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[9px] font-bold block mb-0.5">Since previous analysis</span>
                            {r.trader.kept
                              ? <span className="italic">{r.trader.whatChanged[0]}{r.trader.heldSince ? ` · holding since ${new Date(r.trader.heldSince).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                              : r.trader.whatChanged.join(' · ')}
                          </div>
                        </div>
                      </div>

                      {/* Readiness + probability + MQS */}
                      <div className="flex flex-col sm:flex-row xl:flex-col gap-5 items-center xl:items-end shrink-0">
                        <ReadinessGauge passed={gatesPassed} total={gatesTotal} active={isActive} />
                        <div className="w-64">
                          <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">Probability spectrum</div>
                          <ProbSpectrum p={r.probabilities} />
                          <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <span>Market Quality</span>
                            <span className={clsx('font-black text-sm tabular-nums', (r.quality.score ?? 0) >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                              {r.quality.score ?? '—'}<span className="text-slate-400 dark:text-slate-500 text-[10px]">/100 · {r.quality.interpretation}</span>
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-slate-900/10 dark:bg-white/10 overflow-hidden mt-1">
                            <div className={clsx('h-full rounded-full transition-all duration-700', (r.quality.score ?? 0) >= 70 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${r.quality.score ?? 0}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── Order-ticket setup ── */}
                    {r.trader.setup && (
                      <div className="mt-6 relative rounded-2xl bg-white/80 dark:bg-white/[0.06] ring-1 ring-slate-200 dark:ring-white/10 backdrop-blur-sm overflow-hidden shadow-sm">
                        {/* stamp */}
                        <div className={clsx('absolute right-4 top-3 rotate-[8deg] rounded-md border-2 px-2.5 py-0.5 text-[10px] font-black tracking-widest',
                          r.trader.setup.active ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400' : 'border-amber-500/80 text-amber-600 dark:border-amber-400/80 dark:text-amber-400/90')}>
                          {r.trader.setup.active ? 'ACTIVE' : 'WAITING'}
                        </div>
                        <div className="p-4 sm:p-5">
                          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-2">
                            {isActive ? 'The setup' : 'If you still want a trade — best available setup'}
                          </div>
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className={clsx('text-2xl font-black tracking-tight', r.trader.setup.action === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400')}>
                              {r.trader.setup.action} {r.trader.setup.strike.toLocaleString('en-IN')} {r.trader.setup.side}
                            </span>
                            <span className="text-amber-500 dark:text-amber-400 text-sm">{'★'.repeat(r.trader.setup.stars)}<span className="text-slate-300 dark:text-white/15">{'★'.repeat(5 - r.trader.setup.stars)}</span></span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">{r.trader.setup.condition}.</p>

                          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 divide-x divide-dashed divide-slate-200 dark:divide-white/10 rounded-xl bg-slate-50 dark:bg-black/20 ring-1 ring-slate-200/70 dark:ring-white/5">
                            {([
                              ['Premium', r.trader.setup.premiumZone, 'text-slate-900 dark:text-white'],
                              ['Stop-loss', r.trader.setup.stopLoss, 'text-rose-500 dark:text-rose-400'],
                              ['Target 1', r.trader.setup.target1, 'text-emerald-600 dark:text-emerald-400'],
                              ['Target 2', r.trader.setup.target2, 'text-emerald-600 dark:text-emerald-400'],
                            ] as const).map(([l, v, c]) => (
                              <div key={l} className="px-3.5 py-3">
                                <div className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500">{l}</div>
                                <div className={clsx('text-sm font-bold tabular-nums mt-0.5', c)}>{v}</div>
                              </div>
                            ))}
                          </div>

                          <p className={clsx('text-xs font-semibold mt-3', r.trader.setup.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400/90')}>{r.trader.setup.statusLine}</p>
                          {r.trader.setup.sizingNote && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{r.trader.setup.sizingNote}</p>}
                          {r.trader.setup.alternative && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2.5 pt-2.5 border-t border-dashed border-slate-200 dark:border-white/10">
                              <b className="text-slate-700 dark:text-slate-300">Why not the runner-up:</b> {r.trader.setup.alternative}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-3">{r.trader.mqsExplainer}</p>
                  </div>
                </div>
              )
            })()}

            {/* ── Recommendation (only when trade) ── */}
            {r.recommendation && (
              <SectionCard title={`Recommended: ${r.recommendation.strike} ${r.recommendation.side}`} right={<Chip tone="mid">confidence {r.recommendation.confidencePct}% (capped — OI/IV missing)</Chip>}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                  {([
                    ['Premium', fmtN(r.recommendation.premium)],
                    ['Entry zone', r.recommendation.entryZone ? `${fmtN(r.recommendation.entryZone[0])} – ${fmtN(r.recommendation.entryZone[1])}` : '—'],
                    ['Stop (premium)', fmtN(r.recommendation.stopLossPremium)],
                    ['T1 / T2 (premium)', `${fmtN(r.recommendation.target1Premium)} / ${fmtN(r.recommendation.target2Premium)}`],
                    ['Risk:Reward', r.recommendation.riskReward != null ? `1:${r.recommendation.riskReward}` : '—'],
                    ['Entry time', r.recommendation.entryTime],
                    ['Holding', r.recommendation.holdingTime],
                    ['Max holding', r.recommendation.maxHoldingTime],
                  ] as const).map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2.5">
                      <div className="text-[10px] text-slate-400">{l}</div>
                      <div className="font-bold text-slate-900 dark:text-white">{v}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3"><b>Trigger:</b> {r.recommendation.trigger} · <b>Confirm:</b> {r.recommendation.confirmation.join('; ')}</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">Premium targets are delta-proxy estimates (Greeks unavailable). Position sizing and execution are the trader's responsibility.</p>
              </SectionCard>
            )}

            {/* ── Session + Expiry + VIX ── */}
            <div className="grid gap-4 md:grid-cols-3">
              <SectionCard title="Session">
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <div>Spot <b className="text-slate-900 dark:text-white">{fmtN(r.projection.current)}</b> · Prev close {fmtN(r.session.prevClose)}</div>
                  <div>Open {fmtN(r.session.open)} · {r.session.gapType ?? '—'} {r.session.gapPct != null && `(${r.session.gapPct}%)`}</div>
                  <div>Day {fmtN(r.session.dayLow)} – {fmtN(r.session.dayHigh)}</div>
                  <div>OR(15m) {fmtN(r.session.orLow)} – {fmtN(r.session.orHigh)} · <Chip tone={r.session.orState === 'Above OR' ? 'good' : r.session.orState === 'Below OR' ? 'bad' : 'na'}>{r.session.orState ?? 'forming'}</Chip></div>
                </div>
              </SectionCard>
              <SectionCard title="Expiry" right={r.expiry.favors ? <Chip tone="na">{r.expiry.favors}</Chip> : undefined}>
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <div><b className="text-slate-900 dark:text-white">{r.expiry.current ?? '—'}</b> ({r.expiry.kind ?? '—'}) · DTE {r.expiry.dte ?? '—'}</div>
                  <div>Theta <Chip tone={r.expiry.thetaPressure === 'Extreme' || r.expiry.thetaPressure === 'High' ? 'bad' : 'na'}>{r.expiry.thetaPressure ?? '—'}</Chip> Gamma <Chip tone={r.expiry.gammaRisk === 'Extreme' || r.expiry.gammaRisk === 'High' ? 'bad' : 'na'}>{r.expiry.gammaRisk ?? '—'}</Chip></div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{r.expiry.note}</p>
                </div>
              </SectionCard>
              <SectionCard title="India VIX" right={r.vix.band ? <Chip tone={r.vix.band === 'High' || r.vix.band === 'Extreme' ? 'bad' : r.vix.band === 'Normal' ? 'good' : 'mid'}>{r.vix.band}</Chip> : undefined}>
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <div><b className="text-slate-900 dark:text-white text-base">{fmtN(r.vix.value)}</b> {r.vix.changePct != null && <span className={r.vix.changePct >= 0 ? 'text-red-500' : 'text-emerald-500'}>({r.vix.changePct >= 0 ? '+' : ''}{r.vix.changePct}%)</span>}</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{r.vix.note}</p>
                </div>
              </SectionCard>
            </div>

            {/* ── Structure + Levels ── */}
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Market structure" className="lg:col-span-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[560px]">
                    <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="py-1.5 pr-3">TF</th><th className="py-1.5 pr-3">Trend</th><th className="py-1.5 pr-3">&gt;E20</th><th className="py-1.5 pr-3">&gt;E50</th><th className="py-1.5 pr-3">&gt;E200</th><th className="py-1.5 pr-3">RSI</th><th className="py-1.5 pr-3">MACD</th><th className="py-1.5 pr-3">ADX</th><th className="py-1.5 pr-3">ST</th><th className="py-1.5">ATR</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {r.structure.map((s) => <StructRow key={s.tf} s={s} />)}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">VWAP unavailable for index candles (no volume) — will activate when a futures feed exists.</p>
              </SectionCard>
              <SectionCard title="Key levels">
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <div>R2 <b>{fmtN(r.keyLevels.r2)}</b> · R1 <b>{fmtN(r.keyLevels.r1)}</b></div>
                  <div>Pivot <b>{fmtN(r.keyLevels.pivot)}</b></div>
                  <div>S1 <b>{fmtN(r.keyLevels.s1)}</b> · S2 <b>{fmtN(r.keyLevels.s2)}</b></div>
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">Breakout &gt; <b className="text-emerald-600">{fmtN(r.keyLevels.breakout)}</b></div>
                  <div>Breakdown &lt; <b className="text-red-500">{fmtN(r.keyLevels.breakdown)}</b></div>
                  {r.keyLevels.swingResistance.length > 0 && <div>Swing R: {r.keyLevels.swingResistance.map(fmtN).join(', ')}</div>}
                  {r.keyLevels.swingSupport.length > 0 && <div>Swing S: {r.keyLevels.swingSupport.map(fmtN).join(', ')}</div>}
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">Expected range: <b>{fmtN(r.projection.expectedLow)} – {fmtN(r.projection.expectedHigh)}</b> ({fmtN(r.projection.expectedRangePts, 0)} pts)</div>
                </div>
              </SectionCard>
            </div>

            {/* ── Chain + Strategy comparison ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title={`Option chain — ${r.chain.expiry ?? 'waiting for feed'}`}>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  {([
                    ['ATM strike', fmtN(r.chain.atmStrike, 0)],
                    ['ATM straddle', `${fmtN(r.chain.straddle)} (${fmtN(r.chain.straddlePctOfSpot)}% of spot)`],
                    ['Implied day range', r.chain.impliedDayRangeLow != null ? `${fmtN(r.chain.impliedDayRangeLow)} – ${fmtN(r.chain.impliedDayRangeHigh)}` : '—'],
                    ['PCR (volume)', fmtN(r.chain.pcrVolume)],
                    ['Call-heavy strike', fmtN(r.chain.callVolumeHeavyStrike, 0)],
                    ['Put-heavy strike', fmtN(r.chain.putVolumeHeavyStrike, 0)],
                    ['ATM spread', r.chain.atmSpreadPct != null ? `${r.chain.atmSpreadPct}%` : '—'],
                    ['Liquidity', r.chain.liquidity],
                  ] as const).map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2.5">
                      <div className="text-[10px] text-slate-400">{l}</div>
                      <div className="font-bold text-slate-900 dark:text-white">{v}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">{r.chain.note}</p>
              </SectionCard>
              <SectionCard title="Trade comparison — all 12 strategies ranked" right={<Chip tone="na">{r.strategy.verdict}</Chip>}>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs min-w-[560px]">
                    <thead className="sticky top-0 bg-white dark:bg-card-dark"><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="py-1.5 pr-2">#</th><th className="py-1.5 pr-2">Strategy</th><th className="py-1.5 pr-2">Prob</th><th className="py-1.5 pr-2">RR</th><th className="py-1.5 pr-2">θ</th><th className="py-1.5 pr-2">Vega</th><th className="py-1.5 pr-2">Liq</th><th className="py-1.5">Score</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300">
                      {r.strategyMatrix.ranked.map((s, i) => (
                        <tr key={s.id} className={clsx(i === 0 && 'bg-emerald-50/60 dark:bg-emerald-900/10 font-semibold', i === 1 && 'bg-slate-50/60 dark:bg-slate-800/30')}>
                          <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                          <td className="py-1.5 pr-2 text-slate-900 dark:text-white whitespace-nowrap">
                            <span className="text-amber-400">{'⭐'.repeat(s.stars)}</span> {s.action} {s.strike?.toLocaleString('en-IN') ?? '—'} {s.side}
                            <span className="text-[9px] text-slate-400 ml-1">({s.moneyness})</span>
                            {s.rejected && <span className="ml-1.5 text-[9px] font-bold text-red-500" title={s.rejected}>VETOED</span>}
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums">{s.probPct}%</td>
                          <td className="py-1.5 pr-2 tabular-nums">{s.rr != null ? `1:${s.rr}` : '—'}</td>
                          <td className="py-1.5 pr-2"><span className={s.theta === 'Tailwind' ? 'text-emerald-500' : s.theta === 'Headwind' ? 'text-red-500' : 'text-slate-400'}>{s.theta === 'Tailwind' ? '↑' : s.theta === 'Headwind' ? '↓' : '·'}</span></td>
                          <td className="py-1.5 pr-2"><span className={s.vega === 'Favorable' ? 'text-emerald-500' : s.vega === 'Unfavorable' ? 'text-red-500' : 'text-slate-400'}>{s.vega === 'Favorable' ? '↑' : s.vega === 'Unfavorable' ? '↓' : '·'}</span></td>
                          <td className="py-1.5 pr-2">{s.liquidity[0]}</td>
                          <td className="py-1.5 tabular-nums font-semibold">{s.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {r.strategyMatrix.whyBest && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2"><b className="text-emerald-600 dark:text-emerald-400">Why #1:</b> {r.strategyMatrix.whyBest}</p>
                )}
                {r.strategyMatrix.whyNotSecond && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1"><b>Why not #2:</b> {r.strategyMatrix.whyNotSecond}</p>
                )}
                {r.strategyMatrix.nearTieNote && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1"><b>Near-tie:</b> {r.strategyMatrix.nearTieNote}</p>
                )}
                <p className="text-[10px] text-slate-400 mt-2">Probabilities are heuristic estimates from live structure/volume/VIX (IV & Greeks unavailable — theta/gamma/vega shown qualitatively via DTE, straddle richness and VIX).</p>
              </SectionCard>
            </div>

            {/* ── Gates + Strikes ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Entry gates (all must pass)">
                <div className="space-y-1.5">
                  {r.strategy.gates.map((g) => (
                    <div key={g.gate} className="flex items-start gap-2 text-xs">
                      <span className={clsx('mt-px font-bold', g.pass === true ? 'text-emerald-500' : g.pass === false ? 'text-red-500' : 'text-slate-400')}>{g.pass === true ? '✓' : g.pass === false ? '✗' : '?'}</span>
                      <div><span className="font-semibold text-slate-900 dark:text-white">{g.gate}</span> <span className="text-slate-500 dark:text-slate-400">— {g.detail}</span></div>
                    </div>
                  ))}
                </div>
              </SectionCard>
              <SectionCard title="Strike candidates" right={<span className="text-[10px] text-slate-400">for the current directional lean</span>}>
                {r.candidates.length === 0 ? <p className="text-xs text-slate-400">Waiting for option-chain data…</p> : (
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400"><th className="py-1.5 pr-2">Strike</th><th className="py-1.5 pr-2">Type</th><th className="py-1.5 pr-2">Premium</th><th className="py-1.5 pr-2">Spread</th><th className="py-1.5 pr-2">Liq</th><th className="py-1.5">Score</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300">
                      {r.candidates.map((c) => (
                        <tr key={c.label} className={clsx(c === r.candidates[0] && 'font-semibold')}>
                          <td className="py-1.5 pr-2 text-slate-900 dark:text-white">{c.strike} <span className="text-[10px] text-slate-400">({c.label})</span></td>
                          <td className="py-1.5 pr-2">{c.side}</td>
                          <td className="py-1.5 pr-2">{fmtN(c.premium)}</td>
                          <td className="py-1.5 pr-2">{c.spreadPct != null ? `${c.spreadPct}%` : '—'}</td>
                          <td className="py-1.5 pr-2">{c.liquidity}</td>
                          <td className="py-1.5 tabular-nums">{c.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </SectionCard>
            </div>

            {/* ── Time blocks + Risks + Sentiment ── */}
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Time blocks" className="lg:col-span-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[520px]">
                    <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400"><th className="py-1.5 pr-2">Block</th><th className="py-1.5 pr-2">Trend</th><th className="py-1.5 pr-2">Volatility</th><th className="py-1.5 pr-2">Strategy</th><th className="py-1.5">Avoid?</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300">
                      {r.timeBlocks.map((b) => (
                        <tr key={b.block} className={clsx(b.current && 'bg-brand-50/50 dark:bg-brand-900/10')}>
                          <td className="py-1.5 pr-2 font-semibold text-slate-900 dark:text-white">{b.block}{b.current && <span className="ml-1 text-[9px] text-brand-500 font-bold">NOW</span>}</td>
                          <td className="py-1.5 pr-2">{b.trend}</td>
                          <td className="py-1.5 pr-2">{b.volatility}</td>
                          <td className="py-1.5 pr-2">{b.strategy}</td>
                          <td className="py-1.5">{b.avoid ? <Chip tone="bad">YES</Chip> : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
              <SectionCard title="Risks & sentiment">
                <div className="space-y-1.5 mb-3">
                  {r.risks.map((k) => (
                    <div key={k.risk} className="flex items-start gap-2 text-xs">
                      <Chip tone={k.level === 'High' ? 'bad' : k.level === 'Moderate' ? 'mid' : 'good'}>{k.level}</Chip>
                      <div className="text-slate-600 dark:text-slate-300"><b className="text-slate-900 dark:text-white">{k.risk}</b> — {k.note}</div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  Tape sentiment: <b className="text-slate-900 dark:text-white">{r.sentiment.label}</b> ({r.sentiment.confidencePct}%)
                  <p className="text-[10px] text-slate-400 mt-1">{r.sentiment.basis}</p>
                </div>
              </SectionCard>
            </div>

            {/* ── Data availability ── */}
            <SectionCard title="Data availability" right={<Chip tone="mid">confidence reduced accordingly</Chip>}>
              <ul className="grid gap-1 sm:grid-cols-2 text-[11px] text-slate-500 dark:text-slate-400">
                {r.missing.map((m) => <li key={m} className="flex gap-1.5"><span className="text-amber-500">⚠</span>{m}</li>)}
              </ul>
            </SectionCard>

            <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 px-1 pb-4">{r.disclaimer}</p>
          </>
        )}
      </div>
    </div>
  )
}
