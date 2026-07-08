import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { clsx } from 'clsx'
import { useAuth } from '@/hooks/useAuth'
import {
  getSignals,
  createSignal,
  updateSignal,
  deleteSignal,
  toggleSignal,
} from '@/api/signal'
import type {
  Signal,
  TradeType,
  SLMode,
  TPMode,
  CreateSignalPayload,
  ExecConditionItem,
} from '@/types/signal'
import { parseTradeDetails } from '@/types/signal'

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNAL_STRATEGY_CODES = ['INTRADAY_MANUAL', 'DELTA_MANUAL']

const SYM_MAP: Record<string, string> = {
  NIFTY: 'Nifty 50',
  BANKNIFTY: 'Nifty Bank',
  FINNIFTY: 'Nifty Fin Service',
  BANKEX: 'BANKEX',
  SENSEX: 'SENSEX',
  MIDCPNIFTY: 'MIDCPNIFTY',
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
}

const ALL_INDICES = Object.keys(SYM_MAP)
const RR_OPTIONS = ['1:1', '1:1.5', '1:2', '1:2.5', '1:3'] as const
type RRValue = (typeof RR_OPTIONS)[number]

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormState {
  strategyCode: string
  indexName: string
  symbolName: string
  tradeType: TradeType
  entryPrice: string
  slMode: SLMode
  slValue: string
  tpMode: TPMode
  tpPrice: string
  rrValue: RRValue | ''
  isRealTime: boolean
  opType: string
  marketPrice: string
}

const DEFAULT_FORM: FormState = {
  strategyCode: 'INTRADAY_MANUAL',
  indexName: '',
  symbolName: '',
  tradeType: 'LONG',
  entryPrice: '',
  slMode: 'PRICE',
  slValue: '',
  tpMode: 'PRICE',
  tpPrice: '',
  rrValue: '',
  isRealTime: false,
  opType: '<',
  marketPrice: 'ltp',
}

// ─── Calc helpers ─────────────────────────────────────────────────────────────

function calcSLPrice(form: FormState): number {
  const entry = parseFloat(form.entryPrice)
  const raw = parseFloat(form.slValue)
  if (isNaN(entry) || isNaN(raw) || raw <= 0) return NaN
  if (form.slMode === 'PRICE') return raw
  const pts = Math.abs(raw)
  return form.tradeType === 'LONG' ? entry - pts : entry + pts
}

function calcTPPrice(form: FormState, sl: number): number {
  const entry = parseFloat(form.entryPrice)
  if (form.tpMode === 'PRICE') {
    const v = parseFloat(form.tpPrice)
    return isNaN(v) ? NaN : v
  }
  if (!form.rrValue) return NaN
  const reward = parseFloat(form.rrValue.split(':')[1])
  const risk = Math.abs(entry - sl)
  return form.tradeType === 'LONG' ? entry + risk * reward : entry - risk * reward
}

function validateForm(form: FormState): string | null {
  if (!form.indexName) return 'Select an index'
  if (!form.symbolName.trim()) return 'Symbol name is required'
  const entry = parseFloat(form.entryPrice)
  if (isNaN(entry) || entry <= 0) return 'Entry price must be > 0'
  const slRaw = parseFloat(form.slValue)
  if (isNaN(slRaw) || slRaw <= 0) return 'Stop-loss value must be > 0'
  const sl = calcSLPrice(form)
  if (!isNaN(sl) && sl <= 0) return 'SL price must be > 0'
  if (form.tpMode === 'PRICE') {
    const tp = parseFloat(form.tpPrice)
    if (isNaN(tp) || tp <= 0) return 'Target price must be > 0'
  } else {
    if (!form.rrValue) return 'Select a R:R ratio'
  }
  return null
}

