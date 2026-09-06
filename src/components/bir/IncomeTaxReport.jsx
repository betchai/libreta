import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useBirData } from '@/hooks/useBirData'
import { useSettings } from '@/hooks/useSettings'
import { downloadFilingCSV } from '@/lib/bookkeeping'
import { manilaCumulativeRange, parseStoredDate, manilaStartOfDateStr } from '@/lib/manilaTime'
import { QUARTERS, MONTHS } from '@/lib/vat'
import { graduatedIncomeTax, EIGHT_PERCENT, OSD_RATE, VAT_THRESHOLD, SC_PWD_ANNUAL_EXEMPTION } from '@/lib/bir'
import { Download, AlertTriangle } from 'lucide-react'
import { useState, useMemo } from 'react'

const REGIMES = [
  { id: 'itemized', label: 'Graduated — itemized deductions (1701/1701Q)' },
  { id: 'osd', label: 'Graduated — 40% Optional Standard Deduction (1701A/1701Q)' },
  { id: '8', label: '8% on gross receipts (1701A/1701Q, non-VAT ≤ ₱3M)' },
]

export default function IncomeTaxReport() {
    const { sales, saleItems, expenses, expenseCategories, isLoading } = useBirData()
    const { settings } = useSettings()
    const now = new Date()
    const currentQuarter = QUARTERS[Math.floor(now.getMonth() / 3)].id
    const [year, setYear] = useState(now.getFullYear())
    const [period, setPeriod] = useState(currentQuarter)
    const [regime, setRegime] = useState('itemized')
    const [mixedIncome, setMixedIncome] = useState(false)
    const [priorPaid, setPriorPaid] = useState('0')
    const [taxCredits, setTaxCredits] = useState('0')

    const itemsBySale = useMemo(() => {
        const m = {}
        saleItems.forEach(si => { (m[si.sale_id] = m[si.sale_id] || []).push(si) })
        return m
    }, [saleItems])

    const nonDeductibleCategories = useMemo(() => {
        return new Set((expenseCategories || []).filter(c => c.non_deductible).map(c => c.name))
    }, [expenseCategories])

    const isAnnual = period === 'Q4'
    const annualForm = regime === 'itemized' ? '1701' : '1701A'

    const cumulativeRows = useMemo(() => {
        const selIdx = isAnnual ? 3 : QUARTERS.findIndex(x => x.id === period)
        const out = []
        for (let i = 0; i <= selIdx; i++) {
            const q = QUARTERS[i]
            const { from, to } = manilaCumulativeRange(year, q.months[2])
            const inRange = sales.filter(s => s.status === 'Completed'
                && parseStoredDate(s.created_date) >= from && parseStoredDate(s.created_date) <= to)
            const gross = inRange.reduce((a, s) => a + (Number(s.gross_amount) || Number(s.total_amount) || 0), 0)
            const scPwdDiscount = inRange.reduce((a, s) => a + (Number(s.sc_pwd_discount_amount) || 0), 0)
            const otherDiscount = inRange.reduce((a, s) => a + (Number(s.other_discount_amount) || 0), 0)
            const discounts = scPwdDiscount + otherDiscount
            let cogs = 0
            inRange.forEach(s => (itemsBySale[s.id] || []).forEach(si => {
                cogs += (Number(si.cost_price_at_sale) || 0) * (Number(si.quantity) || 0)
            }))
            const periodExpenses = (expenses || []).filter(e => {
                const d = manilaStartOfDateStr(e.date)
                return d >= from && d <= to && !nonDeductibleCategories.has(e.category)
            })
            const opex = periodExpenses.reduce((a, e) => a + (Number(e.amount) || 0), 0)
            const grossIncome = gross - scPwdDiscount - otherDiscount - cogs
            const osd = grossIncome * OSD_RATE
            const netReceipts = gross - scPwdDiscount - otherDiscount
            const taxableBase8 = Math.max(0, netReceipts - (mixedIncome ? 0 : SC_PWD_ANNUAL_EXEMPTION))
            let netTaxable = 0
            let taxDue = 0
            if (regime === '8') {
                netTaxable = taxableBase8
                taxDue = netTaxable * EIGHT_PERCENT
            } else if (regime === 'osd') {
                netTaxable = grossIncome - osd
                taxDue = graduatedIncomeTax(netTaxable)
            } else {
                netTaxable = grossIncome - opex
                taxDue = graduatedIncomeTax(netTaxable)
            }
            const label = isAnnual
                ? (i === 0 ? `Q1 (Jan–${MONTHS[q.months[2]]})` : `Q1–${i + 1} cumulative (Jan–${MONTHS[q.months[2]]})`)
                : (i === 0 ? `Quarter 1 (Jan–${MONTHS[q.months[2]]})` : `Quarter 1–${i + 1} cumulative (Jan–${MONTHS[q.months[2]]})`)
            out.push({ label, gross, scPwdDiscount, otherDiscount, cogs, grossIncome, opex, osd, netReceipts, taxableBase8, netTaxable, taxDue })
        }
        return out
    }, [sales, itemsBySale, expenses, nonDeductibleCategories, year, period, regime, mixedIncome, isAnnual])

    const latest = cumulativeRows[cumulativeRows.length - 1] || { label: '', gross: 0, scPwdDiscount: 0, otherDiscount: 0, cogs: 0, grossIncome: 0, opex: 0, osd: 0, netReceipts: 0, taxableBase8: 0, netTaxable: 0, taxDue: 0 }
    const priorPaidNum = Number(priorPaid) || 0
    const taxCreditsNum = Number(taxCredits) || 0
    const payableRows = cumulativeRows.map(r => ({ ...r, payable: Math.max(0, r.taxDue - priorPaidNum - taxCreditsNum) }))
    const payable = Math.max(0, latest.taxDue - priorPaidNum - taxCreditsNum)

    const breached = regime === '8' && latest.gross > VAT_THRESHOLD

    const exportCSV = () => {
        const headers = ['Cumulative Period', 'Gross Sales', 'Less: SC/PWD', 'Less: Other Disc.', 'Cost of Goods Sold', 'Gross Income', 'Net Taxable/Tax Base', 'Income Tax Due', 'Prior Paid + 2307 Credits', 'Tax Payable']
        const rowsArr = payableRows.map(r => [r.label, r.gross.toFixed(2), r.scPwdDiscount.toFixed(2), r.otherDiscount.toFixed(2), r.cogs.toFixed(2), r.grossIncome.toFixed(2), r.netTaxable.toFixed(2), r.taxDue.toFixed(2), (priorPaidNum + taxCreditsNum).toFixed(2), r.payable.toFixed(2)])
        downloadFilingCSV(`income_tax_${annualForm}_${period}_${year}.csv`, [['Regime', REGIMES.find(r => r.id === regime).label], ['Mixed income earner', mixedIncome ? 'Yes' : 'No'], ['Prior 1701Q payments', priorPaidNum.toFixed(2)], ['2307 CWT credits', taxCreditsNum.toFixed(2)], ['Tax Payable', payable.toFixed(2)]], headers, rowsArr)
    }

    const formNote = isAnnual
        ? `Annual Return (${annualForm}) — covers the full year; due April 15, ${year + 1}. `
        : `Quarterly 1701Q — cumulative through ${period === 'Q1' ? 'Mar' : period === 'Q2' ? 'Jun' : 'Sep'} ${year}; due ${period === 'Q1' ? 'May 15' : period === 'Q2' ? 'Aug 15' : 'Nov 15'}, ${year}. `
    const regimeNote =
        regime === '8' ? `8% × (gross receipts net of discounts${mixedIncome ? ' — no ₱250k reduction for mixed income earners' : ' less ₱250,000 (purely self-employed only)'}), in lieu of graduated rates + percentage tax. Election on the first 1701Q is irrevocable for the year.`
        : regime === 'osd' ? `Net taxable income = gross income − 40% OSD. OSD replaces itemized operating expenses (opex is NOT deducted separately).`
        : `Graduated TRAIN rates on net taxable income (gross − discounts − COGS − itemized opex); first ₱250k at 0%.`

    return (
        <Card>
            <CardHeader>
                <CardTitle>{isAnnual ? `Annual Income Tax Worksheet (${annualForm})` : 'Quarterly Income Tax Worksheet (1701Q — cumulative)'}</CardTitle>
                <CardDescription>{formNote}{regimeNote}</CardDescription>
                <div className="flex flex-wrap items-end gap-3 mt-2">
                    <div className="space-y-1"><Label className="text-xs">Year</Label>
                        <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-[110px]" />
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Period</Label>
                        <Select value={period} onValueChange={setPeriod}>
                            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {QUARTERS.map(q => <SelectItem key={q.id} value={q.id}>{q.id === 'Q4' ? 'Q4 = Annual (1701/1701A)' : q.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Deduction Regime</Label>
                        <Select value={regime} onValueChange={setRegime}>
                            <SelectTrigger className="w-80"><SelectValue /></SelectTrigger>
                            <SelectContent>{REGIMES.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 pb-1"><Switch id="mixed" checked={mixedIncome} onCheckedChange={setMixedIncome} /><Label htmlFor="mixed" className="text-xs">Mixed income earner (also has compensation)</Label></div>
                    <div className="space-y-1"><Label className="text-xs">Prior 1701Q payments this year</Label><Input type="number" value={priorPaid} onChange={e => setPriorPaid(e.target.value)} className="w-[150px]" /></div>
                    <div className="space-y-1"><Label className="text-xs">2307 credits (CWT)</Label><Input type="number" value={taxCredits} onChange={e => setTaxCredits(e.target.value)} className="w-[150px]" /></div>
                    <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export</Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? <p className="text-center py-8 text-slate-500">Loading…</p> : (
                    <>
                        {breached && (
                            <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>Cumulative gross exceeds ₱{VAT_THRESHOLD.toLocaleString()}. The 8% option no longer applies — you must use graduated rates and your business tax switches from percentage tax (3%) to VAT effective the month after breaching. Register the change with the BIR.</span>
                            </div>
                        )}
                        {regime === '8' && settings?.vat_registered !== false && !breached && (
                            <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>Settings have VAT switched ON. The 8% income-tax option is only for non-VAT taxpayers — verify your registration with the BIR before using this worksheet.</span>
                            </div>
                        )}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Cumulative Period</TableHead>
                                    <TableHead className="text-right">Gross Sales</TableHead>
                                    <TableHead className="text-right">Less: Disc.</TableHead>
                                    {(regime === 'itemized' || regime === 'osd') && <TableHead className="text-right">Less: COGS</TableHead>}
                                    {(regime === 'itemized' || regime === 'osd') && <TableHead className="text-right">Gross Income</TableHead>}
                                    {regime === 'itemized' && <TableHead className="text-right">Op. Expenses</TableHead>}
                                    {regime === 'osd' && <TableHead className="text-right">40% OSD</TableHead>}
                                    {regime === '8' && <TableHead className="text-right">Gross Receipts</TableHead>}
                                    {regime === '8' && <TableHead className="text-right">Less ₱250k*</TableHead>}
                                    <TableHead className="text-right">Net Taxable</TableHead>
                                    <TableHead className="text-right">Tax Due</TableHead>
                                    <TableHead className="text-right">Payable</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payableRows.map((r, i) => (
                                    <TableRow key={r.label} className={i === cumulativeRows.length - 1 ? 'bg-pink/10' : ''}>
                                        <TableCell className="font-medium">{r.label}</TableCell>
                                        <TableCell className="text-right">{r.gross.toFixed(2)}</TableCell>
                                        <TableCell className="text-right text-rose-600">{(r.scPwdDiscount + r.otherDiscount).toFixed(2)}</TableCell>
                                        {(regime === 'itemized' || regime === 'osd') && <TableCell className="text-right">{r.cogs.toFixed(2)}</TableCell>}
                                        {(regime === 'itemized' || regime === 'osd') && <TableCell className="text-right">{r.grossIncome.toFixed(2)}</TableCell>}
                                        {regime === 'itemized' && <TableCell className="text-right">{r.opex.toFixed(2)}</TableCell>}
                                        {regime === 'osd' && <TableCell className="text-right">{r.osd.toFixed(2)}</TableCell>}
                                        {regime === '8' && <TableCell className="text-right">{r.netReceipts.toFixed(2)}</TableCell>}
                                        {regime === '8' && <TableCell className="text-right text-slate-400">{mixedIncome ? '—' : SC_PWD_ANNUAL_EXEMPTION.toFixed(2)}</TableCell>}
                                        <TableCell className="text-right font-medium">{r.netTaxable.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">{r.taxDue.toFixed(2)}</TableCell>
                                        <TableCell className="text-right font-bold">{r.payable.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <p className="text-xs text-slate-400 mt-1">*₱250,000 deduction applies once per year and only for purely self-employed individuals (no compensation income). Payable = Tax Due − prior 1701Q payments − 2307 creditable withholding certificates.</p>

                        <div className="mt-4 grid grid-cols-3 md:grid-cols-7 gap-3">
                            <div className="p-4 rounded-lg border bg-slate-50"><p className="text-xs text-slate-500">Gross Sales</p><p className="text-lg font-bold text-slate-800">₱{latest.gross.toFixed(2)}</p></div>
                            <div className="p-4 rounded-lg border bg-rose-50"><p className="text-xs text-rose-500">Less: Disc. + COGS</p><p className="text-lg font-bold text-rose-600">₱{(latest.scPwdDiscount + latest.otherDiscount + latest.cogs).toFixed(2)}</p></div>
                            <div className="p-4 rounded-lg border bg-pink/10"><p className="text-xs text-pink">{regime === '8' ? 'Gross Receipts' : 'Gross Income'}</p><p className="text-lg font-bold text-pink">₱{(regime === '8' ? latest.netReceipts : latest.grossIncome).toFixed(2)}</p></div>
                            <div className="p-4 rounded-lg border bg-slate-50"><p className="text-xs text-slate-500">{regime === '8' ? 'Taxable Base' : 'Net Taxable Income'}</p><p className="text-lg font-bold text-blue-700">₱{latest.netTaxable.toFixed(2)}</p></div>
                            <div className="p-4 rounded-lg border bg-slate-50"><p className="text-xs text-slate-500">Income Tax Due</p><p className="text-lg font-bold text-slate-800">₱{latest.taxDue.toFixed(2)}</p></div>
                            <div className="p-4 rounded-lg border bg-slate-50"><p className="text-xs text-slate-500">Prior Paid + 2307</p><p className="text-lg font-bold text-red-600">₱{(priorPaidNum + taxCreditsNum).toFixed(2)}</p></div>
                            <div className="p-4 rounded-lg border bg-blue-50"><p className="text-xs text-blue-600">Tax Payable</p><p className="text-lg font-bold text-blue-700">₱{payable.toFixed(2)}</p></div>
                        </div>

                        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 space-y-2">
                            <div><b>Depreciation note:</b> Depreciation is recorded at the cash outlay in the month paid. If the business holds significant fixed assets, depreciation should be computed on a schedule — flag this as a manual adjustment area and review with your accountant.</div>
                            <div>Prior quarters' tax already paid and 2307 tax credits are subtracted from the current cumulative tax due to get the amount payable for this period. Non-deductible expense categories (flagged in Setup) are excluded automatically.</div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}