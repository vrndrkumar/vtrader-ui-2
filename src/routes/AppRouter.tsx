import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { ProtectedRoute } from './ProtectedRoute'
import { AdminRoute } from './AdminRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAuth } from '@/hooks/useAuth'

const LoginPage       = lazy(() => import('@/pages/LoginPage'))
const RegisterPage    = lazy(() => import('@/pages/RegisterPage'))
const DashboardPage   = lazy(() => import('@/pages/DashboardPage'))
const TradePage       = lazy(() => import('@/trade'))
const JournalPage     = lazy(() => import('@/journal/JournalPage'))
const BrokerPage      = lazy(() => import('@/pages/BrokerPage'))
const ReportsPage     = lazy(() => import('@/pages/ReportsPage'))
const AnalyticsPage   = lazy(() => import('@/pages/AnalyticsPage'))
const StrategiesPage      = lazy(() => import('@/pages/StrategiesPage'))
const SignalGeneratorPage = lazy(() => import('@/pages/SignalGeneratorPage'))
const HoldingsPage           = lazy(() => import('@/holdings/HoldingsPage'))
const InsightUniversePage    = lazy(() => import('@/insight/UniversePage'))
const InsightReportPage      = lazy(() => import('@/insight/StockReportPage'))
const InsightGuidePage       = lazy(() => import('@/insight/GuidePage'))
const OptionInsightsPage     = lazy(() => import('@/insight/options/OptionInsightsPage'))
const StrategyLabPage        = lazy(() => import('@/insight/StrategyLabPage'))
const OptionLabPage          = lazy(() => import('@/insight/options/OptionLabPage'))
const TransitionsPage        = lazy(() => import('@/insight/TransitionsPage'))
const OptionSimulatorPage    = lazy(() => import('@/simulator/OptionSimulatorPage'))
const DocsPage               = lazy(() => import('@/admin/docs/DocsPage'))
const ControlPanelLayout     = lazy(() => import('@/admin/controlPanel/ControlPanelLayout'))
const StrategiesMaster       = lazy(() => import('@/admin/controlPanel/strategies/StrategiesMaster'))
const BrokersMaster          = lazy(() => import('@/admin/controlPanel/brokers/BrokersMaster'))

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen">
      <svg className="animate-spin h-8 w-8 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login"    element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />

          {/* Protected — all share AppLayout (sidebar) */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/dashboard"   element={<DashboardPage />} />
            <Route path="/trade"       element={<TradePage />} />
            <Route path="/holdings"    element={<HoldingsPage />} />
            <Route path="/journal"     element={<JournalPage />} />
            <Route path="/brokers"     element={<BrokerPage />} />
            <Route path="/strategies"  element={<StrategiesPage />} />
            <Route path="/analytics"   element={<AnalyticsPage />} />
            <Route path="/reports"     element={<ReportsPage />} />
            <Route path="/signals"     element={<SignalGeneratorPage />} />
            <Route path="/strategy-lab" element={<StrategyLabPage />} />
            <Route path="/insight"           element={<InsightUniversePage />} />
            <Route path="/insight/guide"   element={<InsightGuidePage />} />
            <Route path="/insight/transitions" element={<TransitionsPage />} />
            <Route path="/insight/options" element={<OptionInsightsPage />} />
            <Route path="/insight/option-lab" element={<AdminRoute><OptionLabPage /></AdminRoute>} />
            <Route path="/insight/:symbol" element={<InsightReportPage />} />
            <Route path="/admin/option-simulator" element={<AdminRoute><OptionSimulatorPage /></AdminRoute>} />
            <Route path="/admin/docs" element={<AdminRoute><DocsPage /></AdminRoute>} />
            <Route path="/admin/control-panel" element={<AdminRoute><ControlPanelLayout /></AdminRoute>}>
              <Route index element={<Navigate to="strategies" replace />} />
              <Route path="strategies" element={<StrategiesMaster />} />
              <Route path="brokers" element={<BrokersMaster />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
