// ── Option Lab (dry-run) ──────────────────────────────────────────────────────
// Paper-trades the Option Insight engine's decisions and tracks each to its exit
// (SL / target / time / force-exit), faithful to the reference engine. Admin-only.
// P&L is in rupees: (exit − entry) × lots × lot_size, buying-only. Research only.
import { useEffect, useState } from 'react'
import axios from 'axios'
import clsx from 'clsx'

const BASE = (import.meta.env.VITE_INSIGHT_API as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3600' : 'https://insights.vtrader.in')
const client = axios.create({ baseURL: BASE })

type Tab = 'open' | 'history' | 'metrics'
const nf = (v: unknown, d = 2) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }))
const int = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? '—' : Math.round(Number(v)).toLocaleString('en-IN'))
const pnlColor = (v: unknown) => (v == null ? '' : Number(v) > 0 ? 'text-emerald-600 dark:text-emerald-400' : Number(v) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400')
const legStr = (legs: any[]) => (Array.isArray(legs) ? legs.map((l) => `${int(l.strike)}${l.side}`).join(' + ') : '—')
const decisionCls = (d: string) => d === 'CALL' ? 'text-emerald-500' : d === 'PUT' ? 'text-rose-500' : d === 'BOTH' ? 'text-brand-500' : 'text-slate-400'
const statusCls = (s: string) =>
  s === 'TARGET' ? 'bg-emerald-500/10 text-emerald-500'
  : s === 'STOP_LOSS' ? 'bg-rose-500/10 text-rose-500'
  : s === 'OPEN' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
  : 'bg-slate-500/10 text-slate-500'

export default function OptionLabPage() {
  const [tab, setTab] = useState<Tab>('open')
  const [rows, setRows] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async (t: Tab) => {
    setLoading(true)
    try {
      if (t === 'metrics') setMetrics((await client.get('/option-analysis/dryrun/metrics')).data)
      else setRows((await client.get('/option-analysis/dryrun', { params: t === 'open' ? { open: 1 } : { limit: 300 } })).data.rows ?? [])
    } finally { setLoading(false) }
  }
  useEffect(() => { void load(tab) /* eslint-disable-next-line */ }, [tab])

  const evaluateNow = async () => { setBusy('eval'); try { await client.post('/option-analysis/dryrun/evaluate'); await load(tab) } finally { setBusy(null) } }
  const wipe = async () => {
    if (!window.confirm('Delete ALL Option Lab dry-run data? This cannot be undone.')) return
    setBusy('wipe'); try { await client.post('/option-lab/reset'); await load(tab) } finally { setBusy(null) }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-surface-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">Option Lab · Dry-run</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Every Option Insight decision is paper-traded and tracked to its exit (stop-loss, target, time or day-end force-exit). P&L in rupees, buying-only. Measure and tune the engine over time — research only, not advice.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void evaluateNow()} disabled={!!busy}
              className="h-9 px-3.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50">
              {busy === 'eval' ? 'Evaluating…' : 'Evaluate now'}
            </button>
            <button onClick={() => void wipe()} disabled={!!busy}
              className="h-9 px-3.5 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50">
              {busy === 'wipe' ? 'Wiping…' : 'Reset data'}
            </button>
          </div>
        </div>

        <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden w-fit">
          {(['open', 'history', 'metrics'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('px-4 py-1.5 text-xs font-bold capitalize', tab === t ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-card-dark text-slate-500 dark:text-slate-400')}>
              {t === 'open' ? 'Open positions' : t}
            </button>
          ))}
        </div>

        {loading && <div className="text-xs text-slate-400">Loading…</div>}

        {tab === 'open' && !loading && (
          <Table
            empty="No open dry-run positions. One opens per index when the engine gives a trade (during market hours), and is held until SL / target / time / force-exit."
            cols={['Time', 'Index', 'Decision', 'Legs', 'Entry ₹', 'Now P&L ₹', 'MFE ₹', 'MAE ₹', 'Qty', 'Status']}
            rows={rows.map((r) => [
              new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), r.index_sym,
              <span className={clsx('font-bold', decisionCls(r.decision))}>{r.decision}</span>,
              legStr(r.legs), nf(r.entry_combined, 2),
              <span className={pnlColor(r.last_pnl)}>{nf(r.last_pnl, 0)}</span>,
              <span className={pnlColor(r.mfe)}>{nf(r.mfe, 0)}</span>, <span className={pnlColor(r.mae)}>{nf(r.mae, 0)}</span>,
              int(r.qty), <Badge s={r.status} />,
            ])}
          />
        )}

        {tab === 'history' && !loading && (
          <Table
            empty="No dry-run trades yet."
            cols={['Time', 'Index', 'Decision', 'Legs', 'Exit', 'P&L ₹', 'MFE ₹', 'MAE ₹', 'Mins', 'Status']}
            rows={rows.map((r) => [
              new Date(r.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }), r.index_sym,
              <span className={clsx('font-bold', decisionCls(r.decision))}>{r.decision}</span>,
              legStr(r.legs), r.exit_reason ?? '—',
              <span className={pnlColor(r.exit_pnl ?? r.last_pnl)}>{nf(r.exit_pnl ?? r.last_pnl, 0)}</span>,
              <span className={pnlColor(r.mfe)}>{nf(r.mfe, 0)}</span>, <span className={pnlColor(r.mae)}>{nf(r.mae, 0)}</span>,
              r.minutes_to_outcome ?? '—', <Badge s={r.status} />,
            ])}
          />
        )}

        {tab === 'metrics' && !loading && metrics && <Metrics m={metrics} />}
      </div>
    </div>
  )
}

