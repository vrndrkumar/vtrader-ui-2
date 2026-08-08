// ── RunningStrategyBar ───────────────────────────────────────────────────────
// Replaces the preset-strategy row in the Trade → Strategy section with the
// live running-strategy selectors: strategy (group) dropdown, broker
// multi-select, and dynamic tag tabs. Selecting a group/tag loads that
// running strategy's open option legs into the builder (payoff updates).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { getTrades } from '@/api/reports'
import type { Trade } from '@/types/reports'
import { tagFallbackColor } from '@/journal/TagCombobox'
import { defaultLegQty } from '../../store/strategyStore'
import type { OptType, Side, StrategyLeg } from '../../types/options'

const BROKER_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']
function brokerColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return BROKER_COLORS[h % BROKER_COLORS.length]
}

const isOpen = (t: Trade) => t.status !== 'CLOSED'

function detectIndex(sym: string): string {
  const u = sym.toUpperCase()
  if (u.startsWith('BANKNIFTY'))  return 'BANKNIFTY'
  if (u.startsWith('MIDCPNIFTY')) return 'MIDCPNIFTY'
  if (u.startsWith('FINNIFTY'))   return 'FINNIFTY'
  if (u.startsWith('NIFTY'))      return 'NIFTY'
  if (u.startsWith('BANKEX'))     return 'BANKEX'
  if (u.startsWith('SENSEX'))     return 'SENSEX'
  return 'NIFTY'
}

interface ParsedOption { index: string; rawExpiry: string; optType: OptType; strike: number }
function parseOption(sym: string): ParsedOption | null {
  const parts = sym.split('_')
  if (parts.length < 4) return null
  const optType = parts[parts.length - 2] as OptType
  if (!['CE', 'PE'].includes(optType)) return null
  const strike = parseInt(parts[parts.length - 1], 10)
  if (isNaN(strike)) return null
  return { index: detectIndex(sym), rawExpiry: parts[1] ?? '', optType, strike }
}

// Trade → StrategyLeg. Entry premium (avg_exit_price for shorts) becomes the
// leg price so the payoff reflects what was actually paid/received.
function tradeToLeg(t: Trade, expiries: string[]): StrategyLeg | null {
  if (!isOpen(t) || t.total_quantity === 0) return null
  const p = parseOption(t.symbol_name)
  if (!p) return null
  const isShort = t.total_quantity < 0
  const entry = isShort ? (t.avg_exit_price ?? t.avg_entry_price) : t.avg_entry_price
  const { lot } = defaultLegQty(p.index)
  // Best-effort match to a live chain expiry so DTE resolves; else raw.
  const expiry = expiries.find(e => e.replace(/\s/g, '').toUpperCase().startsWith(p.rawExpiry.slice(0, 5).toUpperCase())) ?? p.rawExpiry
  return {
    id: `run_${t.trade_id}`,
    side: (isShort ? 'SELL' : 'BUY') as Side,
    expiry,
    strike: p.strike,
    optType: p.optType,
    qty: Math.abs(t.total_quantity),
    lot,
    priceType: 'Limit',
    price: entry,
    ltp: entry,
    iv: 0,
  }
}

// ── Dropdowns ─────────────────────────────────────────────────────────────────

