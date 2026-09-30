// ── Option Insight ───────────────────────────────────────────────────────────
// Server-side quantitative option-BUYING analysis (ported from the Option-
// Analysis engine). Admin runs the analysis for NIFTY / BANKNIFTY / SENSEX; the
// stored result is served to every user here. No Kite, no execution, no AI —
// pure quantitative signals. Research only, not investment advice.
import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const BASE = (import.meta.env.VITE_INSIGHT_API as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3600' : 'https://insights.vtrader.in')
const client = axios.create({ baseURL: BASE })

// ── helpers ──────────────────────────────────────────────────────────────────
const nf = (v: unknown, d = 2) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }))
const int = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? '—' : Math.round(Number(v)).toLocaleString('en-IN'))
const pctOf = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? '—' : `${Math.round(Number(v) * 100)}%`)
const signed = (v: unknown, d = 1) => (v == null || Number.isNaN(Number(v)) ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(d)}`)

type Decision = 'CALL' | 'PUT' | 'BOTH' | 'NO_TRADE'
const DECISION_THEME: Record<Decision, { label: string; grad: string; ring: string; text: string; chip: string }> = {
  CALL: { label: 'CALL', grad: 'from-emerald-500/20 via-emerald-500/5 to-transparent', ring: 'ring-emerald-500/40', text: 'text-emerald-500 dark:text-emerald-400', chip: 'bg-emerald-500 text-white' },
  PUT: { label: 'PUT', grad: 'from-rose-500/20 via-rose-500/5 to-transparent', ring: 'ring-rose-500/40', text: 'text-rose-500 dark:text-rose-400', chip: 'bg-rose-500 text-white' },
  BOTH: { label: 'STRADDLE', grad: 'from-brand-500/20 via-brand-500/5 to-transparent', ring: 'ring-brand-500/40', text: 'text-brand-600 dark:text-brand-400', chip: 'bg-brand-500 text-slate-900' },
  NO_TRADE: { label: 'NO TRADE', grad: 'from-slate-400/10 via-slate-400/5 to-transparent', ring: 'ring-slate-400/30', text: 'text-slate-400', chip: 'bg-slate-500 text-white' },
}
const biasChip = (b?: string) =>
  b === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
  : b === 'BEARISH' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
  : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20'

export default function OptionInsightsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const pollRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    try { setData((await client.get('/option-analysis/current')).data) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    pollRef.current = window.setInterval(() => void load(), 60_000)
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [load])

  const runAnalysis = async () => {
    setRunning(true)
    try { setData(await (await client.post('/option-analysis/run')).data); await load() } finally { setRunning(false) }
  }

  const byIndex = data?.byIndex ?? {}
  const order = data?.indices?.length ? data.indices : ['NIFTY', 'BANKNIFTY', 'SENSEX']
  const generatedAt = data?.generatedAt ? new Date(data.generatedAt) : null
  const hasResult = order.some((i: string) => byIndex[i])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-surface-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
                <svg className="h-5 w-5 text-slate-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
              </div>
              <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight">Option Insight</h1>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/20">Buying</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Quantitative intraday analysis for NIFTY, BANKNIFTY & SENSEX — OI walls, PCR, ORB, gap, VIX expected move and live-premium profitability, combined into one directional call. Research only, not advice.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {generatedAt && (
              <div className="text-right mr-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Last analysed</div>
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300"><LiveAgo at={generatedAt} /></div>
              </div>
            )}
            {isAdmin && (
              <>
                <button onClick={() => setSettingsOpen(true)}
                  className="h-9 px-3.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  Settings
                </button>
                <Link to="/insight/option-lab"
                  className="h-9 px-3.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center">
                  Dry-run Lab
                </Link>
                <button onClick={() => void runAnalysis()} disabled={running}
                  className="h-9 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-400 to-brand-600 text-slate-900 shadow-lg shadow-brand-500/25 hover:brightness-105 disabled:opacity-50 transition flex items-center gap-2">
                  {running && <Spinner />}
                  {running ? 'Analysing…' : 'Run analysis'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── body ── */}
        {loading ? (
          <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <SkeletonCard key={i} />)}</div>
        ) : !hasResult ? (
          <EmptyState isAdmin={isAdmin} onRun={() => void runAnalysis()} running={running} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {order.map((idx: string) => byIndex[idx] && <IndexCard key={idx} r={byIndex[idx]} />)}
          </div>
        )}

        <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center pt-2">
          Quantitative signals for research and education only — not investment advice. Options carry substantial risk of loss.
        </p>
      </div>

      {isAdmin && settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} onSaved={() => void load()} />}
    </div>
  )
}

// ── index card ────────────────────────────────────────────────────────────────
function IndexCard({ r }: { r: any }) {
  if (!r.ok) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-slate-900 dark:text-white">{r.index}</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-400">unavailable</span>
        </div>
        <p className="mt-3 text-xs text-slate-500">{r.skip || r.error || 'No data for this index right now.'}</p>
      </div>
    )
  }
  const t = DECISION_THEME[(r.decision as Decision)] ?? DECISION_THEME.NO_TRADE
  const change = r.spot != null && r.dayOpen != null ? r.spot - r.dayOpen : null
  const changePct = change != null && r.dayOpen ? (change / r.dayOpen) * 100 : null
  const upside = r.probability?.upside ?? null

  return (
    <div className={clsx('rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-hidden animate-slide-up ring-1', t.ring)}>
      {/* decision banner */}
      <div className={clsx('relative px-5 pt-4 pb-4 bg-gradient-to-b', t.grad)}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">{r.index}</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/5 dark:bg-white/10 text-slate-500 dark:text-slate-400 font-mono">{r.expiry}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{nf(r.spot, 2)}</span>
              {change != null && (
                <span className={clsx('text-xs font-semibold tabular-nums', change >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                  {signed(change, 1)} ({signed(changePct, 2)}%)
                </span>
              )}
            </div>
          </div>
          <span className={clsx('px-3 py-1.5 rounded-xl text-sm font-extrabold tracking-wide shadow-sm', t.chip)}>{t.label}</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{r.reason}</p>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* recommendation */}
        {r.recommendation?.legs?.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Suggested entry</div>
            <div className="space-y-2">
              {r.recommendation.legs.map((l: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    BUY <span className="tabular-nums">{int(l.strike)}</span> <span className={l.side === 'CE' ? 'text-emerald-500' : 'text-rose-500'}>{l.side}</span>
                  </span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    @ ₹{nf(l.entryPremium, 2)} <span className="text-slate-300 dark:text-slate-600">·</span> BE {int(l.breakeven)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* probability gauge */}
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-slate-400">Upside probability</span>
            <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{pctOf(upside)}</span>
          </div>
          <ProbBar upside={upside} />
          <div className="flex justify-between text-[9px] text-slate-400 mt-1">
            <span>PUT ≤45%</span><span>coin-flip</span><span>≥55% CALL</span>
          </div>
        </div>

        {/* expected move */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric label="Exp. move" value={`±${int(r.expectedMove)}`} sub="pts" />
          <Metric label="Down target" value={int(r.expectedDownsideTarget)} sub="" />
          <Metric label="Up target" value={int(r.expectedUpsideTarget)} sub="" />
        </div>

        {/* signal chips */}
        <div className="flex flex-wrap gap-1.5">
          <Chip label="OI" value={r.oiBias} cls={biasChip(r.oiBias)} />
          <Chip label="ORB" value={r.orbBias} cls={biasChip(r.orbBias)} />
          <Chip label="ATM OI" value={r.atmOiBias} cls={biasChip(r.atmOiBias)} />
          <Chip label="Momentum" value={r.momentum?.bias} cls={biasChip(r.momentum?.bias)} />
          <Chip label="Gap" value={r.gap?.large ? 'LARGE' : signed(r.gap?.points, 0)} cls={r.gap?.large ? biasChip('BEARISH') : biasChip()} />
        </div>

        {/* stats grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
          <Row k="PCR (weighted)" v={`${nf(r.pcr, 2)} (${nf(r.weightedPcr, 2)})`} />
          <Row k="India VIX" v={nf(r.indiaVix, 2)} />
          <Row k="Vol. confidence" v={r.volatilityConfidence == null ? '—' : `${Math.round(r.volatilityConfidence)}%`} />
          <Row k="ATM premium C/P" v={`${nf(r.premiums?.ce, 0)} / ${nf(r.premiums?.pe, 0)}`} />
          <Row k="Resistance" v={`${int(r.walls?.resistanceStrike)} (${int(r.walls?.resistanceDistance)}p)`} />
          <Row k="Support" v={`${int(r.walls?.supportStrike)} (${int(r.walls?.supportDistance)}p)`} />
        </div>
      </div>
    </div>
  )
}

function ProbBar({ upside }: { upside: number | null }) {
  const pct = upside == null ? 50 : Math.round(upside * 100)
  return (
    <div className="relative h-2.5 rounded-full bg-gradient-to-r from-rose-500/30 via-slate-300 dark:via-slate-600 to-emerald-500/30 overflow-visible">
      <div className="absolute inset-y-0 left-[45%] w-px bg-slate-400/50" />
      <div className="absolute inset-y-0 left-[55%] w-px bg-slate-400/50" />
      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-white dark:bg-slate-100 border-2 border-brand-500 shadow transition-all" style={{ left: `${pct}%` }} />
    </div>
  )
}
function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 py-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{value}<span className="text-[9px] font-normal text-slate-400 ml-0.5">{sub}</span></div>
    </div>
  )
}
function Chip({ label, value, cls }: { label: string; value?: string; cls: string }) {
  return <span className={clsx('px-2 py-0.5 rounded-md text-[10px] font-semibold border', cls)}>{label} <span className="opacity-90">{value ?? '—'}</span></span>
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between"><span className="text-slate-400">{k}</span><span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{v}</span></div>
}

function LiveAgo({ at }: { at: Date }) {
  const [, force] = useState(0)
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 30_000); return () => clearInterval(t) }, [])
  const secs = Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000))
  const s = secs < 60 ? `${secs}s ago` : secs < 3600 ? `${Math.floor(secs / 60)}m ago` : at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  return <>{s}</>
}
function Spinner() { return <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin" /> }
function SkeletonCard() {
  return <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark h-96 animate-pulse" />
}
function EmptyState({ isAdmin, onRun, running }: { isAdmin: boolean; onRun: () => void; running: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-card-dark py-16 px-6 text-center animate-fade-in">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-4">
        <svg className="h-7 w-7 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
      </div>
      <h3 className="font-display font-bold text-slate-800 dark:text-white">No analysis yet</h3>
      <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
        {isAdmin ? 'Run the analysis to generate the latest directional read for all three indices. Results are shared with every user.' : 'The analysis hasn’t been run yet. Please check back shortly — an admin refreshes it during market hours.'}
      </p>
      {isAdmin && (
        <button onClick={onRun} disabled={running}
          className="mt-4 h-9 px-5 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-400 to-brand-600 text-slate-900 shadow-lg shadow-brand-500/25 hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2">
          {running && <Spinner />}{running ? 'Analysing…' : 'Run analysis'}
        </button>
      )}
    </div>
  )
}

// ── admin settings drawer ─────────────────────────────────────────────────────
function SettingsDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<any>(null)
  const [defaults, setDefaults] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { void (async () => { const { data } = await client.get('/option-analysis/settings'); setS(data.settings); setDefaults(data.defaults) })() }, [])

  const set = (k: string, v: any) => { setMsg(null); setS((p: any) => ({ ...p, [k]: v })) }
  const setLot = (idx: string, v: any) => { setMsg(null); setS((p: any) => ({ ...p, lot_sizes: { ...p.lot_sizes, [idx]: v === '' ? '' : Number(v) } })) }
  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      // drop any transient blank fields so they keep their stored value
      const lot_sizes = Object.fromEntries(Object.entries(s.lot_sizes ?? {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, Number(v)]))
      const payload = { ...s, lot_sizes }
      // persist, then reflect exactly what the server stored back into the form
      const { data } = await client.post('/option-analysis/settings', payload)
      if (data?.settings) setS(data.settings)
      setMsg({ ok: true, text: 'Saved ✓ — applies to the next analysis run.' })
      onSaved()
    } catch (e: any) {
      setMsg({ ok: false, text: `Save failed: ${e?.response?.data?.error ?? e?.message ?? 'unknown error'}` })
    } finally { setSaving(false) }
  }
  const reset = () => { if (defaults) { setMsg(null); setS({ ...defaults }) } }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white dark:bg-surface-dark shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white/90 dark:bg-surface-dark/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-display font-bold text-slate-900 dark:text-white">Analysis settings</h2>
            <p className="text-[11px] text-slate-400">Admin only · applies to the next run</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 flex items-center justify-center">✕</button>
        </div>

        {!s ? <div className="p-6 text-xs text-slate-400">Loading…</div> : (
          <div className="p-5 space-y-6">
            <Section title="Signal thresholds">
              <NumField label="PCR threshold" k="pcr_threshold" s={s} set={set} step={0.01} />
              <NumField label="Gap threshold factor" k="gap_threshold_factor" s={s} set={set} step={0.1} />
              <NumField label="Min expected move (pts)" k="min_expected_move_points" s={s} set={set} step={1} />
              <NumField label="CALL probability ≥" k="call_probability_threshold" s={s} set={set} step={0.01} />
              <NumField label="PUT probability ≤" k="put_probability_threshold" s={s} set={set} step={0.01} />
              <NumField label="Profit margin factor" k="profit_margin_factor" s={s} set={set} step={0.05} />
              <NumField label="ORB minutes" k="orb_minutes" s={s} set={set} step={1} />
            </Section>

            <Section title="Dry-run sizing">
              <NumField label="Lots" k="lots" s={s} set={set} step={1} />
              <div className="grid grid-cols-3 gap-2">
                {['NIFTY', 'BANKNIFTY', 'SENSEX'].map((idx) => (
                  <label key={idx} className="text-[11px]">
                    <span className="text-slate-400">{idx} lot</span>
                    <input type="number" value={s.lot_sizes?.[idx] ?? ''} onChange={(e) => setLot(idx, e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm tabular-nums" />
                  </label>
                ))}
              </div>
            </Section>

            <Section title="Auto-run (daily)">
              <ToggleField label="Auto-run each trading day" k="auto_run_enabled" s={s} set={set} />
              <TimeField label="Start time (IST)" k="start_time" s={s} set={set} />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                At this time every weekday the server analyses all indices and opens dry-run positions automatically — no manual run needed. Waits for market open (09:15) if earlier. Tip: 09:20+ so the opening range has begun forming.
              </p>
            </Section>

            <Section title="Exit rules (SL / target / time)">
              <ToggleField label="Stop-loss enabled" k="sl_enabled" s={s} set={set} />
              <NumField label="Max loss (₹)" k="max_loss" s={s} set={set} step={100} />
              <ToggleField label="Target enabled" k="target_enabled" s={s} set={set} />
              <NumField label="Target profit (₹)" k="target_profit" s={s} set={set} step={100} />
              <SelectField label="P&L mode" k="pnl_mode" s={s} set={set} opts={['COMBINED', 'PERLEG']} />
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
              <ToggleField label="Time exit enabled" k="time_exit_enabled" s={s} set={set} />
              <TimeField label="Time exit (IST)" k="time_exit" s={s} set={set} />
              <TimeField label="Force exit (IST) — always on" k="force_exit_time" s={s} set={set} />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Values are always editable; the toggle decides whether that rule is active. Force-exit is the day-end safety square-off and is always on (default 15:15). Stop-loss and target are off by default (as in the reference engine) — turn them on to have positions exit on rupee P&L.
              </p>
            </Section>

            {msg && (
              <div className={clsx('text-[11px] rounded-lg px-3 py-2 border', msg.ok
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400')}>
                {msg.text}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button onClick={() => void save()} disabled={saving}
                className="flex-1 h-10 rounded-xl text-sm font-bold bg-gradient-to-r from-brand-400 to-brand-600 text-slate-900 shadow-lg shadow-brand-500/25 hover:brightness-105 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save settings'}
              </button>
              <button onClick={reset} className="h-10 px-4 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Defaults</button>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Force-exit is always active as a day-end safety square-off. Stop-loss and target are off by default (as in the reference engine) — enable them to have dry-run positions exit on P&L. Lot sizes are exchange-set and change over time; keep them current.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">{title}</h3>
      {children}
    </div>
  )
}
function NumField({ label, k, s, set, step = 1, disabled }: any) {
  return (
    <label className={clsx('flex items-center justify-between gap-3', disabled && 'opacity-40')}>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <input type="number" step={step} disabled={disabled} value={s[k] ?? ''} onChange={(e) => set(k, e.target.value === '' ? '' : Number(e.target.value))}
        className="w-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm tabular-nums text-right" />
    </label>
  )
}
function TimeField({ label, k, s, set, disabled }: any) {
  return (
    <label className={clsx('flex items-center justify-between gap-3', disabled && 'opacity-40')}>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <input type="time" disabled={disabled} value={s[k] ?? ''} onChange={(e) => set(k, e.target.value)}
        className="w-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm tabular-nums text-right" />
    </label>
  )
}
function SelectField({ label, k, s, set, opts }: any) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <select value={s[k] ?? ''} onChange={(e) => set(k, e.target.value)}
        className="w-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm">
        {opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
function ToggleField({ label, k, s, set }: any) {
  const on = !!s[k]
  return (
    <button type="button" onClick={() => set(k, !on)} className="w-full flex items-center justify-between">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={clsx('h-5 w-9 rounded-full p-0.5 transition', on ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700')}>
        <span className={clsx('block h-4 w-4 rounded-full bg-white transition-transform', on && 'translate-x-4')} />
      </span>
    </button>
  )
}
