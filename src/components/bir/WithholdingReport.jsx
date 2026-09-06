import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useBirData } from '@/hooks/useBirData'
import { useSettings } from '@/hooks/useSettings'
import { downloadCSV } from '@/lib/bookkeeping'
import { parseStoredDate, manilaMonthRange } from '@/lib/manilaTime'
import { MONTHS } from '@/lib/vat'
import { EWT_RATES } from '@/lib/bir'
import { Download, Info, AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'

const QUARTER_MONTHS = [
  { q: 'Q1', months: [0, 1, 2] }, { q: 'Q2', months: [3, 4, 5] },
  { q: 'Q3', months: [6, 7, 8] }, { q: 'Q4', months: [9, 10, 11] },
]

export default function WithholdingReport() {
    const { restocks, expenses, isLoading } = useBirData()
    const { settings } = useSettings()
    const [year, setYear] = useState(new Date().getFullYear())
    const [goodsRate, setGoodsRate] = useState(EWT_RATES.goods)
    const [servicesRate, setServicesRate] = useState(EWT_RATES.services)

    const goods = Number(goodsRate) || 0
    const services = Number(servicesRate) || 0

    const monthRows = useMemo(() => {
        return MONTHS.map((_, mi) => {
            const { from, to } = manilaMonthRange(year, mi)
            const goodsBase = restocks
                .filter(r => { const d = parseStoredDate(r.created_date); return d >= from && d <= to })
                .reduce((a, r) => a + (Number(r.purchase_cost) || 0), 0)
            const servicesBase = (expenses || [])
                .filter(e => { const d = parseStoredDate(e.date); return d >= from && d <= to })
                .reduce((a, e) => a + (Number(e.amount) || 0), 0)
            const ewtGoods = goodsBase * goods
            const ewtServices = servicesBase * services
            const total = ewtGoods + ewtServices
            return { month: MONTHS[mi], goodsBase, servicesBase, ewtGoods, ewtServices, total, remit: mi % 3 === 2 ? '1601-EQ' : '0619-E' }
        })
    }, [restocks, expenses, year, goods, services])

    const yearly = monthRows.reduce((a, r) => ({
        goodsBase: a.goodsBase + r.goodsBase, servicesBase: a.servicesBase + r.servicesBase,
        ewtGoods: a.ewtGoods + r.ewtGoods, ewtServices: a.ewtServices + r.ewtServices, total: a.total + r.total,
    }), { goodsBase: 0, servicesBase: 0, ewtGoods: 0, ewtServices: 0, total: 0 })

    const quarterRows = QUARTER_MONTHS.map(qm => {
        const rows = qm.months.map(mi => monthRows[mi])
        const monthly = rows.slice(0, 2).reduce((a, r) => a + r.total, 0)
        const eq = rows[2].total
        return { q: qm.q, monthly, eq, total: monthly + eq }
    })

    const certs = useMemo(() => {
        const map = {}
        restocks.forEach(r => {
            const key = r.supplier_name || '—'
            map[key] = map[key] || { vendor: key, kind: 'Goods', base: 0, ewt: 0 }
            map[key].base += Number(r.purchase_cost) || 0
            map[key].ewt += (Number(r.purchase_cost) || 0) * goods
        })
        ;(expenses || []).forEach(e => {
            const key = e.payee || '— (misc expense)'
            map[key] = map[key] || { vendor: key, kind: 'Services', base: 0, ewt: 0 }
            map[key].base += Number(e.amount) || 0
            map[key].ewt += (Number(e.amount) || 0) * services
        })
        return Object.values(map)
            .filter(v => v.ewt > 0.005)
            .sort((a, b) => b.ewt - a.ewt)
    }, [restocks, expenses, goods, services])

    const exportCSV = () => {
        const headers = ['Month', 'Goods Base', 'Services Base', `EWT Goods (${(goods * 100).toFixed(1)}%)`, `EWT Services (${(services * 100).toFixed(1)}%)`, 'Total WHT', 'Remit Via']
        const rowsArr = monthRows.map(r => [r.month, r.goodsBase.toFixed(2), r.servicesBase.toFixed(2), r.ewtGoods.toFixed(2), r.ewtServices.toFixed(2), r.total.toFixed(2), r.remit])
        rowsArr.push(['Year Total', yearly.goodsBase.toFixed(2), yearly.servicesBase.toFixed(2), yearly.ewtGoods.toFixed(2), yearly.ewtServices.toFixed(2), yearly.total.toFixed(2), ''])
        rowsArr.push([])
        rowsArr.push(['Vendor', 'Kind', 'Base', 'WHT'])
        certs.forEach(c => rowsArr.push([c.vendor, c.kind, c.base.toFixed(2), c.ewt.toFixed(2)]))
        downloadCSV(`withholding_ewt_${year}.csv`, headers, rowsArr)
    }

    const bizName = settings?.business_name || 'This business'

    return (
        <Card>
            <CardHeader>
                <CardTitle>Withholding Tax Worksheets (EWT — 0619-E / 1601-EQ)</CardTitle>
                <CardDescription>Creditable (expanded) withholding tax on purchases and expenses — monthly for months 1–2 of each quarter (0619-E) and by quarterly reconciliation (1601-EQ) for the quarter's third month.</CardDescription>
                <div className="flex flex-wrap items-end gap-3 mt-2">
                    <div className="space-y-1"><Label className="text-xs">Year</Label><Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-[110px]" /></div>
                    <div className="space-y-1"><Label className="text-xs">Standard rate — goods (restocks)</Label><Input type="number" step="0.001" value={goodsRate} onChange={e => setGoodsRate(e.target.value)} className="w-[140px]" /></div>
                    <div className="space-y-1"><Label className="text-xs">Standard rate — services (expenses)</Label><Input type="number" step="0.001" value={servicesRate} onChange={e => setServicesRate(e.target.value)} className="w-[140px]" /></div>
                    <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export</Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? <p className="text-center py-8 text-slate-500">Loading…</p> : (
                    <>
                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800 mb-4 space-y-1">
                            <p className="flex items-center gap-1"><Info className="w-3.5 h-3.5" /> <b>Assumptions:</b> restocks/purchases = goods at {goodsRate * 100}%, expenses/payees = services at {servicesRate * 100}% (EOPT-standard rates). Compute WHT on the income payment net of VAT when the payee is VAT-registered. These worksheets assume {bizName} is registered as a withholding agent for creditable tax — if unsure, consult your accountant.</p>
                        </div>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Month</TableHead>
                                    <TableHead className="text-right">Goods Base</TableHead>
                                    <TableHead className="text-right">Services Base</TableHead>
                                    <TableHead className="text-right">EWT Goods</TableHead>
                                    <TableHead className="text-right">EWT Services</TableHead>
                                    <TableHead className="text-right">Total WHT</TableHead>
                                    <TableHead>Remit via</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {monthRows.map(r => <TableRow key={r.month}>
                                    <TableCell className="font-medium">{r.month}</TableCell>
                                    <TableCell className="text-right">{r.goodsBase.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{r.servicesBase.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{r.ewtGoods.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{r.ewtServices.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-medium">{r.total.toFixed(2)}</TableCell>
                                    <TableCell className="text-xs text-slate-500">{r.remit === '1601-EQ' ? '1601-EQ (quarterly)' : '0619-E (10th)'}</TableCell>
                                </TableRow>)}
                                <TableRow className="bg-slate-50">
                                    <TableCell className="font-bold">Year Total</TableCell>
                                    <TableCell className="text-right font-bold">{yearly.goodsBase.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{yearly.servicesBase.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{yearly.ewtGoods.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{yearly.ewtServices.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{yearly.total.toFixed(2)}</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableBody>
                        </Table>

                        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                            {quarterRows.map(qr => (
                                <div key={qr.q} className="p-4 rounded-lg border bg-violet-50">
                                    <p className="text-xs text-violet-700">Quarter {qr.q} — WHT payable</p>
                                    <div className="mt-1 space-y-0.5">
                                        <p className="text-xs text-slate-500">0619-E: ₱{qr.monthly.toFixed(2)}</p>
                                        <p className="text-xs text-slate-500">1601-EQ: ₱{qr.eq.toFixed(2)}</p>
                                        <p className="text-lg font-bold text-plum">₱{qr.total.toFixed(2)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <h4 className="text-sm font-semibold text-slate-700 mt-5 mb-2">2307 Certificates of Creditable Tax Withheld — by payee ({year})</h4>
                        <Table>
                            <TableHeader>
                                <TableRow><TableHead>Payee</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">Tax Withheld</TableHead></TableRow>
                            </TableHeader>
                            <TableBody>
                                {certs.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-5 text-slate-400">No withholdable payments this year</TableCell></TableRow>
                                    : certs.map(c => (
                                        <TableRow key={c.vendor + c.kind}>
                                            <TableCell className="font-medium">{c.vendor}</TableCell>
                                            <TableCell className="text-slate-500">{c.kind}</TableCell>
                                            <TableCell className="text-right">{c.base.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-medium">{c.ewt.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                            </TableBody>
                        </Table>
                        <p className="text-xs text-slate-400 mt-1">Issue Form 2307 to each payee shown on a separate schedule (or one consolidated certificate per payee), attaching copies to the 1601-EQ/1604-E. This app does not track payroll — compensation WHT (1601-C, annual 1604-C/2316) must come from your payroll system.</p>

                        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <p>Only if {bizName} is actually registered for the creditable withholding tax type in its Certificate of Registration (COR) 2303 should these amounts be remitted. Rates may differ for leased properties, professional fees, or taxpayers classified as large — confirm with your accountant.</p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}