function Badge({ s }: { s: string }) { return <span className={clsx('px-2 py-0.5 rounded-md text-[10px] font-bold', statusCls(s))}>{s}</span> }

function Table({ cols, rows, empty }: { cols: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-6 text-xs text-slate-500">{empty}</div>
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-800">
          {cols.map((c) => <th key={c} className="px-3 py-2.5 font-semibold whitespace-nowrap">{c}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
              {row.map((cell, j) => <td key={j} className="px-3 py-2.5 whitespace-nowrap text-slate-700 dark:text-slate-300 tabular-nums">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={clsx('text-lg font-bold tabular-nums', tone ?? 'text-slate-900 dark:text-white')}>{value}</div>
    </div>
  )
}

function Metrics({ m }: { m: any }) {
  const pnlColorLocal = (v: unknown) => (v == null ? undefined : Number(v) > 0 ? 'text-emerald-500' : Number(v) < 0 ? 'text-rose-500' : undefined)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat label="Trades" value={m.counts?.resolved ?? 0} />
        <Stat label="Open now" value={m.counts?.openNow ?? 0} />
        <Stat label="Win rate" value={m.winRate == null ? '—' : `${m.winRate}%`} />
        <Stat label="Net P&L ₹" value={int(m.netPnl)} tone={pnlColorLocal(m.netPnl)} />
        <Stat label="Profit factor" value={nf(m.profitFactor)} />
        <Stat label="Max DD ₹" value={int(m.maxDrawdown)} tone="text-rose-500" />
        <Stat label="Avg P&L ₹" value={int(m.avgPnl)} tone={pnlColorLocal(m.avgPnl)} />
        <Stat label="Avg win ₹" value={int(m.avgWin)} tone="text-emerald-500" />
        <Stat label="Avg loss ₹" value={int(m.avgLoss)} tone="text-rose-500" />
        <Stat label="Wins" value={m.counts?.wins ?? 0} />
        <Stat label="Losses" value={m.counts?.losses ?? 0} />
        <Stat label="Total logged" value={m.counts?.total ?? 0} />
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-800">
            {['Index', 'Trades', 'Win%', 'Net P&L ₹'].map((c) => <th key={c} className="px-3 py-2.5 font-semibold">{c}</th>)}
          </tr></thead>
          <tbody>
            {(m.byIndex ?? []).map((g: any) => (
              <tr key={g.index} className="border-b border-slate-50 dark:border-slate-800/50">
                <td className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200">{g.index}</td>
                <td className="px-3 py-2.5 tabular-nums">{g.trades}</td>
                <td className="px-3 py-2.5 tabular-nums">{g.winRate == null ? '—' : `${g.winRate}%`}</td>
                <td className={clsx('px-3 py-2.5 tabular-nums font-semibold', pnlColorLocal(g.netPnl))}>{int(g.netPnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-3 py-2">
        {(m.counts?.resolved ?? 0) < 30
          ? `Only ${m.counts?.resolved ?? 0} resolved trades — too few for firm conclusions. Aim for ~30 for a first read, ~100 to trust the win-rate.`
          : `${m.counts?.resolved} resolved trades.`}
      </div>
    </div>
  )
}
