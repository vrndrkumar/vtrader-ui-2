import { useState } from 'react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { validateBroker } from '@/api/broker'
import type { UserBroker } from '@/types/broker'

interface ValidateBrokerModalProps {
  open: boolean
  onClose: () => void
  broker: UserBroker | null
}

type Status = 'idle' | 'loading' | 'success' | 'error'

export function ValidateBrokerModal({ open, onClose, broker }: ValidateBrokerModalProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const handleClose = () => {
    setStatus('idle')
    setMessage('')
    onClose()
  }

  const handleValidate = async () => {
    if (!broker) return
    setStatus('loading')
    setMessage('')
    try {
      const res = await validateBroker({
        brokerId: broker.brokerId ?? 0,
        brokerInfo: broker.brokerInfo,
      })
      setStatus('success')
      setMessage(res.message ?? 'Broker configuration is valid.')
    } catch (err: unknown) {
      setStatus('error')
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Validation failed. Please check your credentials.'
      setMessage(msg)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Validate Broker Config" size="sm">
      <div className="flex flex-col items-center gap-5 py-2">
        {/* Broker identity */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-900 dark:text-white">{broker?.brokerName}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              User ID: {broker?.brokerInfo?.userId ?? '—'}
            </p>
          </div>
        </div>

        {/* Result */}
        {status !== 'idle' && (
          <div
            className={clsx(
              'w-full rounded-xl p-4 flex items-start gap-3 text-sm',
              status === 'loading' && 'bg-slate-50 dark:bg-white/5 text-slate-500',
              status === 'success' && 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
              status === 'error' && 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
            )}
          >
            {status === 'loading' && (
              <svg className="animate-spin h-4 w-4 shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {status === 'success' && (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {status === 'error' && (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            <span>{status === 'loading' ? 'Connecting to broker…' : message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Close
          </Button>
          <Button
            onClick={handleValidate}
            loading={status === 'loading'}
            className="flex-1"
          >
            {status === 'idle' ? 'Run Test' : 'Re-test'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
