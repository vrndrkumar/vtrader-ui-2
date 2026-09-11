// ── Option Simulator — V3.1 workstation (mock data, admin-only) ───────────────
// Time machine for historical options replay. Top: replay scrubber + quick jumps.
// Left: Option Chain | Positions tabs (chain dominant). Right: Payoff | P&L | Risk.
// No price chart (by design).

import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useSim } from './store'
import { NAV_STEPS, type NavStep } from './store'
import type { Frequency, IndexCode, OptionQuote, OptType, PositionLeg, Side } from './types'
import { bsGreeks } from './engine/blackScholes'
import { computePayoffCurve, computeStats, inr, type OptionLeg } from '@/components/PayoffEChart'
import { SimPayoffChart } from './SimPayoffChart'

const FREQS: Frequency[] = ['1m', '3m', '5m', '15m', '30m', '1h']
const fmtCompact = (n?: number) => {
  if (n == null) return ''
  const a = Math.abs(n)
  if (a >= 1e7) return (n / 1e7).toFixed(2) + 'Cr'
  if (a >= 1e5) return (n / 1e5).toFixed(2) + 'L'
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}
const istTime = (ts: number) => (ts ? new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : '--:--:--')
const istHM = (ts: number) => (ts ? new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--')
const istDay = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: '2-digit' })

export default function OptionSimulatorPage() {
  const ready = useSim(s => s.ready)
  const autostart = useSim(s => s.autostart)
  useEffect(() => { if (!ready) void autostart() }, [ready, autostart])
  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-[#0a0f1a]">
      {ready ? <Workstation /> : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <svg className="animate-spin h-7 w-7 text-brand-600" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          <p className="text-[12px] text-slate-400 dark:text-white/35">Reconstructing option chain…</p>
        </div>
      )}
    </div>
  )
}

