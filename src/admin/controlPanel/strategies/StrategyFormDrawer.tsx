import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { StrategyMaster, StrategyUpsertPayload } from '@/types/strategyConfig'
import { STRATEGY_STATUSES, statusMeta } from '@/types/strategyConfig'
import { createStrategy, updateStrategy } from '@/api/strategyConfig'
import { JsonEditor, validateJson, type JsonValidity } from '../ui/JsonEditor'
import { Drawer } from '../ui/Drawer'

type Tab = 'details' | 'config'

interface Props {
  mode: 'create' | 'edit'
  strategy?: StrategyMaster
  onClose: () => void
  onSaved: (s: StrategyMaster) => void
}

const CODE_RE = /^[A-Z0-9_]+$/

export function StrategyFormDrawer({ mode, strategy, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>('details')
  const [name, setName] = useState(strategy?.strategyName ?? '')
  const [code, setCode] = useState(strategy?.strategyCode ?? '')
  const [status, setStatus] = useState(String(strategy?.status ?? 'DRAFT'))
  const [description, setDescription] = useState(strategy?.description ?? '')
  const [json, setJson] = useState(() => JSON.stringify(strategy?.configData ?? {}, null, 2))
  const [jsonValidity, setJsonValidity] = useState<JsonValidity>(() => validateJson(JSON.stringify(strategy?.configData ?? {})))
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Strategy name is required.'
    if (!code.trim()) e.code = 'Strategy code is required.'
    else if (!CODE_RE.test(code.trim())) e.code = 'Use uppercase letters, numbers and underscores only.'
    if (!jsonValidity.valid) e.json = jsonValidity.error ?? 'Configuration JSON is invalid.'
    return e
  }, [name, code, jsonValidity])

  const canSave = Object.keys(errors).length === 0 && !saving

  const save = async () => {
    setTouched(true)
    if (!canSave) { if (errors.json) setTab('config'); else setTab('details'); return }
    setSaving(true)
    const payload: StrategyUpsertPayload = {
      strategyName: name.trim(),
      strategyCode: code.trim(),
      status,
      description: description.trim() || null,
      configData: JSON.parse(json),
    }
    try {
      const saved = mode === 'create'
        ? await createStrategy(payload)
        : await updateStrategy(strategy!.id, payload)
      toast.success(mode === 'create' ? 'Strategy created' : 'Strategy updated')
      onSaved({ ...(strategy ?? {} as StrategyMaster), ...saved, ...payload, id: saved?.id ?? strategy?.id ?? 0 })
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || `Could not ${mode === 'create' ? 'create' : 'update'} strategy`)
      setSaving(false)
    }
  }

  return (
    <Drawer
      onClose={saving ? () => {} : onClose}
      width="max-w-3xl"
      title={mode === 'create' ? 'New strategy' : 'Edit strategy'}
      subtitle={mode === 'edit' ? strategy?.strategyCode : 'Define a new master strategy'}
      footer={
        <div className="flex items-center gap-3">
          <span className={clsx('text-[11px] font-medium flex items-center gap-1.5', jsonValidity.valid ? 'text-slate-400 dark:text-slate-500' : 'text-red-500')}>
            {!jsonValidity.valid && <><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>Fix configuration JSON to save</>}
          </span>
          <button onClick={onClose} disabled={saving} className="ml-auto h-9 px-4 rounded-lg border border-slate-200 dark:border-white/10 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50">Cancel</button>
          <button onClick={save} disabled={!canSave} className="h-9 px-5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-bold shadow-sm shadow-brand-600/25 disabled:opacity-50 flex items-center gap-2">
            {saving && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6-8.49" /></svg>}
            {saving ? 'Saving…' : mode === 'create' ? 'Create strategy' : 'Save changes'}
          </button>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-100 dark:border-white/[0.06] shrink-0">
        {([['details', 'Details'], ['config', 'Configuration']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx('relative h-9 px-3 text-[13px] font-semibold transition-colors',
            tab === k ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600')}>
            {l}{k === 'config' && !jsonValidity.valid && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" />}
            {tab === k && <span className="absolute bottom-0 inset-x-2 h-0.5 rounded-t bg-brand-500" />}
          </button>
        ))}
      </div>

      {tab === 'details' ? (
        <div className="p-5 space-y-5 overflow-y-auto flex-1 min-h-0">
          <Field label="Strategy name" required error={touched ? errors.name : undefined}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Intra Plus Expiry Strategy" className={inputCls(touched && !!errors.name)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Strategy code" required error={touched ? errors.code : undefined} hint="Unique identifier · matches trade group name">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="INTPLUSEXP" className={clsx(inputCls(touched && !!errors.code), 'font-mono uppercase')} />
            </Field>
            <Field label="Status" hint={statusMeta(status).description}>
              <div className="relative">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={clsx(inputCls(false), 'appearance-none pr-9')}>
                  {(STRATEGY_STATUSES.includes(status as never) ? STRATEGY_STATUSES : [status, ...STRATEGY_STATUSES]).map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
                </select>
                <svg viewBox="0 0 24 24" className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
              </div>
            </Field>
          </div>
          <Field label="Description" hint="Optional — shown to admins in the detail view">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What does this strategy do?" className={clsx(inputCls(false), 'resize-none leading-relaxed')} />
          </Field>
        </div>
      ) : (
        <div className="p-5 flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex items-start gap-2 mb-3">
            <svg viewBox="0 0 24 24" className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16v-4M12 8h.01M22 12A10 10 0 112 12a10 10 0 0120 0z" /></svg>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">Free-form configuration. Structure varies per strategy — edit the raw JSON directly. Saving is blocked while the JSON is invalid.</p>
          </div>
          <JsonEditor value={json} onChange={setJson} onValidityChange={setJsonValidity} minHeight={380} />
        </div>
      )}
    </Drawer>
  )
}

function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error ? <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1"><svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 8v4M12 16h.01M22 12A10 10 0 112 12a10 10 0 0120 0z" /></svg>{error}</p>
        : hint ? <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">{hint}</p> : null}
    </div>
  )
}

function inputCls(err: boolean) {
  return clsx(
    'w-full h-10 px-3 rounded-lg border bg-white dark:bg-white/[0.03] text-[13px] text-slate-800 dark:text-white outline-none transition-colors',
    err ? 'border-red-300 dark:border-red-500/40 focus:border-red-400' : 'border-slate-200 dark:border-white/10 focus:border-brand-400 dark:focus:border-brand-500',
  )
}
