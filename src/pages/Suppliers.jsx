import SupplierDialog from '@/components/suppliers/SupplierDialog'
import SupplierPaymentDialog from '@/components/purchase/SupplierPaymentDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useSuppliers, usePurchaseOrders, useStockMovements, useSupplierPayments, useCreateSupplier, useUpdateSupplier, useSupplierPayment } from '@/hooks/usePurchaseData'
import { useTenantId } from '@/hooks/useTenantId'
import { computeSupplierAp } from '@/lib/purchaseOrders'
import { Plus, Search, Pencil, CreditCard } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`

export default function Suppliers() {
  const tenantId = useTenantId()
  const { data: suppliers = [], isLoading } = useSuppliers()
  const { data: purchaseOrders = [] } = usePurchaseOrders()
  const { data: movements = [] } = useStockMovements()
  const { data: payments = [] } = useSupplierPayments()
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier()
  const supplierPayment = useSupplierPayment()
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState(null)
  const [paymentSupplier, setPaymentSupplier] = useState(null)

  const confirmPayment = (args) => new Promise((resolve, reject) => {
    supplierPayment.mutate(args, { onSuccess: resolve, onError: reject })
  })

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))

  const submit = (data) => {
    const action = dialog.mode === 'edit' ? updateSupplier : createSupplier
    action.mutate(dialog.mode === 'edit' ? { id: dialog.supplier.id, data } : data, {
      onSuccess: () => { toast.success(dialog.mode === 'edit' ? 'Supplier updated' : 'Supplier added'); setDialog(null) },
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-plum">Suppliers</h1>
          <p className="text-slate-500">Manage vendors and accounts payable</p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })} className="bg-pink hover:bg-pink/90"><Plus className="w-4 h-4 mr-2" />Add Supplier</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? <div className="py-10 text-center text-slate-400">Loading…</div> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cyan-50 text-left text-xs uppercase text-cyan-700">
                <tr><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">VAT</th><th className="px-4 py-3">Terms</th><th className="px-4 py-3 text-right">AP Balance</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const ap = computeSupplierAp(s.id, purchaseOrders, movements, payments)
                  return (
                    <tr key={s.id} className={`border-t ${s.is_active === false ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-medium">{s.name}<div className="text-xs text-slate-400">{s.contact_person || ''}</div></td>
                      <td className="px-4 py-3 text-slate-500">{s.phone || s.email || '—'}</td>
                      <td className="px-4 py-3">{s.is_vat_registered ? 'Registered' : 'Non-VAT'}</td>
                      <td className="px-4 py-3">{s.payment_terms}</td>
                      <td className={`px-4 py-3 text-right font-medium ${ap > 0 ? 'text-slate-800' : 'text-pink'}`}>{MONEY(ap)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {ap > 0 && <Button size="sm" variant="outline" onClick={() => setPaymentSupplier(s)}><CreditCard className="w-3 h-3 mr-1" />Pay</Button>}
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => setDialog({ mode: 'edit', supplier: s })}><Pencil className="w-4 h-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No suppliers</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {dialog && <SupplierDialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null) }} supplier={dialog.mode === 'edit' ? dialog.supplier : null} onSubmit={submit} />}

      {paymentSupplier && <SupplierPaymentDialog
        open={!!paymentSupplier}
        onOpenChange={(o) => { if (!o) setPaymentSupplier(null) }}
        supplier={paymentSupplier}
        purchaseOrders={purchaseOrders}
        stockMovements={movements}
        supplierPayments={payments}
        onConfirm={confirmPayment}
      />}
    </div>
  )
}
