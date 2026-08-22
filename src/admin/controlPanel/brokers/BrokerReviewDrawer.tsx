import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { UserBroker, BrokerInfo } from '@/types/broker'
import { validateBroker, approveBroker, updateBroker, deleteBroker } from '@/api/broker'
import { Drawer } from '../ui/Drawer'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { brokerStatusMeta, isApproved, masterBrokerId, brokerDisplay } from './brokerStatus'

const IP_TYPES = ['ipV4', 'ipV6']

type Test = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }

function mask(v?: string) {
  if (!v) return '—'
  if (v.length <= 8) return v
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

export function BrokerReviewDrawer({ broker, onClose, onDone }: {
  broker: UserBroker; onClose: () => void; onDone: () => void
}) {
  const [ipType, setIpType] = useState(broker.brokerInfo.ipType ?? 'ipV4')
  const [ipAddress, setIpAddress] = useState(broker.brokerInfo.IPAddress ?? '')
  const [test, setTest] = useState<Test>({ status: 'idle' })
  const [busy, setBusy] = useState<'approve' | 'reject' | 'toggle' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const approved = isApproved(broker)
  const brokerId = masterBrokerId(broker)
  const info = broker.brokerInfo

  const payloadInfo = useMemo<BrokerInfo>(() => ({ ...info, ipType, IPAddress: ipAddress }), [info, ipType, ipAddress])

  const runValidate = async () => {
    setTest({ status: 'testing' })
    try {
      const res = await validateBroker({ brokerId, brokerInfo: payloadInfo })
      const ok = res.success !== false
      setTest(ok ? { status: 'ok', message: res.message ?? 'Config valid — IP & credentials reachable.' } : { status: 'fail', message: res.message ?? 'Validation failed.' })
    } catch (err) {
      setTest({ status: 'fail', message: errMsg(err, 'Validation failed. Check IP type / address & credentials.') })
    }
  }

  const decide = async (status: 'APPROVED' | 'REJECTED') => {
    if (status === 'APPROVED' && !ipAddress.trim()) { toast.error('Set an IP address before approving'); return }
    setBusy(status === 'APPROVED' ? 'approve' : 'reject')
    try {
      await approveBroker(broker.id, { brokerInfo: payloadInfo, brokerId, status })
      toast.success(status === 'APPROVED' ? 'Broker approved' : 'Broker rejected')
      onDone()
    } catch (err) { toast.error(errMsg(err, `Could not ${status === 'APPROVED' ? 'approve' : 'reject'} broker`)); setBusy(null) }
  }

  const toggleActive = async () => {
    setBusy('toggle')
    try {
      await updateBroker(broker.id, {
        brokerId, brokerInfo: payloadInfo, isActive: !broker.isActive,
        preferences: broker.preferences ?? { default: false, quantity: {} },
      })
      toast.success(broker.isActive ? 'Broker deactivated' : 'Broker activated')
      onDone()
    } catch (err) { toast.error(errMsg(err, 'Could not update broker')); setBusy(null) }
  }

  const remove = async () => {
    setDeleting(true)
    try { await deleteBroker(broker.id); toast.success('Broker removed'); onDone() }
    catch (err) { toast.error(errMsg(err, 'Delete not permitted')); setDeleting(false); setConfirmDelete(false) }
  }

  const sm = brokerStatusMeta(broker.status)

  return (
    <Drawer
      title={brokerDisplay(broker)}
      subtitle={`${broker.brokerName} · user #${broker.userId}`}
      width="max-w-2xl"
      onClose={onClose}
      headerActions={<span className={clsx('inline-flex items-center gap-1.5 rounded-full border text-[11px] font-semibold px-2.5 py-1', sm.badge)}><span className={clsx('h-2 w-2 rounded-full', sm.dot)} />{sm.label}</span>}
      footer={
        <div className="flex items-center gap-2 w-full">
          {approved ? (
            <button onClick={toggleActive} disabled={busy === 'toggle'} className={clsx('h-9 px-3.5 rounded-lg text-[13px] font-semibold border flex items-center gap-2 disabled:opacity-50',
              broker.isActive ? 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                : 'border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10')}>
              {broker.isActive ? 'Deactivate' : 'Activate'}
            </button>
          ) : (
            <button onClick={() => decide('REJECTED')} disabled={!!busy} className="h-9 px-3.5 rounded-lg text-[13px] font-semibold border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50">Reject</button>
          )}
          <button onClick={() => setConfirmDelete(true)} className="h-9 w-9 grid place-items-center rounded-lg border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" title="Remove broker">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
          </button>
          {!approved && (
            <button onClick={() => decide('APPROVED')} disabled={!!busy} className="ml-auto h-9 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold shadow-sm flex items-center gap-2 disabled:opacity-60">
              {busy === 'approve' && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6-8.49" /></svg>}
              Approve
            </button>
          )}
          {approved && <button onClick={onClose} className="ml-auto h-9 px-5 rounded-lg border border-slate-200 dark:border-white/10 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5">Close</button>}
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto">
        {/* Identity meta */}
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100 dark:border-white/[0.06]">
          <Meta label="Broker" value={broker.brokerName} />
          <Meta label="Login" value={info.loginSource ?? '—'} />
          <Meta label="App user" value={`#${broker.userId}`} />
          <Meta label="Active" value={broker.isActive ? 'Yes' : 'No'} />
        </div>

        {/* IP configuration — admin sets these on approval */}
        <div className="p-5 border-b border-slate-100 dark:border-white/[0.06]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">IP whitelisting <span className="text-amber-500 normal-case font-semibold">· set by admin</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">IP Type</label>
              <div className="relative">
                <select value={ipType} onChange={(e) => { setIpType(e.target.value); setTest({ status: 'idle' }) }} className="w-full h-10 px-3 pr-9 appearance-none rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-[13px] text-slate-800 dark:text-white outline-none focus:border-brand-400">
                  {[...new Set([ipType, ...IP_TYPES])].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <svg viewBox="0 0 24 24" className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">IP Address</label>
              <input value={ipAddress} onChange={(e) => { setIpAddress(e.target.value); setTest({ status: 'idle' }) }} placeholder="e.g. 200.141.15.69 or 2a02:4780:63:15f0::1"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-[13px] font-mono text-slate-800 dark:text-white outline-none focus:border-brand-400" />
            </div>
          </div>

          {/* Validate banner */}
          <div className={clsx('mt-3 rounded-xl border p-3 flex items-start gap-3 text-sm',
            test.status === 'ok' ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : test.status === 'fail' ? 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400')}>
            <span className="mt-0.5 shrink-0">
              {test.status === 'testing' ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6-8.49" /></svg>
                : test.status === 'ok' ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                  : test.status === 'fail' ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                    : <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{test.status === 'ok' ? 'Validation passed' : test.status === 'fail' ? 'Validation failed' : test.status === 'testing' ? 'Validating…' : 'Validate before approving'}</p>
              <p className="text-[12px] opacity-90">{test.message ?? 'Confirm the IP type / address & credentials connect to the broker.'}</p>
            </div>
            <button onClick={runValidate} disabled={test.status === 'testing'} className="ml-auto shrink-0 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-[12px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/5 disabled:opacity-50">
              {test.status === 'ok' ? 'Re-validate' : 'Validate'}
            </button>
          </div>
        </div>

        {/* Credentials (read-only, masked) */}
        <div className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">Credentials</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <KV k="User ID" v={info.userId} mono />
            <KV k="Vendor code" v={info.vendorCode} mono />
            <KV k="API key" v={mask(info.apiKey)} mono />
            <KV k="Secret key" v={mask(info.secretKey)} mono />
            <KV k="2FA / TOTP" v={mask(info.twoFAKey)} mono />
            <KV k="App key" v={mask(info.appkey)} mono />
            <KV k="IMEI" v={info.imei} mono />
          </div>
        </div>
      </div>

      <ConfirmDialog open={confirmDelete} tone="danger" busy={deleting}
        title="Remove broker?"
        message={<>This permanently removes <b className="text-slate-700 dark:text-slate-200">{brokerDisplay(broker)}</b> for user #{broker.userId}. This cannot be undone.</>}
        confirmLabel="Remove" onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
    </Drawer>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">{label}</p><p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums truncate">{value}</p></div>
}
function KV({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-2 min-w-0"><span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0">{k}</span><span className={clsx('text-[12px] text-slate-700 dark:text-slate-200 truncate', mono && 'font-mono')}>{v || '—'}</span></div>
}

function errMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
}
