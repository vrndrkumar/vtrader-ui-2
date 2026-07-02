import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  addBroker,
  deleteBroker,
  getBrokerMasterList,
  getUserBrokers,
  updateBroker,
} from '@/api/broker'
import type { AddBrokerPayload, BrokerMaster, UserBroker } from '@/types/broker'
import { BrokerCard } from '@/components/broker/BrokerCard'
import { AddBrokerModal } from '@/components/broker/AddBrokerModal'
import { ValidateBrokerModal } from '@/components/broker/ValidateBrokerModal'
import { DeleteBrokerModal } from '@/components/broker/DeleteBrokerModal'
import { Button } from '@/components/ui/Button'

export default function BrokerPage() {
  const [brokers, setBrokers] = useState<UserBroker[]>([])
  const [masterList, setMasterList] = useState<BrokerMaster[]>([])
  const [loading, setLoading] = useState(true)

  // Modal states
  const [addOpen, setAddOpen] = useState(false)
  const [editBroker, setEditBroker] = useState<UserBroker | null>(null)
  const [validateBroker, setValidateBroker] = useState<UserBroker | null>(null)
  const [deletingBroker, setDeletingBroker] = useState<UserBroker | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [settingPrimaryId, setSettingPrimaryId] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [userBrokers, master] = await Promise.all([getUserBrokers(), getBrokerMasterList()])
      setBrokers(Array.isArray(userBrokers) ? userBrokers : [])
      setMasterList(Array.isArray(master) ? master : [])
    } catch {
      toast.error('Failed to load brokers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Derive primary broker — the one with preferences.default = true
  const primaryBroker = brokers.find((b) => b.preferences?.default === true) ?? brokers[0]

  // Add / Edit submit
  const handleBrokerSubmit = async (payload: AddBrokerPayload) => {
    try {
      if (editBroker) {
        await updateBroker(editBroker.id, payload)
        toast.success('Broker updated')
      } else {
        if (brokers.length === 0) payload.preferences.default = true
        await addBroker(payload)
        toast.success('Broker connected!')
      }
      setAddOpen(false)
      setEditBroker(null)
      await fetchData()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (editBroker ? 'Failed to update broker' : 'Failed to connect broker')
      toast.error(msg)
      // do NOT re-throw — let the modal stay open naturally via isSubmitting reset
    }
  }

  // Set primary
  const handleSetPrimary = async (broker: UserBroker) => {
    setSettingPrimaryId(broker.id)
    try {
      await updateBroker(broker.id, {
        brokerName: broker.brokerName,
        brokerInfo: broker.brokerInfo,
        isActive: broker.isActive,
        preferences: {
          ...(broker.preferences ?? { quantity: {} }),
          default: true,
        },
      })
      toast.success(`${broker.brokerName} set as primary`)
      fetchData()
    } catch {
      toast.error('Failed to set primary broker')
    } finally {
      setSettingPrimaryId(null)
    }
  }

  // Delete
  const handleDelete = async () => {
    if (!deletingBroker) return
    setIsDeleting(true)
    try {
      await deleteBroker(deletingBroker.id)
      toast.success('Broker removed')
      setDeletingBroker(null)
      fetchData()
    } catch {
      toast.error('Failed to remove broker')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Brokers</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage your connected trading accounts
          </p>
        </div>
        <Button onClick={() => { setEditBroker(null); setAddOpen(true) }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Broker
        </Button>
      </div>

      {/* Summary strip */}
      {!loading && brokers.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard label="Total Brokers" value={brokers.length} />
          <StatCard label="Active" value={brokers.filter((b) => b.isActive).length} accent="green" />
          <StatCard label="Primary" value={primaryBroker?.brokerName ?? '—'} isText />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <svg className="animate-spin h-8 w-8 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : brokers.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {brokers.map((broker) => (
            <BrokerCard
              key={broker.id}
              broker={broker}
              isPrimary={broker.id === primaryBroker?.id}
              isOnly={brokers.length === 1}
              onEdit={(b) => { setEditBroker(b); setAddOpen(true) }}
              onDelete={setDeletingBroker}
              onValidate={setValidateBroker}
              onSetPrimary={handleSetPrimary}
              settingPrimary={settingPrimaryId === broker.id}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <AddBrokerModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditBroker(null) }}
        onSubmit={handleBrokerSubmit}
        brokerMasterList={masterList}
        editBroker={editBroker}
        isFirstBroker={brokers.length === 0}
      />
      <ValidateBrokerModal
        open={!!validateBroker}
        onClose={() => setValidateBroker(null)}
        broker={validateBroker}
      />
      <DeleteBrokerModal
        open={!!deletingBroker}
        onClose={() => setDeletingBroker(null)}
        onConfirm={handleDelete}
        broker={deletingBroker}
        isDeleting={isDeleting}
      />
    </div>
  )
}

/* ── helpers ── */
function StatCard({
  label, value, accent, isText,
}: {
  label: string
  value: number | string
  accent?: 'green'
  isText?: boolean
}) {
  return (
    <div className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
      <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold mb-1">
        {label}
      </p>
      <p className={`font-bold ${isText ? 'text-base' : 'text-2xl'} ${accent === 'green' ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-white'}`}>
        {value}
      </p>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-16 w-16 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
        No brokers connected
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs">
        Connect your first broker to start deploying strategies and trading automatically.
      </p>
      <Button onClick={onAdd}>Connect your first broker</Button>
    </div>
  )
}
