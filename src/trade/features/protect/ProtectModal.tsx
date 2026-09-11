// ── Combined Protect modal (create / edit) ───────────────────────────────────
// Attach a portfolio-level SL/Target over the selected positions of ONE index.
// Any of five triggers may be armed (OR): combined P&L stop / target, index
// level down / up, and a time cutoff. At least one is required.

import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { useGroupMonitorStore, combinedRunningPnl } from '@/trade/store/groupMonitorStore'
import { useMarketStore } from '@/trade/store/marketStore'
import { useTradebookStore } from '../tradebook/tradebookStore'
import { totalPnl } from '../tradebook/types'
import { realtime } from '@/trade/data/realtime/realtimeService'
import type { GroupPayload } from '@/api/groupMonitors'
import { inr, px, pnlCls } from '../tradebook/format'

const num = (v: string) => (v.trim() === '' ? NaN : Number(v))

/** HH:MM (local) → ISO for today (or tomorrow if already past). */
function timeToIso(hhmm: string): string | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const d = new Date()
  d.setSeconds(0, 0); d.setHours(h, m)
  return d.toISOString()
}
function isoToTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ProtectModal() {
  const { modalOpen, editing, draftLegs, draftIndex, closeModal, submitCreate, submitEdit } = useGroupMonitorStore()
  const quotes = useMarketStore((s) => s.quotes)

  // Trigger fields — each independently toggleable. The two index inputs are
  // DIRECTION-AGNOSTIC levels: whether each fires on a cross UP or DOWN is inferred
  // from where it sits vs the live index, so the user never picks the wrong side.
  const [pnlSl, setPnlSl] = useState('')
  const [pnlTgt, setPnlTgt] = useState('')
  const [idxA, setIdxA] = useState('')
  const [idxB, setIdxB] = useState('')
  const [time, setTime] = useState('')
  const [seeded, setSeeded] = useState<number | 'new' | null>(null)

  // Seed once per open (from the edited group, or blank for create).
  const seedKey = editing ? editing.id : 'new'
  if (modalOpen && seeded !== seedKey) {
    setPnlSl(editing?.pnlSl != null ? String(editing.pnlSl) : '')
    setPnlTgt(editing?.pnlTarget != null ? String(editing.pnlTarget) : '')
    setIdxA(editing?.indexTarget != null ? String(editing.indexTarget) : '') // above level
    setIdxB(editing?.indexSl != null ? String(editing.indexSl) : '')         // below level
    setTime(isoToTime(editing?.timeStop ?? null))
    setSeeded(seedKey)
  }

  const legs = draftLegs
  const indexName = draftIndex
  const idxLtp = quotes[indexName]?.ltp

  // Make sure every leg's symbol is subscribed so the live price is present even
  // for a thin strike that hasn't ticked yet while this modal is open.
  const legSymsKey = legs.map((l) => l.symbolName).join(',')
  useEffect(() => {
    if (!modalOpen || !legSymsKey) return
    realtime.start()
    const unsubs = legSymsKey.split(',').map((s) => realtime.subscribeSymbolTick(s, { prime: false }))
    return () => unsubs.forEach((u) => u())
  }, [modalOpen, legSymsKey])

  // Live positions → running P&L (realized + live unrealized) keyed by symbol|broker,
  // plus a seed-LTP fallback for legs not yet ticked.
  const positions = useTradebookStore((s) => s.positions)
  const { netMap, seedMap } = useMemo(() => {
    const netMap: Record<string, number> = {}
    const seedMap: Record<string, number> = {}
    for (const p of positions) {
      if (!p.symbol) continue
      const liveLtp = quotes[p.symbol]?.ltp ?? p.ltp
      if (p.ltp) seedMap[p.symbol] = p.ltp
      // Running P&L with the LIVE ltp = realized + unrealized(live).
      const live = { ...p, ltp: liveLtp }
      netMap[`${p.symbol}|${p.brokerLabel}`] = totalPnl(live)
    }
    return { netMap, seedMap }
  }, [positions, quotes])

  // Live combined RUNNING P&L — exactly what the Positions table shows.
  const livePnl = useMemo(
    () => combinedRunningPnl(legs, netMap, (sym) => quotes[sym]?.ltp ?? seedMap[sym]),
    [legs, netMap, quotes, seedMap],
  )

  if (!modalOpen) return null

  // Direction of an index level inferred from the live index: at/above → cross-up
  // (fires when index ≥ level, stored as indexTarget); below → cross-down (indexSl).
  const dirOf = (v: string): 'ABOVE' | 'BELOW' | null => {
    const n = num(v)
    if (v.trim() === '' || Number.isNaN(n) || idxLtp == null) return null
    return n >= idxLtp ? 'ABOVE' : 'BELOW'
  }
  // Fold the two free-form levels into the backend's below(indexSl)/above(indexTarget) slots.
  let idxSlOut: number | null = null
  let idxTgtOut: number | null = null
  for (const v of [idxA, idxB]) {
    const d = dirOf(v)
    if (d === 'ABOVE') idxTgtOut = num(v)
    else if (d === 'BELOW') idxSlOut = num(v)
  }

  const anyTrigger = [pnlSl, pnlTgt, idxA, idxB, time].some((v) => v.trim() !== '')
  const save = async () => {
    const common = {
      pnlSl: pnlSl.trim() === '' ? null : num(pnlSl),
      pnlTarget: pnlTgt.trim() === '' ? null : num(pnlTgt),
      indexSl: idxSlOut,
      indexTarget: idxTgtOut,
      timeStop: timeToIso(time),
    }
    let ok: boolean
    if (editing) {
      // Editing thresholds only — keep the original arm anchor (armPnl / armPrice).
      ok = await submitEdit(editing.id, common)
    } else {
      // Arm now: capture the anchor at THIS instant so armPnl and each leg's
      // armPrice are consistent (running rebuilds exactly from them).
      const armLegs = legs.map((l) => ({ ...l, armPrice: quotes[l.symbolName]?.ltp ?? seedMap[l.symbolName] ?? l.armPrice }))
      const payload: GroupPayload = { indexName, legs: armLegs, name: `${indexName} protect`, armPnl: livePnl, ...common }
      ok = await submitCreate(payload)
    }
    if (ok) setSeeded(null)
  }
  const close = () => { setSeeded(null); closeModal() }

  const timePast = time && timeToIso(time) && new Date(timeToIso(time)!).getTime() < Date.now()

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={close} />
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-card-dark shadow-2xl ring-1 ring-black/5 dark:ring-white/10 animate-slide-up overflow-hidden">
        {/* Header — neutral, theme-aware surface with a muted accent */}
        <div className="px-5 pt-4 pb-3 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 grid place-items-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" /></svg>
                </span>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{editing ? 'Edit combined protect' : 'Combined protect'}</h2>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{indexName} · {legs.length} position{legs.length > 1 ? 's' : ''} · squares off all on any trigger</p>
            </div>
            <button onClick={close} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
          {/* Live combined P&L + legs */}
          <div className="mt-3 flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-400">Live running P&L</p>
              <p className={clsx('text-2xl font-extrabold tabular-nums leading-tight', pnlCls(livePnl))}>{inr(livePnl, true)}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest text-slate-400">{indexName}</p>
              <p className="text-lg font-bold tabular-nums leading-tight text-slate-700 dark:text-slate-200">{idxLtp != null ? px(idxLtp) : '—'}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {legs.map((l) => (
              <span key={`${l.brokerName}-${l.symbolName}`} className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                {l.display || l.symbolName} · {l.lockedQty > 0 ? '+' : ''}{l.lockedQty}
              </span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 max-h-[52vh] overflow-auto">
          {/* Combined P&L — ABSOLUTE levels on the running P&L shown above. */}
          <Section title="Combined P&L" hint={`Running ${inr(livePnl, true)} now. Cut when it reaches either level.`}>
            <Field label="Cut if P&L falls to" accent="amber" prefix="₹" value={pnlSl} onChange={setPnlSl} placeholder="e.g. -15000"
              warn={pnlSl.trim() !== '' && num(pnlSl) >= livePnl ? 'At/above current — fires now' : undefined} />
            <Field label="Cut if P&L rises to" accent="green" prefix="₹" value={pnlTgt} onChange={setPnlTgt} placeholder="e.g. 5000"
              warn={pnlTgt.trim() !== '' && num(pnlTgt) <= livePnl ? 'At/below current — fires now' : undefined} />
          </Section>

          {/* Index level — just type a level; the direction (cross up / cross down)
              is inferred from where it sits vs the live index, so you can't pick the
              wrong side. A short's stop is simply a level ABOVE; a long's a level BELOW. */}
          <Section title="Index level" hint={`${indexName}${idxLtp != null ? ` now ${px(idxLtp)}` : ''}. Enter a level — it triggers when spot crosses it from here.`}>
            <LevelField indexName={indexName} value={idxA} onChange={setIdxA} dir={dirOf(idxA)} placeholder="e.g. 23500" />
            <LevelField indexName={indexName} value={idxB} onChange={setIdxB} dir={dirOf(idxB)} placeholder="e.g. 23300" />
          </Section>

          {/* Time */}
          <Section title="Time cutoff" hint="Squares off at/after this time today.">
            <div className="flex items-center gap-2">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="h-9 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-400" />
              {time && <button onClick={() => setTime('')} className="text-[11px] text-slate-400 hover:text-slate-600">clear</button>}
            </div>
            {timePast && <p className="text-[10px] text-amber-500 mt-1">That time is already past — it will fire on the next tick.</p>}
          </Section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <p className="text-[11px] text-slate-400 flex-1">{anyTrigger ? 'Any one trigger squares off every leg (MKT).' : 'Set at least one trigger to continue.'}</p>
          <button onClick={close} className="h-9 px-4 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-95">Cancel</button>
          <button onClick={save} disabled={!anyTrigger}
            className={clsx('h-9 px-5 rounded-lg text-sm font-bold text-white transition active:scale-95 inline-flex items-center gap-1.5',
              anyTrigger ? 'bg-violet-600 hover:bg-violet-700' : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed')}>
            {editing ? 'Save changes' : 'Arm protect'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
      <div className="mb-2">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{title}</p>
        <p className="text-[10px] text-slate-400">{hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

// A free-form index level whose trigger direction is inferred (cross ↑ / ↓).
function LevelField({ indexName, value, onChange, dir, placeholder }: {
  indexName: string; value: string; onChange: (v: string) => void; dir: 'ABOVE' | 'BELOW' | null; placeholder?: string
}) {
  const on = value.trim() !== ''
  const up = dir === 'ABOVE'
  return (
    <label className={clsx('block rounded-xl border px-2.5 py-1.5 transition focus-within:ring-2 focus-within:ring-violet-400',
      on ? 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-white/5' : 'border-slate-200 dark:border-slate-800')}>
      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
        <span className={clsx('h-1.5 w-1.5 rounded-full', on ? (up ? 'bg-emerald-500' : 'bg-amber-400') : 'bg-slate-300 dark:bg-slate-600')} />
        Index level
      </span>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-transparent text-sm font-semibold tabular-nums focus:outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600" />
      {on && dir && (
        <span className={clsx('block text-[9px] mt-0.5 font-semibold', up ? 'text-emerald-600' : 'text-amber-600')}>
          {up ? `↑ fires when ${indexName} rises to ${value}` : `↓ fires when ${indexName} falls to ${value}`}
        </span>
      )}
      {on && !dir && <span className="block text-[9px] mt-0.5 text-slate-400">waiting for live {indexName}…</span>}
    </label>
  )
}

function Field({ label, accent, prefix, value, onChange, placeholder, warn }: {
  label: string; accent: 'amber' | 'green'; prefix?: string; value: string; onChange: (v: string) => void; placeholder?: string; warn?: string
}) {
  const on = value.trim() !== ''
  const ring = accent === 'amber' ? 'focus-within:ring-amber-400' : 'focus-within:ring-green-400'
  const dot = accent === 'amber' ? 'bg-amber-400' : 'bg-green-500'
  return (
    <label className={clsx('block rounded-xl border px-2.5 py-1.5 transition focus-within:ring-2', ring,
      warn ? 'border-amber-400 dark:border-amber-600' : on ? 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-white/5' : 'border-slate-200 dark:border-slate-800')}>
      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
        <span className={clsx('h-1.5 w-1.5 rounded-full', on ? dot : 'bg-slate-300 dark:bg-slate-600')} />{label}
      </span>
      <span className="flex items-center gap-1">
        {prefix && <span className="text-sm text-slate-400">{prefix}</span>}
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full bg-transparent text-sm font-semibold tabular-nums focus:outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600" />
      </span>
      {warn && <span className="block text-[9px] text-amber-500 mt-0.5">{warn}</span>}
    </label>
  )
}
