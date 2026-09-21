// ── Service Status dashboard (Control Panel · admin-only) ─────────────────────
// Category boxes (Market Data live today; Algo / Backend / Orders / Sockets /
// AI / Live Feeds / Logins ready to light up as they start reporting). Polls the
// monitoring API, shows aggregated per-category health + recent alerts.

import { useEffect, useMemo } from 'react'
import { clsx } from 'clsx'
import { useServiceHealth, type Severity, type ServiceRow } from './serviceHealthStore'
import { CATEGORIES } from './categories'

const DOT: Record<Severity, string> = { ok: 'bg-emerald-500', warn: 'bg-amber-500', down: 'bg-red-500' }
const PILL: Record<Severity, string> = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  down: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}
const ACCENT_BAR: Record<Severity, string> = { ok: 'bg-emerald-400', warn: 'bg-amber-400', down: 'bg-red-400' }
const PILL_TEXT: Record<Severity, string> = { ok: 'Operational', warn: 'Degraded', down: 'Down' }

const LABEL: Record<string, string> = {
  // market data
  engine: 'Candle Engine', api: 'Candle API', confirm: 'Confirm Service', chain: 'Chain Service',
  'data-feed': 'Live Data Feed', eod: 'EOD Finalize', 'eod-backfill': 'EOD Backfill',
  'stocks-eod': 'Stocks EOD', 'eod-chain': 'EOD Full Chain', fyers: 'Fyers Rate Limit',
  // algo
  'quant-signal': 'Quant Signals', 'signal-generator': 'Signal Generator', 'strategy-monitor': 'Strategy Monitor',
  'zero-hero': 'Zero Hero Strategy', 'ema-cross': 'EMA Cross Directional', 'intplus-expiry': 'IntPlus Expiry',
  // backend / feeds / socket / orders / ai
  'trade-app': 'Trade App (API)', 'livefeed-fyers': 'Fyers Livefeed', 'livefeed-angelone': 'AngelOne Livefeed',
  'delta-livefeed': 'Delta Livefeed', 'order-sockets': 'Order Socket', orchestrator: 'Trade Orchestrator',
  insights: 'AI Insights',
}
const worst = (rows: ServiceRow[]): Severity =>
  rows.some((r) => r.severity === 'down') ? 'down' : rows.some((r) => r.severity === 'warn') ? 'warn' : 'ok'
const fmtTime = (s?: string) => (s ? new Date(s).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : '')

