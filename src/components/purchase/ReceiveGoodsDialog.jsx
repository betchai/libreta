import { base44 } from '@/api/base44Client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTenantId } from '@/hooks/useTenantId'
import { Receipt, AlertTriangle, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
const COST_THRESHOLD = 0.15

// onConfirm(toReceive, options) => Promise<{ status, gross, warnings }>
export default function ReceiveGoodsDialog({ open, onOpenChange, po, poItems, onConfirm }) {
    const tenantId = useTenantId()
    const [rows, setRows] = useState([])
    const [paidNow, setPaidNow] = useState(false)
    const [invoiceNo, setInvoiceNo] = useState('')
    const [overReceipt, setOverReceipt] = useState(false)
    const [busy, setBusy] = useState(false)
    const [products, setProducts] = useState({})

    useEffect(() => {
        if (!open || !po) return
        setPaidNow(po.payment_terms === 'COD')
        setInvoiceNo('')
        setOverReceipt(false)
        const fetchProducts = async () => {
            const map = {}
            for (const it of poItems) {
                if (!map[it.product_id]) {
                    const p = (await base44.entities.Product.filter({ id: it.product_id, tenant_id: tenantId }))[0]
                    if (p) map[it.product_id] = p
                }
            }
            setProducts(map)
            setRows(poItems.map(it => ({
                item_id: it.id,
                product_name: it.product_name,
                remaining: (Number(it.quantity_ordered) || 0) - (Number(it.quantity_received) || 0),
                qty: 0,
                actual_cost: it.unit_cost,
                prev_cost: map[it.product_id]?.cost_price || 0,
            })))
        }
        fetchProducts()
    }, [open, po, poItems])

    const setRow = (i, k, v) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
    const warnings = rows.filter(r => Number(r.qty) > 0 && r.prev_cost > 0 && Math.abs(Number(r.actual_cost) - r.prev_cost) / r.prev_cost > COST_THRESHOLD)
    const gross = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.actual_cost) || 0), 0)

    const handleConfirm = async () => {
        const toReceive = rows.filter(r => Number(r.qty) > 0).map(r => ({ item_id: r.item_id, quantity_received: Number(r.qty), actual_unit_cost: Number(r.actual_cost) }))
        if (toReceive.length === 0) { toast.error('Enter a quantity to receive'); return }
        setBusy(true)
        try {
            const res = await onConfirm(toReceive, { paid_now: paidNow, invoice_number: invoiceNo, over_receipt: overReceipt })
            ;(res.warnings || []).forEach((w) => toast.warning(typeof w === 'string' ? w : `${w.product_name}: cost ${w.direction} ${w.drift}%`))
            toast.success(`Received — PO now ${res.status} (₱${Number(res.gross).toFixed(2)})`)
            onOpenChange(false)
        } catch (e) {
            toast.error('Receive failed: ' + (e?.message || e))
        } finally { setBusy(false) }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Receive Items — {po?.po_number}</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="space-y-1"><Label>Supplier Invoice / Receipt No.</Label><Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Required to claim input VAT" /></div>
                    <div className="border rounded-lg">
                        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-xs font-medium text-slate-600">
                            <div className="col-span-4">Product</div><div className="col-span-2">Remaining</div><div className="col-span-2">Receive Qty</div><div className="col-span-2">Actual Unit Cost</div><div className="col-span-2 text-right">Total</div>
                        </div>
                        {rows.map((r, i) => {
                            const drift = r.prev_cost > 0 && Number(r.qty) > 0 ? Math.abs(Number(r.actual_cost) - r.prev_cost) / r.prev_cost : 0
                            const overLimit = Number(r.qty) > r.remaining
                            return (
                                <div key={r.item_id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-t">
                                    <div className="col-span-4 text-sm min-w-0">
                                        <span className="block truncate">{r.product_name}</span>
                                        {drift > COST_THRESHOLD && <span className="block text-xs text-amber-600"><AlertTriangle className="w-3 h-3 inline mr-1 shrink-0" />{Number(r.actual_cost) > r.prev_cost ? 'Increase' : 'Decrease'} {Math.round(drift * 100)}% vs last avg ₱{r.prev_cost.toFixed(2)}</span>}
                                    </div>
                                    <div className="col-span-2 text-sm text-slate-600">{r.remaining}</div>
                                    <Input className="col-span-2 h-8" type="number" step="0.01" value={r.qty} onChange={e => setRow(i, 'qty', e.target.value)} />
                                    <Input className="col-span-2 h-8" type="number" step="0.01" value={r.actual_cost} onChange={e => setRow(i, 'actual_cost', e.target.value)} />
                                    <div className="col-span-2 text-right text-sm font-medium whitespace-nowrap">₱{((Number(r.qty) || 0) * (Number(r.actual_cost) || 0)).toFixed(2)}</div>
                                    {overLimit && !overReceipt && <div className="col-span-12 text-xs text-red-600">Receiving exceeds remaining — enable over-receipt to allow.</div>}
                                </div>
                            )
                        })}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2"><Switch checked={paidNow} onCheckedChange={setPaidNow} /><Label>Paid now (Cash)</Label></div>
                        <div className="flex items-center gap-2"><Switch checked={overReceipt} onCheckedChange={setOverReceipt} /><Label>Allow over-receipt</Label></div>
                        <div className="ml-auto text-sm font-medium">Gross: ₱{gross.toFixed(2)}</div>
                    </div>
                    {warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 space-y-1">
                            {warnings.map((w, i) => <div key={i} className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{w.product_name}: cost moved {Math.round(Math.abs(Number(w.actual_cost) - w.prev_cost) / w.prev_cost * 100)}% from last average — review suggested selling price.</div>)}
                        </div>
                    )}
                    {!paidNow && <p className="text-xs text-slate-500">On-account receipt — this increases Accounts Payable for {po?.supplier_name}.</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={busy} className="bg-pink hover:bg-pink/90">{busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirm Receipt</> : 'Confirm Receipt'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