function buildPayload(form: FormState): CreateSignalPayload {
  const entry = parseFloat(form.entryPrice)
  const slRaw = parseFloat(form.slValue)
  const targetValue =
    form.tpMode === 'PRICE' ? parseFloat(form.tpPrice) : form.rrValue
  const opType = form.isRealTime
    ? form.tradeType === 'LONG'
      ? '<'
      : '>'
    : form.opType
  return {
    strategyCode: form.strategyCode,
    indexName: form.indexName,
    symbolName: form.symbolName,
    tradeType: form.tradeType,
    entryPrice: entry,
    slMode: form.slMode,
    slValue: slRaw,
    targetMode: form.tpMode,
    targetValue: targetValue ?? '',
    isRealTime: form.isRealTime,
    opType,
    marketPrice: form.isRealTime ? 'ltp' : form.marketPrice,
  }
}

function fmtPrice(v: number) {
  if (isNaN(v)) return '—'
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ─── Tiny UI helpers ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
      {children}
    </span>
  )
}

function FieldInput({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input
        {...props}
        className={clsx(
          'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5',
          'text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600',
          'px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow',
          props.className,
        )}
      />
    </div>
  )
}

function FieldSelect({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <select
        {...props}
        className={clsx(
          'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
          'text-slate-900 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow appearance-none',
          props.className,
        )}
      >
        {children}
      </select>
    </div>
  )
}

function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="flex bg-slate-100 dark:bg-white/5 rounded-xl p-1 gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              'flex-1 text-sm font-medium py-1.5 rounded-lg transition-all',
              value === opt.value
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Calc Preview Panel ───────────────────────────────────────────────────────

function CalcPreview({ form }: { form: FormState }) {
  const entry = parseFloat(form.entryPrice)
  const sl = calcSLPrice(form)
  const tp = calcTPPrice(form, sl)
  const risk = !isNaN(entry) && !isNaN(sl) ? Math.abs(entry - sl) : NaN
  const reward = !isNaN(entry) && !isNaN(tp) ? Math.abs(tp - entry) : NaN
  const rr = !isNaN(risk) && !isNaN(reward) && risk > 0 ? reward / risk : NaN

  const row = (label: string, value: string, color?: string) => (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={clsx('text-xs font-bold font-mono tabular-nums', color ?? 'text-slate-900 dark:text-white')}>
        {value}
      </span>
    </div>
  )

  return (
    <div className="bg-slate-50 dark:bg-white/3 rounded-xl border border-slate-200 dark:border-slate-700/50 p-3 space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
        Preview
      </p>
      {row('Entry', fmtPrice(entry))}
      {row(
        'Stop-Loss',
        fmtPrice(sl),
        isNaN(sl) ? undefined : 'text-red-600 dark:text-red-400',
      )}
      {row(
        'Target',
        fmtPrice(tp),
        isNaN(tp) ? undefined : 'text-emerald-600 dark:text-emerald-400',
      )}
      {row('Risk (pts)', isNaN(risk) ? '—' : fmtPrice(risk))}
      {row('Reward (pts)', isNaN(reward) ? '—' : fmtPrice(reward))}
      {row(
        'R:R',
        isNaN(rr) ? '—' : `1 : ${rr.toFixed(2)}`,
        !isNaN(rr) ? (rr >= 1.5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400') : undefined,
      )}
    </div>
  )
}

// ─── JSON Preview ─────────────────────────────────────────────────────────────

function QueryPreview({ form }: { form: FormState }) {
  const [copied, setCopied] = useState(false)

  const entry = parseFloat(form.entryPrice)
  const sl = calcSLPrice(form)
  const tp = calcTPPrice(form, sl)

  const jsonPayload = useMemo(() => {
    if (!form.indexName || isNaN(entry) || isNaN(sl) || isNaN(tp)) return null
    return buildPayload(form)
  }, [form, entry, sl, tp])

  const jsonStr = jsonPayload
    ? JSON.stringify(jsonPayload, null, 2)
    : '// Fill the form to see the payload'

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonStr)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          API Payload Preview
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:opacity-80 transition-opacity"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="flex-1 overflow-auto rounded-xl bg-slate-900 dark:bg-black/60 text-slate-300 text-xs leading-relaxed p-4 font-mono whitespace-pre-wrap break-words">
        {jsonStr}
      </pre>
    </div>
  )
}


