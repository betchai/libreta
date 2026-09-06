import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useTenantId } from '@/hooks/useTenantId'
import { useCreateCustomer, useUpdateCustomer } from '@/hooks/useCustomerData'
import { toast } from 'sonner'

const blank = () => ({ name: '', nickname_or_alias: '', phone: '', address: '', credit_limit: 0, notes: '', is_active: true })

export default function CustomerDialog({ open, onOpenChange, customer, onSaved }) {
    const tenantId = useTenantId()
    const isEdit = !!customer
    const createCustomer = useCreateCustomer()
    const updateCustomer = useUpdateCustomer()
    const [form, setForm] = useState(blank())

    useEffect(() => {
        if (open) {
            setForm(customer ? {
                name: customer.name || '',
                nickname_or_alias: customer.nickname_or_alias || '',
                phone: customer.phone || '',
                address: customer.address || '',
                credit_limit: customer.credit_limit ?? 0,
                notes: customer.notes || '',
                is_active: customer.is_active !== false,
            } : blank())
        }
    }, [customer, open])

    const handleSave = () => {
        if (!form.name.trim()) { toast.error('Name is required'); return }
        const payload = { ...form, name: form.name.trim(), credit_limit: Number(form.credit_limit) || 0, tenant_id: tenantId }
        const action = isEdit
            ? updateCustomer.mutateAsync({ id: customer.id, data: payload })
            : createCustomer.mutateAsync(payload)
        action
            .then(() => { toast.success(isEdit ? 'Customer updated' : 'Customer added'); onOpenChange(false); onSaved?.() })
            .catch((e) => toast.error('Save failed: ' + (e?.message || e)))
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Name *</Label>
                            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Juan Dela Cruz" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Nickname / Alias</Label>
                            <Input value={form.nickname_or_alias} onChange={e => setForm(p => ({ ...p, nickname_or_alias: e.target.value }))} placeholder="Boy" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Phone</Label>
                            <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="0917..." />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Credit Limit (₱)</Label>
                            <Input type="number" min={0} value={form.credit_limit} onChange={e => setForm(p => ({ ...p, credit_limit: e.target.value }))} placeholder="0 = no credit" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Address</Label>
                        <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Brgy. San Isidro..." />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Notes</Label>
                        <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="pays every payday, farm owner in Brgy X" />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Active customer</Label>
                        <Switch checked={form.is_active} onCheckedChange={c => setForm(p => ({ ...p, is_active: c }))} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={createCustomer.isPending || updateCustomer.isPending} className="bg-pink hover:bg-pink/90">
                        {createCustomer.isPending || updateCustomer.isPending ? 'Saving…' : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
