import { useState } from 'react'
import { clsx } from 'clsx'
import { useBrokerStore, type BrokerAccount } from '@/store/brokerStore'
import { useAuth } from '@/hooks/useAuth'

const AVATAR_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500', 'bg-rose-500', 'bg-violet-500']
const avatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length]

function qtySummary(q: Record<string, number>): string {
  const parts: string[] = []
  if (q.nifty != null) parts.push(`N ${q.nifty}`)
  if (q.banknifty != null) parts.push(`BN ${q.banknifty}`)
  if (q.sensex != null) parts.push(`SX ${q.sensex}`)
  if (q.stocks != null) parts.push(`Eq ${q.stocks}`)
  return parts.join(' · ')
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={clsx('relative h-5 w-9 rounded-full transition-colors', on ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600')}
    >
      <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

function BrokerRow({ account, selected, onToggle, onOnly }: { account: BrokerAccount; selected: boolean; onToggle: () => void; onOnly: () => void }) {
  return (
    <div className={clsx('group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer', selected ? 'bg-brand-50/70 dark:bg-brand-900/20' : 'hover:bg-slate-50 dark:hover:bg-white/5')} onClick={onToggle}>
      <div className={clsx('h-4 w-4 rounded border flex items-center justify-center shrink-0', selected ? 'bg-brand-600 border-brand-600' : 'border-slate-300 dark:border-slate-600')}>
        {selected && <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l4 4 10-10" /></svg>}
      </div>
      <div className={clsx('h-7 w-7 rounded-full grid place-items-center text-white text-[11px] font-bold shrink-0', avatarColor(account.id))}>
        {account.brokerName.slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{account.displayName}</span>
          {account.isDefault && <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400">DEFAULT</span>}
        </div>
        <p className="text-[10px] text-slate-400 tabular-nums truncate">{qtySummary(account.quantity)}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onOnly() }}
        className="opacity-0 group-hover:opacity-100 text-[10px] font-medium px-1.5 py-0.5 rounded text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-opacity"
      >
        Only
      </button>
    </div>
  )
}

export function BrokerSelector() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const accounts = useBrokerStore((s) => s.accounts)
  const selectedIds = useBrokerStore((s) => s.selectedIds)
  const quickTrade = useBrokerStore((s) => s.quickTrade)
  const confirmOrders = useBrokerStore((s) => s.confirmOrders)
  const toggleSelected = useBrokerStore((s) => s.toggleSelected)
  const selectOnly = useBrokerStore((s) => s.selectOnly)
  const setQuickTrade = useBrokerStore((s) => s.setQuickTrade)
  const setConfirmOrders = useBrokerStore((s) => s.setConfirmOrders)
  const [open, setOpen] = useState(false)

  const selected = accounts.filter((a) => selectedIds.includes(a.id))
  const label = selected.length === 0 ? 'No broker' : selected.length === 1 ? selected[0].displayName : `${selected[0].brokerName} +${selected.length - 1}`

  return (
    <div className="relative">
      <button
        onClick={() => isAdmin && setOpen((o) => !o)}
        disabled={!isAdmin}
        title={!isAdmin ? 'Broker selection is managed by your admin' : undefined}
        className={clsx(
          'flex items-center gap-2 h-9 pl-2 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-700',
          isAdmin
            ? 'hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer'
            : 'opacity-60 cursor-not-allowed',
        )}
      >
        {selected[0] && <span className={clsx('h-5 w-5 rounded-full grid place-items-center text-white text-[9px] font-bold', avatarColor(selected[0].id))}>{selected[0].brokerName.slice(0, 2)}</span>}
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[130px] truncate">{label}</span>
        {quickTrade && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center gap-0.5"><svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor"><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>QT</span>}
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1.5 w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-card-dark shadow-xl animate-fade-in">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Broker context</p>
              <p className="text-[10px] text-slate-400">Selected brokers drive orders, positions & books everywhere.</p>
            </div>
            <div className="p-1.5 max-h-72 overflow-y-auto">
              {accounts.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-400">No brokers connected.</p>
              ) : accounts.map((a) => (
                <BrokerRow key={a.id} account={a} selected={selectedIds.includes(a.id)} onToggle={() => toggleSelected(a.id)} onOnly={() => selectOnly(a.id)} />
              ))}
            </div>
            <div className="px-3 py-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Quick Trade</p>
                  <p className="text-[10px] text-slate-400">One-tap orders with default qty</p>
                </div>
                <Toggle on={quickTrade} onChange={setQuickTrade} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Confirm orders</p>
                  <p className="text-[10px] text-slate-400">Ask before Quick Trade fires</p>
                </div>
                <Toggle on={confirmOrders} onChange={setConfirmOrders} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
