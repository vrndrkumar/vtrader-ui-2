import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/**
 * Admin-only gate. Reuses the existing JWT role model (`role === 'ADMIN'`).
 * Architected so a later capability claim (e.g. OPTION_SIMULATOR) can replace
 * the role check in this single place. NOTE: this is a convenience gate — the
 * backend APIs must independently authorize admin access.
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
