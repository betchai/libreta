import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useBirData } from '@/hooks/useBirData'
import { useSettings } from '@/hooks/useSettings'
import { downloadFilingCSV } from '@/lib/bookkeeping'
import { manilaMonthRange, parseStoredDate, manilaStartOfDateStr } from '@/lib/manilaTime'
import { MONTHS } from '@/lib/vat'
import { Download, Info } from 'lucide-react'
import { useMemo, useState } from 'react'

export default function VatMonthlyReport() {
    const { sales, saleItems, restocks, expenses, isLoading } = useBirData()
    const { settings } = useSettings()
    const [year, setYear] = useState(new Date().getFullYear())
    const [month, setMonth] = useState(new Date().getMonth())

    const itemsBySale = useMemo(() => {
        const m = {}
        saleItems.forEach(si => { (m[si.sale_id] = m[si.sale_id] || []).push(si) })
        return m
    }, [saleItems])

    const data = useMemo(() => {
        const { from, to } = manilaMonthRange(year, month)
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
        return { count: monthSales.length, vatable, output, exempt, input, net: output - input }
    }, [sales, itemsBySale, restocks, expenses, year, month])

    const exportCSV = () => {
        const headers = ['Month', 'Vatable Sales', 'Output VAT', 'Vat-Exempt Sales', 'Input VAT', 'Net VAT']
        const rowsArr = [[MONTHS[month] + ' ' + year, data.vatable.toFixed(2), data.output.toFixed(2), data.exempt.toFixed(2), data.input.toFixed(2), data.net.toFixed(2)]]
        downloadFilingCSV(`vat_2550M_${MONTHS[month]}_${year}.csv`, [
            ['BIR Form', '2550M — Monthly VAT Declaration (OPTIONAL, RMC 52-2023)'],
            ['Taxpayer Name', settings.business_name || '—'],
            ['Period', `${MONTHS[month]} ${year}`],
            ['VAT Rate', `${Math.round((Number(settings.vat_rate) || 0) * 100)}%`],
            ['VAT-Inclusive Pricing', settings.vat_inclusive ? 'Yes' : 'No'],
        ], headers, rowsArr, [['Net VAT Payable / (Excess Input)', data.net.toFixed(2)]])
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Monthly VAT Worksheet (2550M — optional)</CardTitle>
                <CardDescription>Optional since RMC 52-2023 — filing this monthly is not required as long as the quarterly 2550Q is filed.</CardDescription>
                <div className="flex flex-wrap items-end gap-3 mt-2">
                    <div className="space-y-1"><Label className="text-xs">Year</Label><Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-[110px]" /></div>
                    <div className="space-y-1"><Label className="text-xs">Month</Label>
                        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m} {year}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export</Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? <p className="text-center py-8 text-slate-500">Loading…</p> : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            <Card className="bg-slate-50"><div className="p-3"><p className="text-xs text-slate-500">Sales Count</p><p className="text-lg font-bold text-slate-800">{data.count}</p></div></Card>
                            <Card className="bg-slate-50"><div className="p-3"><p className="text-xs text-slate-500">Vatable Sales</p><p className="text-lg font-bold text-slate-800">₱{data.vatable.toFixed(2)}</p></div></Card>
                            <Card className="bg-slate-50"><div className="p-3"><p className="text-xs text-slate-500">Output VAT</p><p className="text-lg font-bold text-pink">₱{data.output.toFixed(2)}</p></div></Card>
                            <Card className="bg-slate-50"><div className="p-3"><p className="text-xs text-slate-500">Vat-Exempt</p><p className="text-lg font-bold text-slate-800">₱{data.exempt.toFixed(2)}</p></div></Card>
                            <Card className="bg-slate-50"><div className="p-3"><p className="text-xs text-slate-500">Input VAT</p><p className="text-lg font-bold text-blue-600">₱{data.input.toFixed(2)}</p></div></Card>
                            <Card className="bg-blue-50"><div className="p-3"><p className="text-xs text-blue-600">Net VAT</p><p className="text-lg font-bold text-blue-700">₱{data.net.toFixed(2)}</p></div></Card>
                        </div>
                        <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                            <Info className="w-4 h-4 shrink-0" />
                            <p>This is the same VAT math shown in the quarterly 2550Q worksheet but for a single month. If you choose to file the optional 2550M each month, amounts here should roll up exactly to the quarter totals (Jan+Feb+Mar = Q1, etc.). The quarterly 2550Q remains the mandatory filing.</p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}