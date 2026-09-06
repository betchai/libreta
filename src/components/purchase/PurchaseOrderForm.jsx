import { base44 } from '@/api/base44Client'
import SupplierSelect from '@/components/purchase/SupplierSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useProducts } from '@/hooks/useProducts'
import { useTenantId } from '@/hooks/useTenantId'
import { updatePurchaseOrder, createPurchaseOrder } from '@/lib/purchaseOrders'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2, Plus, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Line } from 'recharts'
import { toast } from 'sonner'
const TERMS = ['COD', 'Net 7', 'Net 15', 'Net 30', 'Net 60']

export default function PurchaseOrderForm({ open, onOpenChange, po, duplicateOf, suppliers, onAddSupplier }) {
    const tenantId = useTenantId()
    const queryClient = useQueryClient()
    const isEdit = !!po
    const locked = isEdit && po.status !== 'draft'
    const source = po || duplicateOf

    const { data: products = [] } = useProducts()

    const [supplier, setSupplier] = useState(null)
    const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
    const [expectedDate, setExpectedDate] = useState('')
    const [terms, setTerms] = useState('COD')
    const [notes, setNotes] = useState('')
    const [lines, setLines] = useState([{ product_id: '', product_name: '', quantity_ordered: 1, unit_of_purchase: '', unit_cost: 0 }])
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!open) return
        if (source) {
            setSupplier(suppliers.find(s => s.id === source.supplier_id) || null)
            setOrderDate(duplicateOf ? new Date().toISOString().slice(0, 10) : (source.order_date || new Date().toISOString().slice(0, 10)))
            setExpectedDate(duplicateOf ? '' : (source.expected_delivery_date || ''))
            setTerms(source.payment_terms || 'COD')
            setNotes(duplicateOf ? '' : (source.notes || ''))
            base44.entities.PurchaseOrderItem.filter({ po_id: source.id, tenant_id: tenantId }).then(items => {
                setLines(items.map(i => ({ id: duplicateOf ? '' : i.id, product_id: i.product_id, product_name: i.product_name, quantity_ordered: i.quantity_ordered, unit_of_purchase: i.unit_of_purchase, unit_cost: i.unit_cost })))
            })
        } else {
            setSupplier(null)
            setOrderDate(new Date().toISOString().slice(0, 10))
            setExpectedDate('')
            setTerms('COD')
            setNotes('')
            setLines([{ product_id: '', product_name: '', quantity_ordered: 1, unit_of_purchase: '', unit_cost: 0 }])
        }
    }, [open, po, duplicateOf])

    useEffect(() => { if (supplier) setTerms(supplier.payment_terms || terms) }, [supplier])

    const setLine = (idx, k, v) => setLines(prev => prev.map((l, i) => i === idx ? { ...l, [k]: v } : l))
    const onProduct = (idx, pid) => {
        const p = products.find(x => x.id === pid)
        if (!p) return
        setLine(idx, 'product_id', pid)
        setLine(idx, 'product_name', p.name)
        setLine(idx, 'unit_of_purchase', p.base_unit)
        setLine(idx, 'unit_cost', p.cost_price || 0)
    }
    const addLine = () => setLines(prev => [...prev, { product_id: '', product_name: '', quantity_ordered: 1, unit_of_purchase: '', unit_cost: 0 }])
    const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx))

    const total = lines.reduce((s, l) => s + ((Number(l.quantity_ordered) || 0) * (Number(l.unit_cost) || 0)), 0)

    const handleSave = async () => {
        if (!supplier) { toast.error('Select a supplier'); return }
        const valid = lines.filter(l => l.product_id && Number(l.quantity_ordered) > 0)
        if (valid.length === 0) { toast.error('Add at least one line item'); return }
        setBusy(true)
        try {
            const payload = { supplier, order_date: orderDate, expected_delivery_date: expectedDate, payment_terms: terms, notes, items: valid }
            if (isEdit) await updatePurchaseOrder(tenantId, po, payload)
            else await createPurchaseOrder(tenantId, payload)
            queryClient.invalidateQueries(['pos', tenantId])
            queryClient.invalidateQueries(['products', tenantId])
            toast.success(isEdit ? 'PO updated' : 'PO created')
            onOpenChange(false)
        } catch (e) {
            toast.error('Failed: ' + (e?.message || e))
        } finally { setBusy(false) }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{isEdit ? `Edit ${po.po_number}` : duplicateOf ? `New PO from ${duplicateOf.po_number}` : 'New Purchase Order'}</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-1">
                        <Label>Supplier</Label>
                        <SupplierSelect value={supplier?.id} onChange={setSupplier} suppliers={suppliers} onAddNew={onAddSupplier} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1"><Label>Order Date</Label><Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} disabled={locked} /></div>
                        <div className="space-y-1"><Label>Expected Delivery</Label><Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} /></div>
                        <div className="space-y-1"><Label>Payment Terms</Label><Select value={terms} onValueChange={setTerms}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                    </div>

                    <div className="border rounded-lg">
                        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-xs font-medium text-slate-600">
                            <div className="col-span-4">Product</div><div className="col-span-2">Qty Ordered</div><div className="col-span-1">Unit</div><div className="col-span-2">Unit Cost</div><div className="col-span-2 text-right">Total</div><div className="col-span-1"></div>
                        </div>
                        {lines.map((l, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-t">
                                <div className="col-span-4 min-w-0">
                                    <Select value={l.product_id} onValueChange={v => onProduct(idx, v)} disabled={locked}>
                                        <SelectTrigger className="h-8"><SelectValue placeholder="Select product" /></SelectTrigger>
                                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id} className="truncate">{p.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <Input className="col-span-2 h-8" type="number" step="0.01" value={l.quantity_ordered} onChange={e => setLine(idx, 'quantity_ordered', e.target.value)} disabled={locked} />
                                <div className="col-span-1 text-xs text-slate-500 self-center whitespace-nowrap">{l.unit_of_purchase || '—'}</div>
                                <Input className="col-span-2 h-8" type="number" step="0.01" value={l.unit_cost} onChange={e => setLine(idx, 'unit_cost', e.target.value)} disabled={locked} />
                                <div className="col-span-2 text-right text-sm font-medium self-center whitespace-nowrap">₱{((Number(l.quantity_ordered) || 0) * (Number(l.unit_cost) || 0)).toFixed(2)}</div>
                                <div className="col-span-1 flex justify-end">{!locked && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeLine(idx)}><Trash2 className="w-4 h-4 text-red-500" /></Button>}</div>
                            </div>
                        ))}
                        {!locked && <div className="p-2 border-t"><Button size="sm" variant="outline" onClick={addLine}><Plus className="w-4 h-4 mr-1" /> Add Line</Button></div>}
                    </div>
                    {locked && <p className="text-xs text-amber-600">PO is {po.status} — ordered quantities and costs are locked. Use Receive Items to record deliveries.</p>}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
                        <div className="rounded-lg bg-slate-50 border p-3 flex flex-col justify-center"><div className="flex justify-between text-sm"><span className="text-slate-600">Order Total</span><b>₱{total.toFixed(2)}</b></div></div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={busy} className="bg-pink hover:bg-pink/90">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{isEdit ? 'Save Changes' : 'Create PO'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
