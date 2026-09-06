import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { computeSupplierAp, poEffectiveOutstanding } from '@/lib/purchaseOrders'
import { Loader2 } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
const METHODS = ['Cash', 'Bank Transfer', 'Check', 'GCash']

// onConfirm(args) => Promise. args: { supplier, poId, payment_date, amount, payment_method, reference_number }
export default function SupplierPaymentDialog({ open, onOpenChange, supplier, po, purchaseOrders, stockMovements = [], supplierPayments = [], onConfirm }) {
    const [selSupplierId, setSelSupplierId] = useState('')
    const [poId, setPoId] = useState('')
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
    const [amount, setAmount] = useState(0)
    const [method, setMethod] = useState('Cash')
    const [reference, setReference] = useState('')
    const [busy, setBusy] = useState(false)

    const supplierPos = purchaseOrders.filter(p => p.supplier_id === selSupplierId && p.status !== 'cancelled')
    const supplierOptions = [...new Map(purchaseOrders.filter(p => p.supplier_id).map(p => [p.supplier_id, p.supplier_name])).entries()]

    const poOutstanding = (poIdVal) => {
        const onAccount = stockMovements
            .filter(m => m.po_id === poIdVal && m.reason === 'restock' && m.direction === 'in' && m.paid === false)
            .reduce((s, m) => s + (Number(m.purchase_cost) || 0), 0)
        const paid = supplierPayments
            .filter(p => p.po_id === poIdVal)
            .reduce((s, p) => s + (Number(p.amount) || 0), 0)
        return onAccount - paid
    }

    const outstanding = useMemo(() => {
        if (poId) return poEffectiveOutstanding(poId, purchaseOrders, stockMovements, supplierPayments)
        return selSupplierId ? computeSupplierAp(selSupplierId, purchaseOrders, stockMovements, supplierPayments) : 0
    }, [poId, selSupplierId, purchaseOrders, stockMovements, supplierPayments])

    useEffect(() => {
        if (!open) return
        const initSupId = supplier?.id || ''
        const initPoId = po?.id || ''
        setSelSupplierId(initSupId)
        setPoId(initPoId)
        setPaymentDate(new Date().toISOString().slice(0, 10))
        const bal = Math.max(0, initPoId ? poEffectiveOutstanding(initPoId, purchaseOrders, stockMovements, supplierPayments) : (initSupId ? computeSupplierAp(initSupId, purchaseOrders, stockMovements, supplierPayments) : 0))
        setAmount(bal > 0 ? Math.round(bal * 100) / 100 : 0)
        setMethod('Cash')
        setReference('')
    }, [open, supplier, po])

    const handleConfirm = async () => {
        const sup = (purchaseOrders.find(p => p.supplier_id === selSupplierId) ? { id: selSupplierId, name: purchaseOrders.find(p => p.supplier_id === selSupplierId).supplier_name } : { id: selSupplierId, name: supplier?.name || '' })
        if (!selSupplierId) { toast.error('Select a supplier'); return }
        if (!(Number(amount) > 0)) { toast.error('Enter an amount'); return }
        if (Number(amount) > outstanding + 0.01) { toast.error(`Amount exceeds outstanding payable of ₱${Math.max(0, outstanding).toFixed(2)}`); return }
        setBusy(true)
        try {
            await onConfirm({ supplier: sup, poId: poId || '', payment_date: paymentDate, amount: Number(amount), payment_method: method, reference_number: reference })
            toast.success('Payment recorded')
            onOpenChange(false)
        } catch (e) {
            toast.error('Payment failed: ' + (e?.message || e))
        } finally { setBusy(false) }
    }

    const poLabel = poId ? (purchaseOrders.find(p => p.id === poId)?.po_number || poId) : ''

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Record Supplier Payment</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                    <div className={`rounded-lg border p-3 ${outstanding > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                        <div className="text-xs text-slate-500">Outstanding Payable{poId ? ` — ${poLabel}` : ''}</div>
                        <div className={`text-lg font-bold ${outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>₱{Math.max(0, outstanding).toFixed(2)}</div>
                        {!!supplier && !po && <div className="text-[11px] text-slate-500">Across all of {supplier.name}'s unallocated PO receipts</div>}
                    </div>
                    <div className="space-y-1">
                        <Label>Supplier</Label>
                        <Select value={selSupplierId} onValueChange={(v) => {
                            setSelSupplierId(v); setPoId('')
                            const bal = Math.max(0, computeSupplierAp(v, purchaseOrders, stockMovements, supplierPayments))
                            setAmount(bal > 0 ? Math.round(bal * 100) / 100 : 0)
                        }} disabled={!!supplier}>
                            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                            <SelectContent>
                                {supplierOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label>Allocate to PO (optional)</Label>
                        <Select value={poId} onValueChange={(v) => {
                            setPoId(v)
                            const bal = v ? Math.max(0, poOutstanding(v)) : (selSupplierId ? Math.max(0, computeSupplierAp(selSupplierId, purchaseOrders, stockMovements, supplierPayments)) : 0)
                            setAmount(bal > 0 ? Math.round(bal * 100) / 100 : 0)
                        }} disabled={!!po}>
                            <SelectTrigger><SelectValue placeholder="Unallocated / general payment" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">Unallocated</SelectItem>
                                {supplierPos.map(p => <SelectItem key={p.id} value={p.id}>{p.po_number} — {p.status}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label>Payment Date</Label><Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} /></div>
                        <div className="space-y-1"><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label>Method</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-1"><Label>Reference No.</Label><Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Check/GCash ref" /></div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={busy} className="bg-pink hover:bg-pink/90">{busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving</> : 'Record Payment'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
