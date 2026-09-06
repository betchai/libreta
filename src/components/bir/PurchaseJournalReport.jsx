import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useBirData } from '@/hooks/useBirData'
import { downloadCSV } from '@/lib/bookkeeping'
import { parseStoredDate, manilaStartOfDateStr, manilaEndOfDateStr, toManilaDisplayDate } from '@/lib/manilaTime'
import { format } from 'date-fns'
import { Download } from 'lucide-react'
import { useState, useMemo } from 'react'
export default function PurchaseJournalReport() {
    const { restocks, isLoading } = useBirData()
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')

    const rows = useMemo(() => {
        return restocks.map(r => ({
            date: parseStoredDate(r.created_date),
            supplier: r.supplier_name || '—',
            invoice: r.invoice_or_receipt_number || '—',
            cost: Number(r.purchase_cost) || 0,
            inputVat: Number(r.input_vat) || 0,
            nonCreditable: r.non_creditable,
            total: (Number(r.purchase_cost) || 0),
            id: r.id,
        }))
            .filter(r => {
                if (from && r.date < manilaStartOfDateStr(from)) return false
                if (to && r.date > manilaEndOfDateStr(to)) return false
                return true
            })
            .sort((a, b) => a.date - b.date)
    }, [restocks, from, to])

    const totals = rows.reduce((a, r) => ({ cost: a.cost + r.cost, inputVat: a.inputVat + r.inputVat }), { cost: 0, inputVat: 0 })

    const exportCSV = () => {
        const headers = ['Date', 'Supplier', 'Invoice No.', 'Purchase Cost', 'Input VAT', 'Total']
        const rowsArr = rows.map(r => [format(toManilaDisplayDate(r.date), 'MMM dd, yyyy'), r.supplier, r.invoice, r.cost.toFixed(2), r.inputVat.toFixed(2), r.total.toFixed(2)])
        downloadCSV('purchase_journal.csv', headers, rowsArr)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Purchase Journal</CardTitle>
                <CardDescription>Book of Accounts — chronological record of restocks/purchases</CardDescription>
                <div className="flex flex-wrap items-end gap-3 mt-2">
                    <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[150px]" /></div>
                    <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[150px]" /></div>
                    <Button variant="outline" onClick={exportCSV} disabled={rows.length === 0}><Download className="w-4 h-4 mr-2" />Export</Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? <p className="text-center py-8 text-slate-500">Loading…</p> : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Invoice No.</TableHead>
                                <TableHead className="text-right">Purchase Cost</TableHead><TableHead className="text-right">Input VAT</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-center">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-6 text-slate-500">No purchases in range</TableCell></TableRow> : rows.map(r => (
                                <TableRow key={r.id}>
                                    <TableCell className="whitespace-nowrap">{format(toManilaDisplayDate(r.date), 'MMM dd, yyyy')}</TableCell>
                                    <TableCell>{r.supplier}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.invoice}</TableCell>
                                    <TableCell className="text-right">{r.cost.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{r.inputVat.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-medium">{r.total.toFixed(2)}</TableCell>
                                    <TableCell className="text-center">
                                        {r.nonCreditable ? <Badge variant="destructive" className="text-xs">Non-creditable</Badge> : <Badge className="bg-pink/15 text-pink hover:bg-pink/15 text-xs">Creditable</Badge>}
                                    </TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="bg-slate-50"><TableCell colSpan={3} className="font-bold">Totals</TableCell><TableCell className="text-right font-bold">{totals.cost.toFixed(2)}</TableCell><TableCell className="text-right font-bold">{totals.inputVat.toFixed(2)}</TableCell><TableCell className="text-right font-bold">{totals.cost.toFixed(2)}</TableCell><TableCell /></TableRow>
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
