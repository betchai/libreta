import { base44 } from '@/api/base44Client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useTenantId } from '@/hooks/useTenantId'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Barcode } from 'lucide-react'
import { toast } from 'sonner'
export default function ProductForm({ initialData, onSuccess, onCancel }) {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: initialData || {
      name: '', sku: '', category: 'Feed', base_unit: 'Sack', base_price: 0, cost_price: 0,
      vat_exempt: false, sc_pwd_discount_eligible: true, has_fractions: false, fraction_unit: '',
      fraction_multiplier: 0, fraction_price: 0, stock_quantity: 0, low_stock_threshold: 5, sell_by_weight: false,
    },
  })

  const hasFractions = watch('has_fractions')
  const category = watch('category')
  const vatExempt = watch('vat_exempt')
  const scPwdEligible = watch('sc_pwd_discount_eligible')
  const sellByWeight = watch('sell_by_weight')

  const mutation = useMutation({
    mutationFn: (data) => {
      const parsedData = {
        ...data,
        tenant_id: tenantId,
        base_price: parseFloat(data.base_price),
        cost_price: parseFloat(data.cost_price) || 0,
        vat_exempt: !!data.vat_exempt,
        sc_pwd_discount_eligible: data.sc_pwd_discount_eligible !== false,
        stock_quantity: parseFloat(data.stock_quantity),
        low_stock_threshold: parseFloat(data.low_stock_threshold),
        fraction_multiplier: data.has_fractions ? parseFloat(data.fraction_multiplier) : 0,
        fraction_price: data.has_fractions ? parseFloat(data.fraction_price) : 0,
        sell_by_weight: data.has_fractions ? !!data.sell_by_weight : false,
      }
      if (initialData?.id) return base44.entities.Product.update(initialData.id, parsedData)
      return base44.entities.Product.create(parsedData)
    },
    onSuccess: () => { toast.success(`Product ${initialData ? 'updated' : 'created'} successfully`); qc.invalidateQueries(['products', tenantId]); onSuccess() },
    onError: (error) => { toast.error('Error saving product: ' + error.message); onCancel() },
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-6 mt-4">
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-2"><Label className="font-semibold">Product Name <span className="text-red-500">*</span></Label><Input {...register('name', { required: true })} placeholder="e.g. Premium Broiler Starter" className="h-11" /></div>
        <div className="space-y-2"><Label className="font-semibold">SKU / Barcode <span className="text-red-500">*</span></Label><Input {...register('sku', { required: true })} placeholder="e.g. PBS-001" className="h-11 font-mono" /></div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-2"><Label className="font-semibold">Category</Label><Select value={category} onValueChange={(v) => setValue('category', v)}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent>{['Feed', 'Medicine', 'Tools', 'Supplement', 'Other'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label className="font-semibold">Current Stock (in Base Units) <span className="text-red-500">*</span></Label><Input type="number" step="any" {...register('stock_quantity', { required: true, min: 0 })} className="h-11" /></div>
      </div>

      <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Base Pricing & Cost</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <div className="space-y-2"><Label className="font-semibold">Base Unit <span className="text-red-500">*</span></Label><Input {...register('base_unit', { required: true })} placeholder="e.g. Sack, Bottle" className="h-11" /></div>
          <div className="space-y-2"><Label className="font-semibold">Cost per Unit (₱)</Label><Input type="number" step="0.01" {...register('cost_price', { min: 0 })} className="h-11" placeholder="0" /><p className="text-xs text-slate-400">Auto-updated by PO receiving (weighted avg)</p></div>
          <div className="space-y-2"><Label className="font-semibold">Price per Unit (₱) <span className="text-red-500">*</span></Label><Input type="number" step="0.01" {...register('base_price', { required: true, min: 0 })} className="h-11" /></div>
          <div className="space-y-2"><Label className="font-semibold text-slate-600">Low Stock Alert At</Label><Input type="number" step="any" {...register('low_stock_threshold')} className="h-11" placeholder="e.g. 5" /></div>
        </div>
        <div className="flex items-center space-x-3 pt-4"><Checkbox id="vat_exempt" checked={vatExempt} onCheckedChange={(checked) => setValue('vat_exempt', checked)} className="w-5 h-5 data-[state=checked]:bg-pink" /><Label htmlFor="vat_exempt" className="font-medium text-slate-700 cursor-pointer">VAT-exempt / zero-rated product (sales of this item carry no output VAT)</Label></div>
        <div className="flex items-center space-x-3 pt-2"><Checkbox id="sc_pwd_discount_eligible" checked={scPwdEligible !== false} onCheckedChange={(checked) => setValue('sc_pwd_discount_eligible', checked)} className="w-5 h-5 data-[state=checked]:bg-pink" /><Label htmlFor="sc_pwd_discount_eligible" className="font-medium text-slate-700 cursor-pointer">Eligible for Senior Citizen / PWD statutory discount (food, medicine, essential goods)</Label></div>
      </div>

      <div className={`p-5 rounded-xl border transition-colors ${hasFractions ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center space-x-3 mb-2"><Checkbox id="has_fractions" checked={hasFractions} onCheckedChange={(checked) => setValue('has_fractions', checked)} className="w-5 h-5 data-[state=checked]:bg-blue-600" /><Label htmlFor="has_fractions" className="font-bold text-blue-900 cursor-pointer text-base">Enable Fractional Selling (e.g. Kilos from a Sack, mL from a Bottle)</Label></div>
        {hasFractions && (
          <>
            <div className="grid grid-cols-3 gap-5 pt-4 mt-4 border-t border-blue-100">
              <div className="space-y-2"><Label className="font-semibold text-blue-900">Fraction Unit <span className="text-red-500">*</span></Label><Input {...register('fraction_unit', { required: hasFractions })} placeholder="e.g. Kg, mL" className="h-11 bg-white" /></div>
              <div className="space-y-2"><Label className="font-semibold text-blue-900">Multiplier per Base <span className="text-red-500">*</span></Label><Input type="number" step="any" {...register('fraction_multiplier', { required: hasFractions, min: 0.01 })} placeholder="e.g. 50" className="h-11 bg-white" /><div className="text-xs text-blue-700 font-medium mt-1">Total {watch('fraction_unit') || 'units'} inside 1 {watch('base_unit') || 'base unit'}</div></div>
              <div className="space-y-2"><Label className="font-semibold text-blue-900">Price per Fraction (₱) <span className="text-red-500">*</span></Label><Input type="number" step="0.01" {...register('fraction_price', { required: hasFractions, min: 0 })} className="h-11 bg-white" /></div>
            </div>
            <div className="flex items-center space-x-3 pt-4 mt-4 border-t border-blue-100"><Checkbox id="sell_by_weight" checked={!!sellByWeight} onCheckedChange={(checked) => setValue('sell_by_weight', checked)} className="w-5 h-5 data-[state=checked]:bg-blue-600" /><Label htmlFor="sell_by_weight" className="font-medium text-blue-900 cursor-pointer">Weigh at counter (sold by {watch('fraction_unit') || 'unit'} with tare) — e.g. meat, produce</Label></div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t mt-8">
        <Button type="button" variant="outline" onClick={onCancel} className="h-12 px-6">Cancel</Button>
        <Button type="submit" disabled={mutation.isPending} className="h-12 px-8 bg-blue-600 hover:bg-blue-700 font-bold">{mutation.isPending ? 'Saving...' : (initialData ? 'Update Product' : 'Save Product')}</Button>
      </div>
    </form>
  )
}