function buildFormFromSignal(s: Signal): FormState {
  const td = parseTradeDetails(s.trade_details)
  const ecRaw = td.execCondition

  // Default opType follows trade direction (LONG → '<', SHORT → '>')
  const defaultOp = s.trade_type === 'LONG' ? '<' : '>'

  let isRealTime: boolean
  let opType = defaultOp
  let marketPrice = 'ltp'

  if (Array.isArray(ecRaw)) {
    // Old schema: trade_details.execCondition is an array directly
    const tdAny = td as Record<string, unknown>
    isRealTime = tdAny.isRealTime !== false
    const ecItem = ecRaw[0] as ExecConditionItem | undefined
    if (ecItem) {
      opType = ecItem.opType || defaultOp
      marketPrice = ecItem.marketPrice || 'ltp'
    }
  } else if (ecRaw && typeof ecRaw === 'object') {
    // New schema: { isRealTime: bool, execCondition: [{...}] }
    isRealTime = ecRaw.isRealTime !== undefined ? !!ecRaw.isRealTime : true
    const ecItem = ecRaw.execCondition?.[0]
    if (ecItem) {
      opType = ecItem.opType || defaultOp
      marketPrice = ecItem.marketPrice || 'ltp'
    }
  } else {
    isRealTime = true
  }

  return {
    strategyCode: s.strategy_code,
    indexName: s.index_name,
    symbolName: s.symbol_name, // saved value — must NOT be overridden by auto-fill
    tradeType: s.trade_type,
    entryPrice: String(td.entryPrice ?? ''),
    slMode: 'PRICE',
    slValue: String(td.slPrice ?? ''),
    tpMode: 'PRICE',
    tpPrice: String(td.targetPrice ?? ''),
    rrValue: '',
    isRealTime,
    opType,
    marketPrice,
  }
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  signal,
  onClose,
  onSaved,
}: {
  signal: Signal
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Edit Signal #{signal.id}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-5">
          <EditSignalForm signal={signal} onSaved={onSaved} onClose={onClose} />
        </div>
      </div>
    </div>
  )
}

