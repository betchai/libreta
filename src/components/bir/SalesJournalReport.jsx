import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useBirData } from '@/hooks/useBirData'
import { downloadCSV } from '@/lib/bookkeeping'
import { parseStoredDate, manilaStartOfDateStr, manilaEndOfDateStr, toManilaDisplayDate } from '@/lib/manilaTime'
import { format } from 'date-fns'
import { Download, Receipt } from 'lucide-react'
import { useState, useMemo } from 'react'
export default function SalesJournalReport() {
    const { sales, saleItems, isLoading } = useBirData()
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')

    const itemsBySale = useMemo(() => {
        const m = {}
        saleItems.forEach(si => { (m[si.sale_id] = m[si.sale_id] || []).push(si) })
        return m
    }, [saleItems])

    const rows = useMemo(() => {
        return sales.filter(s => s.status === 'Completed')
            .map(s => {
                const items = itemsBySale[s.id] || []
                const vatable = items.reduce((a, si) => a + (Number(si.vatable_sales) || 0), 0)
                const vat = items.reduce((a, si) => a + (Number(si.output_vat) || 0), 0)
                const exempt = items.reduce((a, si) => a + (Number(si.vat_exempt_sales) || 0), 0)
                return { date: parseStoredDate(s.created_date), receipt: s.id, customer: 'Walk-in customer', vatable, vat, exempt, total: Number(s.total_amount) || 0 }
            })
            .filter(r => {
                if (from && r.date < manilaStartOfDateStr(from)) return false
                if (to && r.date > manilaEndOfDateStr(to)) return false
                return true
            })
            .sort((a, b) => a.date - b.date)
    }, [sales, itemsBySale, from, to])

    const totals = rows.reduce((a, r) => ({ vatable: a.vatable + r.vatable, vat: a.vat + r.vat, exempt: a.exempt + r.exempt, total: a.total + r.total }), { vatable: 0, vat: 0, exempt: 0, total: 0 })

    const exportCSV = () => {
        const headers = ['Date', 'Receipt/Invoice No.', 'Customer', 'Vatable Sales', 'VAT', 'Vat-Exempt Sales', 'Total']
        const rowsArr = rows.map(r => [format(toManilaDisplayDate(r.date), 'MMM dd, yyyy'), r.receipt, r.customer, r.vatable.toFixed(2), r.vat.toFixed(2), r.exempt.toFixed(2), r.total.toFixed(2)])
        downloadCSV('sales_journal.csv', headers, rowsArr)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Sales Journal</CardTitle>
                <CardDescription>Book of Accounts — chronological record of completed sales</CardDescription>
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
                                <TableHead>Date</TableHead><TableHead>Receipt No.</TableHead><TableHead>Customer</TableHead>
                                <TableHead className="text-right">Vatable Sales</TableHead><TableHead className="text-right">VAT</TableHead><TableHead className="text-right">Vat-Exempt</TableHead><TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-6 text-slate-500">No sales in range</TableCell></TableRow> : rows.map(r => (
                                <TableRow key={r.receipt}>
                                    <TableCell className="whitespace-nowrap">{format(toManilaDisplayDate(r.date), 'MMM dd, yyyy')}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.receipt.slice(0, 12)}</TableCell>
                                    <TableCell>{r.customer}</TableCell>
                                    <TableCell className="text-right">{r.vatable.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{r.vat.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{r.exempt.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-medium">{r.total.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="bg-slate-50"><TableCell colSpan={3} className="font-bold">Totals</TableCell><TableCell className="text-right font-bold">{totals.vatable.toFixed(2)}</TableCell><TableCell className="text-right font-bold">{totals.vat.toFixed(2)}</TableCell><TableCell className="text-right font-bold">{totals.exempt.toFixed(2)}</TableCell><TableCell className="text-right font-bold">{totals.total.toFixed(2)}</TableCell></TableRow>
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
