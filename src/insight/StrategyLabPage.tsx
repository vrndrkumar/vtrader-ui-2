import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import axios from 'axios'

/// <reference types="vite/client" />
const BASE = (import.meta.env.VITE_INSIGHT_API as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3600' : 'http://164.52.201.122:3600')
const client = axios.create({ baseURL: BASE })

interface Row {
  category: string; horizon: string; topN: number; sl: number; provisional?: boolean
  n: number; cohorts: number; confidence: string
  avgRet: number | null; medianRet: number | null; hitRate: number | null
  avgExcess: number | null; beatNiftyPct: number | null; avgMaxDD: number | null
}
const HZ_LABEL: Record<string, string> = { WEEKLY: 'Weekly', BIWEEKLY: 'Bi-weekly', MONTHLY: 'Monthly' }
interface Scorecard {
  cohorts: Array<{ key: string; startDate: string; engine: string; niftyStart: number | null }>
  scope?: string
  horizons: string[]; slScenarios: number[]; categories: string[]; rows: Row[]; note: string | null
}
interface Holding {
  category: string; rank: number; symbol: string; name: string
  entryPrice: number | null; qty: number | null; invested: number
  livePrice: number | null; returnPct: number | null; pnl: number | null; maxDDPct: number | null
}
interface HoldingsResp { cohortKey: string; startDate: string; engine: string; holdings: Holding[] }

const num = (v: number | null, s = false) => (v == null ? '—' : `${s && v > 0 ? '+' : ''}${v}${'%'}`)

interface TransRow {
  from: string; to: string; pair: string; horizon: string; n: number; symbols: number
  avgRet: number | null; medianRet: number | null; hitRate: number | null
  avgExcess: number | null; beatNiftyPct: number | null; avgMaxDD: number | null; confidence: string
}
interface TransScore { horizons: string[]; pairs: string[]; rows: TransRow[]; note: string | null; pending?: number }

export default function StrategyLabPage() {
  const [tab, setTab] = useState<'category' | 'transition'>('category')
  const [trans, setTrans] = useState<TransScore | null>(null)
  const [transLoading, setTransLoading] = useState(false)
  const [computing, setComputing] = useState(false)
  const [computeMsg, setComputeMsg] = useState<string | null>(null)
  const [tHorizon, setTHorizon] = useState('1W')
  const loadTrans = async () => {
    setTransLoading(true)
    try { setTrans((await client.get<TransScore>('/paper/transition-scorecard')).data) }
    catch { /* ignore */ } finally { setTransLoading(false) }
  }
  const computeTrans = async () => {
    setComputing(true); setComputeMsg('Starting…')
    try {
      await client.post('/paper/transition-compute')
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500))
        const { data } = await client.get('/paper/transition-compute/status')
        setComputeMsg(`Computing outcomes: ${data.done}/${data.total} symbols · ${data.stored} stored`)
        if (!data.running) break
      }
      await loadTrans()
      setComputeMsg(null)
    } catch { setComputeMsg('Compute failed — check server logs.') } finally { setComputing(false) }
  }
  useEffect(() => { if (tab === 'transition' && !trans) void loadTrans() /* eslint-disable-next-line */ }, [tab])

  const [data, setData] = useState<Scorecard | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [horizon, setHorizon] = useState('WEEKLY')
  const [topN, setTopN] = useState(10)
  const [sl, setSl] = useState(0)
  const [openCohort, setOpenCohort] = useState<string | null>(null)
  const [holdings, setHoldings] = useState<HoldingsResp | null>(null)
  const [holdingsLoading, setHoldingsLoading] = useState(false)
  const [catFilter, setCatFilter] = useState<string>('')

  const openHoldings = async (key: string) => {
    if (openCohort === key) { setOpenCohort(null); return }
    setOpenCohort(key); setHoldings(null); setHoldingsLoading(true); setCatFilter('')
    try { setHoldings((await client.get<HoldingsResp>(`/paper/cohort/${encodeURIComponent(key)}/holdings`)).data) }
    catch (e: unknown) { setErr((e as Error).message) }
    finally { setHoldingsLoading(false) }
  }

  const [scope, setScope] = useState<string>('ALL') // 'ALL' or a cohort key
  const load = async (sc = scope) => {
    setLoading(true); setErr(null)
    try { setData((await client.get<Scorecard>('/paper/scorecard', { params: sc === 'ALL' ? {} : { cohort: sc } })).data) }
    catch (e: unknown) { setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load('ALL') }, [])

  const capture = async () => {
    setCapturing(true)
    try { await client.post('/paper/capture'); await load() }
    catch (e: unknown) { setErr((e as Error).message) }
    finally { setCapturing(false) }
  }

  const view = useMemo(() => {
    if (!data) return []
    return data.rows
      .filter((r) => r.horizon === horizon && r.topN === topN && r.sl === sl)
      .sort((a, b) => (b.avgExcess ?? b.avgRet ?? -99) - (a.avgExcess ?? a.avgRet ?? -99))
  }, [data, horizon, topN, sl])

  return (
    <div className="flex-1 min-h-screen bg-slate-50 dark:bg-surface-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Strategy Lab <span className="text-[10px] align-top text-amber-500 font-bold">ADMIN</span></h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Paper-trade attribution — which dashboard category actually pays, measured forward vs NIFTY. ₹10k/stock, no costs.
            </p>
          </div>
          {tab === 'category' && (
            <button onClick={() => void capture()} disabled={capturing}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
              {capturing ? 'Capturing…' : 'Capture cohort now'}
            </button>
          )}
        </div>

        {/* tab switcher */}
        <span className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden w-fit">
          {(['category', 'transition'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('px-3.5 py-1.5 text-xs font-bold', tab === t ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-card-dark text-slate-500 dark:text-slate-400')}>
              {t === 'category' ? 'Category attribution' : 'Transition attribution (X→Y)'}
            </button>
          ))}
        </span>

        {/* ── TRANSITION ATTRIBUTION TAB ── */}
        {tab === 'transition' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">Which badge change (X → Y) pays, and how fast — forward returns vs NIFTY from the transition day. Answers "which move should I bet on."</p>
              <button onClick={() => void computeTrans()} disabled={computing}
                className="shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                {computing ? (computeMsg ?? 'Computing…') : 'Compute outcomes'}
              </button>
            </div>
            {computeMsg && computing && <div className="text-[11px] text-slate-500 dark:text-slate-400">{computeMsg}</div>}
            {trans?.note && <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">⚠ {trans.note}</div>}
            <span className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden w-fit">
              {(trans?.horizons ?? ['1W', '2W', '1M']).map((h) => (
                <button key={h} onClick={() => setTHorizon(h)} className={clsx('px-3 py-1.5 text-xs font-bold', tHorizon === h ? 'bg-brand-600 text-white' : 'bg-white dark:bg-card-dark text-slate-500 dark:text-slate-400')}>{h}</button>
              ))}
            </span>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[760px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-3 py-2.5">Transition (X → Y)</th><th className="px-3 py-2.5 text-right">Avg return</th><th className="px-3 py-2.5 text-right">Median</th>
                    <th className="px-3 py-2.5 text-right">vs NIFTY</th><th className="px-3 py-2.5 text-right">Hit rate</th><th className="px-3 py-2.5 text-right">Avg max DD</th>
                    <th className="px-3 py-2.5 text-right">n / stocks</th><th className="px-3 py-2.5">Confidence</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                    {transLoading && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Computing forward returns per transition…</td></tr>}
                    {!transLoading && (trans?.rows.filter((r) => r.horizon === tHorizon).length ?? 0) === 0 && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No transition results yet — the log fills forward as nightly analyses record badge changes, and needs ~1 week to mature the first returns.</td></tr>
                    )}
                    {(trans?.rows.filter((r) => r.horizon === tHorizon).sort((a, b) => (b.avgExcess ?? -99) - (a.avgExcess ?? -99)) ?? []).map((r, i) => (
                      <tr key={r.pair} className={clsx(i === 0 && 'bg-emerald-50/40 dark:bg-emerald-900/10')}>
                        <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">{i === 0 && '🏆 '}{r.pair}</td>
                        <td className={clsx('px-3 py-2.5 text-right font-bold tabular-nums', (r.avgRet ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>{r.avgRet != null ? `${r.avgRet > 0 ? '+' : ''}${r.avgRet}%` : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.medianRet != null ? `${r.medianRet}%` : '—'}</td>
                        <td className={clsx('px-3 py-2.5 text-right font-bold tabular-nums', (r.avgExcess ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>{r.avgExcess != null ? `${r.avgExcess > 0 ? '+' : ''}${r.avgExcess}%` : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.hitRate ?? '—'}%</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-red-500">{r.avgMaxDD != null ? `${r.avgMaxDD}%` : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-slate-400">{r.n} / {r.symbols}</td>
                        <td className="px-3 py-2.5"><span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded', r.confidence === 'High' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' : r.confidence === 'Moderate' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400')}>{r.confidence}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 px-1">Ranked by outperformance vs NIFTY. "n" = transition events, "stocks" = distinct symbols. Don't trust a pair until it reaches 10+ stocks (Moderate). Forward-only, survivorship-free.</p>
          </div>
        )}

        {tab === 'category' && data?.note && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            ⚠ {data.note}
          </div>
        )}
        {err && <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-xs text-red-700 dark:text-red-400">{err}</div>}

        {/* cohorts strip */}
        {tab === 'category' && data && data.cohorts.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Cohorts ({data.cohorts.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {data.cohorts.map((c) => (
                <button key={c.key} onClick={() => void openHoldings(c.key)}
                  className={clsx('text-[10px] px-2 py-1 rounded font-medium transition-colors',
                    openCohort === c.key ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700')}>
                  {c.key} · {c.startDate} · {c.engine} · {openCohort === c.key ? 'hide ▲' : 'view holdings ▼'}
                </button>
              ))}
            </div>

            {/* holdings drill-down */}
            {openCohort && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                {holdingsLoading && <p className="text-xs text-slate-400">Loading holdings + live prices…</p>}
                {holdings && (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <button onClick={() => setCatFilter('')}
                        className={clsx('text-[10px] px-2 py-0.5 rounded font-semibold', catFilter === '' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')}>All ({holdings.holdings.length})</button>
                      {[...new Set(holdings.holdings.map((h) => h.category))].map((c) => (
                        <button key={c} onClick={() => setCatFilter(c)}
                          className={clsx('text-[10px] px-2 py-0.5 rounded font-semibold', catFilter === c ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')}>{c}</button>
                      ))}
                    </div>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
                      <table className="w-full text-xs min-w-[720px]">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80">
                          <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                            <th className="px-3 py-2">Category</th><th className="px-3 py-2">#</th><th className="px-3 py-2">Stock</th>
                            <th className="px-3 py-2 text-right">Entry ₹</th><th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Invested</th><th className="px-3 py-2 text-right">Live ₹</th>
                            <th className="px-3 py-2 text-right">Return</th><th className="px-3 py-2 text-right">P&L ₹</th>
                            <th className="px-3 py-2 text-right" title="Max Drawdown — the worst intraday drop from your entry price since capture (using daily lows). It shows how much 'heat' you'd have sat through, even if the price later recovered.">Max DD ⓘ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60 text-slate-600 dark:text-slate-300">
                          {holdings.holdings.filter((h) => !catFilter || h.category === catFilter).map((h, i) => (
                            <tr key={`${h.category}-${h.symbol}-${i}`}>
                              <td className="px-3 py-1.5 text-[10px] text-slate-400">{h.category}</td>
                              <td className="px-3 py-1.5 text-slate-400">{h.rank}</td>
                              <td className="px-3 py-1.5 font-semibold text-slate-900 dark:text-white">{h.symbol}<span className="text-[10px] text-slate-400 ml-1 font-normal">{h.name}</span></td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{h.entryPrice ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{h.qty ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{h.invested.toLocaleString('en-IN')}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{h.livePrice ?? '—'}</td>
                              <td className={clsx('px-3 py-1.5 text-right tabular-nums font-bold', (h.returnPct ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : (h.returnPct ?? 0) < 0 ? 'text-red-500' : 'text-slate-400')}>{h.returnPct != null ? `${h.returnPct > 0 ? '+' : ''}${h.returnPct}%` : '—'}</td>
                              <td className={clsx('px-3 py-1.5 text-right tabular-nums', (h.pnl ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : (h.pnl ?? 0) < 0 ? 'text-red-500' : 'text-slate-400')}>{h.pnl != null ? `${h.pnl > 0 ? '+' : ''}${h.pnl.toLocaleString('en-IN')}` : '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-red-400">{h.maxDDPct != null ? `${h.maxDDPct}%` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                      <b>Qty</b> = whole shares that fit in ₹10,000 (no fractional shares), so <b>Invested</b> is the actual amount deployed (≤ ₹10k).
                      {' '}<b>Max DD</b> (drawdown) = the worst drop from your entry the stock touched since capture — the pain you'd have sat through even if it recovered. A −8% Max DD with 0% return means it dipped 8% then came back.
                      {' '}Live return is running (unrealised); the scorecard above uses fixed 1W/2W/1M/3M windows.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* controls */}
        {tab === 'category' && <div className="flex flex-wrap items-center gap-2">
          {data && data.cohorts.length > 0 && (
            <select
              value={scope}
              onChange={(e) => { setScope(e.target.value); void load(e.target.value) }}
              className="px-2.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              <option value="ALL">All cohorts (aggregate)</option>
              {data.cohorts.map((c) => <option key={c.key} value={c.key}>{c.key} · {c.startDate}</option>)}
            </select>
          )}
          <span className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {(data?.horizons ?? ['WEEKLY', 'BIWEEKLY', 'MONTHLY']).map((h) => (
              <button key={h} onClick={() => setHorizon(h)}
                className={clsx('px-3 py-1.5 text-xs font-bold', horizon === h ? 'bg-brand-600 text-white' : 'bg-white dark:bg-card-dark text-slate-500 dark:text-slate-400')}>{HZ_LABEL[h] ?? h}</button>
            ))}
          </span>
          <span className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {[5, 10, 20].map((n) => (
              <button key={n} onClick={() => setTopN(n)}
                className={clsx('px-3 py-1.5 text-xs font-bold', topN === n ? 'bg-brand-600 text-white' : 'bg-white dark:bg-card-dark text-slate-500 dark:text-slate-400')}>Top {n}</button>
            ))}
          </span>
          <span className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {(data?.slScenarios ?? [0, 5, 10]).map((s) => (
              <button key={s} onClick={() => setSl(s)}
                className={clsx('px-3 py-1.5 text-xs font-bold', sl === s ? 'bg-brand-600 text-white' : 'bg-white dark:bg-card-dark text-slate-500 dark:text-slate-400')}>{s === 0 ? 'No SL' : `${s}% SL`}</button>
            ))}
          </span>
        </div>}

        {/* scorecard */}
        {tab === 'category' && <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[820px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5 text-right" title="Average price move of the stocks in this category over the window.">Avg return ⓘ</th>
                  <th className="px-3 py-2.5 text-right" title="The middle stock's return — ignores outliers. If higher than Avg, a few laggards dragged the average down.">Median ⓘ</th>
                  <th className="px-3 py-2.5 text-right" title="Category return MINUS NIFTY return = outperformance. NOT NIFTY's own growth. +1% means it beat the index by 1 point. This is the number that matters.">vs NIFTY ⓘ</th>
                  <th className="px-3 py-2.5 text-right" title="% of the category's stocks that ended positive.">Hit rate ⓘ</th>
                  <th className="px-3 py-2.5 text-right" title="% of the category's stocks that individually beat NIFTY's return.">Beat NIFTY ⓘ</th>
                  <th className="px-3 py-2.5 text-right" title="Average worst dip below entry during the window — the 'heat' you'd sit through, even if it recovered.">Avg max DD ⓘ</th>
                  <th className="px-3 py-2.5 text-right" title="n = number of stock-positions counted (follows the Top 5/10/20 toggle). cohorts = number of weeks aggregated.">n / cohorts ⓘ</th>
                  <th className="px-3 py-2.5" title="How trustworthy the result is. Low = under 10 weeks (a data point, not a verdict). Moderate = 10+. High = 25+.">Confidence ⓘ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {loading && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Computing forward returns…</td></tr>}
                {!loading && view.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    No results yet for this view — the target Friday hasn't been reached. Weekly cohorts settle at their Friday close (provisional from ~15:15, final after ~16:00).
                  </td></tr>
                )}
                {view.map((r, i) => (
                  <tr key={r.category} className={clsx(i === 0 && 'bg-emerald-50/40 dark:bg-emerald-900/10')}>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">
                      {i === 0 && '🏆 '}{r.category}
                      {r.provisional && <span className="ml-1.5 text-[9px] font-bold text-amber-500" title="Friday close still forming — updates through the session, final after ~16:00">LIVE</span>}
                    </td>
                    <td className={clsx('px-3 py-2.5 text-right font-bold tabular-nums', (r.avgRet ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>{num(r.avgRet, true)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{num(r.medianRet, true)}</td>
                    <td className={clsx('px-3 py-2.5 text-right font-bold tabular-nums', (r.avgExcess ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>{num(r.avgExcess, true)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.hitRate ?? '—'}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.beatNiftyPct != null ? `${r.beatNiftyPct}%` : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-500">{num(r.avgMaxDD)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{r.n} / {r.cohorts}</td>
                    <td className="px-3 py-2.5">
                      <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded',
                        r.confidence === 'High' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' :
                        r.confidence === 'Moderate' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-400')}>{r.confidence}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>}

        {tab === 'category' && <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">How to read these numbers ▾</summary>
          <div className="px-4 pb-4 text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5 leading-relaxed">
            <p><b>vs NIFTY</b> = category return − NIFTY return (outperformance). It is <b>not</b> NIFTY's growth. If Avg return is +1.7% and vs NIFTY is +1.1%, then NIFTY grew ~0.6% and this category beat it by 1.1 points. This is the column that matters — beating a rising market is what counts.</p>
            <p><b>Avg vs Median:</b> Avg is the mean; Median is the middle stock. Median above Avg ⇒ a few big losers dragged the mean down (most stocks did fine).</p>
            <p><b>Hit rate</b> = % of stocks that went up. <b>Beat NIFTY</b> = % of stocks that individually beat the index.</p>
            <p><b>Max DD</b> (drawdown) = worst dip below entry during the window — the pain you'd sit through even if it recovered.</p>
            <p><b>n / cohorts:</b> n = positions counted (changes with the Top 5/10/20 toggle); cohorts = number of weeks. <b>LIVE tag</b> = Friday still settling, numbers still moving; once it disappears the row is locked forever.</p>
          </div>
        </details>}

        {tab === 'category' && <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 px-1 pb-4">
          Each category is its own paper book (a stock in N categories gets N positions). Returns are price-only vs NIFTY over the same window,
          survivorship-free (entries stored before outcomes). "vs NIFTY" is the number that matters — raw returns flatter in bull markets.
          Do not rank categories or switch strategy until confidence reaches Moderate (10+ cohorts, ~2–3 months). Research tool, not advice.
        </p>}
      </div>
    </div>
  )
}
