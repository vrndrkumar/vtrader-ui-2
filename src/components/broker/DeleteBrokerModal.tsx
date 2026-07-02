import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { UserBroker } from '@/types/broker'

interface DeleteBrokerModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  broker: UserBroker | null
  isDeleting: boolean
}

export function DeleteBrokerModal({ open, onClose, onConfirm, broker, isDeleting }: DeleteBrokerModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Remove Broker" size="sm">
      <div className="flex flex-col items-center gap-5 py-2 text-center">
        <div className="h-14 w-14 rounded-2xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-slate-900 dark:text-white mb-1">
            Remove {broker?.brokerName}?
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This will disconnect the broker. Any strategies using it will need to be reassigned.
          </p>
        </div>
        <div className="flex gap-3 w-full">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            loading={isDeleting}
            className="flex-1 !bg-red-600 hover:!bg-red-700"
          >
            Remove
          </Button>
        </div>
      </div>
    </Modal>
  )
}
