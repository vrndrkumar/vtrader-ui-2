// ── Indicators master (Control Panel) ────────────────────────────────────────
// Admin surface to view & edit the default config for the structured indicators
// (SMC, Liquidity Sweep) that the market-data service computes for the JSON API.
// Mirrors the on-chart indicator settings: see current values, modify, save (for
// all users), and reset to defaults.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { getIndicatorConfig, saveIndicatorConfig, resetIndicatorConfig, type IndKind, type IndicatorConfigResp } from '@/api/indicatorConfig'

const INDICATORS: { id: IndKind; label: string; sub: string }[] = [
  { id: 'smc', label: 'Smart Money Concepts', sub: 'Order blocks · FVG · structure · liquidity' },
  { id: 'liquidity_sweep', label: 'Buyside & Sellside Liquidity', sub: 'Liquidity levels · breach zones · voids' },
]

// Field grouping + friendly labels per indicator (keys not listed fall to "Other").
const GROUPS: Record<IndKind, { title: string; keys: string[] }[]> = {
  smc: [
    { title: 'General', keys: ['mode'] },
    { title: 'Internal Structure', keys: ['showInternals', 'showInternalBull', 'showInternalBear', 'internalFilterConfluence'] },
    { title: 'Swing Structure', keys: ['showStructure', 'showSwingBull', 'showSwingBear', 'swingsLength', 'showSwings', 'showHighLowSwings'] },
    { title: 'Order Blocks', keys: ['showInternalOrderBlocks', 'internalOrderBlocksSize', 'showSwingOrderBlocks', 'swingOrderBlocksSize', 'orderBlockFilter', 'orderBlockMitigation'] },
    { title: 'Equal Highs / Lows', keys: ['showEqualHighsLows', 'equalHighsLowsLength', 'equalHighsLowsThreshold'] },
    { title: 'Fair Value Gaps', keys: ['showFairValueGaps', 'fairValueGapsThreshold', 'fairValueGapsTimeframe', 'fairValueGapsExtend'] },
    { title: 'MTF Levels', keys: ['showDailyLevels', 'showWeeklyLevels', 'showMonthlyLevels'] },
    { title: 'Premium / Discount', keys: ['showPremiumDiscountZones'] },
  ],
  liquidity_sweep: [
    { title: 'Detection', keys: ['liqLen', 'margin', 'mode', 'visLiq'] },
    { title: 'Buyside', keys: ['liqBuy', 'marBuy'] },
    { title: 'Sellside', keys: ['liqSel', 'marSel'] },
    { title: 'Liquidity Voids', keys: ['lqVoid'] },
  ],
}

