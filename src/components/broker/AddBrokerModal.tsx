import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useForm, useWatch } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { LotInput } from '@/components/ui/LotInput'
import { getIndexMaster } from '@/services/indexMasterCache'
import { parseLot } from '@/types/indexMaster'
import { validateBroker } from '@/api/broker'
import type { BrokerMaster, UserBroker, AddBrokerPayload, BrokerQuantity, BrokerInfo, LoginSource } from '@/types/broker'

const FIXED_IMEI = 'abcde'

function vendorCode(broker: string, userId: string) {
  return broker.toUpperCase() === 'FINVASIA' ? `${userId}_U` : ''
}
function isCryptoBroker(brokerName: string) {
  return (brokerName ?? '').toUpperCase().includes('DELTA')
}
const CRYPTO_SYMBOLS = ['BTC', 'ETH']
// Symbols that should never get a default-quantity input.
const HIDDEN_SYMBOLS = ['INDIAVIX', 'INDIA VIX', 'VIX']

type IndexRow = { symbol: string; lot: number; exchange: string }
type QuantityMap = Record<string, number>

interface FormValues {
  brokerName: string
  isActive: boolean
  userId: string
  password: string
  apiKey: string
  secretKey: string
  twoFAKey: string
  ipAddress: string
  appkey: string
}

interface AddBrokerModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (payload: AddBrokerPayload) => Promise<void>
  brokerMasterList: BrokerMaster[]
  editBroker?: UserBroker | null
  isFirstBroker: boolean
}

type Step = 'method' | 'config'
type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }

