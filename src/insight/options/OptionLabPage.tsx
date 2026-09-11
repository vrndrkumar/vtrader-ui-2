// ── Option Lab: live/would-be option trades, outcomes, and performance ───────
// Reads the server-side log built from the (v2) engine's decisions. Admin-only.
import { useEffect, useState } from 'react'
import axios from 'axios'
import clsx from 'clsx'

const BASE = (import.meta.env.VITE_INSIGHT_API as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3600' : 'https://insights.vtrader.in')
const client = axios.create({ baseURL: BASE })

type Tab = 'live' | 'history' | 'metrics'
const num = (v: unknown, d = 2) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d))
const pnlColor = (v: unknown) => (v == null ? '' : Number(v) > 0 ? 'text-emerald-600 dark:text-emerald-400' : Number(v) < 0 ? 'text-rose-600 dark:text-rose-400' : '')

export default function OptionLabPage() {
  const [tab, setTab] = useState<Tab>('live')
  const [live, setLive] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

  const loadLive = async () => { setLoading(true); try { setLive((await client.get('/option-lab/live')).data.rows ?? []) } finally { setLoading(false) } }
  const loadHistory = async () => { setLoading(true); try { setHistory((await client.get('/option-lab/signals', { params: { limit: 300 } })).data.rows ?? []) } finally { setLoading(false) } }
  const loadMetrics = async () => { setLoading(true); try { setMetrics((await client.get('/option-lab/metrics')).data) } finally { setLoading(false) } }

  useEffect(() => {
    if (tab === 'live') void loadLive()
    else if (tab === 'history') void loadHistory()
    else void loadMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const evaluateNow = async () => {
    setEvaluating(true)
    try { await client.post('/option-lab/evaluate'); if (tab === 'live') await loadLive(); else if (tab === 'history') await loadHistory(); else await loadMetrics() }
    finally { setEvaluating(false) }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Option Lab</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">Every engine decision (real & would-be) is logged with indicators, VIX, Greeks and market state, then tracked to its outcome. Use it to measure and tune the engine over time. Research only — not advice.</p>
        </div>
        <button onClick={() => void evaluateNow()} disabled={evaluating}
          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
          {evaluating ? 'Evaluating…' : 'Evaluate outcomes now'}
        </button>
      </div>

      <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden w-fit">
        {(['live', 'history', 'metrics'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('px-4 py-1.5 text-xs font-bold capitalize', tab === t ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-card-dark text-slate-500 dark:text-slate-400')}>
            {t === 'live' ? 'Live / open' : t}
          </button>
        ))}
      </div>

      {loading && <div className="text-xs text-slate-400">Loading…</div>}

      {tab === 'live' && !loading && (
        <Table
          empty="No open position right now. A position appears only when the engine takes a real (active) trade, and it stays here — held and tracked — until its SL or target hits. NO-TRADE candidates are recorded under History for research, not shown as trades."
          cols={['Time', 'Index', 'Trade', 'Strike', 'Entry', 'Now', 'SL', 'T1', 'Status', 'MFE', 'MAE']}
          rows={live.map((r) => [
            new Date(r.created_at).toLocaleTimeString(), r.index_sym,
            `${r.action ?? '—'} ${r.side ?? ''}`, num(r.strike, 0), num(r.entry_premium), num(r.last_premium),
            num(r.sl_premium), num(r.t1_premium), r.status,
            <span className={pnlColor(r.mfe)}>{num(r.mfe)}</span>, <span className={pnlColor(r.mae)}>{num(r.mae)}</span>,
          ])}
        />
      )}

      {tab === 'history' && !loading && (
        <Table
          empty="No signals logged yet."
          cols={['Time', 'Index', 'Verdict', 'Trade', 'Strike', 'Conf', 'Result', 'P&L', 'R', 'Mins']}
          rows={history.map((r) => [
            new Date(r.created_at).toLocaleString(), r.index_sym,
            <span className={r.verdict === 'NO TRADE' ? 'text-slate-400' : 'text-slate-800 dark:text-slate-200'}>{r.verdict}</span>,
            r.action ? `${r.action} ${r.side}` : '—', num(r.strike, 0), r.confidence ?? '—',
            r.status ?? '—',
            <span className={pnlColor(r.pnl_premium)}>{r.pnl_premium == null ? '—' : num(r.pnl_premium)}</span>,
            <span className={pnlColor(r.r_multiple)}>{r.r_multiple == null ? '—' : num(r.r_multiple)}</span>,
            r.minutes_to_outcome ?? '—',
          ])}
        />
      )}

      {tab === 'metrics' && !loading && metrics && <Metrics m={metrics} />}
    </div>
  )
}

function Table({ cols, rows, empty }: { cols: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-6 text-xs text-slate-500">{empty}</div>
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-800">
          {cols.map((c) => <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap">{c}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50">
              {row.map((cell, j) => <td key={j} className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={clsx('text-lg font-bold', tone ?? 'text-slate-900 dark:text-white')}>{value}</div>
    </div>
  )
}

function GroupTable({ title, rows }: { title: string; rows: any[] }) {
  if (!rows?.length) return null
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300">{title}</h3>
      <Table
        cols={['Group', 'Trades', 'Win%', 'Expectancy', 'Avg R', 'Profit factor']}
        empty="—"
        rows={rows.map((g) => [g.key, g.trades, g.winRate == null ? '—' : `${g.winRate}%`, num(g.expectancy), num(g.avgR), num(g.profitFactor)])}
      />
    </div>
  )
}

function Metrics({ m }: { m: any }) {
  const o = m.overall ?? {}
  return (
    <div className="space-y-5">
      <div className="text-[11px] rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-3 py-2">{m.note}</div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <Stat label="Signals" value={m.counts?.totalSignals ?? 0} />
        <Stat label="Given trades" value={m.counts?.givenTrades ?? 0} />
        <Stat label="Would-be" value={m.counts?.wouldBeTrades ?? 0} />
        <Stat label="Open now" value={m.counts?.openNow ?? 0} />
        <Stat label="Resolved" value={m.counts?.resolved ?? 0} />
        <Stat label="NO TRADE" value={m.counts?.noTrade ?? 0} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <Stat label="Win rate" value={o.winRate == null ? '—' : `${o.winRate}%`} />
        <Stat label="Expectancy" value={num(o.expectancy)} tone={pnlColor(o.expectancy)} />
        <Stat label="Profit factor" value={num(o.profitFactor)} />
        <Stat label="Avg R" value={num(o.avgR)} />
        <Stat label="Net P&L" value={num(o.netPnl)} tone={pnlColor(o.netPnl)} />
        <Stat label="Max DD" value={num(o.maxDrawdown)} tone="text-rose-500" />
        <Stat label="Avg win" value={num(o.avgWin)} tone="text-emerald-500" />
        <Stat label="Avg loss" value={num(o.avgLoss)} tone="text-rose-500" />
        <Stat label="Win streak" value={o.maxWinStreak ?? '—'} />
        <Stat label="Lose streak" value={o.maxLoseStreak ?? '—'} />
        <Stat label="Avg MFE" value={num(o.avgMfe)} />
        <Stat label="Avg MAE" value={num(o.avgMae)} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <GroupTable title="BUY vs SELL" rows={[{ key: 'BUY', ...m.buy }, { key: 'SELL', ...m.sell }]} />
        <GroupTable title="By confidence (calibration — should rise with confidence)" rows={m.calibration} />
        <GroupTable title="By setup" rows={m.bySetup} />
        <GroupTable title="By market (VIX)" rows={m.byMarket} />
        <GroupTable title="By market quality (MQS)" rows={m.byQuality} />
        <GroupTable title="By time of day" rows={m.byTimeBlock} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <GroupTable title="Best conditions" rows={m.bestConditions} />
        <GroupTable title="Worst conditions" rows={m.worstConditions} />
      </div>

      <div className="space-y-1">
        <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300">Rejection funnel — which gate blocked NO-TRADE signals</h3>
        <Table cols={['Blocking gate', 'Count']} empty="No rejections logged." rows={(m.rejectionFunnel ?? []).map((f: any) => [f.gate, f.count])} />
      </div>
    </div>
  )
}
