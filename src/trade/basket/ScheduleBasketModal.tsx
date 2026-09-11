// ── Schedule Basket modal (create / edit) ────────────────────────────────────
// Attach an ENTRY trigger (index level and/or time) and an optional EXIT trigger
// to a snapshot basket. Whichever sub-condition fires first wins. Entry places
// the legs (BUY→SELL, brokers parallel); exit reverses them (MKT). Once ENTERED,
// the entry is locked and only the exit can be changed.

import { useState } from 'react'
import { clsx } from 'clsx'
import { useScheduledBasketStore } from '@/trade/store/scheduledBasketStore'
import { useMarketStore } from '@/trade/store/marketStore'
import { useBrokerStore } from '@/store/brokerStore'
import type { IndexDir, ScheduledPayload } from '@/api/scheduledBaskets'

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s))
function timeToIso(hhmm: string): string | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const d = new Date(); d.setSeconds(0, 0); d.setHours(h, m); return d.toISOString()
}
function isoToTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const breachNow = (dir: IndexDir, idx: number | undefined, level: number) =>
  idx != null && (dir === 'ABOVE' ? idx >= level : idx <= level)

export function ScheduleBasketModal() {
  const { modalOpen, editing, draftLegs, draftBrokers, draftIndex, closeModal, submitCreate, submitEdit } = useScheduledBasketStore()
  const idxLtp = useMarketStore((s) => s.quotes[draftIndex]?.ltp)
  const allBrokers = useBrokerStore((s) => s.accounts)

  const entered = editing?.status === 'ENTERED'

  const [entryIdx, setEntryIdx] = useState('')
  const [entryDir, setEntryDir] = useState<IndexDir>('ABOVE')
  const [entryTime, setEntryTime] = useState('')
  const [exitOn, setExitOn] = useState(false)
  const [exitIdx, setExitIdx] = useState('')
  const [exitDir, setExitDir] = useState<IndexDir>('BELOW')
  const [exitTime, setExitTime] = useState('')
  const [brokers, setBrokers] = useState<string[]>([])
  const [seeded, setSeeded] = useState<number | 'new' | null>(null)

  const seedKey = editing ? editing.id : 'new'
  if (modalOpen && seeded !== seedKey) {
    setBrokers(editing ? editing.brokers : draftBrokers)
    setEntryIdx(editing?.entryIndexLevel != null ? String(editing.entryIndexLevel) : '')
    setEntryDir((editing?.entryIndexDir as IndexDir) || 'ABOVE')
    setEntryTime(isoToTime(editing?.entryTime))
    const hasExit = !!(editing && (editing.exitIndexLevel != null || editing.exitTime != null))
    setExitOn(hasExit)
    setExitIdx(editing?.exitIndexLevel != null ? String(editing.exitIndexLevel) : '')
    setExitDir((editing?.exitIndexDir as IndexDir) || 'BELOW')
    setExitTime(isoToTime(editing?.exitTime))
    setSeeded(seedKey)
  }

  if (!modalOpen) return null

  const legs = draftLegs
  const totalQty = legs.reduce((a, l) => a + l.qty, 0)
  const buys = legs.filter((l) => l.side === 'BUY').length

  const entrySet = entryIdx.trim() !== '' || entryTime.trim() !== ''
  const canSave = entered ? true : (entrySet && brokers.length > 0) // entered → editing exit only
  const toggleBroker = (name: string) => setBrokers((cur) => (cur.includes(name) ? cur.filter((b) => b !== name) : [...cur, name]))

  const close = () => { setSeeded(null); closeModal() }

  const save = async () => {
    const exit = {
      exitIndexLevel: exitOn ? numOrNull(exitIdx) : null,
      exitIndexDir: exitOn && exitIdx.trim() !== '' ? exitDir : null,
      exitTime: exitOn ? timeToIso(exitTime) : null,
    }
    let ok: boolean
    if (entered && editing) {
      ok = await submitEdit(editing.id, exit) // exit-only after entry
    } else {
      const payload: ScheduledPayload = {
        name: `${draftIndex} basket`,
        indexName: draftIndex,
        brokers,
        legs,
        entryIndexLevel: numOrNull(entryIdx),
        entryIndexDir: entryIdx.trim() !== '' ? entryDir : null,
        entryTime: timeToIso(entryTime),
        ...exit,
      }
      ok = editing ? await submitEdit(editing.id, payload) : await submitCreate(payload)
    }
    if (ok) setSeeded(null)
  }

  const entryWarn = entryIdx.trim() !== '' && breachNow(entryDir, idxLtp, Number(entryIdx)) ? 'Already past — will fire immediately' : ''
  const exitWarn = exitOn && exitIdx.trim() !== '' && breachNow(exitDir, idxLtp, Number(exitIdx)) ? 'Already past — will fire immediately' : ''

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={close} />
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-card-dark shadow-2xl ring-1 ring-black/5 dark:ring-white/10 animate-slide-up overflow-hidden">
        {/* Header — neutral, theme-aware surface */}
        <div className="px-5 pt-4 pb-3 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 grid place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                </span>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{editing ? (entered ? 'Edit exit' : 'Edit schedule') : 'Schedule basket'}</h2>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{draftIndex} · {legs.length} legs · {brokers.length} broker{brokers.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={close} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10 transition active:scale-90"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {legs.slice(0, 6).map((l, i) => (
                <span key={i} className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                  <b className={l.side === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{l.side === 'BUY' ? 'B' : 'S'}</b> {l.display || l.symbolName} · {l.qty}
                </span>
              ))}
              {legs.length > 6 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-white/10 text-slate-500">+{legs.length - 6}</span>}
            </div>
            <div className="text-right shrink-0 pl-2">
              <p className="text-[9px] uppercase tracking-widest text-slate-400">{draftIndex}</p>
              <p className="text-lg font-bold tabular-nums leading-tight text-slate-700 dark:text-slate-200">{idxLtp != null ? idxLtp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</p>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Qty {totalQty} · {buys} buy / {legs.length - buys} sell · executes BUY→SELL, brokers in parallel</p>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 max-h-[52vh] overflow-auto">
          {/* Entry */}
          <TriggerCard
            title="Entry trigger" required
            hint={entered ? `Entered ${editing?.entryFiredBy ? `on ${editing.entryFiredBy}` : ''} — locked` : 'Whichever fires first enters the basket.'}
            disabled={entered}
            idxValue={entered ? (editing?.entryIndexLevel != null ? String(editing.entryIndexLevel) : '') : entryIdx}
            onIdx={setEntryIdx} dir={entered ? (editing?.entryIndexDir as IndexDir) || 'ABOVE' : entryDir} onDir={setEntryDir}
            time={entered ? isoToTime(editing?.entryTime) : entryTime} onTime={setEntryTime}
            indexName={draftIndex} warn={entered ? '' : entryWarn}
          />

          {/* Exit (optional, editable even after entry) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Exit trigger <span className="text-slate-400 font-medium">· optional</span></p>
                <p className="text-[10px] text-slate-400">Reverses the basket (square off, MKT) when it fires.</p>
              </div>
              <button onClick={() => setExitOn((v) => !v)} type="button"
                className={clsx('relative h-5 w-9 rounded-full transition', exitOn ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600')}>
                <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', exitOn ? 'left-4' : 'left-0.5')} />
              </button>
            </label>
            {exitOn && (
              <div className="mt-3">
                <TriggerInputs idxValue={exitIdx} onIdx={setExitIdx} dir={exitDir} onDir={setExitDir}
                  time={exitTime} onTime={setExitTime} indexName={draftIndex} warn={exitWarn} accent="rose" />
              </div>
            )}
          </div>

          {/* Brokers — pick which of the user's brokers this fires on (locked once entered) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Fires on these brokers</p>
              <span className="text-[10px] font-semibold text-slate-400">{brokers.length} selected</span>
            </div>
            {entered ? (
              <div className="flex flex-wrap gap-1">
                {(editing?.brokers ?? []).map((b) => <span key={b} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">{b}</span>)}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allBrokers.map((a) => {
                  const on = brokers.includes(a.brokerName)
                  return (
                    <button key={a.id} type="button" onClick={() => toggleBroker(a.brokerName)}
                      className={clsx('inline-flex items-center gap-1 h-7 pl-1.5 pr-2 rounded-lg text-[11px] font-semibold border transition active:scale-95',
                        on ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/25 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300 dark:hover:border-slate-600')}>
                      <span className={clsx('h-3.5 w-3.5 grid place-items-center rounded border', on ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 dark:border-slate-600')}>
                        {on && <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      {a.displayName}
                    </button>
                  )
                })}
                {allBrokers.length === 0 && <span className="text-[11px] text-slate-400">No brokers connected.</span>}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <p className="text-[11px] text-slate-400 flex-1">{entered ? 'Entry is locked — adjust the exit only.' : brokers.length === 0 ? 'Select at least one broker.' : entrySet ? 'Index and/or time — first hit enters.' : 'Set an entry trigger to continue.'}</p>
          <button onClick={close} className="h-9 px-4 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-95">Cancel</button>
          <button onClick={save} disabled={!canSave}
            className={clsx('h-9 px-5 rounded-lg text-sm font-bold text-white transition active:scale-95',
              canSave ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed')}>
            {editing ? 'Save' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TriggerCard(props: {
  title: string; hint: string; required?: boolean; disabled?: boolean
  idxValue: string; onIdx: (v: string) => void; dir: IndexDir; onDir: (d: IndexDir) => void
  time: string; onTime: (v: string) => void; indexName: string; warn: string
}) {
  return (
    <div className={clsx('rounded-2xl border p-3', props.disabled ? 'border-slate-200 dark:border-slate-800 opacity-70' : 'border-slate-200 dark:border-slate-800')}>
      <div className="mb-2">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{props.title}{props.required && <span className="text-rose-400"> *</span>}</p>
        <p className="text-[10px] text-slate-400">{props.hint}</p>
      </div>
      <fieldset disabled={props.disabled}>
        <TriggerInputs idxValue={props.idxValue} onIdx={props.onIdx} dir={props.dir} onDir={props.onDir}
          time={props.time} onTime={props.onTime} indexName={props.indexName} warn={props.warn} accent="indigo" />
      </fieldset>
    </div>
  )
}

function TriggerInputs({ idxValue, onIdx, dir, onDir, time, onTime, indexName, warn, accent }: {
  idxValue: string; onIdx: (v: string) => void; dir: IndexDir; onDir: (d: IndexDir) => void
  time: string; onTime: (v: string) => void; indexName: string; warn: string; accent: 'indigo' | 'rose'
}) {
  const ring = accent === 'rose' ? 'focus-within:ring-rose-400' : 'focus-within:ring-indigo-400'
  return (
    <div className="space-y-2">
      {/* Index level + direction */}
      <div className={clsx('rounded-xl border border-slate-200 dark:border-slate-800 p-2 focus-within:ring-2', ring)}>
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{indexName} level</p>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
            {(['ABOVE', 'BELOW'] as IndexDir[]).map((d) => (
              <button key={d} type="button" onClick={() => onDir(d)}
                className={clsx('h-7 px-2 text-[10px] font-bold transition', dir === d
                  ? (d === 'ABOVE' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white')
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5')}>
                {d === 'ABOVE' ? 'Cross ↑' : 'Cross ↓'}
              </button>
            ))}
          </div>
          <input inputMode="decimal" value={idxValue} onChange={(e) => onIdx(e.target.value)} placeholder="e.g. 23300.45"
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold tabular-nums focus:outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600" />
        </div>
        {warn && <p className="text-[9px] text-amber-500 mt-1">{warn}</p>}
      </div>
      {/* Time */}
      <div className={clsx('rounded-xl border border-slate-200 dark:border-slate-800 p-2 focus-within:ring-2', ring)}>
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Time (today)</p>
        <div className="flex items-center gap-2">
          <input type="time" value={time} onChange={(e) => onTime(e.target.value)}
            className="flex-1 bg-transparent text-sm font-semibold tabular-nums focus:outline-none" />
          {time && <button type="button" onClick={() => onTime('')} className="text-[10px] text-slate-400 hover:text-slate-600">clear</button>}
        </div>
      </div>
    </div>
  )
}
