import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPageUrl } from '@/lib/utils'
import {
  LayoutDashboard, ShoppingCart, Package, Settings as SettingsIcon, Store, LogOut,
  ReceiptText, Users, TrendingUp, Calculator, Landmark, Receipt, Truck,
  ClipboardList, HandCoins, FileBarChart, Gauge, Building2, History, Ban,
} from 'lucide-react'
import { useSettings } from '@/hooks/useSettings'
import { useAuth } from '@/lib/AuthContext'
import { useBusinesses } from '@/hooks/useBusinesses'
import { isSuperadmin, isAdmin } from '@/lib/auth-roles'
import OfflineBanner from '@/components/OfflineBanner'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
const PLACEHOLDER_ICONS = {
  CreditReports: FileBarChart,
  ImportHistory: History,
  Voided: Ban,
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut, switchBusiness } = useAuth()
  const { data: settings } = useSettings()
  const { data: businesses = [] } = useBusinesses()
  const [loggingOut, setLoggingOut] = React.useState(false)

  const isActive = (path) => location.pathname === `/${path}` || location.pathname.includes(path)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await signOut()
      window.location.assign(window.location.origin)
    } catch (e) {
      toast.error('Failed to sign out.')
      setLoggingOut(false)
    }
  }

  const handleSwitch = async (tenantId) => {
    if (!tenantId || tenantId === user?.tenant_id) return
    try {
      await switchBusiness(tenantId)
      navigate('/')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const canManage = isAdmin(user)
  const tenantItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: 'Dashboard' },
    { name: 'POS', icon: ShoppingCart, path: 'POS' },
    { name: 'Sales', icon: ReceiptText, path: 'Sales' },
    ...(canManage
      ? [
          { name: 'Inventory', icon: Package, path: 'Inventory' },
          { name: 'Import History', icon: History, path: 'ImportHistory' },
          { name: 'Customers', icon: HandCoins, path: 'Customers' },
          { name: 'Credit Summary', icon: Gauge, path: 'CreditSummary' },
          { name: 'Credit Reports', icon: FileBarChart, path: 'CustomerReports' },
          { name: 'Suppliers', icon: Truck, path: 'Suppliers' },
          { name: 'Purchase Orders', icon: ClipboardList, path: 'PurchaseOrders' },
          { name: 'Expenses', icon: Receipt, path: 'Expenses' },
          { name: 'Bookkeeping', icon: Calculator, path: 'Bookkeeping' },
          { name: 'BIR Compliance', icon: Landmark, path: 'BirCompliance' },
          { name: 'Profit', icon: TrendingUp, path: 'Profit' },
          { name: 'Users', icon: Users, path: 'Users' },
          { name: 'Settings', icon: SettingsIcon, path: 'Settings' },
        ]
      : []),
  ]

  const superadmin = isSuperadmin(user)
  const menuItems = superadmin
    ? [
        { name: 'Platform Admin', icon: Building2, path: 'PlatformAdmin' },
        ...(user?.tenant_id ? tenantItems : []),
      ]
    : tenantItems

  const bizName = settings?.business_name || 'My Store'

  return (
    <div className="flex h-screen font-sans text-slate-900" style={{ background: 'var(--paper)' }}>
      <aside className="w-20 lg:w-64 flex flex-col transition-all duration-300 shadow-xl z-20 border-r border-pink-100" style={{ background: '#FCF0F4' }}>
        <a href="/" className="p-4 lg:p-6 flex items-center justify-center lg:justify-start gap-3 border-b border-pink-100 no-underline">
          <img src="/libreta.ico" alt="Libreta" className="w-8 h-8 rounded-lg" />
          <span className="text-xl font-bold tracking-tight hidden lg:block text-wine">{bizName}</span>
        </a>

        {businesses.length > 1 && (
          <div className="px-2 lg:px-4 pt-3 border-b border-pink-100 pb-3">
            <div className="hidden lg:block">
              <select
                value={user?.tenant_id || ''}
                onChange={(e) => handleSwitch(e.target.value)}
                aria-label="Switch business"
                className="w-full h-9 rounded-lg border border-pink-200 bg-white text-sm font-semibold px-2 text-wine cursor-pointer"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}{b.role === 'cashier' ? ' (cashier)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => { const next = businesses.find((b) => !b.isActive); if (next) handleSwitch(next.id) }}
              title="Switch business"
              className="lg:hidden flex items-center justify-center w-full h-9 rounded-lg border border-pink-200 bg-white text-wine/70 hover:bg-pink-50"
            >
              <Store className="w-4 h-4" />
            </button>
          </div>
        )}

        <nav className="flex-1 min-h-0 overflow-y-auto py-6 px-2 lg:px-4 space-y-1">
          {menuItems.map((item) => {
            const active = isActive(item.path) || currentPageName === item.name
            const Icon = item.icon
            return (
              <Link key={item.name} to={createPageUrl(item.path)} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group no-underline ${active ? 'bg-pink text-white shadow-md' : 'text-wine/70 hover:bg-pink-50 hover:text-wine'}`}>
                <Icon className={`w-6 h-6 ${active ? 'text-white' : 'text-wine/40 group-hover:text-pink'}`} />
                <span className="font-medium hidden lg:block">{item.name}</span>
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white hidden lg:block" />}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-pink-100">
          <button onClick={handleLogout} disabled={loggingOut} className="flex items-center gap-3 px-3 py-3 w-full rounded-xl text-wine/50 hover:bg-red-50 hover:text-red-500 transition-colors">
            <LogOut className="w-5 h-5" />
            <span className="font-medium hidden lg:block">{loggingOut ? 'Signing out…' : 'Sign Out'}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'var(--paper)' }}>
        <OfflineBanner />
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto h-full">{children}</div>
        </div>
      </main>
    </div>
  )
}
