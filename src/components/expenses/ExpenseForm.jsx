import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { computeExpenseInputVat } from '@/lib/expenses'
import { uploadReceipt } from '@/lib/storage'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const PAYMENT_METHODS = ['Cash', 'GCash', 'Bank Transfer', 'Check']

const emptyForm = () => ({
    date: new Date().toISOString().slice(0, 10),
    category: '',
    category_id: '',
    account_code: '',
    description: '',
    amount: '',
    payment_method: 'Cash',
    payee: '',
    receipt_or_invoice_number: '',
    is_vat_registered_payee: false,
    non_creditable: false,
    recurring: false,
    attached_receipt_image: '',
})

export default function ExpenseForm({ open, onOpenChange, categories, onSave, editing, vatRegistered = true }) {
    const [form, setForm] = useState(emptyForm())
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (open) setForm(editing ? { ...editing } : emptyForm())
    }, [open, editing])

    const handleCategoryChange = (categoryId) => {
        const cat = categories.find((c) => c.id === categoryId)
        if (cat) setForm((f) => ({ ...f, category_id: categoryId, category: cat.name, account_code: cat.account_code }))
    }

    const handleFileUpload = async (file) => {
        if (!file) return
        try {
            const file_url = await uploadReceipt(file)
            setForm((f) => ({ ...f, attached_receipt_image: file_url }))
            toast.success('Receipt uploaded')
        } catch (e) {
            toast.error('Receipt upload failed: ' + (e?.message || e))
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.category_id) { toast.error('Please select a category'); return }
        if (!form.amount || Number(form.amount) <= 0) { toast.error('Please enter a valid amount'); return }
        setBusy(true)
        try {
            await onSave(form)
            onOpenChange(false)
        } catch (err) {
            toast.error('Failed to save expense: ' + (err?.message || err))
        } finally { setBusy(false) }
    }

    const amount = Number(form.amount) || 0
    const inputVat = computeExpenseInputVat(amount, form.is_vat_registered_payee, form.non_creditable, vatRegistered)
    const netExpense = amount - inputVat

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit Expense' : 'Record Expense'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>Date</Label>
                            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Category</Label>
                            <Select value={form.category_id} onValueChange={handleCategoryChange}>
                                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                                <SelectContent>
                                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea placeholder="What was this expense for?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>Amount (gross)</Label>
                            <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Payment Method</Label>
                            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>Payee</Label>
                            <Input placeholder="Supplier, landlord, etc." value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Receipt / Invoice #</Label>
                            <Input placeholder="OR/SI number" value={form.receipt_or_invoice_number} onChange={(e) => setForm({ ...form, receipt_or_invoice_number: e.target.value })} />
                        </div>
                    </div>

                    <div className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="vat-reg">VAT-registered payee</Label>
                            <Switch id="vat-reg" checked={form.is_vat_registered_payee} onCheckedChange={(v) => setForm({ ...form, is_vat_registered_payee: v })} />
                        </div>
                        {form.is_vat_registered_payee && (
                            <div className="flex items-center justify-between">
                                <Label htmlFor="non-cred" className="text-xs text-slate-500">Non-creditable (no valid invoice)</Label>
                                <Switch id="non-cred" checked={form.non_creditable} onCheckedChange={(v) => setForm({ ...form, non_creditable: v })} />
                            </div>
                        )}
                        {form.is_vat_registered_payee && inputVat > 0 && (
                            <div className="text-xs space-y-0.5 pt-1 border-t border-slate-200">
                                <div className="flex justify-between"><span className="text-slate-500">Input VAT (creditable)</span><span className="font-medium text-pink">₱{inputVat.toFixed(2)}</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Net expense</span><span className="font-medium">₱{netExpense.toFixed(2)}</span></div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between">
                        <Label htmlFor="recurring">Recurring expense</Label>
                        <Switch id="recurring" checked={form.recurring} onCheckedChange={(v) => setForm({ ...form, recurring: v })} />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Receipt Image (optional)</Label>
                        {form.attached_receipt_image && (
                            <a href={form.attached_receipt_image} target="_blank" rel="noreferrer" className="text-xs text-pink hover:underline block mb-1">View attached image</a>
                        )}
                        <Input type="file" accept="image/*" onChange={(e) => handleFileUpload(e.target.files?.[0])} />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" className="bg-pink hover:bg-pink/90" disabled={busy}>
                            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {editing ? 'Update' : 'Save'} Expense
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
