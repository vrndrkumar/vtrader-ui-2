import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ServiceAlertsWatcher } from '@/admin/controlPanel/serviceStatus/ServiceAlertsWatcher'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-surface-dark">
      {/* Admin-only: watches data-service health app-wide and toasts on trouble */}
      <ServiceAlertsWatcher />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