// ══ Workstation ═══════════════════════════════════════════════════════════════
function Workstation() {
  return (
    <>
      <ReplayBar />
      <div className="flex-1 min-h-0 flex">
        {/* Left — option chain (full greeks matrix) */}
        <div className="w-[clamp(720px,54%,880px)] shrink-0 border-r border-slate-200 dark:border-white/[0.06] flex flex-col">
          <RichChain />
        </div>
        {/* Right — strategy workspace (payoff-led, no cards) */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white dark:bg-[#0a0f1a]">
          <MetricsStrip />
          <div className="flex-[1.8_1.8_0%] min-h-0 border-b border-slate-200 dark:border-white/[0.06] flex flex-col"><Analysis /></div>
          <div className="flex-1 min-h-0 flex flex-col"><PositionsPanel /></div>
        </div>
      </div>
    </>
  )
}

// ── Strategy metrics — thin inline strip (no card) ───────────────────────────────
function MetricsStrip() {
  const { legs, stats } = usePayoff()
  const has = legs.length > 0
  const items: { l: string; v: string; t?: 'green' | 'red' | 'indigo' }[] = [
    { l: 'Max profit', v: has ? `+₹${inr(Math.abs(stats.maxProfit))}` : '—', t: has ? 'green' : undefined },
    { l: 'Max loss', v: !has ? '—' : stats.maxLoss <= -1e7 ? 'Unlimited' : `−₹${inr(Math.abs(stats.maxLoss))}`, t: has ? 'red' : undefined },
    { l: 'POP', v: has ? `${stats.pop}%` : '—' },
    { l: 'Breakeven', v: !has ? '—' : stats.breakevens.length ? stats.breakevens.map(b => b.toLocaleString('en-IN')).join(' · ') : 'None', t: has ? 'indigo' : undefined },
  ]
  return (
    <div className="shrink-0 flex items-center h-12 px-4 border-b border-slate-200 dark:border-white/[0.06]">
      {items.map((it, i) => (
        <div key={it.l} className={clsx('pr-6', i > 0 && 'pl-6 border-l border-slate-200 dark:border-white/[0.06]')}>
          <Stat label={it.l} value={it.v} tone={it.t} />
        </div>
      ))}
    </div>
  )
}

// ── Replay bar (scrubber + quick jumps) ───────────────────────────────────────
function ReplayBar() {
  const { config, steps, cursor, status, speed, spot, realized, unrealized, reset, play, pause, seek, cycleSpeed, changeIndex, changeFrequency, navStep, setNavStep, stepNav, events } = useSim()
  const total = realized + unrealized
  const pct = steps.length > 1 ? (cursor / (steps.length - 1)) * 100 : 0
  const navLabel = navStep === 'D' ? '1 day' : navStep === 60 ? '1 hour' : `${navStep} min`
  const jump = 'h-7 px-2 rounded-lg border border-slate-200 dark:border-white/[0.1] text-[11px] font-bold text-slate-500 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/[0.06] tabular-nums'
  const navBtn = 'h-7 w-7 grid place-items-center rounded-lg border border-slate-200 dark:border-white/[0.1] text-slate-600 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/[0.06]'
  const evColor = (k: string) => k === 'EXIT' || k.includes('SL') ? '#dc2626' : k.includes('TARGET') || k === 'ENTRY' || k === 'ADD' ? '#16a34a' : '#818CF8'
  return (
    <div className="shrink-0 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0b1220]">
      {/* scrubber */}
      <div className="flex items-center gap-3 px-4 h-8">
        <span className="text-[10px] font-bold tabular-nums text-slate-400 dark:text-white/30 w-9">{steps.length ? istHM(steps[0]) : ''}</span>
        <div className="relative flex-1 h-5">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded bg-slate-100 dark:bg-white/[0.06]" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded bg-amber-500" style={{ width: `${pct}%` }} />
          <input type="range" min={0} max={steps.length - 1} value={cursor} onChange={e => seek(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer" />
          <span className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-white dark:ring-[#0b1220] pointer-events-none" style={{ left: `${pct}%`, transform: 'translate(-50%,-50%)' }} />
          {events.map(e => { const i = steps.findIndex(t => t >= e.ts); if (i < 0) return null; return <span key={e.id} title={`${istTime(e.ts)} · ${e.label}`} className="absolute top-0 h-2 w-0.5 rounded pointer-events-none" style={{ left: `${(i / Math.max(1, steps.length - 1)) * 100}%`, transform: 'translateX(-50%)', background: evColor(e.kind) }} /> })}
        </div>
        <span className="text-[10px] font-bold tabular-nums text-slate-400 dark:text-white/30 w-9 text-right">{steps.length ? istHM(steps[steps.length - 1]) : ''}</span>
      </div>
      {/* toolbar */}
      <div className="flex items-center gap-2 px-4 h-12 border-t border-slate-100 dark:border-white/[0.05]">
        {/* index + timeframe */}
        <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 dark:border-white/[0.06]">
          <PillSelect value={config?.index ?? 'NIFTY'} onChange={v => void changeIndex(v as IndexCode)} options={(['NIFTY', 'SENSEX'] as IndexCode[]).map(v => ({ value: v, label: v }))} strong />
          <PillSelect value={config?.frequency ?? '5m'} onChange={v => void changeFrequency(v as Frequency)} options={FREQS.map(f => ({ value: f, label: f }))} />
        </div>
        {/* date + time picker */}
        <DateTimePicker />
        {/* time navigation: SOD · ◀ · step · ▶ · EOD */}
        <div className="flex items-center gap-1">
          <button onClick={() => seek(0)} className={jump} title="Start of day">SOD</button>
          <button onClick={() => void stepNav(-1)} className={navBtn} title={`Backward ${navLabel}`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <PillSelect value={String(navStep)} onChange={v => setNavStep((v === 'D' ? 'D' : Number(v)) as NavStep)}
            options={NAV_STEPS.map(s => ({ value: String(s), label: s === 'D' ? '1D' : s === 60 ? '1h' : `${s}m` }))} />
          <button onClick={() => void stepNav(1)} className={navBtn} title={`Forward ${navLabel}`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <button onClick={() => seek(steps.length - 1)} className={jump} title="End of day">EOD</button>
        </div>
        {/* autoplay */}
        <button onClick={() => status === 'playing' ? pause() : play()} className="ml-1 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[12px] font-bold">
          {status === 'playing' ? <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>}
          {status === 'playing' ? 'Pause' : 'Autoplay'}
        </button>
        <button onClick={cycleSpeed} className="h-8 px-2 rounded-lg border border-slate-200 dark:border-white/[0.1] text-[12px] font-black tabular-nums text-slate-600 dark:text-white/60">{speed}×</button>
        {/* right cluster */}
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right"><div className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 leading-none">Spot</div><div className="text-[14px] font-black tabular-nums leading-tight text-slate-800 dark:text-white">{spot ? spot.toLocaleString('en-IN') : '—'}</div></div>
          <div className="text-right"><div className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 leading-none">Total · gross</div><div className={clsx('text-[14px] font-black tabular-nums leading-tight', total >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{total >= 0 ? '+' : '−'}₹{inr(Math.abs(total))}</div></div>
          <button onClick={() => void reset()} title="Clear positions & restart at SOD" className="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 dark:border-white/[0.1] text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.05]"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" /><path d="M3 3v5h5" /></svg></button>
        </div>
      </div>
    </div>
  )
}

// A compact pill-styled native select (keeps the platform dropdown, our chrome).
function PillSelect({ value, onChange, options, icon, strong }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; icon?: 'calendar'; strong?: boolean }) {
  return (
    <div className="relative flex items-center h-8 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.03] hover:border-slate-300 dark:hover:border-white/20 pl-2.5 pr-6">
      {icon === 'calendar' && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 mr-1.5 text-slate-400 dark:text-white/35" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>}
      <span className={clsx('tabular-nums truncate max-w-[160px]', strong ? 'text-[13px] font-black text-slate-800 dark:text-white' : 'text-[12px] font-semibold text-slate-600 dark:text-white/60')}>{options.find(o => o.value === value)?.label ?? value}</span>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 dark:text-white/35 absolute right-1.5 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      <select value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 w-full opacity-0 cursor-pointer">{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </div>
  )
}

// ── Combined calendar + time picker ────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0')
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function DateTimePicker() {
  const { config, sessions, expiries, steps, cursor, status, changeDate, seekToTime } = useSim()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])

  const ts = steps[cursor]
  const curHM = ts ? new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' }) : '09:15'
  const [selDate, setSelDate] = useState(config?.date ?? '')
  const [selH, setSelH] = useState(curHM.slice(0, 2))
  const [selM, setSelM] = useState(curHM.slice(3, 5))
  const initMonth = (config?.date ?? '2026-01-01')
  const [view, setView] = useState({ y: Number(initMonth.slice(0, 4)), m: Number(initMonth.slice(5, 7)) - 1 })
  // re-sync local selection whenever the picker is opened
  useEffect(() => { if (open) { setSelDate(config?.date ?? ''); setSelH(curHM.slice(0, 2)); setSelM(curHM.slice(3, 5)); if (config) setView({ y: Number(config.date.slice(0, 4)), m: Number(config.date.slice(5, 7)) - 1 }) } }, [open]) // eslint-disable-line

  const sessionSet = useMemo(() => new Set(sessions.map(s => s.date)), [sessions])
  const expirySet = useMemo(() => new Set(expiries.map(e => e.date)), [expiries])
  const times = useMemo(() => steps.map(t => new Date(t).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' })), [steps])
  const hours = useMemo(() => Array.from(new Set(times.map(t => t.slice(0, 2)))), [times])
  const mins = useMemo(() => times.filter(t => t.startsWith(selH)).map(t => t.slice(3, 5)), [times, selH])

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const offset = first.getDay()
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(view.y, view.m, i - offset + 1)
      return { d, str: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, inMonth: d.getMonth() === view.m }
    })
  }, [view])

  const moveMonth = (dm: number) => setView(v => { const d = new Date(v.y, v.m + dm, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const moveYear = (dy: number) => setView(v => ({ ...v, y: v.y + dy }))

  async function apply() {
    if (selDate && selDate !== config?.date) await changeDate(selDate)
    seekToTime(`${selH}:${selM}`)
    setOpen(false)
  }

  const triggerLabel = config ? `${istDay(config.date)}  ${curHM}` : ''
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.03] hover:border-slate-300 dark:hover:border-white/20">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 dark:text-white/35" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        <span className="text-[12px] font-bold tabular-nums text-slate-800 dark:text-white whitespace-nowrap">{triggerLabel}</span>
        <span className={clsx('h-1.5 w-1.5 rounded-full', status === 'playing' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-white/20')} />
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 dark:text-white/35" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-40 rounded-2xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-slate-900 shadow-2xl overflow-hidden w-[420px]">
          <div className="flex">
            {/* calendar */}
            <div className="flex-1 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-0.5">
                  <NavBtn title="Prev year" onClick={() => moveYear(-1)}><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></NavBtn>
                  <NavBtn title="Prev month" onClick={() => moveMonth(-1)}><path d="M15 18l-6-6 6-6" /></NavBtn>
                </div>
                <span className="text-[13px] font-black text-slate-800 dark:text-white tabular-nums">{MON[view.m]} {view.y}</span>
                <div className="flex items-center gap-0.5">
                  <NavBtn title="Next month" onClick={() => moveMonth(1)}><path d="M9 18l6-6-6-6" /></NavBtn>
                  <NavBtn title="Next year" onClick={() => moveYear(1)}><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></NavBtn>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0.5 mb-1">{DOW.map(d => <div key={d} className="h-6 grid place-items-center text-[10px] font-black uppercase text-slate-400 dark:text-white/30">{d}</div>)}</div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map(({ d, str, inMonth }) => {
                  const selectable = sessionSet.has(str)
                  const expiry = expirySet.has(str)
                  const selected = str === selDate
                  return (
                    <button key={str} disabled={!selectable} onClick={() => setSelDate(str)}
                      className={clsx('relative h-8 w-full grid place-items-center rounded-full text-[12px] font-bold tabular-nums transition-colors',
                        selected ? 'bg-brand-500 text-white ring-2 ring-brand-300 dark:ring-brand-700'
                          : expiry ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                            : selectable ? 'text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                              : clsx('cursor-default', inMonth ? 'text-slate-300 dark:text-white/20' : 'text-slate-200 dark:text-white/10'))}>
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>
            {/* time wheels */}
            <div className="w-[132px] border-l border-slate-100 dark:border-white/[0.06] p-2">
              <div className="text-center text-[13px] font-black tabular-nums text-slate-800 dark:text-white mb-1.5">{selH}:{selM}</div>
              <div className="flex gap-1.5 h-[236px]">
                <div className="flex-1 overflow-y-auto no-scrollbar rounded-lg bg-slate-50 dark:bg-white/[0.03] p-1 space-y-0.5">
                  {hours.map(hh => <button key={hh} onClick={() => setSelH(hh)} className={clsx('w-full h-7 rounded-md text-[13px] font-bold tabular-nums', hh === selH ? 'bg-brand-500 text-white' : 'text-slate-600 dark:text-white/55 hover:bg-slate-100 dark:hover:bg-white/[0.06]')}>{hh}</button>)}
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar rounded-lg bg-slate-50 dark:bg-white/[0.03] p-1 space-y-0.5">
                  {mins.map(mm => <button key={mm} onClick={() => setSelM(mm)} className={clsx('w-full h-7 rounded-md text-[13px] font-bold tabular-nums', mm === selM ? 'bg-brand-500 text-white' : 'text-slate-600 dark:text-white/55 hover:bg-slate-100 dark:hover:bg-white/[0.06]')}>{mm}</button>)}
                </div>
              </div>
            </div>
          </div>
          {/* footer */}
          <div className="flex items-center gap-4 px-3 h-11 border-t border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02]">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-white/45"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Expiry</span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-white/45"><span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-white/20" />Unavailable</span>
            <button onClick={() => void apply()} className="ml-auto h-8 px-5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[12px] font-bold shadow-sm">Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

function NavBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className="h-7 w-7 grid place-items-center rounded-md text-slate-400 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">{children}</svg></button>
}

// ── Expiry selector strip ─────────────────────────────────────────────────────────
function ExpiryTabs() {
  const { expiries, config, changeExpiry } = useSim()
  if (!expiries.length || !config) return null
  const dteOf = (d: string) => Math.max(0, Math.round((Date.parse(`${d}T15:30:00+05:30`) - Date.parse(`${config.date}T09:15:00+05:30`)) / 86_400_000))
  return (
    <div className="flex items-center gap-1 shrink-0 px-2 h-9 border-b border-slate-100 dark:border-white/[0.05] overflow-x-auto no-scrollbar">
      {expiries.map(e => {
        const active = e.id === config.expiryId
        const dte = dteOf(e.date)
        return (
          <button key={e.id} onClick={() => void changeExpiry(e.id)} title={e.label}
            className={clsx('shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-bold border transition-colors whitespace-nowrap',
              active ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/25 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 dark:text-white/45 hover:bg-slate-100 dark:hover:bg-white/[0.05]')}>
            <span className="uppercase tracking-wide">{e.label}</span>
            <span className={clsx('tabular-nums text-[9px] font-black px-1 py-px rounded', active ? 'bg-brand-500/20 text-brand-700 dark:text-brand-300' : 'text-slate-400 dark:text-white/30')}>{dte}d</span>
            {e.type === 'monthly' && <span className="text-[8px] font-black text-amber-500">M</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── Rich option chain ────────────────────────────────────────────────────────────
function RichChain() {
  const { chain, positions, config, steps, cursor, addLeg } = useSim()
  const [lots, setLots] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atmRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const c = scrollRef.current, a = atmRef.current; if (c && a) { const cr = c.getBoundingClientRect(), ar = a.getBoundingClientRect(); c.scrollTop += (ar.top - cr.top) - (c.clientHeight / 2 - ar.height / 2) } }, [chain?.atm])
  const dte = useMemo(() => { if (!config) return 1; const ed = config.expiryId.split('-').slice(1).join('-'); return Math.max(0.5, (Date.parse(`${ed}T00:00:00+05:30`) + 930 * 60000 - steps[cursor]) / 86_400_000) }, [config, steps, cursor])
  if (!chain) return <div className="h-full flex items-center justify-center text-[12px] text-slate-400 dark:text-white/25">Loading chain…</div>

  const posBy = new Map<string, number>()
  for (const l of positions) if (l.status === 'OPEN') posBy.set(`${l.optType}-${l.strike}`, (posBy.get(`${l.optType}-${l.strike}`) ?? 0) + (l.side === 'BUY' ? l.qty : -l.qty))
  const lotSz = positions[0]?.lotSize
  // Prefer the feed's delta; fall back to a BS estimate from IV.
  const deltaOf = (q: { delta?: number; iv?: number } | undefined, K: number, ot: OptType) =>
    q ? (q.delta != null && q.delta !== 0 ? q.delta : bsGreeks(chain.spot, K, dte / 365, (q.iv ?? 0) || 0.15, ot).delta) : 0
  const COLS = '42px 44px 42px minmax(64px,1fr) 76px 78px 82px 78px 76px minmax(64px,1fr) 42px 44px 42px'
  const maxOi = Math.max(1, ...chain.rows.flatMap(r => [r.ce?.oi ?? 0, r.pe?.oi ?? 0]))
  const maxOiChg = Math.max(1, ...chain.rows.flatMap(r => [Math.abs(r.ce?.oiChange ?? 0), Math.abs(r.pe?.oiChange ?? 0)]))

  const posLots = (q?: number) => q == null || lotSz == null ? '' : `${q > 0 ? '+' : ''}${Math.round(q / lotSz)}`
  const posPill = (q?: number) => q == null ? null : (
    <span className={clsx('shrink-0 text-[9px] font-black tabular-nums px-1 rounded-[3px]', q > 0 ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300' : 'bg-rose-500/15 text-rose-600 dark:text-rose-300')}>{posLots(q)}</span>
  )
  const greekTip = (q: OptionQuote | undefined, K: number, ot: OptType) => q
    ? `${ot} ${K}\nΔ ${deltaOf(q, K, ot).toFixed(3)}   Γ ${(q.gamma ?? 0).toFixed(4)}\nΘ ${(q.theta ?? 0).toFixed(2)}   Vega ${(q.vega ?? 0).toFixed(2)}\nIV ${q.iv ? (q.iv * 100).toFixed(1) : '—'}%   OI ${fmtCompact(q.oi) || '—'}\nVol ${fmtCompact(q.volume) || '—'}${q.bid ? `   Bid ${q.bid} / Ask ${q.ask}` : ''}`
    : ''
  // Greek cell.
  const G = ({ v, cls, d = 2 }: { v?: number; cls: string; d?: number }) => (
    <div className={clsx('flex items-center justify-center text-[10.5px] font-mono tabular-nums', cls)}>{v != null ? v.toFixed(d) : ''}</div>
  )
  // OI total with a subtle inline heatmap bar (green calls / red puts) anchored to the strike side.
  const OiTotal = ({ q, side, tint }: { q?: OptionQuote; side: 'call' | 'put'; tint?: string }) => (
    <div className={clsx('relative flex items-center overflow-hidden', side === 'call' ? 'justify-end pr-2.5' : 'justify-start pl-2.5', tint)}>
      <div className={clsx('absolute inset-y-0 pointer-events-none', side === 'call' ? 'right-0 bg-emerald-500/10 dark:bg-emerald-500/[0.08]' : 'left-0 bg-rose-500/10 dark:bg-rose-500/[0.08]')} style={{ width: `${Math.min(100, ((q?.oi ?? 0) / maxOi) * 100)}%` }} />
      <span className={clsx('relative text-[11px] font-mono tabular-nums font-semibold', side === 'call' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{q?.oi ? fmtCompact(q.oi) : ''}</span>
    </div>
  )
  // OI-change chip: absolute OI change + mini bar (scaled to the chain's max change).
  const OiChip = ({ q, side }: { q?: OptionQuote; side: 'call' | 'put' }) => {
    const v = q?.oiChange
    if (v == null) return <div />
    const up = v >= 0
    return (
      <div className="flex items-center justify-center px-1" title={q?.oiChangePct != null ? `${up ? '+' : ''}${q.oiChangePct.toFixed(2)}%` : undefined}>
        <div className={clsx('flex items-center gap-1.5 h-[18px] px-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]', side === 'put' && 'flex-row-reverse')}>
          <span className={clsx('text-[9.5px] font-mono font-bold tabular-nums', v === 0 ? 'text-slate-400' : up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400')}>{up ? '+' : ''}{fmtCompact(v)}</span>
          <div className={clsx('w-7 h-1.5 rounded-sm bg-slate-100 dark:bg-white/10 overflow-hidden flex', side === 'call' ? 'justify-end' : 'justify-start')}>
            <div className={clsx('h-full rounded-sm', up ? 'bg-emerald-500' : 'bg-rose-500')} style={{ width: `${Math.min(100, (Math.abs(v) / maxOiChg) * 100)}%` }} />
          </div>
        </div>
      </div>
    )
  }
  // LTP with BUY/SELL revealed on row hover. The action panel extends over the
  // neighbouring OI-change column (away from the strike) so both buttons fit.
  const LtpCell = ({ q, K, ot, side, tint }: { q?: OptionQuote; K: number; ot: OptType; side: 'call' | 'put'; tint?: string }) => (
    <div title={greekTip(q, K, ot)} className={clsx('relative flex items-center cursor-default', side === 'call' ? 'justify-end pr-2.5' : 'justify-start pl-2.5', tint)}>
      <span className="font-mono text-[13px] font-bold text-slate-800 dark:text-white/85 transition-opacity group-hover:opacity-0">{q ? q.ltp.toFixed(2) : '—'}</span>
      {q?.contractId && (
        <div className={clsx('absolute top-0 bottom-0 z-30 flex items-center gap-1 px-1.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto bg-slate-100/95 dark:bg-[#141b2e]/95 shadow-sm', side === 'call' ? 'right-0 justify-end' : 'left-0 justify-start')} style={{ width: 132 }}>
          <button onClick={() => void addLeg(q.contractId, K, ot, 'BUY', lots)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1 rounded shadow-sm">BUY</button>
          <button onClick={() => void addLeg(q.contractId, K, ot, 'SELL', lots)} className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] px-2.5 py-1 rounded shadow-sm">SELL</button>
        </div>
      )}
    </div>
  )
  const cellHdr = 'px-2 py-2.5'

  return (
    <div className="flex flex-col h-full">
      {/* header: index · spot · ATM · lots */}
      <div className="flex items-center gap-2.5 px-3 h-11 border-b border-slate-200 dark:border-white/[0.06] shrink-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-black text-slate-900 dark:text-white tracking-tight">{config?.index}</span>
          <span className="text-[15px] font-black tabular-nums text-slate-900 dark:text-white leading-none">{chain.spot.toLocaleString('en-IN')}</span>
        </div>
        <span className="flex items-center gap-1.5 px-2 h-6 rounded bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 text-[11px] font-bold tabular-nums">
          <span className="text-[9px] font-black uppercase tracking-wider opacity-60">ATM</span>{chain.atm.toLocaleString('en-IN')}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-white/30">Lot {lotSz ?? '—'}</span>
        <span title="Simulated data" className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/30 mr-0.5">Lots</span>
          <button onClick={() => setLots(l => Math.max(1, l - 1))} className="h-6 w-6 grid place-items-center rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]">−</button>
          <span className="w-6 text-center text-[12px] font-black tabular-nums text-slate-800 dark:text-white/80">{lots}</span>
          <button onClick={() => setLots(l => l + 1)} className="h-6 w-6 grid place-items-center rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]">+</button>
        </div>
      </div>
      {/* expiry tabs */}
      <ExpiryTabs />
      {/* CALLS | STRIKE | PUTS band */}
      <div className="grid shrink-0 items-center h-7 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.04]" style={{ gridTemplateColumns: COLS }}>
        <div className="col-span-6 text-center text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400/80">Calls</div>
        <div className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40">Strike</div>
        <div className="col-span-6 text-center text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400/80">Puts</div>
      </div>
      {/* column header */}
      <div className="grid shrink-0 border-b border-slate-200 dark:border-white/[0.06] text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-white/30" style={{ gridTemplateColumns: COLS }}>
        <div className={clsx(cellHdr, 'text-center')}>Δ</div><div className={clsx(cellHdr, 'text-center')}>Θ</div><div className={clsx(cellHdr, 'text-center')}>V</div><div className={clsx(cellHdr, 'text-right')}>OI</div><div className={clsx(cellHdr, 'text-center')}>OI Chg</div><div className={clsx(cellHdr, 'text-right')}>LTP</div>
        <div className={clsx(cellHdr, 'text-center')} />
        <div className={clsx(cellHdr, 'text-left')}>LTP</div><div className={clsx(cellHdr, 'text-center')}>OI Chg</div><div className={clsx(cellHdr, 'text-left')}>OI</div><div className={clsx(cellHdr, 'text-center')}>V</div><div className={clsx(cellHdr, 'text-center')}>Θ</div><div className={clsx(cellHdr, 'text-center')}>Δ</div>
      </div>
      {/* rows */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {chain.rows.map((r, i) => {
          const isAtm = r.strike === chain.atm
          const ceItm = r.strike < chain.spot, peItm = r.strike > chain.spot
          const ceRun = posBy.get(`CE-${r.strike}`), peRun = posBy.get(`PE-${r.strike}`)
          const ceTint = ceItm ? 'bg-emerald-500/[0.04]' : '', peTint = peItm ? 'bg-rose-500/[0.04]' : ''
          const next = chain.rows[i + 1]
          const showSpot = r.strike <= chain.spot && (!next || next.strike > chain.spot)
          return (
            <div key={r.strike}>
              <div ref={isAtm ? atmRef : undefined}
                className={clsx('group grid items-stretch h-[38px] border-b border-slate-100 dark:border-white/[0.03]',
                  isAtm ? 'bg-amber-50 dark:bg-amber-500/[0.08]' : (ceRun != null || peRun != null) ? 'bg-slate-50 dark:bg-white/[0.03]' : 'hover:bg-slate-50/60 dark:hover:bg-white/[0.02]')}
                style={{ gridTemplateColumns: COLS }}>
                {/* CALL: Δ Θ V · OI · OIchg · LTP */}
                <G v={r.ce ? deltaOf(r.ce, r.strike, 'CE') : undefined} cls={clsx('font-bold text-emerald-600 dark:text-emerald-400', ceTint)} />
                <G v={r.ce?.theta} cls={clsx('text-amber-600 dark:text-amber-500', ceTint)} d={1} />
                <G v={r.ce?.vega} cls={clsx('text-slate-500 dark:text-white/45', ceTint)} />
                <OiTotal q={r.ce} side="call" tint={ceTint} />
                <div className={ceTint}><OiChip q={r.ce} side="call" /></div>
                <div className="relative flex items-center">{posPill(ceRun) && <span className="absolute left-1 z-20">{posPill(ceRun)}</span>}<div className="flex-1 h-full"><LtpCell q={r.ce} K={r.strike} ot="CE" side="call" tint={ceTint} /></div></div>
                {/* STRIKE */}
                <div className={clsx('flex items-center justify-center border-x', isAtm ? 'border-amber-300/60 dark:border-amber-700/50 bg-amber-100/40 dark:bg-amber-500/[0.06]' : 'border-slate-200/70 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02]')}>
                  <span className={clsx('font-mono tabular-nums font-black', isAtm ? 'text-[13.5px] text-amber-700 dark:text-amber-300' : 'text-[13px] text-blue-600 dark:text-blue-400')}>{r.strike.toLocaleString('en-IN')}</span>
                </div>
                {/* PUT: LTP · OIchg · OI · V Θ Δ */}
                <div className="relative flex items-center"><div className="flex-1 h-full"><LtpCell q={r.pe} K={r.strike} ot="PE" side="put" tint={peTint} /></div>{posPill(peRun) && <span className="absolute right-1 z-20">{posPill(peRun)}</span>}</div>
                <div className={peTint}><OiChip q={r.pe} side="put" /></div>
                <OiTotal q={r.pe} side="put" tint={peTint} />
                <G v={r.pe?.vega} cls={clsx('text-slate-500 dark:text-white/45', peTint)} />
                <G v={r.pe?.theta} cls={clsx('text-amber-600 dark:text-amber-500', peTint)} d={1} />
                <G v={r.pe ? deltaOf(r.pe, r.strike, 'PE') : undefined} cls={clsx('font-bold text-rose-600 dark:text-rose-400', peTint)} />
              </div>
              {showSpot && (
                <div className="relative h-0 z-10">
                  <div className="absolute inset-x-0 -top-px h-[1.5px] bg-brand-500 dark:bg-brand-400" />
                  <span className="absolute right-1.5 -top-[9px] px-1.5 py-px rounded bg-brand-500 text-white text-[9px] font-black tabular-nums shadow">{chain.spot.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Positions panel ──────────────────────────────────────────────────────────────
function PositionsPanel() {
  const { positions, closeAll, chain, addLeg } = useSim()
  const [adding, setAdding] = useState(false)
  const open = positions.filter(l => l.status === 'OPEN')
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 h-9 border-b border-slate-100 dark:border-white/[0.05] shrink-0">
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-white/40">Legs</span>
        <span className="text-[10px] text-slate-400 dark:text-white/30">{open.length} open</span>
        {open.length > 0 && <button onClick={() => void closeAll()} className="h-6 px-2 rounded-md border border-red-200 dark:border-red-900/40 text-[10px] font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">Exit all</button>}
        <button onClick={() => setAdding(a => !a)} className="ml-auto flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>Add leg</button>
      </div>
      {adding && chain && <AddLegRow chain={chain} onAdd={(cid, k, ot, sd, lots) => { void addLeg(cid, k, ot, sd, lots); setAdding(false) }} />}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {positions.length === 0
          ? <div className="h-full flex flex-col items-center justify-center gap-1 text-center"><p className="text-[12px] text-slate-400 dark:text-white/30">No legs yet</p><p className="text-[11px] text-slate-300 dark:text-white/20">In the option chain, hover a strike and tap <b className="text-emerald-500">B</b>/<b className="text-red-500">S</b></p></div>
          : positions.map(l => <LegCard key={l.id} leg={l} />)}
      </div>
    </div>
  )
}

function AddLegRow({ chain, onAdd }: { chain: NonNullable<ReturnType<typeof useSim.getState>['chain']>; onAdd: (cid: string, strike: number, ot: OptType, side: Side, lots: number) => void }) {
  const [side, setSide] = useState<Side>('SELL'); const [ot, setOt] = useState<OptType>('CE'); const [strike, setStrike] = useState(chain.atm); const [lots, setLots] = useState(1)
  const cid = ot === 'CE' ? chain.rows.find(r => r.strike === strike)?.ce?.contractId : chain.rows.find(r => r.strike === strike)?.pe?.contractId
  return (
    <div className="flex items-center gap-1.5 px-2 py-2 border-b border-slate-100 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02]">
      <div className="flex rounded-md overflow-hidden ring-1 ring-slate-200 dark:ring-white/10">{(['BUY', 'SELL'] as Side[]).map(s => <button key={s} onClick={() => setSide(s)} className={clsx('px-2 h-6 text-[10px] font-black', side === s ? (s === 'BUY' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white') : 'text-slate-400')}>{s[0]}</button>)}</div>
      <div className="flex rounded-md overflow-hidden ring-1 ring-slate-200 dark:ring-white/10">{(['CE', 'PE'] as OptType[]).map(o => <button key={o} onClick={() => setOt(o)} className={clsx('px-2 h-6 text-[10px] font-black', ot === o ? 'bg-slate-700 text-white' : 'text-slate-400')}>{o}</button>)}</div>
      <select value={strike} onChange={e => setStrike(Number(e.target.value))} className="h-6 px-1.5 rounded-md border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.05] text-[11px] font-bold tabular-nums">{chain.rows.map(r => <option key={r.strike} value={r.strike}>{r.strike}</option>)}</select>
      <div className="flex items-center gap-0.5"><button onClick={() => setLots(l => Math.max(1, l - 1))} className="h-6 w-6 rounded border border-slate-200 dark:border-white/[0.1] text-slate-500">−</button><span className="w-6 text-center text-[11px] font-bold">{lots}</span><button onClick={() => setLots(l => l + 1)} className="h-6 w-6 rounded border border-slate-200 dark:border-white/[0.1] text-slate-500">+</button></div>
      <button onClick={() => cid && onAdd(cid, strike, ot, side, lots)} className="ml-auto h-6 px-3 rounded-md bg-brand-600 text-white text-[10px] font-bold hover:bg-brand-700">Add</button>
    </div>
  )
}

// Small square icon button used across the leg controls.
function IconBtn({ title, onClick, children, tone = 'default' }: { title: string; onClick: () => void; children: React.ReactNode; tone?: 'default' | 'danger' | 'active' }) {
  return (
    <button title={title} onClick={onClick} className={clsx('h-7 w-7 grid place-items-center rounded-md border transition-colors',
      tone === 'danger' ? 'border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
        : tone === 'active' ? 'border-brand-300 dark:border-brand-800 text-brand-600 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20'
          : 'border-slate-200 dark:border-white/[0.1] text-slate-500 dark:text-white/45 hover:bg-slate-50 dark:hover:bg-white/[0.05]')}>{children}</button>
  )
}

function LegCard({ leg }: { leg: PositionLeg }) {
  const { closeLeg, reverseLeg, changeQty, rollStrike, removeLeg } = useSim()
  const [modify, setModify] = useState(false)
  const mtm = leg.status === 'CLOSED' ? leg.realized : leg.unrealized
  const lots = Math.round(leg.qty / leg.lotSize)
  const buy = leg.side === 'BUY'
  const open = leg.status === 'OPEN'
  return (
    <div className={clsx('relative rounded-r-xl border border-l-2 pl-2.5 pr-3 py-2', leg.status === 'CLOSED' ? 'opacity-45 border-slate-200 border-l-slate-300 dark:border-white/[0.06]' : buy ? 'border-emerald-200 border-l-emerald-500 dark:border-emerald-900/40' : 'border-red-200 border-l-red-500 dark:border-red-900/40', 'dark:bg-white/[0.02]')}>
      <div className="flex items-center gap-2">
        <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-black', buy ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white')}>{leg.side}</span>
        <span className="text-[13px] font-bold text-slate-800 dark:text-white/85 tabular-nums">{leg.strike} <span className={clsx('text-[10px]', leg.optType === 'CE' ? 'text-emerald-600' : 'text-red-500')}>{leg.optType}</span></span>
        <span className="text-[10px] text-slate-400 dark:text-white/30">×{leg.qty} · {lots}L</span>
        <span className={clsx('ml-auto text-[13px] font-black tabular-nums', mtm >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{mtm >= 0 ? '+' : '−'}₹{inr(Math.abs(mtm))}</span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 dark:text-white/40">
        <span>entry <b className="font-bold text-slate-700 dark:text-white/70">{leg.avgEntry.toFixed(1)}</b></span>
        <span>ltp <b className="font-bold text-slate-700 dark:text-white/70">{leg.ltp.toFixed(1)}</b></span>
        {leg.sl != null && <span className="text-red-500">SL {leg.sl.toFixed(1)}</span>}
        {leg.target != null && <span className="text-emerald-500">Tgt {leg.target.toFixed(1)}</span>}
      </div>
      {open && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* qty stepper */}
          <div className="flex items-center rounded-md border border-slate-200 dark:border-white/[0.1] overflow-hidden">
            <button title="Decrease lots" onClick={() => void changeQty(leg.id, lots - 1)} className="h-7 w-7 grid place-items-center text-slate-500 dark:text-white/45 hover:bg-slate-50 dark:hover:bg-white/[0.05]"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" /></svg></button>
            <span className="w-9 text-center text-[11px] font-black tabular-nums text-slate-700 dark:text-white/70 border-x border-slate-200 dark:border-white/[0.1]">{lots}L</span>
            <button title="Increase lots" onClick={() => void changeQty(leg.id, lots + 1)} className="h-7 w-7 grid place-items-center text-slate-500 dark:text-white/45 hover:bg-slate-50 dark:hover:bg-white/[0.05]"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg></button>
          </div>
          {/* strike stepper — shows the actual strike */}
          <div className="flex items-center rounded-md border border-slate-200 dark:border-white/[0.1] overflow-hidden">
            <button title="Lower strike" onClick={() => void rollStrike(leg.id, -1)} className="h-7 w-7 grid place-items-center text-slate-500 dark:text-white/45 hover:bg-slate-50 dark:hover:bg-white/[0.05]"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" /></svg></button>
            <span className="px-2 text-center text-[11px] font-black tabular-nums text-slate-700 dark:text-white/70 border-x border-slate-200 dark:border-white/[0.1] leading-7">{leg.strike.toLocaleString('en-IN')}</span>
            <button title="Higher strike" onClick={() => void rollStrike(leg.id, 1)} className="h-7 w-7 grid place-items-center text-slate-500 dark:text-white/45 hover:bg-slate-50 dark:hover:bg-white/[0.05]"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg></button>
          </div>
          {/* buy/sell toggle */}
          <IconBtn title={`Flip to ${buy ? 'SELL' : 'BUY'}`} onClick={() => void reverseLeg(leg.id)}><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" /></svg></IconBtn>
          {/* SL / target */}
          <IconBtn title="Stop-loss & target" onClick={() => setModify(true)} tone={leg.sl != null || leg.target != null ? 'active' : 'default'}><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg></IconBtn>
          <div className="ml-auto flex items-center gap-2">
            {/* square off */}
            <button title="Square off (exit at market)" onClick={() => void closeLeg(leg.id)} className="h-7 px-2.5 flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-900/20 text-[10px] font-black text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4M16 17l5-5-5-5M21 12H9" /></svg>Square off</button>
            {/* delete */}
            <IconBtn title="Delete leg" onClick={() => void removeLeg(leg.id)} tone="danger"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg></IconBtn>
          </div>
        </div>
      )}
      {!open && (
        <div className="flex justify-end mt-2">
          <IconBtn title="Remove from book" onClick={() => removeLeg(leg.id)} tone="danger"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg></IconBtn>
        </div>
      )}
      {modify && <ModifyPopover leg={leg} lots={lots} onClose={() => setModify(false)} />}
    </div>
  )
}

function ModifyPopover({ leg, lots, onClose }: { leg: PositionLeg; lots: number; onClose: () => void }) {
  const { changeQty, setLegRisk, partialExit } = useSim()
  const [q, setQ] = useState(lots); const [sl, setSl] = useState(leg.sl != null ? String(leg.sl) : ''); const [tgt, setTgt] = useState(leg.target != null ? String(leg.target) : '')
  function apply() { if (q !== lots) void changeQty(leg.id, q); setLegRisk(leg.id, { sl: sl ? Number(sl) : undefined, target: tgt ? Number(tgt) : undefined }); onClose() }
  const R = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="flex items-center justify-between"><span className="text-[11px] text-slate-500 dark:text-white/40">{label}</span>{children}</div>
  return (
    <div className="absolute right-2 top-8 z-40 w-56 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-slate-900 shadow-2xl p-3">
      <div className="text-[11px] font-bold text-slate-700 dark:text-white/70 mb-2.5">Modify · {leg.strike} {leg.optType}</div>
      <div className="space-y-2.5">
        <R label="Quantity"><div className="flex items-center gap-1.5"><button onClick={() => setQ(v => Math.max(1, v - 1))} className="h-6 w-6 rounded border border-slate-200 dark:border-white/[0.1] text-slate-500">−</button><span className="w-8 text-center text-[12px] font-bold tabular-nums">{q}L</span><button onClick={() => setQ(v => v + 1)} className="h-6 w-6 rounded border border-slate-200 dark:border-white/[0.1] text-slate-500">+</button></div></R>
        <R label="Stop loss ₹"><input value={sl} onChange={e => setSl(e.target.value)} placeholder="—" className="h-7 w-20 px-2 text-right rounded-md border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.05] text-[12px] font-bold tabular-nums outline-none focus:border-red-400" /></R>
        <R label="Target ₹"><input value={tgt} onChange={e => setTgt(e.target.value)} placeholder="—" className="h-7 w-20 px-2 text-right rounded-md border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.05] text-[12px] font-bold tabular-nums outline-none focus:border-emerald-400" /></R>
        <R label="Partial exit"><div className="flex gap-1">{[['50%', Math.max(1, Math.floor(lots / 2))], ['25%', Math.max(1, Math.floor(lots / 4))]].map(([l, n]) => <button key={l as string} onClick={() => { void partialExit(leg.id, n as number); onClose() }} className="h-6 px-2 rounded-md border border-slate-200 dark:border-white/[0.1] text-[10px] font-bold text-slate-500">{l as string}</button>)}</div></R>
      </div>
      <div className="flex gap-1.5 mt-3"><button onClick={apply} className="flex-1 h-8 rounded-lg bg-brand-600 text-white text-[12px] font-bold hover:bg-brand-700">Apply</button><button onClick={onClose} className="h-8 px-3 rounded-lg border border-slate-200 dark:border-white/[0.1] text-[12px] font-bold text-slate-500">Cancel</button></div>
    </div>
  )
}

// ── Analysis ─────────────────────────────────────────────────────────────────────
type ATab = 'payoff' | 'pnl' | 'risk'
function Analysis() {
  const [tab, setTab] = useState<ATab>('payoff')
  const [expanded, setExpanded] = useState(false)
  const hasLegs = useSim(s => s.positions.some(l => l.status === 'OPEN'))
  return (
    <>
      <div className="flex items-center gap-1 px-3 h-9 border-b border-slate-200 dark:border-white/[0.06] shrink-0">
        {([['payoff', 'Payoff'], ['pnl', 'P&L'], ['risk', 'Risk']] as [ATab, string][]).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={clsx('h-7 px-3 rounded-lg text-[11px] font-bold transition-colors', tab === k ? 'bg-brand-500 text-white' : 'text-slate-500 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/[0.05]')}>{l}</button>)}
        <button onClick={() => setExpanded(true)} className="ml-auto h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" /></svg></button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{!hasLegs ? <AnalysisEmpty /> : tab === 'payoff' ? <PayoffView /> : tab === 'pnl' ? <PnlView /> : <RiskView />}</div>
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-6" onClick={() => setExpanded(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-4xl h-[78vh] rounded-2xl bg-white dark:bg-[#0b1220] border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center gap-1 px-4 h-11 border-b border-slate-100 dark:border-white/[0.06]">{([['payoff', 'Payoff'], ['pnl', 'P&L'], ['risk', 'Risk']] as [ATab, string][]).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={clsx('h-7 px-3 rounded-lg text-[12px] font-bold', tab === k ? 'bg-brand-500 text-white' : 'text-slate-500 dark:text-white/40')}>{l}</button>)}<button onClick={() => setExpanded(false)} className="ml-auto h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>
            <div className="flex-1 min-h-0 flex flex-col">{!hasLegs ? <AnalysisEmpty /> : tab === 'payoff' ? <PayoffView /> : tab === 'pnl' ? <PnlView /> : <RiskView />}</div>
          </div>
        </div>
      )}
    </>
  )
}

function AnalysisEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      <div className="grid grid-cols-2 gap-1.5 opacity-60">
        <div className="h-8 w-14 rounded-md bg-brand-100 dark:bg-brand-900/30" /><div className="h-8 w-8 rounded-md bg-slate-100 dark:bg-white/[0.05]" />
        <div className="h-8 w-8 rounded-md bg-slate-100 dark:bg-white/[0.05]" /><div className="h-8 w-14 rounded-md bg-brand-100 dark:bg-brand-900/30" />
      </div>
      <div><p className="text-[14px] font-bold text-slate-700 dark:text-white/70">Payoff, P&L and risk appear here</p><p className="text-[12px] text-slate-400 dark:text-white/35 mt-1 max-w-[240px]">Add a leg from the option chain to build a position and see the analysis.</p></div>
    </div>
  )
}

function usePayoff() {
  const { positions, chain, config, steps, cursor } = useSim()
  const ts = steps[cursor]
  const legs: OptionLeg[] = useMemo(() => {
    if (!config) return []
    const ed = config.expiryId.split('-').slice(1).join('-')
    const dte = Math.max(0.5, (Date.parse(`${ed}T00:00:00+05:30`) + 930 * 60000 - ts) / 86_400_000)
    const ivOf = (cid: string) => {
      for (const r of chain?.rows ?? []) { if (r.ce?.contractId === cid) return r.ce.iv; if (r.pe?.contractId === cid) return r.pe.iv }
      return undefined
    }
    return positions.filter(l => l.status === 'OPEN').map(l => ({ optType: l.optType, strike: l.strike, qty: l.side === 'BUY' ? l.qty : -l.qty, entry: l.avgEntry, dte, iv: ivOf(l.contractId) || 0.15 }))
  }, [positions, config, ts, chain])
  const data = useMemo(() => computePayoffCurve(legs), [legs])
  const spot = chain?.spot ?? 0
  const step = chain?.step ?? 50
  const stats = useMemo(() => computeStats(data, spot, legs[0]?.dte ?? 1), [data, spot, legs])
  return { legs, data, spot, step, stats }
}

function PayoffView() {
  const { legs, spot, step } = usePayoff()
  return (
    <div className="flex-1 min-h-0 px-2 pt-2 pb-2">
      <div className="w-full h-full"><SimPayoffChart legs={legs} spot={spot} step={step} /></div>
    </div>
  )
}

function PnlView() {
  const { pnl, realized, unrealized } = useSim()
  const total = realized + unrealized
  const max = Math.max(1, ...pnl.map(p => Math.abs(p.total)))
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-3 gap-2 mb-3"><Kpi label="Realized" value={realized} /><Kpi label="Unrealized" value={unrealized} /><Kpi label="Total · gross" value={total} strong /></div>
      {pnl.length === 0 ? <div className="h-24 flex items-center justify-center text-[11px] text-slate-300 dark:text-white/20">Progression builds as replay advances</div> : (
        <div className="flex items-end gap-px h-28 mb-2">{pnl.slice(-120).map((p, i) => <div key={i} className="flex-1 flex flex-col justify-center" title={`${istTime(p.ts)} · ₹${p.total}`}><div className={clsx('w-full rounded-sm', p.total >= 0 ? 'bg-emerald-400/70' : 'bg-red-400/70')} style={{ height: `${(Math.abs(p.total) / max) * 100}%`, alignSelf: p.total >= 0 ? 'flex-end' : 'flex-start' }} /></div>)}</div>
      )}
      <p className="text-[10px] text-amber-500 mt-1">Gross P&L · transaction costs not applied</p>
    </div>
  )
}

// Net portfolio greeks = Σ (contract greek × signed qty), using the live chain snapshot.
function usePortfolioGreeks() {
  const { positions, chain } = useSim()
  return useMemo(() => {
    const g = { delta: 0, gamma: 0, theta: 0, vega: 0, hasData: false }
    if (!chain) return g
    const byId = new Map<string, OptionQuote>()
    for (const r of chain.rows) { if (r.ce) byId.set(r.ce.contractId, r.ce); if (r.pe) byId.set(r.pe.contractId, r.pe) }
    for (const l of positions) {
      if (l.status !== 'OPEN') continue
      const q = byId.get(l.contractId); if (!q) continue
      const sq = l.side === 'BUY' ? l.qty : -l.qty
      g.delta += (q.delta ?? 0) * sq
      g.gamma += (q.gamma ?? 0) * sq
      g.theta += (q.theta ?? 0) * sq
      g.vega += (q.vega ?? 0) * sq
      g.hasData = true
    }
    return g
  }, [positions, chain])
}

function GreeksBar() {
  const g = usePortfolioGreeks()
  const cards: { k: string; sub: string; txt: string; tone: 'green' | 'red' | 'slate' }[] = [
    { k: 'Delta', sub: 'Directional (units)', txt: signed(g.delta, 1), tone: g.delta >= 0 ? 'green' : 'red' },
    { k: 'Gamma', sub: 'Δ per point', txt: g.gamma.toFixed(3), tone: 'slate' },
    { k: 'Theta', sub: '₹ / day', txt: money(g.theta), tone: g.theta >= 0 ? 'green' : 'red' },
    { k: 'Vega', sub: '₹ / 1% IV', txt: money(g.vega), tone: g.vega >= 0 ? 'green' : 'red' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {cards.map((c) => (
        <div key={c.k} className="relative rounded-xl border border-slate-200 dark:border-white/[0.07] bg-gradient-to-br from-white to-slate-50/60 dark:from-white/[0.03] dark:to-transparent px-3 py-2.5 overflow-hidden">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">{c.k}</div>
          <div className={clsx('text-[16px] font-black tabular-nums leading-tight mt-0.5',
            !g.hasData ? 'text-slate-300 dark:text-white/20' : c.tone === 'green' ? 'text-emerald-600 dark:text-emerald-400' : c.tone === 'red' ? 'text-red-500 dark:text-red-400' : 'text-slate-700 dark:text-white/80')}>
            {g.hasData ? c.txt : '—'}
          </div>
          <div className="text-[9.5px] text-slate-400 dark:text-white/25">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}

function RiskView() {
  const { positions, realized, unrealized, pnl } = useSim()
  const open = positions.filter(l => l.status === 'OPEN')
  const total = realized + unrealized
  let dd = 0, pk = 0; for (const p of pnl) { pk = Math.max(pk, p.total); dd = Math.min(dd, p.total - pk) }
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5">Net position greeks</p>
        <GreeksBar />
      </div>
      <div className="grid grid-cols-2 gap-2"><Kpi label="Open legs" value={open.length} raw /><Kpi label="Max drawdown" value={dd} /><Kpi label="Net exposure" value={open.reduce((s, l) => s + (l.side === 'BUY' ? l.qty : -l.qty), 0)} raw /><Kpi label="Total · gross" value={total} strong /></div>
      <div className="rounded-lg border border-slate-100 dark:border-white/[0.06] p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1">Not modeled yet</p><p className="text-[11px] text-slate-400 dark:text-white/30">Margin, capital used and cost-adjusted risk arrive with the cost/margin model.</p></div>
    </div>
  )
}

const signed = (v: number, d = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
const money = (v: number) => `${v >= 0 ? '+' : '−'}₹${inr(Math.abs(Math.round(v)))}`

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' | 'indigo' }) {
  const c = tone === 'green' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'red' ? 'text-red-500 dark:text-red-400' : tone === 'indigo' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-white/70'
  return <div><div className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25">{label}</div><div className={clsx('text-[13px] font-black tabular-nums', c)}>{value}</div></div>
}
function Kpi({ label, value, strong, raw }: { label: string; value: number; strong?: boolean; raw?: boolean }) {
  const pos = value >= 0
  return <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] p-2.5"><div className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">{label}</div><div className={clsx('tabular-nums', strong ? 'text-[15px] font-black' : 'text-[13px] font-bold', raw ? 'text-slate-700 dark:text-white/70' : pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{raw ? value : `${pos ? '+' : '−'}₹${inr(Math.abs(value))}`}</div></div>
}
