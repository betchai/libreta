import ApSummary from '@/components/purchase/ApSummary'
import POReports from '@/components/purchase/POReports'
import PurchaseOrderForm from '@/components/purchase/PurchaseOrderForm'
import ReceiveGoodsDialog from '@/components/purchase/ReceiveGoodsDialog'
import SupplierPaymentDialog from '@/components/purchase/SupplierPaymentDialog'
import SupplierDialog from '@/components/suppliers/SupplierDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { usePurchaseOrders, useSuppliers, useStockMovements, useSupplierPayments, useProductCostHistory, useCreateSupplier, useSendPO, useCancelPO, useClosePOShort, useReceiveGoods, useSupplierPayment } from '@/hooks/usePurchaseData'
import { Plus, Pencil, Send, Ban, ArrowDownToLine, Undo2, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { poEffectiveOutstanding } from '@/lib/purchaseOrders'
import { toast } from 'sonner'
const STATUS_STYLE = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-50 text-blue-700',
  partially_received: 'bg-amber-50 text-amber-700',
  fully_received: 'bg-pink/10 text-pink',
  cancelled: 'bg-rose-50 text-rose-600',
}

export default function PurchaseOrders() {
  const { data: pos = [], isLoading } = usePurchaseOrders()
  const { data: suppliers = [] } = useSuppliers()
  const { data: movements = [] } = useStockMovements()
  const { data: payments = [] } = useSupplierPayments()
  const { data: costHistory = [] } = useProductCostHistory()
  const createSupplier = useCreateSupplier()
  const sendPO = useSendPO()
  const cancelPO = useCancelPO()
  const closeShort = useClosePOShort()
  const receive = useReceiveGoods()
  const supplierPayment = useSupplierPayment()

  const poItems = useMemo(() => pos.flatMap((p) => p.items || []), [pos])

  const [tab, setTab] = useState('pos')
  const [poForm, setPoForm] = useState(null) // {mode:'create'|'edit', po}
  const [receiving, setReceiving] = useState(null)
  const [supplierDialog, setSupplierDialog] = useState(null)
  const [payment, setPayment] = useState(null) // {supplier, po}

  const confirmReceive = (toReceive, options) => new Promise((resolve, reject) => {
    receive.mutate({ po: receiving, receipts: toReceive, options }, { onSuccess: resolve, onError: reject })
  })

  const confirmPayment = (args) => new Promise((resolve, reject) => {
    supplierPayment.mutate(args, { onSuccess: resolve, onError: reject })
  })

  const tabs = [['pos', 'Purchase Orders'], ['ap', 'Accounts Payable'], ['reports', 'Reports']]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-plum">Purchase Orders</h1>
          <p className="text-slate-500">Order, receive, and pay suppliers</p>
        </div>
        {tab === 'pos' && <Button onClick={() => setPoForm({ mode: 'create' })} className="bg-pink hover:bg-pink/90"><Plus className="w-4 h-4 mr-2" />New PO</Button>}
      </div>

      <div className="flex gap-2">
        {tabs.map(([val, label]) => <Button key={val} variant={tab === val ? 'default' : 'outline'} size="sm" onClick={() => setTab(val)}>{label}</Button>)}
      </div>

      {tab === 'pos' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cyan-50 text-left text-xs uppercase text-cyan-700">
                <tr><th className="px-4 py-3">PO #</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Terms</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody>
                {pos.map((po) => {
                  const total = (po.items || []).reduce((s, i) => s + ((Number(i.quantity_ordered) || 0) * (Number(i.unit_cost) || 0)), 0)
                  return (
                    <tr key={po.id} className={`border-t ${po.status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs">{po.po_number}</td>
                      <td className="px-4 py-3">{po.supplier_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{String(po.order_date).slice(0, 10)}</td>
                      <td className="px-4 py-3">{po.payment_terms}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[po.status] || ''}`}>{po.status.replace('_', ' ')}</span></td>
                      <td className="px-4 py-3 text-right font-medium">₱{total.toFixed(2)}</td>
<td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {po.status === 'draft' && <>
                            <Button size="icon" variant="ghost" title="Edit" onClick={() => setPoForm({ mode: 'edit', po })}><Pencil className="w-4 h-4" /></Button>
                            <Button size="sm" variant="outline" onClick={() => sendPO.mutate(po, { onSuccess: () => toast.success('PO sent'), onError: (e) => toast.error(e.message) })}><Send className="w-3 h-3 mr-1" />Send</Button>
                          </>}
                          {(po.status === 'sent' || po.status === 'partially_received') && <>
                            <Button size="sm" className="bg-pink hover:bg-pink/90" onClick={() => setReceiving(po)}><ArrowDownToLine className="w-3 h-3 mr-1" />Receive</Button>
                            {po.status === 'partially_received' && <Button size="sm" variant="outline" onClick={() => closeShort.mutate({ po, reason: prompt('Reason for closing short?') || '' }, { onSuccess: () => toast.success('Closed'), onError: (e) => toast.error(e.message) })}><Undo2 className="w-3 h-3 mr-1" />Close Short</Button>}
                          </>}
                          {po.status === 'fully_received' && poEffectiveOutstanding(po.id, pos, movements, payments) > 0.01 && <Button size="sm" variant="outline" onClick={() => setPayment({ supplier: suppliers.find(s => s.id === po.supplier_id) || { id: po.supplier_id, name: po.supplier_name }, po })}>Pay</Button>}
                          {po.status !== 'cancelled' && po.status !== 'fully_received' && <Button size="sm" variant="outline" className="text-rose-500" onClick={() => cancelPO.mutate({ po, reason: prompt('Reason for cancellation?') || '' }, { onSuccess: () => toast.success('Cancelled'), onError: (e) => toast.error(e.message) })}><Ban className="w-3 h-3 mr-1" />Cancel</Button>}
                          {po.status !== 'draft' && <Button size="icon" variant="ghost" title="Create a new PO from this one" onClick={() => setPoForm({ mode: 'duplicate', po })}><Copy className="w-4 h-4" /></Button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {pos.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No purchase orders</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'ap' && (
        <ApSummary suppliers={suppliers} purchaseOrders={pos} stockMovements={movements} supplierPayments={payments} onRecordPayment={(supplier) => setPayment({ supplier, po: null })} />
      )}

      {tab === 'reports' && (
        <POReports purchaseOrders={pos} poItems={poItems} suppliers={suppliers} costHistory={costHistory} supplierPayments={payments} stockMovements={movements} />
      )}

      {poForm && (
        <PurchaseOrderForm
          open={!!poForm}
          onOpenChange={(o) => { if (!o) setPoForm(null) }}
          po={poForm.mode === 'edit' ? poForm.po : null}
          duplicateOf={poForm.mode === 'duplicate' ? poForm.po : null}
          suppliers={suppliers}
          onAddSupplier={() => setSupplierDialog({ mode: 'create' })}
        />
      )}

      {receiving && (
        <ReceiveGoodsDialog
          open={!!receiving}
          onOpenChange={(o) => { if (!o) setReceiving(null) }}
          po={receiving}
          poItems={receiving.items || []}
          onConfirm={confirmReceive}
        />
      )}

      {payment && (
        <SupplierPaymentDialog
          open={!!payment}
          onOpenChange={(o) => { if (!o) setPayment(null) }}
          supplier={payment.supplier}
          po={payment.po}
          purchaseOrders={pos}
          stockMovements={movements}
          supplierPayments={payments}
          onConfirm={confirmPayment}
        />
      )}

      {supplierDialog && (
        <SupplierDialog
          open={!!supplierDialog}
          onOpenChange={(o) => { if (!o) setSupplierDialog(null) }}
          supplier={supplierDialog.mode === 'edit' ? supplierDialog.supplier : null}
          onSubmit={(data) => createSupplier.mutate(data, {
            onSuccess: () => { toast.success('Supplier added'); setSupplierDialog(null) },
            onError: (e) => toast.error(e.message),
          })}
        />
      )}
    </div>
  )
}