export default function ServiceStatusPanel() {
  const { overall, counts, services, alerts, loaded, lastError, refresh, ack } = useServiceHealth()

  useEffect(() => { refresh(); const t = setInterval(refresh, 25_000); return () => clearInterval(t) }, [refresh])

  // group live services by category
  const byCat = useMemo(() => {
    const m = new Map<string, ServiceRow[]>()
    for (const s of services) { const a = m.get(s.category) ?? []; a.push(s); m.set(s.category, a) }
    return m
  }, [services])

  const bannerText = overall === 'ok' ? 'All systems operational'
    : overall === 'warn' ? 'Some services need attention' : 'Service disruption detected'
  const updated = services[0]?.evaluated_at

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-slate-50 dark:bg-[#0a0f1a]">
      <div className="max-w-[1160px] mx-auto p-6">

        {/* ── Hero ── */}
        <div className={clsx('relative overflow-hidden rounded-2xl px-6 py-5 mb-6 border',
          overall === 'ok' ? 'border-emerald-200 dark:border-emerald-500/20' :
          overall === 'warn' ? 'border-amber-200 dark:border-amber-500/20' : 'border-red-200 dark:border-red-500/20')}>
          <div className={clsx('pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-2xl opacity-40',
            overall === 'ok' ? 'bg-emerald-400/30' : overall === 'warn' ? 'bg-amber-400/30' : 'bg-red-400/40')} />
          <div className="relative flex items-center gap-4 flex-wrap">
            <span className={clsx('h-11 w-11 rounded-2xl grid place-items-center shrink-0',
              overall === 'ok' ? 'bg-emerald-500/15' : overall === 'warn' ? 'bg-amber-500/15' : 'bg-red-500/15')}>
              <span className={clsx('h-3.5 w-3.5 rounded-full', DOT[overall], overall !== 'ok' && 'animate-pulse')} />
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-[20px] font-black text-slate-900 dark:text-white leading-tight">{bannerText}</h1>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                Data services monitored live · updated {updated ? fmtTime(updated) : '—'}
                {lastError && <span className="text-red-500"> · monitor unreachable</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(['down', 'warn', 'ok'] as Severity[]).map((sev) => (
                <div key={sev} className={clsx('px-3 py-1.5 rounded-xl text-center min-w-[64px]',
                  sev === 'ok' ? 'bg-emerald-50 dark:bg-emerald-500/10' : sev === 'warn' ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-red-50 dark:bg-red-500/10')}>
                  <div className={clsx('text-[17px] font-black leading-none',
                    sev === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : sev === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                    {counts[sev] || 0}
                  </div>
                  <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400 mt-0.5">{PILL_TEXT[sev]}</div>
                </div>
              ))}
              <button onClick={() => refresh()} className="ml-1 h-9 w-9 grid place-items-center rounded-xl border border-slate-200 dark:border-white/10 hover:bg-white dark:hover:bg-white/5 text-slate-500" title="Refresh">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Category grid ── */}
        {!loaded ? (
          <p className="text-slate-400 text-[13px] py-16 text-center">Loading service status…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CATEGORIES.map((cat) => {
              const rows = (byCat.get(cat.id) ?? []).slice().sort((a, b) =>
                ({ down: 0, warn: 1, ok: 2 }[a.severity] - { down: 0, warn: 1, ok: 2 }[b.severity]))
              const has = rows.length > 0
              const sev = has ? worst(rows) : 'ok'
              const healthy = rows.filter((r) => r.severity === 'ok').length
              return (
                <div key={cat.id} className={clsx('relative overflow-hidden rounded-2xl border bg-white dark:bg-white/[0.02] transition-all',
                  'border-slate-200 dark:border-white/[0.07] hover:shadow-md hover:-translate-y-0.5',
                  !has && 'opacity-[0.72]')}>
                  {/* status accent bar */}
                  {has && <span className={clsx('absolute left-0 top-0 bottom-0 w-1', ACCENT_BAR[sev])} />}
                  <div className="p-4 pl-5">
                    {/* header */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className={clsx('h-9 w-9 rounded-xl grid place-items-center text-white shrink-0 bg-gradient-to-br', cat.accent)}>{cat.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight truncate">{cat.name}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{cat.description}</p>
                      </div>
                      {has ? (
                        <span className={clsx('text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0', PILL[sev])}>{PILL_TEXT[sev]}</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 bg-slate-100 text-slate-400 dark:bg-white/[0.05] dark:text-slate-500">Soon</span>
                      )}
                    </div>

                    {/* body */}
                    {has ? (
                      <>
                        <div className="space-y-1.5">
                          {rows.map((r) => (
                            <div key={r.service} className="flex items-center gap-2.5">
                              <span className={clsx('h-2 w-2 rounded-full shrink-0', DOT[r.severity])} />
                              <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300 shrink-0">{LABEL[r.service] || r.service}</span>
                              <span className="text-[11.5px] text-slate-400 dark:text-slate-500 truncate ml-auto text-right">{r.message}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
                          <span className={clsx('text-[11px] font-semibold', sev === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : sev === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                            {healthy}/{rows.length} healthy
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-600">{cat.live ? 'monitored live' : ''}</span>
                        </div>
                      </>
                    ) : (
                      <div className="py-5 text-center rounded-xl border border-dashed border-slate-200 dark:border-white/[0.08]">
                        <p className="text-[12px] text-slate-400 dark:text-slate-500">Monitoring coming soon</p>
                        <p className="text-[10.5px] text-slate-300 dark:text-slate-600 mt-0.5">services will appear here once they report</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Alerts ── */}
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-2.5">
            <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">Recent alerts</h2>
            {alerts.some((a) => !a.acked) && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                {alerts.filter((a) => !a.acked).length} new
              </span>
            )}
            {alerts.some((a) => !a.acked) && (
              <button onClick={() => ack('all')} className="ml-auto text-[11.5px] px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/10 text-slate-500 hover:bg-white dark:hover:bg-white/5">Mark all read</button>
            )}
          </div>
          {alerts.length ? (
            <div className="rounded-2xl border border-slate-200 dark:border-white/[0.07] divide-y divide-slate-100 dark:divide-white/[0.05] overflow-hidden bg-white dark:bg-white/[0.02]">
              {alerts.map((a) => (
                <div key={a.id} className={clsx('flex items-center gap-3 px-4 py-2.5', !a.acked && 'bg-slate-50/70 dark:bg-white/[0.02]')}>
                  <span className={clsx('h-2 w-2 rounded-full shrink-0', DOT[a.severity])} />
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-[13px] truncate', a.acked ? 'text-slate-500 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200 font-medium')}>{a.message}</p>
                    <p className="text-[10.5px] text-slate-400 dark:text-slate-600">{fmtTime(a.created_at)}</p>
                  </div>
                  {!a.acked && <button onClick={() => ack(a.id)} className="text-[11px] px-2 py-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">dismiss</button>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-[13px] py-6 text-center border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">No alerts — all clear.</p>
          )}
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-6">
          Auto-refreshes every 25s · admin-only · monitored by <code className="font-mono">market-data-health</code>. New categories light up automatically as their services start reporting.
        </p>
      </div>
    </div>
  )
}