export function AddBrokerModal({
  open, onClose, onSubmit, brokerMasterList, editBroker, isFirstBroker,
}: AddBrokerModalProps) {
  const isEdit = !!editBroker

  const [step, setStep] = useState<Step>('method')
  const [loginSource, setLoginSource] = useState<LoginSource>('API')
  const [confirmMethod, setConfirmMethod] = useState<LoginSource | null>(null)
  const [test, setTest] = useState<TestState>({ status: 'idle' })

  const [allIndices, setAllIndices] = useState<IndexRow[]>([])
  const [indicesLoading, setIndicesLoading] = useState(true)
  const [quantities, setQuantities] = useState<QuantityMap>({})

  const { register, handleSubmit, reset, control, getValues, formState: { errors, isSubmitting } } = useForm<FormValues>()

  const selectedBroker = useWatch({ control, name: 'brokerName' })
  const userId         = useWatch({ control, name: 'userId' })
  const vcHint         = vendorCode(selectedBroker ?? '', userId ?? '')
  const isCrypto       = isCryptoBroker(selectedBroker ?? '')
  // Editing any credential invalidates a previous test result.
  const credWatch = useWatch({ control, name: ['brokerName', 'userId', 'password', 'apiKey', 'secretKey', 'twoFAKey', 'ipAddress', 'appkey'] })
  const credKey = JSON.stringify(credWatch)
  useEffect(() => { setTest((t) => (t.status === 'idle' ? t : { status: 'idle' })) }, [credKey, loginSource])

  const visibleIndices: IndexRow[] = (isCrypto
    ? allIndices.filter((i) => CRYPTO_SYMBOLS.includes(i.symbol))
    : allIndices.filter((i) => !CRYPTO_SYMBOLS.includes(i.symbol))
  ).filter((i) => !HIDDEN_SYMBOLS.includes(i.symbol))

  useEffect(() => {
    getIndexMaster().then((list) => {
      const rows: IndexRow[] = list
        .map((m) => ({ symbol: ((m.symbolCode ?? m.symbol_code) ?? '').toUpperCase(), lot: parseLot(m.lot), exchange: (m.exchange ?? '').toUpperCase() }))
        .filter((r) => r.symbol && r.lot > 0)
      setAllIndices(rows)
    }).finally(() => setIndicesLoading(false))
  }, [])

  // Reset everything each open
  useEffect(() => {
    if (!open) return
    setTest({ status: 'idle' })
    setConfirmMethod(null)
    const existingQty = editBroker?.preferences?.quantity ?? {}
    const qty: QuantityMap = {}
    allIndices.forEach(({ symbol, lot }) => {
      const saved = existingQty[symbol] ?? existingQty[symbol.toLowerCase()]
      qty[symbol] = saved ? Math.max(lot, Math.round(saved / lot) * lot) : lot
    })
    setQuantities(qty)

    if (isEdit && editBroker) {
      const info = editBroker.brokerInfo ?? ({} as BrokerInfo)
      setLoginSource(info.loginSource ?? 'API')
      setStep('config')
      reset({
        brokerName: editBroker.brokerName, isActive: editBroker.isActive,
        userId: info.userId ?? '', password: info.password ?? '', apiKey: info.apiKey ?? '',
        secretKey: info.secretKey ?? '', twoFAKey: info.twoFAKey ?? '', ipAddress: info.IPAddress ?? '', appkey: info.appkey ?? '',
      })
    } else {
      setLoginSource('API')
      setStep('method')
      reset({ brokerName: brokerMasterList[0]?.name ?? '', isActive: true, userId: '', password: '', apiKey: '', secretKey: '', twoFAKey: '', ipAddress: '', appkey: '' })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || allIndices.length === 0) return
    setQuantities((prev) => {
      const next = { ...prev }
      const existingQty = editBroker?.preferences?.quantity ?? {}
      allIndices.forEach(({ symbol, lot }) => {
        if (next[symbol] == null) {
          const saved = existingQty[symbol] ?? existingQty[symbol.toLowerCase()]
          next[symbol] = saved ? Math.max(lot, Math.round(saved / lot) * lot) : lot
        }
      })
      return next
    })
  }, [allIndices, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const setQty = (symbol: string, value: number) => setQuantities((prev) => ({ ...prev, [symbol]: value }))
  const handleClose = () => { if (!isSubmitting) onClose() }

  // Broker master id: on add from the selected master row; on edit from the record.
  const brokerIdFor = (values: FormValues): number =>
    (isEdit ? (editBroker?.brokerId ?? brokerMasterList.find((m) => m.name === editBroker?.brokerName)?.id)
      : brokerMasterList.find((m) => m.name === values.brokerName)?.id) ?? 0

  function buildInfo(values: FormValues): BrokerInfo {
    const prev = editBroker?.brokerInfo
    const appkey = (values.appkey || prev?.appkey || '').trim()
    const vc = vendorCode(values.brokerName, values.userId)
    // Spread the existing brokerInfo first so backend-owned fields (ipType, and any
    // others we don't render) are preserved on update; then override the edited ones.
    return {
      ...(prev ?? {}),
      loginSource,
      userId: values.userId,
      password: values.password,
      vendorCode: vc || prev?.vendorCode || '',
      apiKey: values.apiKey,
      secretKey: values.secretKey ?? '',
      twoFAKey: values.twoFAKey,
      imei: prev?.imei ?? FIXED_IMEI,
      IPAddress: values.ipAddress || prev?.IPAddress || '',
      ...(appkey ? { appkey } : {}),
    }
  }

  // Optional config check — never blocks saving.
  const runTest = async () => {
    const values = getValues()
    if (!values.userId || !values.password || !values.twoFAKey) {
      setTest({ status: 'fail', message: 'Fill User ID, Password and 2FA key before testing.' }); return
    }
    setTest({ status: 'testing' })
    try {
      const res = await validateBroker({ brokerId: brokerIdFor(values), brokerInfo: buildInfo(values) })
      const ok = res.success !== false
      setTest(ok ? { status: 'ok', message: res.message ?? 'Configuration looks valid.' } : { status: 'fail', message: res.message ?? 'Verification failed.' })
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Verification failed. Check your credentials.'
      setTest({ status: 'fail', message: msg })
    }
  }

  const onFormSubmit = async (values: FormValues) => {
    const quantity: BrokerQuantity = {}
    visibleIndices.forEach(({ symbol }) => { quantity[symbol] = quantities[symbol] ?? 0 })
    const preferences = {
      ...(editBroker?.preferences ?? {}),
      default: isFirstBroker || Boolean(editBroker?.preferences?.default),
      quantity,
    }
    // Backend identifies the broker by its master brokerId (WHERE id = brokerId).
    const brokerId = brokerIdFor(values)
    const payload: AddBrokerPayload = {
      brokerId,
      brokerName: values.brokerName,
      isActive: values.isActive,
      brokerInfo: buildInfo(values),
      preferences,
    }
    await onSubmit(payload)
  }

  // ── Step 1: choose login method ─────────────────────────────────────────────
  const methodStep = (
    <div className="space-y-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">Choose how VTrader should connect to this broker. This affects login behaviour and billing.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MethodCard
          active={confirmMethod === 'WEB'}
          onClick={() => setConfirmMethod('WEB')}
          badge="No API cost"
          badgeTone="emerald"
          title="WEB login"
          desc="VTrader logs in through the broker's web session. No API subscription needed."
          icon={<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 9h20" /></>}
        />
        <MethodCard
          active={confirmMethod === 'API'}
          onClick={() => setConfirmMethod('API')}
          badge="Paid add-on"
          badgeTone="amber"
          title="API login"
          desc="Direct API access via your broker's developer keys. Fastest & most reliable."
          icon={<><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" /><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" /></>}
        />
      </div>
    </div>
  )

  // ── Step 2: configuration form ──────────────────────────────────────────────
  const configStep = (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* method chip */}
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 px-3 py-2">
        <span className={clsx('inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full', loginSource === 'API' ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400')}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', loginSource === 'API' ? 'bg-amber-500' : 'bg-emerald-500')} />
          {loginSource} login
        </span>
        <span className="text-[12px] text-slate-500 dark:text-slate-400">{loginSource === 'API' ? 'Direct API access' : 'Web session login'}</span>
        {!isEdit && <button type="button" onClick={() => { setStep('method'); setConfirmMethod(null) }} className="ml-auto text-[12px] font-semibold text-brand-600 dark:text-brand-400 hover:underline">Change</button>}
      </div>

      {/* Broker + Active */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Broker</label>
          {isEdit ? (
            <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 opacity-90 truncate" title={editBroker?.brokerName}>
              {editBroker?.brokerName}
            </div>
          ) : brokerMasterList.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm text-slate-400">Loading brokers…</div>
          ) : (
            <select className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5 text-slate-900 dark:text-slate-100 text-sm px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:[color-scheme:dark]" {...register('brokerName')}>
              {brokerMasterList.map((b) => <option key={b.id} value={b.name} className="dark:bg-slate-800">{b.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-end pb-2.5">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" className="sr-only peer" {...register('isActive')} />
              <div className="w-10 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer-checked:bg-brand-600 transition-colors" />
              <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Active</span>
          </label>
        </div>
      </div>

      {/* Credentials */}
      <div>
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Broker Credentials</p>
        <div className="grid grid-cols-2 gap-4">
          <Input label="User ID" placeholder="Broker user ID" error={errors.userId?.message} {...register('userId')} />
          <Input label="Password" type="password" placeholder="Broker password" error={errors.password?.message} {...register('password')} />
          <Input label="API Key" placeholder="API key" error={errors.apiKey?.message} {...register('apiKey')} />
          <Input label="Secret Key" placeholder="Secret key" error={errors.secretKey?.message} {...register('secretKey')} />
          <div className="col-span-2">
            <Input label="2FA / TOTP Key" placeholder="TOTP secret key" error={errors.twoFAKey?.message} {...register('twoFAKey')} />
          </div>
          <div className="col-span-2">
            <Input label="App Key" placeholder="Broker app key" error={errors.appkey?.message} {...register('appkey')} />
          </div>
          {isEdit && editBroker?.brokerInfo?.IPAddress && (
            <div className={editBroker?.brokerInfo?.ipType ? '' : 'col-span-2'}><Input label="IP Address" disabled readOnly {...register('ipAddress')} /></div>
          )}
          {isEdit && editBroker?.brokerInfo?.ipType && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">IP Type</label>
              <div className="w-full h-9 px-2.5 flex items-center rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 opacity-90 truncate">{editBroker.brokerInfo.ipType}</div>
            </div>
          )}
        </div>
        {vcHint && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Vendor code (auto) <span className="font-mono bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">{vcHint}</span></p>
        )}
      </div>

      {/* Default Quantities */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Default Quantities</p>
          {isCrypto && <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">Crypto only (BTC / ETH)</span>}
        </div>
        {indicesLoading ? (
          <div className="flex gap-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 w-28 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}</div>
        ) : visibleIndices.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No indices available</p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {visibleIndices.map(({ symbol, lot }) => (
                <div key={symbol} style={{ width: 110 }}>
                  <LotInput label={symbol} lotSize={lot} value={quantities[symbol] ?? lot} onChange={(v) => setQty(symbol, v)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Optional verification — does NOT block saving */}
      <div className={clsx('rounded-xl border p-3 flex items-start gap-3 text-sm',
        test.status === 'ok' ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : test.status === 'fail' ? 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
            : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400')}>
        <span className="mt-0.5 shrink-0">
          {test.status === 'testing' ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6-8.49" /></svg>
            : test.status === 'ok' ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
              : test.status === 'fail' ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                : <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{test.status === 'ok' ? 'Configuration verified' : test.status === 'fail' ? 'Verification failed' : test.status === 'testing' ? 'Verifying…' : 'Test configuration (optional)'}</p>
          <p className="text-[12px] opacity-90">{test.message ?? 'Optionally confirm your credentials before saving — the server also validates on submit.'}</p>
        </div>
        <Button type="button" variant="outline" onClick={runTest} loading={test.status === 'testing'} className="ml-auto shrink-0 !h-8 !px-3 text-[12px]">
          {test.status === 'ok' ? 'Re-test' : 'Test config'}
        </Button>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" loading={isSubmitting}>
          {isEdit ? 'Save changes' : 'Submit request'}
        </Button>
      </div>
    </form>
  )

  return (
    <>
      <Modal open={open} onClose={handleClose} title={isEdit ? `Edit — ${editBroker?.brokerName}` : step === 'method' ? 'Connect Broker · Login method' : 'Connect Broker · Configuration'} size="lg">
        {step === 'method' && !isEdit ? methodStep : configStep}
      </Modal>

      {/* Confirmation overlays */}
      <MethodConfirm
        method={confirmMethod}
        onCancel={() => setConfirmMethod(null)}
        onConfirm={() => { if (confirmMethod) { setLoginSource(confirmMethod); setStep('config'); setConfirmMethod(null) } }}
      />
    </>
  )
}

// ── Method selection card ──────────────────────────────────────────────────────
function MethodCard({ active, onClick, title, desc, badge, badgeTone, icon }: {
  active: boolean; onClick: () => void; title: string; desc: string; badge: string; badgeTone: 'emerald' | 'amber'; icon: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick}
      className={clsx('text-left rounded-2xl border p-4 transition-all hover:shadow-md',
        active ? 'border-brand-400 ring-2 ring-brand-500/20 bg-brand-50/40 dark:bg-brand-500/[0.06]' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20')}>
      <div className="flex items-center justify-between mb-3">
        <span className="h-10 w-10 rounded-xl grid place-items-center bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">{icon}</svg>
        </span>
        <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', badgeTone === 'emerald' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400')}>{badge}</span>
      </div>
      <h4 className="text-[15px] font-bold text-slate-800 dark:text-white">{title}</h4>
      <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{desc}</p>
    </button>
  )
}

// ── WEB warning / API pricing confirmation ─────────────────────────────────────
function MethodConfirm({ method, onCancel, onConfirm }: { method: LoginSource | null; onCancel: () => void; onConfirm: () => void }) {
  if (!method) return null
  const web = method === 'WEB'
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0e1526] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden animate-fade-in">
        <div className={clsx('px-5 py-4 flex items-center gap-3', web ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-brand-50 dark:bg-brand-500/10')}>
          <span className={clsx('h-10 w-10 rounded-xl grid place-items-center', web ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400')}>
            {web ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
              : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>}
          </span>
          <div>
            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">{web ? 'WEB login — please read' : 'API login — pricing'}</h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">{web ? 'Web session access' : 'Paid API add-on'}</p>
          </div>
        </div>
        <div className="px-5 py-4 text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed space-y-2.5">
          {web ? (
            <>
              <p>This broker will be accessed through the <b>WEB login</b> method.</p>
              <ul className="space-y-1.5">
                <li className="flex gap-2"><Dot /> While this configuration is active, you <b>cannot use the broker's web portal independently</b>.</li>
                <li className="flex gap-2"><Dot /> If you log in to or use the broker's web portal anyway, <b>you are responsible for any resulting consequences</b> (e.g. session conflicts or dropped orders).</li>
              </ul>
            </>
          ) : (
            <>
              <p>API login uses your broker's developer keys for direct, low-latency access.</p>
              <div className="rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/[0.06]">
                <Row k="API subscription" v="Billed by your broker" />
                <Row k="VTrader API add-on" v="As per current plan" />
                <Row k="Billing cycle" v="Monthly, auto-renew" />
              </div>
              <p className="text-[12px] text-slate-400 dark:text-slate-500">By continuing you acknowledge the applicable API charges. Exact pricing is shown on your invoice.</p>
            </>
          )}
        </div>
        <div className="px-5 py-4 flex gap-2 border-t border-slate-100 dark:border-white/[0.06]">
          <button onClick={onCancel} className="flex-1 h-9 rounded-lg border border-slate-200 dark:border-white/10 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5">Cancel</button>
          <button onClick={onConfirm} className={clsx('flex-1 h-9 rounded-lg text-[13px] font-bold text-white shadow-sm', web ? 'bg-amber-500 hover:bg-amber-600' : 'bg-brand-600 hover:bg-brand-700')}>
            {web ? 'I understand, continue' : 'Confirm & continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

const Dot = () => <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between px-3 py-2 text-[12.5px]"><span className="text-slate-500 dark:text-slate-400">{k}</span><span className="font-semibold text-slate-700 dark:text-slate-200">{v}</span></div>
}