function EditSignalForm({
  signal,
  onSaved,
  onClose,
}: {
  signal: Signal
  onSaved: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState<FormState>(() => buildFormFromSignal(signal))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  // Track prev index so auto-fill only fires when the user CHANGES the index,
  // not on initial mount (which would override the saved symbol name).
  const prevIndexRef = useRef(form.indexName)
  useEffect(() => {
    if (form.indexName !== prevIndexRef.current && SYM_MAP[form.indexName]) {
      set('symbolName', SYM_MAP[form.indexName])
    }
    prevIndexRef.current = form.indexName
  }, [form.indexName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateForm(form)
    if (err) { setError(err); return }
    setLoading(true)
    setError(null)
    try {
      await updateSignal(signal.id, buildPayload(form))
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  const sl = calcSLPrice(form)
  const tp = calcTPPrice(form, sl)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FieldSelect label="Strategy" value={form.strategyCode} onChange={(e) => set('strategyCode', e.target.value)}>
          {SIGNAL_STRATEGY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
        </FieldSelect>
        <FieldSelect label="Index" value={form.indexName} onChange={(e) => set('indexName', e.target.value)}>
          <option value="">Select Index</option>
          {ALL_INDICES.map((idx) => <option key={idx} value={idx}>{idx}</option>)}
        </FieldSelect>
      </div>
      <FieldInput label="Symbol Name" value={form.symbolName} onChange={(e) => set('symbolName', e.target.value)} />
      <div>
        <Label>Direction</Label>
        <div className="grid grid-cols-2 gap-3">
          {(['LONG', 'SHORT'] as TradeType[]).map((t) => (
            <button key={t} type="button"
              onClick={() => setForm((f) => ({ ...f, tradeType: t, opType: t === 'LONG' ? '<' : '>' }))}
              className={clsx('py-2.5 rounded-xl text-sm font-bold border-2 transition-all',
                form.tradeType === t && t === 'LONG' && 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
                form.tradeType === t && t === 'SHORT' && 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
                form.tradeType !== t && 'border-slate-200 dark:border-slate-700 text-slate-400',
              )}>
              {t === 'LONG' ? '▲ LONG' : '▼ SHORT'}
            </button>
          ))}
        </div>
      </div>
      <FieldInput label="Entry Price" type="number" step="any" value={form.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} />
      <div className="space-y-2">
        <Seg<SLMode> label="SL Mode" options={[{ label: 'By Price', value: 'PRICE' }, { label: 'By Points', value: 'POINTS' }]} value={form.slMode} onChange={(v) => set('slMode', v)} />
        <FieldInput placeholder={form.slMode === 'PRICE' ? 'SL price' : 'Points'} type="number" step="any" value={form.slValue} onChange={(e) => set('slValue', e.target.value)} />
        {!isNaN(sl) && <p className="text-xs text-red-500 dark:text-red-400 font-medium">SL Price → {fmtPrice(sl)}</p>}
      </div>
      <div className="space-y-2">
        <Seg<TPMode> label="Target Mode" options={[{ label: 'By Price', value: 'PRICE' }, { label: 'By R:R', value: 'RR' }]} value={form.tpMode} onChange={(v) => set('tpMode', v)} />
        {form.tpMode === 'PRICE'
          ? <FieldInput placeholder="Target price" type="number" step="any" value={form.tpPrice} onChange={(e) => set('tpPrice', e.target.value)} />
          : <FieldSelect value={form.rrValue} onChange={(e) => set('rrValue', e.target.value as RRValue | '')}>
              <option value="">Select R:R</option>
              {RR_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </FieldSelect>
        }
        {!isNaN(tp) && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Target → {fmtPrice(tp)}</p>}
      </div>
      <Seg<'realtime' | 'conditional'>
        label="Entry Mode"
        options={[{ label: '⚡ Real-Time', value: 'realtime' }, { label: '📋 Conditional', value: 'conditional' }]}
        value={form.isRealTime ? 'realtime' : 'conditional'}
        onChange={(v) => set('isRealTime', v === 'realtime')}
      />
      {!form.isRealTime && (
        <div className="grid grid-cols-2 gap-3">
          <FieldSelect label="Market Price" value={form.marketPrice} onChange={(e) => set('marketPrice', e.target.value)}>
            <option value="ltp">LTP</option>
            <option value="atp">ATP</option>
          </FieldSelect>
          <FieldSelect label="Condition" value={form.opType} onChange={(e) => set('opType', e.target.value)}>
            <option value="<">{'< (below price)'}</option>
            <option value=">">{'> (above price)'}</option>
          </FieldSelect>
        </div>
      )}
      {error && <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2.5">{error}</p>}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
        <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({
  signal,
  onClose,
  onDeleted,
}: {
  signal: Signal
  onClose: () => void
  onDeleted: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setLoading(true)
    try {
      await deleteSignal(signal.id)
      onDeleted()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Delete Signal</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Signal #{signal.id} · {signal.index_name} · {signal.trade_type}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
          This action cannot be undone. The signal will be permanently removed.
        </p>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Signal Row ───────────────────────────────────────────────────────────────

function SignalRow({
  signal,
  onEdit,
  onDelete,
  onToggle,
}: {
  signal: Signal
  onEdit: (s: Signal) => void
  onDelete: (s: Signal) => void
  onToggle: (s: Signal) => void
}) {
  const td = parseTradeDetails(signal.trade_details)
  const isActive = signal.is_active === 1

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
      <td className="px-3 py-3 text-xs font-mono text-slate-400 whitespace-nowrap">#{signal.id}</td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/5 rounded-lg px-2 py-1">
          {signal.strategy_code}
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
        {signal.index_name}
      </td>
      <td className="px-4 py-3 max-w-[160px]">
        <span className="block text-sm text-slate-600 dark:text-slate-400 truncate" title={signal.symbol_name}>
          {signal.symbol_name}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={clsx(
          'inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap',
          signal.trade_type === 'LONG'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
        )}>
          {signal.trade_type === 'LONG' ? '▲' : '▼'} {signal.trade_type}
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-mono text-slate-700 dark:text-slate-300 tabular-nums">
        {fmtPrice(td.entryPrice ?? NaN)}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-red-600 dark:text-red-400 tabular-nums">
        {fmtPrice(td.slPrice ?? NaN)}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
        {fmtPrice(td.targetPrice ?? NaN)}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {fmtDate(signal.created_at)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {/* Active toggle */}
          <button
            type="button"
            onClick={() => onToggle(signal)}
            title={isActive ? 'Deactivate' : 'Activate'}
            className={clsx(
              'relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer focus:outline-none flex-shrink-0',
              isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
            )}
          >
            <span className={clsx(
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
              isActive ? 'translate-x-5' : 'translate-x-0',
            )} />
          </button>
          {/* Edit */}
          <button
            type="button"
            onClick={() => onEdit(signal)}
            title="Edit signal"
            className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          {/* Delete */}
          <button
            type="button"
            onClick={() => onDelete(signal)}
            title="Delete signal"
            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── All Signals Tab ──────────────────────────────────────────────────────────

function AllSignalsTab() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editSignal, setEditSignal] = useState<Signal | null>(null)
  const [deleteSignal_, setDeleteSignal] = useState<Signal | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [filterStrategy, setFilterStrategy] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterDir, setFilterDir] = useState<'all' | 'LONG' | 'SHORT'>('all')
  const [filterIndex, setFilterIndex] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getSignals({ limit: 200, strategyCode: filterStrategy || undefined })
      setSignals(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load signals')
    } finally {
      setLoading(false)
    }
  }, [filterStrategy])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (filterStatus === 'active' && s.is_active !== 1) return false
      if (filterStatus === 'inactive' && s.is_active !== 0) return false
      if (filterDir !== 'all' && s.trade_type !== filterDir) return false
      if (filterIndex && s.index_name !== filterIndex) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !String(s.id).includes(q) &&
          !s.strategy_code.toLowerCase().includes(q) &&
          !s.index_name.toLowerCase().includes(q) &&
          !s.symbol_name.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [signals, filterStatus, filterDir, filterIndex, search])

  const stats = useMemo(() => ({
    total: signals.length,
    active: signals.filter((s) => s.is_active === 1).length,
    inactive: signals.filter((s) => s.is_active === 0).length,
    long: signals.filter((s) => s.trade_type === 'LONG').length,
  }), [signals])

  const handleToggle = async (signal: Signal) => {
    const newActive = signal.is_active !== 1
    // optimistic update
    setSignals((prev) =>
      prev.map((s) => s.id === signal.id ? { ...s, is_active: newActive ? 1 : 0 } : s),
    )
    try {
      await toggleSignal(signal.id, newActive)
    } catch {
      // revert on failure
      setSignals((prev) =>
        prev.map((s) => s.id === signal.id ? { ...s, is_active: signal.is_active } : s),
      )
    }
  }

  const statCard = (label: string, value: number, color: string) => (
    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
      <p className={clsx('text-2xl font-bold mt-1', color)}>{value}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCard('Total', stats.total, 'text-slate-900 dark:text-white')}
        {statCard('Active', stats.active, 'text-emerald-600 dark:text-emerald-400')}
        {statCard('Inactive', stats.inactive, 'text-slate-400')}
        {statCard('Long', stats.long, 'text-brand-600 dark:text-brand-400')}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="col-span-2 md:col-span-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <select
            value={filterStrategy}
            onChange={(e) => setFilterStrategy(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none appearance-none"
          >
            <option value="">All Strategies</option>
            {SIGNAL_STRATEGY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterIndex}
            onChange={(e) => setFilterIndex(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none appearance-none"
          >
            <option value="">All Indices</option>
            {ALL_INDICES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select
            value={filterDir}
            onChange={(e) => setFilterDir(e.target.value as 'all' | 'LONG' | 'SHORT')}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none appearance-none"
          >
            <option value="all">All Directions</option>
            <option value="LONG">Long</option>
            <option value="SHORT">Short</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none appearance-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing {filtered.length} of {signals.length} signals (today)
          </p>
          <button
            onClick={load}
            disabled={loading}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">{error}</div>
        ) : loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading signals…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-slate-400">No signals found</p>
            <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[820px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['ID', 'Strategy', 'Index', 'Symbol', 'Dir', 'Entry', 'SL', 'Target', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <SignalRow
                    key={s.id}
                    signal={s}
                    onEdit={setEditSignal}
                    onDelete={setDeleteSignal}
                    onToggle={handleToggle}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {editSignal && (
        <EditModal
          key={editSignal.id}
          signal={editSignal}
          onClose={() => setEditSignal(null)}
          onSaved={() => { setEditSignal(null); load() }}
        />
      )}
      {deleteSignal_ && (
        <DeleteModal
          signal={deleteSignal_}
          onClose={() => setDeleteSignal(null)}
          onDeleted={() => { setDeleteSignal(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Create Tab ───────────────────────────────────────────────────────────────

function CreateTab({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [success, setSuccess] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
    setSuccess(null)
  }

  useEffect(() => {
    if (form.indexName && SYM_MAP[form.indexName]) {
      set('symbolName', SYM_MAP[form.indexName])
    }
  }, [form.indexName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateForm(form)
    if (err) { setError(err); return }
    setLoading(true)
    setError(null)
    try {
      const res = await createSignal(buildPayload(form))
      setSuccess(res.id)
      setForm(DEFAULT_FORM)
      onCreated()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create signal')
    } finally {
      setLoading(false)
    }
  }

  const sl = calcSLPrice(form)
  const tp = calcTPPrice(form, sl)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Form */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-5">
          New Signal
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FieldSelect label="Strategy" value={form.strategyCode} onChange={(e) => set('strategyCode', e.target.value)}>
              {SIGNAL_STRATEGY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </FieldSelect>
            <FieldSelect label="Index" value={form.indexName} onChange={(e) => set('indexName', e.target.value)}>
              <option value="">Select Index</option>
              {ALL_INDICES.map((idx) => <option key={idx} value={idx}>{idx}</option>)}
            </FieldSelect>
          </div>

          <FieldInput label="Symbol Name" placeholder="e.g. Nifty 50" value={form.symbolName} onChange={(e) => set('symbolName', e.target.value)} />

          <div>
            <Label>Direction</Label>
            <div className="grid grid-cols-2 gap-3">
              {(['LONG', 'SHORT'] as TradeType[]).map((t) => (
                <button key={t} type="button"
                  onClick={() => setForm((f) => ({ ...f, tradeType: t, opType: t === 'LONG' ? '<' : '>' }))}
                  className={clsx('py-2.5 rounded-xl text-sm font-bold border-2 transition-all',
                    form.tradeType === t && t === 'LONG' && 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
                    form.tradeType === t && t === 'SHORT' && 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
                    form.tradeType !== t && 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300',
                  )}>
                  {t === 'LONG' ? '▲ LONG' : '▼ SHORT'}
                </button>
              ))}
            </div>
          </div>

          <FieldInput label="Entry Price" type="number" placeholder="0.00" min={0} step="any" value={form.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} />

          <div className="space-y-2">
            <Seg<SLMode> label="Stop Loss Mode"
              options={[{ label: 'By Price', value: 'PRICE' }, { label: 'By Points', value: 'POINTS' }]}
              value={form.slMode} onChange={(v) => set('slMode', v)} />
            <FieldInput placeholder={form.slMode === 'PRICE' ? 'SL price' : 'Points away from entry'}
              type="number" min={0} step="any" value={form.slValue} onChange={(e) => set('slValue', e.target.value)} />
            {!isNaN(sl) && <p className="text-xs text-red-500 dark:text-red-400 font-medium">SL Price → {fmtPrice(sl)}</p>}
          </div>

          <div className="space-y-2">
            <Seg<TPMode> label="Target Mode"
              options={[{ label: 'By Price', value: 'PRICE' }, { label: 'By R:R', value: 'RR' }]}
              value={form.tpMode} onChange={(v) => set('tpMode', v)} />
            {form.tpMode === 'PRICE'
              ? <FieldInput placeholder="Target price" type="number" min={0} step="any" value={form.tpPrice} onChange={(e) => set('tpPrice', e.target.value)} />
              : <FieldSelect value={form.rrValue} onChange={(e) => set('rrValue', e.target.value as RRValue | '')}>
                  <option value="">Select R:R</option>
                  {RR_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </FieldSelect>
            }
            {!isNaN(tp) && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Target Price → {fmtPrice(tp)}</p>}
          </div>

          <div className="space-y-2">
            <Seg<'realtime' | 'conditional'> label="Entry Mode"
              options={[{ label: 'Real-Time', value: 'realtime' }, { label: 'Conditional', value: 'conditional' }]}
              value={form.isRealTime ? 'realtime' : 'conditional'}
              onChange={(v) => set('isRealTime', v === 'realtime')} />
            {!form.isRealTime && (
              <div className="grid grid-cols-2 gap-3">
                <FieldSelect label="Market Price" value={form.marketPrice} onChange={(e) => set('marketPrice', e.target.value)}>
                  <option value="ltp">LTP</option>
                  <option value="bid">Bid</option>
                  <option value="ask">Ask</option>
                </FieldSelect>
                <FieldSelect label="Condition" value={form.opType} onChange={(e) => set('opType', e.target.value)}>
                  <option value="<">Price &lt; Entry</option>
                  <option value=">">Price &gt; Entry</option>
                  <option value="<=">Price ≤ Entry</option>
                  <option value=">=">Price ≥ Entry</option>
                </FieldSelect>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2.5">
              {error}
            </p>
          )}
          {success != null && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2.5">
              ✓ Signal #{success} created successfully
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating…' : 'Create Signal'}
          </button>
        </form>
      </div>

      {/* Right: Calc preview + JSON payload */}
      <div className="space-y-4">
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <CalcPreview form={form} />
        </div>
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-2xl p-5 min-h-[260px] flex flex-col">
          <QueryPreview form={form} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'create' | 'list'

export default function SignalGeneratorPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('create')
  const [listKey, setListKey] = useState(0)

  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Access Denied</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Signal Generator is available to administrators only.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Signal Generator
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Create and manage manual trading signals
          </p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 px-3 py-1.5 rounded-full border border-brand-200 dark:border-brand-800">
          Admin
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-white/5 rounded-2xl p-1 w-fit">
        {([
          { id: 'create', label: 'New Signal' },
          { id: 'list', label: 'All Signals' },
        ] as { id: Tab; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'px-5 py-2 rounded-xl text-sm font-medium transition-all',
              tab === id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'create' ? (
        <CreateTab onCreated={() => setListKey((k) => k + 1)} />
      ) : (
        <AllSignalsTab key={listKey} />
      )}
    </div>
  )
}
