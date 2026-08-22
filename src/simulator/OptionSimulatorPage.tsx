// ── Option Simulator — V3.1 workstation (mock data, admin-only) ───────────────
// Time machine for historical options replay. Top: replay scrubber + quick jumps.
// Left: Option Chain | Positions tabs (chain dominant). Right: Payoff | P&L | Risk.
// No price chart (by design).

import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useSim } from './store'
import { NAV_STEPS, type NavStep } from './store'
import type { Frequency, IndexCode, OptType, PositionLeg, Side } from './types'
import { bsGreeks } from './engine/blackScholes'
import { computePayoffCurve, computeStats, inr, type OptionLeg } from '@/components/PayoffEChart'
import { SimPayoffChart } from './SimPayoffChart'

const FREQS: Frequency[] = ['1m', '3m', '5m', '15m', '30m', '1h']
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
        {/* Left — option chain only (dominant) */}
        <div className="flex-[1.75_1.75_0%] min-w-0 border-r border-slate-200 dark:border-white/[0.06] flex flex-col"><RichChain /></div>
        {/* Right — three cards: stats · positions · payoff */}
        <div className="flex-1 min-w-0 flex flex-col gap-2 p-2 min-h-0 bg-slate-50 dark:bg-white/[0.015]">
          <StatsBox />
          <div className="flex-[1.1_1.1_0%] min-h-0 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0b1220] shadow-sm flex flex-col overflow-hidden"><PositionsPanel /></div>
          <div className="flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0b1220] shadow-sm flex flex-col overflow-hidden"><Analysis /></div>
        </div>
      </div>
    </>
  )
}

