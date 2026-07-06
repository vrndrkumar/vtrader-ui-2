import { useState } from 'react'
import { clsx } from 'clsx'
import type { UserBroker } from '@/types/broker'
import { Button } from '@/components/ui/Button'

interface BrokerCardProps {
  broker: UserBroker
  isPrimary: boolean
  isOnly: boolean
  onEdit: (broker: UserBroker) => void
  onDelete: (broker: UserBroker) => void
  onValidate: (broker: UserBroker) => void
  onSetPrimary: (broker: UserBroker) => void
  settingPrimary: boolean
}

const BROKER_COLORS: Record<string, string> = {
  ANGELONE:  'bg-orange-500',
  FINVASIA:  'bg-blue-600',
  ZERODHA:   'bg-teal-600',
  UPSTOX:    'bg-purple-600',
  DHAN:      'bg-sky-600',
  DELTA:     'bg-amber-500',
  DEFAULT:   'bg-slate-500',
}

const BROKER_INITIALS: Record<string, string> = {
  ANGELONE:       'AO',
  FINVASIA:       'FV',
  ZERODHA:        'ZD',
  UPSTOX:         'UP',
  DHAN:           'DH',
  DELTA:          'DX',
  DELTAEXCHANGE:  'DX',
}

// Only show these quantities for Delta / crypto brokers
const CRYPTO_SYMBOLS = ['BTC', 'ETH']

function isCryptoBroker(brokerName: string) {
  return brokerName.toUpperCase().includes('DELTA')
}

export function BrokerCard({
  broker,
  isPrimary,
  isOnly,
  onEdit,
  onDelete,
  onValidate,
  onSetPrimary,
  settingPrimary,
}: BrokerCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const rawName = broker.brokerName ?? ''
  const name    = rawName.toUpperCase()
  // Match color/initials by first key that the name includes
  const colorKey =
    Object.keys(BROKER_COLORS).find((k) => k !== 'DEFAULT' && name.includes(k)) ?? 'DEFAULT'
  const initialsKey =
    Object.keys(BROKER_INITIALS).find((k) => name.replace(/\s/g, '').includes(k)) ?? ''

  const color    = BROKER_COLORS[colorKey]
  const initials = BROKER_INITIALS[initialsKey] ?? name.slice(0, 2)

  const qty = broker.preferences?.quantity
  const isCrypto = isCryptoBroker(rawName)

  // Filter quantities: Delta only BTC/ETH, others exclude CRYPTO symbols
  const displayQty = qty && typeof qty === 'object'
    ? Object.entries(qty).filter(([key]) =>
        isCrypto
          ? CRYPTO_SYMBOLS.includes(key.toUpperCase())
          : !CRYPTO_SYMBOLS.includes(key.toUpperCase())
      )
    : []

  return (
    <div
      className={clsx(
        'relative bg-white dark:bg-card-dark rounded-2xl border transition-all duration-200 overflow-hidden',
        isPrimary
          ? 'border-brand-400 dark:border-brand-600 shadow-lg shadow-brand-100/60 dark:shadow-brand-900/30'
          : 'border-slate-200 dark:border-slate-800 hover:shadow-md dark:hover:shadow-slate-900/40',
      )}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          {/* Avatar */}
          <div className={clsx('h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0', color)}>
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm leading-tight">
                {rawName}
              </h3>
              {isPrimary && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border border-brand-200 dark:border-brand-800/60">
                  <StarSolidIcon />
                  PRIMARY
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={clsx(
                  'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                  broker.isActive
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                )}
              >
                <span className={clsx('h-1.5 w-1.5 rounded-full', broker.isActive ? 'bg-green-500' : 'bg-slate-400')} />
                {broker.isActive ? 'Active' : 'Inactive'}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 truncate">
                {broker.brokerInfo?.userId ?? '—'}
              </span>
            </div>
          </div>

          {/* Kebab menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 w-44 animate-fade-in">
                  <MenuItem icon={<EditIcon />} label="Edit" onClick={() => { setMenuOpen(false); onEdit(broker) }} />
                  <MenuItem icon={<ValidateIcon />} label="Validate config" onClick={() => { setMenuOpen(false); onValidate(broker) }} />
                  {!isPrimary && !isOnly && (
                    <MenuItem icon={<StarIcon />} label="Set as primary" onClick={() => { setMenuOpen(false); onSetPrimary(broker) }} loading={settingPrimary} />
                  )}
                  <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                  <MenuItem icon={<TrashIcon />} label="Remove" onClick={() => { setMenuOpen(false); onDelete(broker) }} danger />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quantity grid */}
        {displayQty.length > 0 && (
          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 mb-4">
            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">
              Default Quantities
            </p>
            <div className="grid gap-y-1" style={{ gridTemplateColumns: `repeat(${Math.min(displayQty.length, 4)}, minmax(0, 1fr))` }}>
              {displayQty.map(([label, val]) => (
                <div key={label} className="text-center">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{val ?? '—'}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onValidate(broker)}>
            <ValidateIcon />
            Test Config
          </Button>
          {!isPrimary && !isOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSetPrimary(broker)}
              loading={settingPrimary}
              title="Set as primary broker"
            >
              <StarIcon />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onEdit(broker)} title="Edit">
            <EditIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── menu item ── */
function MenuItem({
  icon, label, onClick, danger, loading,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={clsx(
        'flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors',
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5',
      )}
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  )
}

/* ── icons ── */
function EditIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
}
function ValidateIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
}
function StarIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
}
function StarSolidIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
}
function TrashIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
}
