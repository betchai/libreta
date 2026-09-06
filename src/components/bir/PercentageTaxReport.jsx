import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useBirData } from '@/hooks/useBirData'
import { useSettings } from '@/hooks/useSettings'
import { downloadFilingCSV } from '@/lib/bookkeeping'
import { manilaMonthRange, parseStoredDate } from '@/lib/manilaTime'
import { QUARTERS, MONTHS } from '@/lib/vat'
import { Download } from 'lucide-react'
import { useState, useMemo } from 'react'
const PERCENTAGE_TAX_RATE = 0.03

export default function PercentageTaxReport() {
    const { sales, isLoading } = useBirData()
    const { settings } = useSettings()
    const [year, setYear] = useState(new Date().getFullYear())
    const [quarter, setQuarter] = useState('Q3')

    const monthRows = useMemo(() => {
        const q = QUARTERS.find(x => x.id === quarter)
        return q.months.map(mi => {
            const { from, to } = manilaMonthRange(year, mi)
            const monthSales = sales.filter(s => s.status === 'Completed'
                && parseStoredDate(s.created_date) >= from && parseStoredDate(s.created_date) <= to)
            const grossBeforeDiscount = monthSales.reduce((sum, s) => sum + (Number(s.gross_amount) || Number(s.total_amount) || 0), 0)
            const totalDiscount = monthSales.reduce((sum, s) => sum + (Number(s.total_discount_amount) || 0), 0)
            const grossReceipts = monthSales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
            const taxDue = grossReceipts * PERCENTAGE_TAX_RATE
            return { month: MONTHS[mi], grossBeforeDiscount, totalDiscount, grossReceipts, taxDue, count: monthSales.length }
        })
    }, [sales, year, quarter])

    const totals = monthRows.reduce((a, r) => ({
        grossBeforeDiscount: a.grossBeforeDiscount + r.grossBeforeDiscount,
        totalDiscount: a.totalDiscount + r.totalDiscount,
        grossReceipts: a.grossReceipts + r.grossReceipts,
        taxDue: a.taxDue + r.taxDue,
        count: a.count + r.count,
    }), { grossBeforeDiscount: 0, totalDiscount: 0, grossReceipts: 0, taxDue: 0, count: 0 })

    const item14TaxDue = totals.taxDue

    const exportCSV = () => {
        const headerLines = [
            ['BIR Form', '2551Q — Quarterly Percentage Tax Return'],
            ['Taxpayer Name', settings.business_name || '—'],
            ['Business Type', settings.business_type || '—'],
            ['Quarter', quarter],
            ['Year', String(year)],
            ['Tax Rate', '3% of gross sales/receipts'],
            ['Eligibility', 'Non-VAT taxpayer, annual gross sales ≤ ₱3,000,000'],
            ['Generated', new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })],
        ]
        const headers = ['Month', 'Gross Before Discount', 'Less: Total Discounts', 'Net Gross Receipts', 'Percentage Tax (3%)', 'Completed Sales Count']
        const rows = monthRows.map(r => [r.month, r.grossBeforeDiscount.toFixed(2), r.totalDiscount.toFixed(2), r.grossReceipts.toFixed(2), r.taxDue.toFixed(2), r.count])
        rows.push(['Quarter Total', totals.grossBeforeDiscount.toFixed(2), totals.totalDiscount.toFixed(2), totals.grossReceipts.toFixed(2), totals.taxDue.toFixed(2), totals.count])
        rows.push([])
        rows.push(['Item 14 — Total Tax Due (Schedule 1)', item14TaxDue.toFixed(2)])
        rows.push(['Item 20B — Total Tax Payable', item14TaxDue.toFixed(2)])
        downloadFilingCSV(`percentage_tax_2551Q_${quarter}_${year}.csv`, headerLines, headers, rows)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Quarterly Percentage Tax (2551Q Worksheet)</CardTitle>
                <CardDescription>Non-VAT taxpayers: 3% of gross sales/receipts per quarter (BIR Form 2551Q, Jan 2018 ENCS).</CardDescription>
                <div className="flex flex-wrap items-end gap-3 mt-2">
                    <div className="space-y-1"><Label className="text-xs">Year</Label>
                        <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-[110px]" />
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Quarter</Label>
                        <Select value={quarter} onValueChange={setQuarter}>
                            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{QUARTERS.map(q => <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export</Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? <p className="text-center py-8 text-slate-500">Loading…</p> : (
                    <>
                        <p className="text-sm text-slate-500 mb-3">Schedule 1 — Percentage tax computation by month. Tax is based on actual gross receipts (net of all SC/PWD and other discounts). The quarterly total flows to Item 14 (Total Tax Due) on Form 2551Q.</p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Month</TableHead>
                                    <TableHead className="text-right">Gross Before Disc.</TableHead>
                                    <TableHead className="text-right">Less: Discounts</TableHead>
                                    <TableHead className="text-right">Net Gross Receipts</TableHead>
                                    <TableHead className="text-right">Percentage Tax (3%)</TableHead>
                                    <TableHead className="text-right">Sales Count</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {monthRows.map(r => <TableRow key={r.month}><TableCell className="font-medium">{r.month}</TableCell><TableCell className="text-right">{r.grossBeforeDiscount.toFixed(2)}</TableCell><TableCell className="text-right text-rose-600">{r.totalDiscount.toFixed(2)}</TableCell><TableCell className="text-right font-medium">{r.grossReceipts.toFixed(2)}</TableCell><TableCell className="text-right">{r.taxDue.toFixed(2)}</TableCell><TableCell className="text-right">{r.count}</TableCell></TableRow>)}
                                <TableRow className="bg-slate-50">
                                    <TableCell className="font-bold">Quarter Total</TableCell>
                                    <TableCell className="text-right font-bold">{totals.grossBeforeDiscount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold text-rose-600">{totals.totalDiscount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{totals.grossReceipts.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{totals.taxDue.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{totals.count}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                        <div className="mt-6 space-y-2">
                            <h4 className="text-sm font-semibold text-slate-700">Form 2551Q — Summary</h4>
                            <div className="rounded-lg border divide-y">
                                <div className="flex justify-between items-center p-3"><span className="text-sm text-slate-600">Item 14 — Total Tax Due (from Schedule 1)</span><span className="font-semibold">₱{item14TaxDue.toFixed(2)}</span></div>
                                <div className="flex justify-between items-center p-3 bg-slate-50"><span className="text-sm text-slate-600">Item 20B — Total Tax Payable</span><span className="text-xl font-bold text-pink">₱{item14TaxDue.toFixed(2)}</span></div>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Assumes no prior-quarter tax credits/payments to deduct (Item 17 = 0). For non-VAT businesses with annual gross sales ≤ ₱3,000,000. Verify eligibility and rate with your tax preparer before filing.</p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