// ── Box 1: key stats ─────────────────────────────────────────────────────────────
function StatsBox() {
  const { legs, stats } = usePayoff()
  const has = legs.length > 0
  return (
    <div className="shrink-0 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0b1220] shadow-sm px-4 py-2.5 flex items-center gap-6 flex-wrap">
      <Stat label="Max profit" value={has ? `+₹${inr(Math.abs(stats.maxProfit))}` : '—'} tone={has ? 'green' : undefined} />
      <Stat label="Max loss" value={!has ? '—' : stats.maxLoss <= -1e7 ? 'Unlimited' : `−₹${inr(Math.abs(stats.maxLoss))}`} tone={has ? 'red' : undefined} />
      <Stat label="POP" value={has ? `${stats.pop}%` : '—'} />
      <Stat label="Breakeven" value={!has ? '—' : stats.breakevens.length ? stats.breakevens.map(b => b.toLocaleString('en-IN')).join(' · ') : 'No breakeven'} tone={has ? 'indigo' : undefined} />
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
  const atmRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => { const c = scrollRef.current, a = atmRef.current; if (c && a) { const cr = c.getBoundingClientRect(), ar = a.getBoundingClientRect(); c.scrollTop += (ar.top - cr.top) - (c.clientHeight / 2 - ar.height / 2) } }, [chain?.atm])
  const dte = useMemo(() => { if (!config) return 1; const ed = config.expiryId.split('-').slice(1).join('-'); return Math.max(0.5, (Date.parse(`${ed}T00:00:00+05:30`) + 930 * 60000 - steps[cursor]) / 86_400_000) }, [config, steps, cursor])
  if (!chain) return <div className="h-full flex items-center justify-center text-[12px] text-slate-400 dark:text-white/25">Loading chain…</div>

  const posBy = new Map<string, number>()
  for (const l of positions) if (l.status === 'OPEN') posBy.set(`${l.optType}-${l.strike}`, (posBy.get(`${l.optType}-${l.strike}`) ?? 0) + (l.side === 'BUY' ? l.qty : -l.qty))
  const lotSz = positions[0]?.lotSize
  const delta = (S: number, K: number, iv: number, ot: OptType) => bsGreeks(S, K, dte / 365, iv || 0.15, ot).delta
  const cols = '50px 1fr 42px 82px 46px 42px 1fr 50px'

  const BS = (ot: OptType, strike: number, cid?: string, r?: boolean) => (
    <span className={clsx('inline-flex h-5 rounded overflow-hidden ring-1 ring-slate-300 dark:ring-white/15 opacity-0 group-hover:opacity-100 transition-opacity', r && 'flex-row-reverse')}>
      <button onClick={() => cid && void addLeg(cid, strike, ot, 'BUY', lots)} className="w-5 grid place-items-center text-[10px] font-black bg-emerald-500 text-white hover:bg-emerald-600">B</button>
      <button onClick={() => cid && void addLeg(cid, strike, ot, 'SELL', lots)} className="w-5 grid place-items-center text-[10px] font-black bg-red-500 text-white hover:bg-red-600">S</button>
    </span>
  )
  const posLots = (q?: number) => q == null || lotSz == null ? '' : `${q > 0 ? '+' : ''}${Math.round(q / lotSz)}`

  return (
    <div className="flex flex-col h-full">
      {/* sub-header: index/lot/spot */}
      <div className="flex items-center gap-3 px-4 h-9 border-b border-slate-100 dark:border-white/[0.05] shrink-0">
        <span className="text-[12px] font-black text-slate-800 dark:text-white/85">{config?.index}</span>
        <span className="text-[11px] text-slate-400 dark:text-white/35">Lot {lotSz ?? '—'}</span>
        <span className="text-[13px] font-black tabular-nums text-slate-700 dark:text-white/80">{chain.spot.toLocaleString('en-IN')}</span>
        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"><svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>Simulated</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 dark:text-white/30">Lots</span>
          <button onClick={() => setLots(l => Math.max(1, l - 1))} className="h-6 w-6 rounded border border-slate-200 dark:border-white/[0.1] text-slate-500">−</button>
          <span className="w-7 text-center text-[12px] font-bold tabular-nums text-slate-700 dark:text-white/70">{lots}</span>
          <button onClick={() => setLots(l => l + 1)} className="h-6 w-6 rounded border border-slate-200 dark:border-white/[0.1] text-slate-500">+</button>
        </div>
      </div>
      {/* expiry tabs */}
      <ExpiryTabs />
      {/* column header */}
      <div className="grid shrink-0 border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-white/30" style={{ gridTemplateColumns: cols }}>
        <div className="px-2 py-1.5">Δ</div><div className="px-2 py-1.5 text-right">Call LTP</div><div className="px-1 py-1.5 text-center">Pos</div>
        <div className="px-1 py-1.5 text-center">Strike</div><div className="px-1 py-1.5 text-center">IV</div>
        <div className="px-1 py-1.5 text-center">Pos</div><div className="px-2 py-1.5">Put LTP</div><div className="px-2 py-1.5 text-right">Δ</div>
      </div>
      {/* rows */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {chain.rows.map(r => {
          const isAtm = r.strike === chain.atm
          const ceItm = r.strike < chain.spot, peItm = r.strike > chain.spot
          const ceRun = posBy.get(`CE-${r.strike}`), peRun = posBy.get(`PE-${r.strike}`)
          return (
            <table key={r.strike} className="w-full border-collapse table-fixed"><tbody><tr ref={isAtm ? atmRef : undefined}
              className={clsx('border-b border-slate-50 dark:border-white/[0.03]', isAtm && 'bg-brand-50/70 dark:bg-brand-900/15 ring-1 ring-inset ring-brand-200 dark:ring-brand-900/40')}>
              <td className="p-0" style={{ width: 50 }}><div className="px-2 py-1.5 text-[10px] tabular-nums text-slate-400 dark:text-white/30">{r.ce ? delta(chain.spot, r.strike, r.ce.iv ?? 0, 'CE').toFixed(2) : ''}</div></td>
              <td className={clsx('p-0', ceItm && 'bg-amber-50/60 dark:bg-amber-900/[0.08]')}><div className="group flex items-center justify-end gap-2 px-2 py-1.5">{BS('CE', r.strike, r.ce?.contractId)}<span className={clsx('text-[9px] tabular-nums', (r.ce?.changePct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500')}>{(r.ce?.changePct ?? 0) >= 0 ? '+' : ''}{r.ce?.changePct ?? 0}%</span><span className="tabular-nums text-[13px] font-bold text-slate-800 dark:text-white/85">{r.ce ? r.ce.ltp.toFixed(2) : '—'}</span></div></td>
              <td className="p-0 text-center" style={{ width: 42 }}>{ceRun != null && <span className={clsx('text-[10px] font-black tabular-nums', ceRun > 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-rose-600 dark:text-rose-400')}>{posLots(ceRun)}</span>}</td>
              <td className="p-0 text-center bg-slate-50/80 dark:bg-white/[0.03]" style={{ width: 82 }}><div className="py-1.5"><span className={clsx('text-[12px] font-black tabular-nums', isAtm ? 'text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-200')}>{r.strike.toLocaleString('en-IN')}</span></div></td>
              <td className="p-0 text-center" style={{ width: 46 }}><span className="text-[10px] tabular-nums text-slate-400 dark:text-white/35">{r.ce?.iv ? (r.ce.iv * 100).toFixed(1) : ''}</span></td>
              <td className="p-0 text-center" style={{ width: 42 }}>{peRun != null && <span className={clsx('text-[10px] font-black tabular-nums', peRun > 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-rose-600 dark:text-rose-400')}>{posLots(peRun)}</span>}</td>
              <td className={clsx('p-0', peItm && 'bg-amber-50/60 dark:bg-amber-900/[0.08]')}><div className="group flex items-center gap-2 px-2 py-1.5"><span className="tabular-nums text-[13px] font-bold text-slate-800 dark:text-white/85">{r.pe ? r.pe.ltp.toFixed(2) : '—'}</span><span className={clsx('text-[9px] tabular-nums', (r.pe?.changePct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500')}>{(r.pe?.changePct ?? 0) >= 0 ? '+' : ''}{r.pe?.changePct ?? 0}%</span>{BS('PE', r.strike, r.pe?.contractId, true)}</div></td>
              <td className="p-0 text-right" style={{ width: 50 }}><div className="px-2 py-1.5 text-[10px] tabular-nums text-slate-400 dark:text-white/30">{r.pe ? delta(chain.spot, r.strike, r.pe.iv ?? 0, 'PE').toFixed(2) : ''}</div></td>
            </tr></tbody></table>
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
    return positions.filter(l => l.status === 'OPEN').map(l => ({ optType: l.optType, strike: l.strike, qty: l.side === 'BUY' ? l.qty : -l.qty, entry: l.avgEntry, dte, iv: 0.15 }))
  }, [positions, config, ts])
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

function RiskView() {
  const { positions, realized, unrealized, pnl } = useSim()
  const open = positions.filter(l => l.status === 'OPEN')
  const total = realized + unrealized
  let dd = 0, pk = 0; for (const p of pnl) { pk = Math.max(pk, p.total); dd = Math.min(dd, p.total - pk) }
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-2"><Kpi label="Open legs" value={open.length} raw /><Kpi label="Max drawdown" value={dd} /><Kpi label="Net exposure" value={open.reduce((s, l) => s + (l.side === 'BUY' ? l.qty : -l.qty), 0)} raw /><Kpi label="Total · gross" value={total} strong /></div>
      <div className="mt-3 rounded-lg border border-slate-100 dark:border-white/[0.06] p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1">Not modeled yet</p><p className="text-[11px] text-slate-400 dark:text-white/30">Margin, capital used and cost-adjusted risk arrive with the cost/margin model and the real historical option API.</p></div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' | 'indigo' }) {
  const c = tone === 'green' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'red' ? 'text-red-500 dark:text-red-400' : tone === 'indigo' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-white/70'
  return <div><div className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25">{label}</div><div className={clsx('text-[13px] font-black tabular-nums', c)}>{value}</div></div>
}
function Kpi({ label, value, strong, raw }: { label: string; value: number; strong?: boolean; raw?: boolean }) {
  const pos = value >= 0
  return <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] p-2.5"><div className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">{label}</div><div className={clsx('tabular-nums', strong ? 'text-[15px] font-black' : 'text-[13px] font-bold', raw ? 'text-slate-700 dark:text-white/70' : pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{raw ? value : `${pos ? '+' : '−'}₹${inr(Math.abs(value))}`}</div></div>
}