function GroupSelect({ value, onChange, groups, disabled }: { value: string; onChange: (v: string) => void; groups: string[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={rootRef} className="relative">
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}
        className={clsx('flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-xl border text-[13px] font-semibold transition-all bg-white dark:bg-white/[0.05] shadow-sm min-w-[160px]', disabled && 'opacity-50 cursor-not-allowed', open ? 'border-brand-400 ring-2 ring-brand-400/15 text-slate-800 dark:text-white' : 'border-slate-200 dark:border-white/[0.09] text-slate-700 dark:text-slate-200 hover:border-slate-300')}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-brand-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
        <span className={clsx('flex-1 text-left truncate', !value && 'text-slate-400 font-normal')}>{value || 'Select strategy…'}</span>
        <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5 text-slate-400 transition-transform shrink-0', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && groups.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-2 w-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {groups.map(g => (
              <button key={g} onMouseDown={e => { e.preventDefault(); onChange(g); setOpen(false) }}
                className={clsx('w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[13px]', value === g ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.05]')}>
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: brokerColor(g) }} />
                <span className="flex-1 truncate">{g}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BrokerMultiSelect({ brokers, selected, onChange, disabled }: { brokers: string[]; selected: Set<string>; onChange: (s: Set<string>) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const allSelected = selected.size === 0 || selected.size === brokers.length
  function toggle(b: string) { const next = new Set(selected); if (next.has(b)) next.delete(b); else next.add(b); onChange(next.size === brokers.length ? new Set() : next) }
  return (
    <div ref={rootRef} className="relative">
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}
        className={clsx('flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-xl border text-[13px] font-semibold transition-all bg-white dark:bg-white/[0.05] shadow-sm min-w-[130px]', disabled && 'opacity-50 cursor-not-allowed', open ? 'border-brand-400 ring-2 ring-brand-400/15 text-slate-800 dark:text-white' : 'border-slate-200 dark:border-white/[0.09] text-slate-700 dark:text-slate-200 hover:border-slate-300')}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12h6M9 8h6M9 16h4" strokeLinecap="round" /></svg>
        {!allSelected ? (
          <div className="flex items-center gap-1 flex-1 overflow-hidden">
            {[...selected].slice(0, 2).map(b => <span key={b} className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-white shrink-0" style={{ background: brokerColor(b) }}>{b.slice(0, 4)}</span>)}
            {selected.size > 2 && <span className="text-[10px] text-slate-500">+{selected.size - 2}</span>}
          </div>
        ) : <span className="flex-1 text-left">All brokers</span>}
        <svg viewBox="0 0 24 24" className={clsx('h-3.5 w-3.5 text-slate-400 transition-transform shrink-0', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && brokers.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-2 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          <button onMouseDown={e => { e.preventDefault(); onChange(new Set()) }}
            className={clsx('w-full flex items-center gap-2.5 px-3.5 py-2.5 border-b border-slate-100 dark:border-white/[0.06]', allSelected ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]')}>
            <span className={clsx('h-4 w-4 rounded border-2 flex items-center justify-center shrink-0', allSelected ? 'border-brand-500 bg-brand-500' : 'border-slate-300 dark:border-white/20')}>
              {allSelected && <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
            </span>
            <span className="text-[12px] font-semibold">All brokers</span>
          </button>
          <div className="py-1">
            {brokers.map(b => {
              const isSel = allSelected || selected.has(b); const c = brokerColor(b)
              return (
                <button key={b} onMouseDown={e => { e.preventDefault(); toggle(b) }} className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                  <span className="h-4 w-4 rounded border-2 flex items-center justify-center shrink-0" style={isSel ? { borderColor: c, background: c } : { borderColor: '#CBD5E1' }}>
                    {isSel && <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                  </span>
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c }} />
                  <span className="text-[12px] text-slate-700 dark:text-slate-200 truncate flex-1">{b}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

interface TagTab { key: string; label: string; color: string | null; trades: Trade[] }
function buildTabs(trades: Trade[]): TagTab[] {
  const tagMap = new Map<string, { color: string | null; trades: Trade[] }>()
  const untagged: Trade[] = []
  for (const t of trades) {
    const tags = t.tags ?? []
    if (!tags.length) { untagged.push(t); continue }
    for (const tag of tags) {
      if (!tagMap.has(tag.name)) tagMap.set(tag.name, { color: tag.metadata?.colorCode ?? null, trades: [] })
      tagMap.get(tag.name)!.trades.push(t)
    }
  }
  const tabs: TagTab[] = [...tagMap.entries()].map(([name, { color, trades: tds }]) => ({ key: name, label: name, color: color ?? tagFallbackColor(name), trades: tds }))
  if (untagged.length) tabs.push({ key: '__others__', label: 'Others', color: null, trades: untagged })
  return tabs
}

// ── Bar ───────────────────────────────────────────────────────────────────────

interface Props {
  expiries: string[]
  onLoad: (legs: StrategyLeg[], index: string) => void
}

export function RunningStrategyBar({ expiries, onLoad }: Props) {
  const [allTrades, setAllTrades] = useState<Trade[]>([])
  const [initialDone, setInitialDone] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedBrokers, setSelectedBrokers] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getTrades().then(r => { if (alive) { setAllTrades(r); setInitialDone(true) } }).catch(() => { if (alive) { setInitialDone(true); toast.error('Failed to load strategies') } })
    return () => { alive = false }
  }, [])

  const distinctGroups = useMemo(() => [...new Set(allTrades.map(t => t.group_name).filter(Boolean))].sort(), [allTrades])
  const distinctBrokers = useMemo(() => [...new Set(allTrades.map(t => t.broker_name).filter(Boolean))].sort(), [allTrades])
  useEffect(() => { if (distinctGroups.length && !selectedGroup) setSelectedGroup(distinctGroups[0]) }, [distinctGroups, selectedGroup])

  const filtered = useMemo(() => {
    let list = allTrades
    if (selectedGroup) list = list.filter(t => t.group_name === selectedGroup)
    if (selectedBrokers.size) list = list.filter(t => selectedBrokers.has(t.broker_name))
    return list
  }, [allTrades, selectedGroup, selectedBrokers])

  const tabs = useMemo(() => buildTabs(filtered), [filtered])
  // Do NOT auto-select the first tab — the builder opens in the "New" (blank)
  // state with no strategy active. Only clear the selection if the currently
  // selected tab disappears (e.g. after a filter change).
  useEffect(() => { if (activeTab && !tabs.find(t => t.key === activeTab)) setActiveTab(null) }, [tabs, activeTab])

  const currentTabTrades = useMemo(() => tabs.find(t => t.key === activeTab)?.trades ?? [], [tabs, activeTab])

  // The builder starts BLANK. A running strategy is loaded into it ONLY after the
  // user actively picks one (clicks a tab, or changes the group/broker filter) —
  // never on the initial auto-selection. This is why opening Strategy no longer
  // jumps the index to whatever the first strategy is (e.g. BANKNIFTY) or fills
  // the builder with pre-existing legs.
  const loadRef = useRef(onLoad)
  loadRef.current = onLoad
  const userPicked = useRef(false)
  const legsKey = useMemo(() => currentTabTrades.filter(isOpen).map(t => `${t.trade_id}:${t.total_quantity}`).sort().join(','), [currentTabTrades])
  const legsFromTrades = useCallback((trades: Trade[]) => {
    const legs = trades.map(t => tradeToLeg(t, expiries)).filter((l): l is StrategyLeg => l !== null)
    const idx = legs.length ? detectIndex(trades.find(t => parseOption(t.symbol_name))?.symbol_name ?? '') : ''
    return { legs, idx }
  }, [expiries])
  // Load the tab the user just clicked immediately (even if it's the already-
  // highlighted default tab, where the effect below wouldn't re-fire).
  const loadTab = (key: string) => {
    userPicked.current = true
    setActiveTab(key)
    const t = tabs.find(x => x.key === key)
    if (!t) return
    const { legs, idx } = legsFromTrades(t.trades)
    if (legs.length) loadRef.current(legs, idx)
  }
  // Keep a loaded strategy in sync with live qty changes / group switches — but
  // only once the user has opted in by picking a strategy.
  useEffect(() => {
    if (!userPicked.current) return
    const { legs, idx } = legsFromTrades(currentTabTrades)
    if (legs.length) loadRef.current(legs, idx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legsKey, expiries.join('|')])

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 pr-1 shrink-0">Running</span>
        <GroupSelect value={selectedGroup} onChange={v => { userPicked.current = true; setSelectedGroup(v); setActiveTab(null) }} groups={distinctGroups} disabled={!initialDone} />
        <BrokerMultiSelect brokers={distinctBrokers} selected={selectedBrokers} onChange={(s) => { userPicked.current = true; setSelectedBrokers(s) }} disabled={!initialDone} />
        {selectedBrokers.size > 0 && (
          <button onClick={() => setSelectedBrokers(new Set())} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-white/[0.1] text-[10px] font-bold text-slate-500 dark:text-white/30 hover:bg-slate-50 dark:hover:bg-white/[0.05]">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>Clear
          </button>
        )}
        <span className="ml-auto text-[10px] text-slate-400">{initialDone ? `${distinctGroups.length} strategies` : 'Loading…'}</span>
      </div>

      {tabs.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(tab => {
            const openCount = tab.trades.filter(isOpen).length
            const isActive = activeTab === tab.key
            const color = tab.color ?? tagFallbackColor(tab.label)
            return (
              <button key={tab.key} onClick={() => loadTab(tab.key)}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border whitespace-nowrap shrink-0', isActive ? 'shadow-sm' : 'border-transparent text-slate-500 dark:text-white/35 hover:bg-slate-50 dark:hover:bg-white/[0.04]')}
                style={isActive ? { background: `${color}15`, borderColor: `${color}30`, color } : {}}>
                {tab.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: isActive ? color : '#94a3b8' }} />}
                {tab.label}
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1" style={isActive ? { background: `${color}20`, color } : { background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
                  {tab.trades.length}
                  {openCount > 0 && <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
