import CustomerDialog from '@/components/customers/CustomerDialog'
import CustomerStatement from '@/components/customers/CustomerStatement'
import RecordPaymentDialog from '@/components/customers/RecordPaymentDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useLedgerEntries, useUpdateCustomer } from '@/hooks/useCustomerData'
import { useCustomers } from '@/hooks/useCustomers'
import { useTenantId } from '@/hooks/useTenantId'
import { isAdmin } from '@/lib/auth-roles'
import { useAuth } from '@/lib/AuthContext'
import { computeBalance, entriesForCustomer } from '@/lib/customerCredit'
import { Tooltip } from '@/components/ui/tooltip'
import { Plus, Search, FileText, HandCoins, Pencil, Archive } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`

export default function Customers() {
  const { user } = useAuth()
  const admin = isAdmin(user)
  const tenantId = useTenantId()
  const { data: customers = [], isLoading } = useCustomers()
  const { data: ledgerEntries = [] } = useLedgerEntries()
  const updateCustomer = useUpdateCustomer()
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState(null) // {mode:'create'|'edit', customer}
  const [paying, setPaying] = useState(null)
  const [statement, setStatement] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  const filtered = customers.filter((c) => {
    if (!showArchived && c.is_active === false) return false
    return c.name.toLowerCase().includes(search.toLowerCase()) || (c.nickname_or_alias || '').toLowerCase().includes(search.toLowerCase())
  })

  const archive = (c) => {
    if (c.is_active === false) return
    const bal = computeBalance(entriesForCustomer(ledgerEntries, c.id))
    if (!confirm(bal > 0.01 ? `Archiving ${c.name} with outstanding ${MONEY(bal)}. Continue?` : `Archive ${c.name}?`)) return
    updateCustomer.mutate({ id: c.id, data: { ...c, is_active: false } }, { onSuccess: () => toast.success('Customer archived'), onError: (e) => toast.error(e.message) })
  }

  if (!admin) return <div className="py-20 text-center text-slate-500">Admin access required.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-plum">Customers</h1>
          <p className="text-slate-500">Manage credit customers (Utang)</p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })} className="bg-pink hover:bg-pink/90"><Plus className="w-4 h-4 mr-2" />Add Customer</Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Hide' : 'Show'} archived</Button>
      </div>

      {isLoading ? <div className="py-10 text-center text-slate-400">Loading…</div> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-50 text-left text-xs uppercase text-orange-600">
                <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3 text-right">Limit</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const bal = computeBalance(entriesForCustomer(ledgerEntries, c.id))
                  return (
                    <tr key={c.id} className={`border-t ${c.is_active === false ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-medium">{c.name}<div className="text-xs text-slate-400">{c.nickname_or_alias || ''}</div></td>
                      <td className="px-4 py-3 text-slate-500">{c.phone || '—'}</td>
                      <td className="px-4 py-3 text-right">{MONEY(c.credit_limit)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${bal > 0 ? 'text-slate-800' : 'text-pink'}`}>{MONEY(bal)}</td>
                      <td className="px-4 py-3">{c.is_active === false ? 'Archived' : 'Active'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip content="View statement"><Button size="icon" variant="ghost" onClick={() => setStatement(c)}><FileText className="w-4 h-4" /></Button></Tooltip>
                          <Tooltip content="Record payment"><Button size="icon" variant="ghost" onClick={() => setPaying(c)}><HandCoins className="w-4 h-4" /></Button></Tooltip>
                          <Tooltip content="Edit customer"><Button size="icon" variant="ghost" onClick={() => setDialog({ mode: 'edit', customer: c })}><Pencil className="w-4 h-4" /></Button></Tooltip>
                          {c.is_active !== false && <Tooltip content="Archive customer"><Button size="icon" variant="ghost" onClick={() => archive(c)}><Archive className="w-4 h-4" /></Button></Tooltip>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No customers</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CustomerDialog
        open={!!dialog}
        onOpenChange={(o) => { if (!o) setDialog(null) }}
        customer={dialog?.mode === 'edit' ? dialog.customer : null}
        onSaved={() => setDialog(null)}
      />
      <RecordPaymentDialog
        open={!!paying}
        onOpenChange={(o) => { if (!o) setPaying(null) }}
        customer={paying}
        outstanding={paying ? computeBalance(entriesForCustomer(ledgerEntries, paying.id)) : 0}
        onPaid={() => setPaying(null)}
      />
      <CustomerStatement
        open={!!statement}
        onOpenChange={(o) => { if (!o) setStatement(null) }}
        customer={statement}
      />
    </div>
  )
}