const LABELS: Record<string, string> = {
  mode: 'Mode', showInternals: 'Show Internal Structure', showInternalBull: 'Internal Bullish', showInternalBear: 'Internal Bearish',
  internalFilterConfluence: 'Confluence Filter', showStructure: 'Show Swing Structure', showSwingBull: 'Swing Bullish', showSwingBear: 'Swing Bearish',
  swingsLength: 'Swings Length', showSwings: 'Show Swing Points', showHighLowSwings: 'Strong/Weak High & Low',
  showInternalOrderBlocks: 'Internal Order Blocks', internalOrderBlocksSize: 'Internal OB Count', showSwingOrderBlocks: 'Swing Order Blocks',
  swingOrderBlocksSize: 'Swing OB Count', orderBlockFilter: 'OB Filter', orderBlockMitigation: 'OB Mitigation',
  showEqualHighsLows: 'Equal Highs/Lows', equalHighsLowsLength: 'Bars Confirmation', equalHighsLowsThreshold: 'Threshold',
  showFairValueGaps: 'Fair Value Gaps', fairValueGapsThreshold: 'Auto Threshold', fairValueGapsTimeframe: 'FVG Timeframe', fairValueGapsExtend: 'Extend FVG',
  showDailyLevels: 'Daily Levels', showWeeklyLevels: 'Weekly Levels', showMonthlyLevels: 'Monthly Levels', showPremiumDiscountZones: 'Premium/Discount Zones',
  liqLen: 'Detection Length', margin: 'Margin', visLiq: '# Visible Levels', liqBuy: 'Buyside Zones', marBuy: 'Buyside Margin',
  liqSel: 'Sellside Zones', marSel: 'Sellside Margin', lqVoid: 'Liquidity Voids',
}
const prettify = (k: string) => LABELS[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

type Val = string | number | boolean

export default function IndicatorsMaster() {
  const [sel, setSel] = useState<IndKind>('smc')
  const [cfg, setCfg] = useState<IndicatorConfigResp | null>(null)
  const [form, setForm] = useState<Record<string, Val>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null)

  const load = useCallback(async (id: IndKind) => {
    setLoading(true); setMsg(null)
    try {
      const r = await getIndicatorConfig(id)
      const safe: IndicatorConfigResp = { ...r, types: r.types ?? {}, enums: r.enums ?? {}, defaults: r.defaults ?? {}, stored: r.stored ?? {}, effective: r.effective ?? {} }
      setCfg(safe)
      setForm({ ...safe.effective } as Record<string, Val>)
    } catch {
      setCfg(null); setMsg({ t: 'err', s: 'Could not reach the indicator service.' })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load(sel) }, [sel, load])

  const dirty = useMemo(() => {
    if (!cfg) return false
    const eff = (cfg.effective ?? {}) as Record<string, unknown>
    return Object.keys(form).some((k) => String(form[k]) !== String(eff[k]))
  }, [form, cfg])

  const set = (k: string, v: Val) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!cfg) return
    setSaving(true); setMsg(null)
    try {
      await saveIndicatorConfig(sel, form)
      await load(sel) // re-fetch the canonical config (schema-safe; never trust write response shape)
      setMsg({ t: 'ok', s: 'Saved. Applies to every user via the indicator API.' })
    } catch (e) {
      const err = e as { response?: { status?: number } }
      setMsg({ t: 'err', s: err.response?.status === 400 ? 'Invalid values.' : 'Save failed.' })
    } finally { setSaving(false) }
  }
  const reset = async () => {
    setSaving(true); setMsg(null)
    try {
      await resetIndicatorConfig(sel)
      await load(sel)
      setMsg({ t: 'ok', s: 'Reset to defaults.' })
    } catch { setMsg({ t: 'err', s: 'Reset failed.' }) } finally { setSaving(false) }
  }

  const types = cfg?.types ?? {}
  const enums = cfg?.enums ?? {}
  const defaults = (cfg?.defaults ?? {}) as Record<string, unknown>
  const groups = cfg ? GROUPS[sel] : []
  const known = new Set(groups.flatMap((g) => g.keys))
  const otherKeys = Object.keys(types).filter((k) => !known.has(k))

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 px-6 pt-5 pb-3">
        <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Indicators</h2>
        <p className="text-[12px] text-slate-400">Default config for SMC & Liquidity Sweep — used by the indicator JSON API for all users.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {INDICATORS.map((ind) => (
            <button key={ind.id} onClick={() => setSel(ind.id)}
              className={clsx('text-left rounded-xl px-3.5 py-2 border transition-all',
                sel === ind.id ? 'border-brand-300/60 bg-brand-500/[0.10] dark:border-brand-500/30' : 'border-slate-200 dark:border-white/10 hover:bg-white dark:hover:bg-white/[0.04]')}>
              <div className={clsx('text-[13px] font-semibold', sel === ind.id ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200')}>{ind.label}</div>
              <div className="text-[10.5px] text-slate-400">{ind.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-24">
        {loading && <p className="text-sm text-slate-400 py-10 text-center">Loading config…</p>}
        {!loading && !cfg && <p className="text-sm text-slate-400 py-10 text-center">{msg?.s ?? 'No config.'}</p>}
        {!loading && cfg && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-5xl">
            {[...groups, ...(otherKeys.length ? [{ title: 'Other', keys: otherKeys }] : [])].map((g) => (
              <Section key={g.title} title={g.title}>
                {g.keys.map((k) => types[k] ? (
                  <Field key={k} label={prettify(k)} type={types[k]} options={enums[k]} value={form[k]}
                    modified={String(form[k]) !== String(defaults[k])}
                    onChange={(v) => set(k, v)} />
                ) : null)}
              </Section>
            ))}
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      {cfg && (
        <div className="shrink-0 border-t border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-[#0a0f1a]/80 backdrop-blur px-6 py-3 flex items-center gap-3">
          {msg && <span className={clsx('text-[12px] font-medium', msg.t === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>{msg.s}</span>}
          <div className="flex-1" />
          <button onClick={reset} disabled={saving} className="h-9 px-4 rounded-lg text-[13px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition disabled:opacity-50">Reset to defaults</button>
          <button onClick={save} disabled={saving || !dirty} className="h-9 px-5 rounded-lg text-[13px] font-bold text-white bg-brand-600 hover:bg-brand-700 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">{saving ? 'Saving…' : 'Save config'}</button>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/[0.02]">
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/[0.06]">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</span>
      </div>
      <div className="px-4 py-2 divide-y divide-slate-50 dark:divide-white/[0.04]">{children}</div>
    </div>
  )
}

function Field({ label, type, options, value, modified, onChange }: {
  label: string; type: string; options?: string[]; value: Val | undefined; modified: boolean; onChange: (v: Val) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 min-h-[38px]">
      <span className="text-[12.5px] text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
        {label}
        {modified && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Changed from default" />}
      </span>
      {type === 'bool' ? (
        <button onClick={() => onChange(!(value === true || value === 'true'))}
          className={clsx('relative h-5 w-9 rounded-full transition shrink-0', (value === true || value === 'true') ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600')}>
          <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', (value === true || value === 'true') ? 'left-4' : 'left-0.5')} />
        </button>
      ) : type === 'enum' ? (
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12.5px] px-2 focus:outline-none focus:ring-2 focus:ring-brand-400 dark:text-slate-200">
          {(options ?? []).map((o) => <option key={o} value={o} className="dark:bg-slate-800">{o}</option>)}
        </select>
      ) : type === 'int' || type === 'float' ? (
        <input type="number" value={Number(value ?? 0)} step={type === 'float' ? 0.1 : 1}
          onChange={(e) => onChange(type === 'float' ? Number(e.target.value) : Math.round(Number(e.target.value)))}
          className="h-8 w-24 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12.5px] px-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-400 dark:text-slate-200" />
      ) : (
        <input value={String(value ?? '')} placeholder="chart" onChange={(e) => onChange(e.target.value)}
          className="h-8 w-28 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12.5px] px-2 focus:outline-none focus:ring-2 focus:ring-brand-400 dark:text-slate-200 placeholder:text-slate-400" />
      )}
    </div>
  )
}
