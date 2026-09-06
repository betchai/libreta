import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useBirData } from '@/hooks/useBirData'
import { useSettings } from '@/hooks/useSettings'
import { downloadFilingCSV } from '@/lib/bookkeeping'
import { parseStoredDate, manilaStartOfDateStr, manilaEndOfDateStr, toManilaDisplayDate } from '@/lib/manilaTime'
import { format } from 'date-fns'
import { Download, Receipt } from 'lucide-react'
import { useState, useMemo } from 'react'
export default function ScPwdDiscountReport() {
    const { sales, saleItems, isLoading } = useBirData()
    const { settings } = useSettings()
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')

    const itemsBySale = useMemo(() => {
        const m = {}
        saleItems.forEach(si => { (m[si.sale_id] = m[si.sale_id] || []).push(si) })
        return m
    }, [saleItems])

    const saleById = useMemo(() => {
        const m = {}
        sales.forEach(s => { m[s.id] = s })
        return m
    }, [sales])

    const rows = useMemo(() => {
        const out = []
        saleItems.forEach(si => {
            if (si.discount_type !== 'senior_citizen' && si.discount_type !== 'pwd') return
            const sale = saleById[si.sale_id]
            if (!sale) return
            if (sale.status === 'Voided') return
            const date = parseStoredDate(sale.created_date)
            if (from && date < manilaStartOfDateStr(from)) return
            if (to && date > manilaEndOfDateStr(to)) return
            out.push({
                date, receipt: sale.id, product: si.product_name,
                customer: si.discount_person_name || sale.customer_name || '—',
                idNumber: si.discount_id_number || '—',
                discountType: si.discount_type === 'senior_citizen' ? 'Senior Citizen' : 'PWD',
                discountAmount: Number(si.discount_amount) || 0,
                cashier: sale.cashier_name || '—',
            })
        })
        return out.sort((a, b) => a.date - b.date)
    }, [saleItems, saleById, from, to])

    const totalDiscount = rows.reduce((s, r) => s + r.discountAmount, 0)

    const exportCSV = () => {
        const headerLines = [
            ['Report', 'Senior Citizen / PWD Discount Report'],
            ['Taxpayer Name', settings.business_name || '—'],
            ['Business Type', settings.business_type || '—'],
            ['Period From', from || '—'],
            ['Period To', to || '—'],
            ['Generated', new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })],
        ]
        const headers = ['Date', 'Receipt/Transaction No.', 'Product', 'Customer/Qualified Person', 'ID Number', 'Discount Type', 'Discount Amount', 'Cashier']
        const rowsArr = rows.map(r => [format(toManilaDisplayDate(r.date), 'MMM dd, yyyy'), r.receipt, r.product, r.customer, r.idNumber, r.discountType, r.discountAmount.toFixed(2), r.cashier])
        rowsArr.push([])
        rowsArr.push(['TOTAL', '', '', '', '', '', totalDiscount.toFixed(2), ''])
        downloadFilingCSV(`sc_pwd_discount_report_${from || 'all'}_to_${to || 'now'}.csv`, headerLines, headers, rowsArr)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Senior Citizen / PWD Discount Report</CardTitle>
                <CardDescription>Itemized statutory discounts given (BIR requirement). The period total is used as an itemized deduction on the 1701Q Income Tax Worksheet.</CardDescription>
                <div className="flex flex-wrap items-end gap-3 mt-2">
                    <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[150px]" /></div>
                    <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[150px]" /></div>
                    <Button variant="outline" onClick={exportCSV} disabled={rows.length === 0}><Download className="w-4 h-4 mr-2" />Export</Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? <p className="text-center py-8 text-slate-500">Loading…</p> : (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead><TableHead>Receipt No.</TableHead><TableHead>Product</TableHead><TableHead>Qualified Person</TableHead><TableHead>ID Number</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Discount</TableHead><TableHead>Cashier</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-6 text-slate-500">No SC/PWD discounts in this period</TableCell></TableRow> : rows.map((r, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="whitespace-nowrap">{format(toManilaDisplayDate(r.date), 'MMM dd, yyyy')}</TableCell>
                                        <TableCell className="font-mono text-xs">{r.receipt.slice(0, 12)}</TableCell>
                                        <TableCell>{r.product}</TableCell><TableCell>{r.customer}</TableCell>
                                        <TableCell className="font-mono text-xs">{r.idNumber}</TableCell><TableCell>{r.discountType}</TableCell>
                                        <TableCell className="text-right font-medium text-rose-600">₱{r.discountAmount.toFixed(2)}</TableCell>
                                        <TableCell className="text-xs">{r.cashier}</TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="bg-slate-50"><TableCell colSpan={6} className="font-bold">Period Total</TableCell><TableCell className="text-right font-bold text-rose-600">₱{totalDiscount.toFixed(2)}</TableCell><TableCell /></TableRow>
                            </TableBody>
                        </Table>
                        <p className="text-xs text-slate-400 mt-3">Voided sales are excluded. This total flows to the "Less: SC/PWD Discounts" line on the 1701Q Income Tax Worksheet as an itemized deduction from gross income.</p>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
