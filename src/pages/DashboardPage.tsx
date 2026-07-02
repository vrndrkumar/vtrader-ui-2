import { useAuth } from '@/hooks/useAuth'

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Welcome back, {user?.username}
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-16 w-16 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-brand-500">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
          Dashboard — Module 3 coming next
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Head to <strong>Brokers</strong> to connect your trading account.
        </p>
      </div>
    </div>
  )
}
