import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useBirData } from '@/hooks/useBirData'
import { useSettings } from '@/hooks/useSettings'
import { downloadFilingCSV } from '@/lib/bookkeeping'
import { manilaMonthRange, parseStoredDate, manilaStartOfDateStr } from '@/lib/manilaTime'
import { QUARTERS, MONTHS } from '@/lib/vat'
import { Download } from 'lucide-react'
import { useState, useMemo } from 'react'
export default function VatSummaryReport() {
    const { sales, saleItems, restocks, expenses, isLoading } = useBirData()
    const { settings } = useSettings()
    const [year, setYear] = useState(new Date().getFullYear())
    const [quarter, setQuarter] = useState('Q3')

    const itemsBySale = useMemo(() => {
        const m = {}
        saleItems.forEach(si => { (m[si.sale_id] = m[si.sale_id] || []).push(si) })
        return m
    }, [saleItems])

    const monthRows = useMemo(() => {
        const q = QUARTERS.find(x => x.id === quarter)
        return q.months.map(mi => {
            const { from, to } = manilaMonthRange(year, mi)
            const monthSales = sales.filter(s => s.status === 'Completed'
                && parseStoredDate(s.created_date) >= from && parseStoredDate(s.created_date) <= to)
            let vatable = 0, output = 0, exempt = 0
            monthSales.forEach(s => (itemsBySale[s.id] || []).forEach(si => {
                vatable += Number(si.vatable_sales) || 0
                output += Number(si.output_vat) || 0
                exempt += Number(si.vat_exempt_sales) || 0
            }))
            const monthRestocks = restocks.filter(r => {
                const d = parseStoredDate(r.created_date)
                return d >= from && d <= to
            })
            const purchaseInput = monthRestocks.filter(r => !r.non_creditable).reduce((s, r) => s + (Number(r.input_vat) || 0), 0)
            const monthExpenses = (expenses || []).filter(e => {
                const d = manilaStartOfDateStr(e.date)
                return d >= from && d <= to && !e.non_creditable
            })
            const expenseInput = monthExpenses.reduce((s, e) => s + (Number(e.input_vat) || 0), 0)
            const input = purchaseInput + expenseInput
            return { month: MONTHS[mi], vatable, output, exempt, input, net: output - input }
        })
    }, [sales, itemsBySale, restocks, expenses, year, quarter])

    const totals = monthRows.reduce((a, r) => ({
        vatable: a.vatable + r.vatable, output: a.output + r.output,
        exempt: a.exempt + r.exempt, input: a.input + r.input,
    }), { vatable: 0, output: 0, exempt: 0, input: 0 })
    const netVat = totals.output - totals.input

    const exportCSV = () => {
        const headerLines = [
            ['BIR Form', '2550Q — Quarterly VAT Return'],
            ['Taxpayer Name', settings.business_name || '—'],
            ['Business Type', settings.business_type || '—'],
            ['Quarter', quarter], ['Year', String(year)],
            ['VAT Rate', `${Math.round((Number(settings.vat_rate) || 0) * 100)}%`],
            ['VAT-Inclusive Pricing', settings.vat_inclusive ? 'Yes' : 'No'],
            ['Generated', new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })],
        ]
        const headers = ['Month', 'Vatable Sales', 'Output VAT', 'Vat-Exempt Sales', 'Input VAT', 'Net VAT']
        const rows = monthRows.map(r => [r.month, r.vatable.toFixed(2), r.output.toFixed(2), r.exempt.toFixed(2), r.input.toFixed(2), r.net.toFixed(2)])
        rows.push(['Quarter Total', totals.vatable.toFixed(2), totals.output.toFixed(2), totals.exempt.toFixed(2), totals.input.toFixed(2), netVat.toFixed(2)])
        rows.push([])
        rows.push(['Net VAT Payable', netVat >= 0 ? netVat.toFixed(2) : '0.00'])
        rows.push(['Excess Input VAT (carry over)', netVat < 0 ? Math.abs(netVat).toFixed(2) : '0.00'])
        downloadFilingCSV(`vat_2550Q_${quarter}_${year}.csv`, headerLines, headers, rows)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Quarterly VAT Summary (2550Q Worksheet)</CardTitle>
                <CardDescription>Output VAT vs Input VAT by month within the selected quarter</CardDescription>
                <div className="flex flex-wrap items-end gap-3 mt-2">
                    <div className="space-y-1"><Label className="text-xs">Year</Label><Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-[110px]" /></div>
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
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Month</TableHead>
                                    <TableHead className="text-right">Vatable Sales</TableHead><TableHead className="text-right">Output VAT</TableHead>
                                    <TableHead className="text-right">Vat-Exempt Sales</TableHead><TableHead className="text-right">Input VAT</TableHead><TableHead className="text-right">Net VAT</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {monthRows.map(r => <TableRow key={r.month}><TableCell className="font-medium">{r.month}</TableCell><TableCell className="text-right">{r.vatable.toFixed(2)}</TableCell><TableCell className="text-right">{r.output.toFixed(2)}</TableCell><TableCell className="text-right">{r.exempt.toFixed(2)}</TableCell><TableCell className="text-right">{r.input.toFixed(2)}</TableCell><TableCell className="text-right">{r.net.toFixed(2)}</TableCell></TableRow>)}
                                <TableRow className="bg-slate-50">
                                    <TableCell className="font-bold">Quarter Total</TableCell>
                                    <TableCell className="text-right font-bold">{totals.vatable.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{totals.output.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{totals.exempt.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{totals.input.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{netVat.toFixed(2)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                        <div className="mt-4 p-4 rounded-lg border bg-slate-50 flex justify-between items-center">
                            <span className="font-medium">{netVat >= 0 ? 'Net VAT Payable' : 'Excess Input VAT (carried over)'}</span>
                            <span className={`text-xl font-bold ${netVat >= 0 ? 'text-pink' : 'text-blue-700'}`}>₱{Math.abs(netVat).toFixed(2)}</span>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
