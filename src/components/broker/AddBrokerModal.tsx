import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { LotInput } from '@/components/ui/LotInput'
import { getIndexMaster } from '@/services/indexMasterCache'
import { parseLot } from '@/types/indexMaster'
import type { BrokerMaster, UserBroker, AddBrokerPayload, BrokerQuantity } from '@/types/broker'

const FIXED_IMEI = 'abcde'

function vendorCode(broker: string, userId: string) {
  return broker.toUpperCase() === 'FINVASIA' ? `${userId}_U` : ''
}

// Detect if the selected broker is a crypto/Delta broker
function isCryptoBroker(brokerName: string) {
  return (brokerName ?? '').toUpperCase().includes('DELTA')
}

// Only these symbols are shown for crypto brokers
const CRYPTO_SYMBOLS = ['BTC', 'ETH']

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
}

interface AddBrokerModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (payload: AddBrokerPayload) => Promise<void>
  brokerMasterList: BrokerMaster[]
  editBroker?: UserBroker | null
  isFirstBroker: boolean
}

export function AddBrokerModal({
  open, onClose, onSubmit, brokerMasterList, editBroker, isFirstBroker,
}: AddBrokerModalProps) {
  const isEdit = !!editBroker

  // All indices loaded from the API (cached after first call)
  const [allIndices, setAllIndices] = useState<IndexRow[]>([])
  const [indicesLoading, setIndicesLoading] = useState(true)

  // Quantity values keyed by symbol
  const [quantities, setQuantities] = useState<QuantityMap>({})

  const {
    register, handleSubmit, reset, control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>()

  const selectedBroker = useWatch({ control, name: 'brokerName' })
  const userId         = useWatch({ control, name: 'userId' })
  const vcHint         = vendorCode(selectedBroker ?? '', userId ?? '')

  const isCrypto = isCryptoBroker(selectedBroker ?? '')

  // Visible indices depend on broker type
  const visibleIndices: IndexRow[] = isCrypto
    ? allIndices.filter((i) => CRYPTO_SYMBOLS.includes(i.symbol))
    : allIndices.filter((i) => !CRYPTO_SYMBOLS.includes(i.symbol))

  // Load indices once on mount (uses module-level cache)
  useEffect(() => {
    getIndexMaster()
      .then((list) => {
        const rows: IndexRow[] = list
          .map((m) => ({
            symbol:   ((m.symbolCode ?? m.symbol_code) ?? '').toUpperCase(),
            lot:      parseLot(m.lot),
            exchange: (m.exchange ?? '').toUpperCase(),
          }))
          .filter((r) => r.symbol && r.lot > 0)
        setAllIndices(rows)
      })
      .finally(() => setIndicesLoading(false))
  }, [])

  // Reset form + quantities every time modal opens
  useEffect(() => {
    if (!open) return

    const existingQty = editBroker?.preferences?.quantity ?? {}

    // Pre-fill quantities from allIndices (may be empty on first mount — back-fill below)
    const qty: QuantityMap = {}
    allIndices.forEach(({ symbol, lot }) => {
      const saved = existingQty[symbol]
      qty[symbol] = saved
        ? Math.max(lot, Math.round(saved / lot) * lot)
        : lot
    })
    setQuantities(qty)

    if (isEdit && editBroker) {
      const info = editBroker.brokerInfo ?? {}
      reset({
        brokerName: editBroker.brokerName,
        isActive:   editBroker.isActive,
        userId:     info.userId     ?? '',
        password:   info.password   ?? '',
        apiKey:     info.apiKey     ?? '',
        secretKey:  info.secretKey  ?? '',
        twoFAKey:   info.twoFAKey   ?? '',
        ipAddress:  info.IPAddress  ?? '',
      })
    } else {
      reset({
        brokerName: brokerMasterList[0]?.name ?? '',
        isActive:   true,
        userId: '', password: '', apiKey: '', secretKey: '', twoFAKey: '', ipAddress: '',
      })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // When allIndices loads asynchronously after the modal opened, back-fill missing keys
  useEffect(() => {
    if (!open || allIndices.length === 0) return
    setQuantities((prev) => {
      const next = { ...prev }
      const existingQty = editBroker?.preferences?.quantity ?? {}
      allIndices.forEach(({ symbol, lot }) => {
        if (next[symbol] == null) {
          const saved = existingQty[symbol]
          next[symbol] = saved ? Math.max(lot, Math.round(saved / lot) * lot) : lot
        }
      })
      return next
    })
  }, [allIndices, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const setQty = (symbol: string, value: number) =>
    setQuantities((prev) => ({ ...prev, [symbol]: value }))

  const handleClose = () => { if (!isSubmitting) onClose() }

  const onFormSubmit = async (values: FormValues) => {
    // Only persist quantities for visible indices (relevant to this broker type)
    const quantity: BrokerQuantity = {}
    visibleIndices.forEach(({ symbol }) => {
      quantity[symbol] = quantities[symbol] ?? 0
    })

    const payload: AddBrokerPayload = {
      brokerName: values.brokerName,
      isActive:   values.isActive,
      brokerInfo: {
        userId:     values.userId,
        password:   values.password,
        vendorCode: vendorCode(values.brokerName, values.userId),
        apiKey:     values.apiKey,
        secretKey:  values.secretKey ?? '',
        twoFAKey:   values.twoFAKey,
        imei:       FIXED_IMEI,
        ...(values.ipAddress ? { IPAddress: values.ipAddress } : {}),
      },
      preferences: {
        ...(editBroker?.preferences ?? {}),
        default:  isFirstBroker || Boolean(editBroker?.preferences?.default),
        quantity,
      },
    }
    await onSubmit(payload)
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? `Edit — ${editBroker?.brokerName}` : 'Connect Broker'}
      size="lg"
    >
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">

        {/* Broker + Active */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Broker</label>
            {brokerMasterList.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm text-slate-400">
                Loading brokers…
              </div>
            ) : (
              <select
                disabled={isEdit}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5 text-slate-900 dark:text-slate-100 text-sm px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 dark:[color-scheme:dark]"
                {...register('brokerName', { required: true })}
              >
                {brokerMasterList.map((b) => (
                  <option key={b.id} value={b.name} className="dark:bg-slate-800">{b.name}</option>
                ))}
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
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
            Broker Credentials
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Input label="User ID" placeholder="Broker user ID" error={errors.userId?.message}
              {...register('userId', { required: 'Required' })} />
            <Input label="Password" type="password" placeholder="Broker password" error={errors.password?.message}
              {...register('password', { required: 'Required' })} />
            <Input label="API Key" placeholder="API key" error={errors.apiKey?.message}
              {...register('apiKey', { required: 'Required' })} />
            <Input label="Secret Key" placeholder="Secret key (if applicable)"
              {...register('secretKey')} />
            <div className="col-span-2">
              <Input label="2FA / TOTP Key" placeholder="TOTP secret key" error={errors.twoFAKey?.message}
                {...register('twoFAKey', { required: 'Required' })} />
            </div>
            {isEdit && editBroker?.brokerInfo?.IPAddress && (
              <div className="col-span-2">
                <Input
                  label="IP Address"
                  disabled
                  readOnly
                  {...register('ipAddress')}
                />
              </div>
            )}
          </div>

          {vcHint && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Vendor code (auto){' '}
              <span className="font-mono bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                {vcHint}
              </span>
            </p>
          )}
        </div>

        {/* Default Quantities — dynamic from Indices API */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Default Quantities
            </p>
            {isCrypto && (
              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                Crypto only (BTC / ETH)
              </span>
            )}
          </div>

          {indicesLoading ? (
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 w-28 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : visibleIndices.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No indices available</p>
          ) : (
            <div className="overflow-x-auto pb-1">
              <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
                {visibleIndices.map(({ symbol, lot }) => (
                  <div key={symbol} style={{ width: 110 }}>
                    <LotInput
                      label={symbol}
                      lotSize={lot}
                      value={quantities[symbol] ?? lot}
                      onChange={(v) => setQty(symbol, v)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Connect broker'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
