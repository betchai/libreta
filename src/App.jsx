// Lazy-load route pages so Vite splits each into its own chunk (cuts initial
// bundle; heavy deps like recharts live only in Dashboard's chunk).
import Layout from '@/components/Layout'
import { Toaster } from '@/components/ui/sonner'
import { isSuperadmin } from '@/lib/auth-roles'
import { useAuth, AuthProvider } from '@/lib/AuthContext'
import { ConnectionProvider } from '@/lib/ConnectionContext'
import ErrorBoundary from '@/lib/ErrorBoundary'
import { queryClient } from '@/lib/query-client'
import Login from '@/pages/Login'
import Onboarding from '@/pages/Onboarding'
import LandingPage from '@/pages/LandingPage'
import DemoAuthProvider from '@/lib/DemoAuthProvider'
import DemoDataLoader from '@/lib/DemoDataLoader'
import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { Routes, Route, BrowserRouter as Router, Navigate } from 'react-router-dom'
const Settings = lazy(() => import('@/pages/Settings'))
const PlatformAdmin = lazy(() => import('@/pages/PlatformAdmin'))
const Pos = lazy(() => import('@/pages/POS'))
const Sales = lazy(() => import('@/pages/Sales'))
const Inventory = lazy(() => import('@/pages/Inventory'))
const Customers = lazy(() => import('@/pages/Customers'))
const CreditSummary = lazy(() => import('@/pages/CreditSummary'))
const CustomerReports = lazy(() => import('@/pages/CustomerReports'))
const Suppliers = lazy(() => import('@/pages/Suppliers'))
const PurchaseOrders = lazy(() => import('@/pages/PurchaseOrders'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const Bookkeeping = lazy(() => import('@/pages/Bookkeeping'))
const BirCompliance = lazy(() => import('@/pages/BirCompliance'))
const Profit = lazy(() => import('@/pages/Profit'))
const Users = lazy(() => import('@/pages/Users'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const ImportHistory = lazy(() => import('@/pages/ImportHistory'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const PageNotFound = lazy(() => import('@/lib/PageNotFound'))

const pageFallback = (
  <div className="flex items-center justify-center py-24">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
)
const withSuspense = (el) => <Suspense fallback={pageFallback}>{el}</Suspense>

function DemoBanner() {
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-gradient-to-r from-pink-500 to-purple-500 text-white text-center py-1.5 text-xs font-bold tracking-wide">
      DEMO MODE — This is a preview. No data is being saved.
      <a href="/" className="ml-3 underline hover:text-pink-100">Exit Demo</a>
    </div>
  )
}

const AuthenticatedApp = () => {
  const { user, isLoadingAuth } = useAuth()

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    )
  }

  // Password-recovery landing: the reset link must always reach the reset page,
  // regardless of session/tenant state (the page handles both itself).
  if (window.location.pathname === '/reset-password') {
    return withSuspense(<ResetPassword />)
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  // Authenticated but no tenant, not a superadmin -> onboarding (join a business).
  if (user && !user.tenant_id && !isSuperadmin(user)) return <Onboarding />

  const isPlatformHome = isSuperadmin(user)

  const routes = [
    { path: 'Dashboard', el: <Dashboard />, name: 'Dashboard' },
    { path: 'POS', el: <Pos key={user?.tenant_id} />, name: 'POS' },
    { path: 'Sales', el: <Sales />, name: 'Sales' },
    { path: 'Inventory', el: <Inventory />, name: 'Inventory' },
    { path: 'ImportHistory', el: <ImportHistory />, name: 'ImportHistory' },
    { path: 'Customers', el: <Customers />, name: 'Customers' },
    { path: 'CreditSummary', el: <CreditSummary />, name: 'CreditSummary' },
    { path: 'CustomerReports', el: <CustomerReports />, name: 'CustomerReports' },
    { path: 'Suppliers', el: <Suppliers />, name: 'Suppliers' },
    { path: 'PurchaseOrders', el: <PurchaseOrders />, name: 'PurchaseOrders' },
    { path: 'Expenses', el: <Expenses />, name: 'Expenses' },
    { path: 'Bookkeeping', el: <Bookkeeping />, name: 'Bookkeeping' },
    { path: 'BirCompliance', el: <BirCompliance />, name: 'BirCompliance' },
    { path: 'Profit', el: <Profit />, name: 'Profit' },
    { path: 'Users', el: <Users />, name: 'Users' },
    { path: 'Settings', el: <Settings />, name: 'Settings' },
  ]

  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/"
          element={
            isPlatformHome && !user.tenant_id
              ? <Layout currentPageName="PlatformAdmin">{withSuspense(<PlatformAdmin />)}</Layout>
              : <Layout currentPageName="POS">{withSuspense(<Pos key={user?.tenant_id} />)}</Layout>
          }
        />
        {routes.map(({ path, el, name }) => (
          <Route key={path} path={`/${path}`} element={<Layout currentPageName={name}>{withSuspense(el)}</Layout>} />
        ))}
        <Route path="/PlatformAdmin" element={<Layout currentPageName="PlatformAdmin">{withSuspense(<PlatformAdmin />)}</Layout>} />
        <Route path="*" element={withSuspense(<PageNotFound />)} />
      </Routes>
    </ErrorBoundary>
  )
}

function DemoApp() {
  window.__DEMO__ = true
  return (
    <DemoAuthProvider>
      <DemoDataLoader>
        <DemoBanner />
        <div className="pt-7">
          <AuthenticatedApp />
        </div>
      </DemoDataLoader>
    </DemoAuthProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider>
          <Router>
            <Routes>
              <Route path="/demo" element={<DemoApp />} />
              <Route path="/demo/*" element={<DemoApp />} />
              <Route path="*" element={<AuthenticatedApp />} />
            </Routes>
          </Router>
        </ConnectionProvider>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}