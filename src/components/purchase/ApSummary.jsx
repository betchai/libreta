import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { computeSupplierAp, dueDate } from '@/lib/purchaseOrders'
import { useState, useMemo } from 'react'
export default function ApSummary({ suppliers, purchaseOrders, stockMovements, supplierPayments, onRecordPayment }) {
    const [expanded, setExpanded] = useState(null)

    const { bySupplier, aging } = useMemo(() => {
        const bySupplier = {}
        const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 }
        const now = new Date()

        suppliers.forEach(s => {
            const pos = purchaseOrders.filter(p => p.supplier_id === s.id && p.status !== 'cancelled')
            let outstanding = computeSupplierAp(s.id, purchaseOrders, stockMovements, supplierPayments)
            if (outstanding <= 0.01) return

            let oldestOverdueDays = 0
            pos.forEach(po => {
                const onAcct = stockMovements.filter(m => m.po_id === po.id && m.reason === 'restock' && m.direction === 'in' && m.paid === false).reduce((sum, m) => sum + (Number(m.purchase_cost) || 0), 0)
                const paid = supplierPayments.filter(p => p.po_id === po.id).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
                const poOut = onAcct - paid
                if (poOut > 0.01) {
                    const due = dueDate(po.order_date, po.payment_terms)
                    const days = Math.floor((now - due) / 86400000)
                    if (days > oldestOverdueDays) oldestOverdueDays = days
                }
            })

            let bucket = 'current'
            if (oldestOverdueDays > 90) bucket = 'd90plus'
            else if (oldestOverdueDays > 60) bucket = 'd61_90'
            else if (oldestOverdueDays > 30) bucket = 'd31_60'
            else if (oldestOverdueDays > 0) bucket = 'd1_30'
            aging[bucket] += outstanding
            bySupplier[s.id] = { supplier: s, outstanding, oldestOverdueDays, pos }
        })
        return { bySupplier, aging }
    }, [suppliers, purchaseOrders, stockMovements, supplierPayments])

    const rows = Object.values(bySupplier).sort((a, b) => b.outstanding - a.outstanding)
    const total = rows.reduce((s, r) => s + r.outstanding, 0)
    const bucketLabel = (d) => d <= 0 ? 'Current' : d <= 30 ? '1–30 days' : d <= 60 ? '31–60 days' : d <= 90 ? '61–90 days' : '90+ days'

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[{ label: 'Current', val: aging.current }, { label: '1–30 days', val: aging.d1_30 }, { label: '31–60 days', val: aging.d31_60 }, { label: '61–90 days', val: aging.d61_90 }, { label: '90+ days', val: aging.d90plus }].map(b => (
                    <Card key={b.label}><CardContent className="p-4"><p className="text-xs text-slate-500">{b.label}</p><p className="text-lg font-bold text-slate-800">₱{b.val.toFixed(2)}</p></CardContent></Card>
                ))}
            </div>

            <Card>
                <CardHeader><CardTitle>Accounts Payable — Outstanding by Supplier</CardTitle><CardDescription>Total AP: <b>₱{total.toFixed(2)}</b></CardDescription></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow><TableHead>Supplier</TableHead><TableHead>Terms</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead>Aging</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">No outstanding payables</TableCell></TableRow> : rows.map(r => (
                                <TableRow key={r.supplier.id}>
                                    <TableCell className="font-medium">{r.supplier.name}{r.supplier.is_vat_registered && <Badge className="ml-2 bg-pink/15 text-pink hover:bg-pink/15">VAT</Badge>}</TableCell>
                                    <TableCell>{r.supplier.payment_terms}</TableCell>
                                    <TableCell className="text-right font-medium">₱{r.outstanding.toFixed(2)}</TableCell>
                                    <TableCell><Badge variant="outline">{bucketLabel(r.oldestOverdueDays)}</Badge></TableCell>
                                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => onRecordPayment(r.supplier)}>Record Payment</Button></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
