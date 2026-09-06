import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useTenantId } from '@/hooks/useTenantId'
import { useCustomerData } from '@/hooks/useCustomerData'
import { useSettings } from '@/hooks/useSettings'
import { entriesForCustomer, computeBalance, recordAdjustment } from '@/lib/customerCredit'
import RecordPaymentDialog from '@/components/customers/RecordPaymentDialog'
import { format } from 'date-fns'
import { toManilaDisplayDate } from '@/lib/manilaTime'
import { HandCoins, Printer, Plus } from 'lucide-react'
import { toast } from 'sonner'

const money = (n) => `₱${(Number(n) || 0).toFixed(2)}`

export default function CustomerStatement({ open, onOpenChange, customer }) {
    const tenantId = useTenantId()
    const { entries, outstandingFor, invalidateAll } = useCustomerData()
    const { settings } = useSettings()
    const [payOpen, setPayOpen] = useState(false)
    const [adjAmount, setAdjAmount] = useState('')
    const [adjNote, setAdjNote] = useState('')
    const [savingAdj, setSavingAdj] = useState(false)

    if (!customer) return null
    const ledger = entriesForCustomer(entries, customer.id)
    const balance = computeBalance(ledger)
    const outstanding = outstandingFor(customer.id)

    const handleAdjustment = () => {
        const amt = Number(adjAmount) || 0
        if (!amt) { toast.error('Enter a non-zero amount (use negative to reduce)'); return }
        if (!adjNote.trim()) { toast.error('A reason is required'); return }
        setSavingAdj(true)
        recordAdjustment(tenantId, { customer, amount: amt, note: adjNote.trim(), recordedBy: 'Admin' })
            .then(() => { setAdjAmount(''); setAdjNote(''); toast.success('Adjustment recorded'); invalidateAll() })
            .catch((e) => toast.error(e?.message || 'Adjustment failed'))
            .finally(() => setSavingAdj(false))
    }

    const printStatement = () => {
        const biz = settings.business_name || 'My Store'
        const rows = ledger.map(e => {
            const charge = e.type === 'charge' ? money(e.amount) : ''
            const payment = e.type === 'payment' ? money(e.amount) : ''
            const adj = e.type === 'adjustment' ? money(e.amount) : ''
            return `<tr><td>${format(toManilaDisplayDate(e.date), 'MMM dd, yyyy')}</td><td>${e.note || ''}</td><td class="r">${charge}</td><td class="r">${payment}</td><td class="r">${adj}</td><td class="r">${money(e.running_balance)}</td></tr>`
        }).join('')
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement ${customer.name}</title>
        <style>body{font-family:'Courier New',monospace;padding:6mm;font-size:12px;color:#000}h2{text-align:center}.dashed{border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:2px 4px;text-align:left}.r{text-align:right}tfoot td{font-weight:bold;border-top:1px solid #000}</style></head><body>
        <h2>${biz}</h2><div class="dashed"></div>
        <div>Customer: ${customer.name}</div>
        ${customer.phone ? `<div>Phone: ${customer.phone}</div>` : ''}
        <div class="dashed"></div>
        <table><thead><tr><th>Date</th><th>Description</th><th>Charge</th><th>Payment</th><th>Adjustment</th><th>Balance</th></tr></thead>
        <tbody>${rows || '<tr><td colspan=6>No transactions</td></tr>'}</tbody>
        <tfoot><tr><td colspan=5 style="text-align:right">Current Balance</td><td class="r">${money(balance)}</td></tr></tfoot></table>
        </body></html>`
        const win = window.open('', '_blank', 'width=720,height=640')
        if (!win) { alert('Please allow pop-ups to print.'); return }
        win.document.write(html); win.document.close(); win.focus()
        setTimeout(() => win.print(), 350)
    }

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[640px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><HandCoins className="w-5 h-5 text-plum" /> {customer.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3 border">
                            <div>
                                <p className="text-xs text-slate-500">Current balance</p>
                                {balance < 0
                                    ? <p className="text-lg font-bold text-pink">₱{Math.abs(balance).toFixed(2)} credit available</p>
                                    : <p className="text-lg font-bold text-rose-600">₱{balance.toFixed(2)} outstanding</p>}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={printStatement}><Printer className="w-4 h-4 mr-1" /> Print</Button>
                                <Button size="sm" className="bg-pink hover:bg-pink/90" onClick={() => setPayOpen(true)}><HandCoins className="w-4 h-4 mr-1" /> Record Payment</Button>
                            </div>
                        </div>
                        <div className="max-h-[320px] overflow-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead><TableHead>Description</TableHead>
                                        <TableHead className="text-right">Charge</TableHead><TableHead className="text-right">Payment</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {ledger.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-6">No transactions yet</TableCell></TableRow>
                                    ) : ledger.map(e => (
                                        <TableRow key={e.id}>
                                            <TableCell className="whitespace-nowrap text-xs">{format(toManilaDisplayDate(e.date), 'MMM dd, yyyy')}</TableCell>
                                            <TableCell className="text-xs">
                                                <div>{e.note || e.type}</div>
                                                <Badge variant="outline" className="text-[10px] capitalize">{e.type}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right text-xs">{e.type === 'charge' ? money(e.amount) : e.type === 'adjustment' && e.amount > 0 ? money(e.amount) : ''}</TableCell>
                                            <TableCell className="text-right text-xs">{e.type === 'payment' ? money(e.amount) : e.type === 'adjustment' && e.amount < 0 ? money(Math.abs(e.amount)) : ''}</TableCell>
                                            <TableCell className="text-right text-xs font-medium">{money(e.running_balance)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="border rounded-lg p-3 space-y-2 bg-amber-50/30">
                            <p className="text-xs font-medium text-amber-800">Admin Adjustment (correction)</p>
                            <div className="flex gap-2 items-end">
                                <div className="space-y-1 flex-1">
                                    <Label className="text-xs">Amount (negative to reduce)</Label>
                                    <Input type="number" step="0.01" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="-100.00" />
                                </div>
                                <div className="space-y-1 flex-[2]">
                                    <Label className="text-xs">Reason *</Label>
                                    <Input value={adjNote} onChange={e => setAdjNote(e.target.value)} placeholder="Correction for overcharge" />
                                </div>
                                <Button size="sm" variant="outline" onClick={handleAdjustment} disabled={savingAdj}><Plus className="w-4 h-4" /></Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} customer={customer} outstanding={outstanding} onPaid={invalidateAll} />
        </>
    )
}
