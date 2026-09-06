import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { downloadCSV } from '@/lib/bookkeeping'
import { poEffectiveOutstanding } from '@/lib/purchaseOrders'
import { parseStoredDate, manilaStartOfDateStr, manilaEndOfDateStr, toManilaDisplayDate } from '@/lib/manilaTime'
import { format } from 'date-fns'
import { History, Download } from 'lucide-react'
import { useState, useMemo } from 'react'
function lineTotal(items, poId) {
    return items.filter(i => i.po_id === poId).reduce((s, i) => s + (Number(i.line_total) || 0), 0)
}
function receivedQty(items, poId) {
    return items.filter(i => i.po_id === poId).reduce((s, i) => s + (Number(i.quantity_received) || 0), 0)
}

export default function POReports({ purchaseOrders, poItems, suppliers, costHistory, supplierPayments, stockMovements = [] }) {
    const [tab, setTab] = useState('open')
    const [supplierFilter, setSupplierFilter] = useState('ALL')
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [productFilter, setProductFilter] = useState('ALL')

    const products = useMemo(() => {
        const map = {}
        costHistory.forEach(c => { map[c.product_id] = c.product_name })
        return Object.entries(map).map(([id, name]) => ({ id, name }))
    }, [costHistory])

    const supplierName = (id) => suppliers.find(s => s.id === id)?.name || '—'
    const openPos = purchaseOrders.filter(p => p.status === 'sent' || p.status === 'partially_received')

    const history = useMemo(() => {
        return purchaseOrders.filter(p => {
            if (supplierFilter !== 'ALL' && p.supplier_id !== supplierFilter) return false
            const d = parseStoredDate(p.order_date)
            if (from && d < manilaStartOfDateStr(from)) return false
            if (to && d > manilaEndOfDateStr(to)) return false
            return true
        }).map(p => {
            const total = lineTotal(poItems, p.id)
            const paid = supplierPayments.filter(pm => pm.po_id === p.id).reduce((s, pm) => s + (Number(pm.amount) || 0), 0)
            const receipts = stockMovements.filter(m => m.po_id === p.id && m.reason === 'restock' && m.direction === 'in')
            const hasOnAccount = receipts.some(m => m.paid === false)
            let balance
            if (hasOnAccount) balance = poEffectiveOutstanding(p.id, purchaseOrders, stockMovements, supplierPayments)
            else if (receipts.length > 0) balance = 0 // received & paid at receipt (Cash) — no AP
            else balance = total - paid // not yet received — ordered amount outstanding
            return { ...p, total, paid, balance: Math.max(0, balance) }
        })
    }, [purchaseOrders, poItems, supplierPayments, stockMovements, supplierFilter, from, to])

    const costRows = useMemo(() => {
        return costHistory
            .filter(c => productFilter === 'ALL' || c.product_id === productFilter)
            .map(c => ({ ...c, supplier: supplierName(c.triggering_po_id ? (purchaseOrders.find(p => p.id === c.triggering_po_id)?.supplier_id) : '') }))
    }, [costHistory, productFilter, purchaseOrders])

    const exportOpen = () => downloadCSV('open_purchase_orders.csv', ['PO Number', 'Supplier', 'Order Date', 'Expected', 'Status', 'Total Ordered'], openPos.map(p => [p.po_number, p.supplier_name, p.order_date, p.expected_delivery_date || '', p.status, lineTotal(poItems, p.id).toFixed(2)]))
    const exportHistory = () => downloadCSV('supplier_purchase_history.csv', ['PO Number', 'Supplier', 'Order Date', 'Status', 'Total', 'Paid', 'Balance'], history.map(p => [p.po_number, p.supplier_name, p.order_date, p.status, p.total.toFixed(2), p.paid.toFixed(2), p.balance.toFixed(2)]))
    const exportCost = () => downloadCSV('cost_trend.csv', ['Date', 'Product', 'Prev Avg Cost', 'New Avg Cost', 'Qty Received', 'Actual Unit Cost'], costRows.map(c => [format(toManilaDisplayDate(c.date), 'MMM dd, yyyy HH:mm'), c.product_name, (c.previous_average_cost || 0).toFixed(2), (c.new_average_cost || 0).toFixed(2), c.quantity_received, (c.actual_unit_cost || 0).toFixed(2)]))

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Button size="sm" variant={tab === 'open' ? 'default' : 'outline'} onClick={() => setTab('open')}>Open POs</Button>
                <Button size="sm" variant={tab === 'history' ? 'default' : 'outline'} onClick={() => setTab('history')}>Supplier Purchase History</Button>
                <Button size="sm" variant={tab === 'cost' ? 'default' : 'outline'} onClick={() => setTab('cost')}>Cost Trend</Button>
            </div>

            {tab === 'open' && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Open Purchase Orders</CardTitle><Button variant="outline" size="sm" onClick={exportOpen} disabled={openPos.length === 0}><Download className="w-4 h-4 mr-1" />Export</Button></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>PO Number</TableHead><TableHead>Supplier</TableHead><TableHead>Order Date</TableHead><TableHead>Expected</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {openPos.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-slate-500">No open POs</TableCell></TableRow> : openPos.map(p => <TableRow key={p.id}><TableCell className="font-mono text-xs">{p.po_number}</TableCell><TableCell>{p.supplier_name}</TableCell><TableCell>{p.order_date}</TableCell><TableCell>{p.expected_delivery_date || '—'}</TableCell><TableCell className="capitalize">{p.status.replace('_', ' ')}</TableCell><TableCell className="text-right">₱{lineTotal(poItems, p.id).toFixed(2)}</TableCell></TableRow>)}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {tab === 'history' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Supplier Purchase History</CardTitle>
                        <div className="flex flex-wrap items-end gap-3 mt-2">
                            <div className="space-y-1"><Label className="text-xs">Supplier</Label><Select value={supplierFilter} onValueChange={setSupplierFilter}><SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All Suppliers</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                            <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[150px]" /></div>
                            <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[150px]" /></div>
                            <Button variant="outline" size="sm" onClick={exportHistory} disabled={history.length === 0}><Download className="w-4 h-4 mr-1" />Export</Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>PO Number</TableHead><TableHead>Supplier</TableHead><TableHead>Order Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {history.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-6 text-slate-500">No POs in range</TableCell></TableRow> : history.map(p => <TableRow key={p.id}><TableCell className="font-mono text-xs">{p.po_number}</TableCell><TableCell>{p.supplier_name}</TableCell><TableCell>{p.order_date}</TableCell><TableCell className="capitalize">{p.status.replace('_', ' ')}</TableCell><TableCell className="text-right">₱{p.total.toFixed(2)}</TableCell><TableCell className="text-right">₱{p.paid.toFixed(2)}</TableCell><TableCell className="text-right font-medium">₱{p.balance.toFixed(2)}</TableCell></TableRow>)}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {tab === 'cost' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Cost Trend</CardTitle>
                        <div className="flex flex-wrap items-end gap-3 mt-2">
                            <div className="space-y-1"><Label className="text-xs">Product</Label><Select value={productFilter} onValueChange={setProductFilter}><SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All Products</SelectItem>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                            <Button variant="outline" size="sm" onClick={exportCost} disabled={costRows.length === 0}><Download className="w-4 h-4 mr-1" />Export</Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Prev Avg</TableHead><TableHead className="text-right">New Avg</TableHead><TableHead className="text-right">Qty Received</TableHead><TableHead className="text-right">Actual Unit Cost</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {costRows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-slate-500">No cost changes recorded yet</TableCell></TableRow> : costRows.map((c, i) => <TableRow key={c.id || i}><TableCell className="whitespace-nowrap">{format(toManilaDisplayDate(c.date), 'MMM dd, yyyy HH:mm')}</TableCell><TableCell className="font-medium">{c.product_name}</TableCell><TableCell className="text-right">₱{(c.previous_average_cost || 0).toFixed(2)}</TableCell><TableCell className="text-right font-medium">₱{(c.new_average_cost || 0).toFixed(2)}</TableCell><TableCell className="text-right">{c.quantity_received}</TableCell><TableCell className="text-right">₱{(c.actual_unit_cost || 0).toFixed(2)}</TableCell></TableRow>)}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
