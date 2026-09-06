import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Save } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
const EMPTY = {
  name: '', contact_person: '', phone: '', email: '', address: '',
  tin: '', is_vat_registered: false, payment_terms: 'COD', is_active: true,
}

export default function SupplierDialog({ open, onOpenChange, supplier, onSubmit }) {
  const [form, setForm] = useState(EMPTY)
  useEffect(() => { if (open) setForm(supplier || EMPTY) }, [supplier, open])

  const save = () => {
    if (!form.name.trim()) return toast.error('Supplier name is required')
    onSubmit(form)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{supplier ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>TIN</Label><Input value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1.5"><Label>Payment Terms</Label>
              <select className="h-9 w-full rounded-md border border-input px-3 text-sm" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}>
                {['COD', 'Net 7', 'Net 15', 'Net 30', 'Net 60'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between pb-1"><Label>VAT-registered</Label><Switch checked={form.is_vat_registered} onCheckedChange={(c) => setForm({ ...form, is_vat_registered: c })} /></div>
          </div>
          <div className="flex items-center justify-between pb-1"><Label>Active</Label><Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} className="bg-pink hover:bg-pink/90"><Save className="w-4 h-4 mr-2" />Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}