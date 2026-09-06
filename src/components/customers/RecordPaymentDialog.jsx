import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTenantId } from '@/hooks/useTenantId'
import { useSettings } from '@/hooks/useSettings'
import { useRecordPayment } from '@/hooks/useCustomerData'
import { printPaymentAck } from '@/lib/printReceipt'
import { toast } from 'sonner'
import { format } from 'date-fns'

// Payment date is Manila-based; the recordCustomerPayment helper handles UTC.
export default function RecordPaymentDialog({ open, onOpenChange, customer, outstanding, onPaid }) {
    const tenantId = useTenantId()
    const { settings } = useSettings()
    const recordPayment = useRecordPayment()
    const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [amount, setAmount] = useState('')
    const [method, setMethod] = useState('Cash')
    const [reference, setReference] = useState('')
    const [allowOverpay, setAllowOverpay] = useState(false)

    useEffect(() => {
        if (open) {
            setPaymentDate(format(new Date(), 'yyyy-MM-dd'))
            setAmount('')
            setMethod('Cash')
            setReference('')
            setAllowOverpay(false)
        }
    }, [open])

    const handleSave = () => {
        const amt = Number(amount) || 0
        if (amt <= 0) { toast.error('Enter a payment amount'); return }
        recordPayment.mutate({
            customer,
            paymentDate,
            amount: amt,
            paymentMethod: method,
            referenceNumber: reference,
            receivedBy: 'Admin',
            allowOverpay,
        }, {
            onSuccess: (entry) => {
                try { printPaymentAck({ customer, payment: { id: entry?.id, date: entry?.date || new Date().toISOString(), amount: entry?.amount ?? amt, method, reference, running_balance: entry?.running_balance }, settings, width: '80mm' }) } catch (e) { /* ignore */ }
                toast.success(`Payment of ₱${amt.toFixed(2)} recorded`)
                onOpenChange(false)
                onPaid?.()
            },
            onError: (e) => toast.error(e?.message || 'Payment failed'),
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>Record Payment — {customer?.name}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="flex justify-between text-sm bg-slate-50 rounded-lg p-3 border">
                        <span className="text-slate-500">Current outstanding</span>
                        <span className={`font-bold ${(outstanding || 0) > 0 ? 'text-rose-600' : 'text-pink'}`}>₱{(Number(outstanding) || 0).toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Payment Date</Label>
                            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Amount (₱)</Label>
                            <Input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Method</Label>
                            <Select value={method} onValueChange={setMethod}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Cash">Cash</SelectItem>
                                    <SelectItem value="GCash">GCash</SelectItem>
                                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Reference No.</Label>
                            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="GCash ref (optional)" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox id="ovp" checked={allowOverpay} onCheckedChange={setAllowOverpay} />
                        <label htmlFor="ovp" className="text-sm text-slate-600">Allow overpayment (creates credit-in-hand)</label>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={recordPayment.isPending} className="bg-pink hover:bg-pink/90">{recordPayment.isPending ? 'Saving…' : 'Record Payment'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
