import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DISCOUNT_TYPES, computeLineDiscount, SC_PWD_RATE, DISCOUNT_LABELS, isStatutory } from '@/lib/discounts'
import { Tag, ChevronUp, ChevronDown } from 'lucide-react'
import { useState } from 'react'
export default function LineDiscountControl({ item, eligible, onChange }) {
  const [expanded, setExpanded] = useState(false)
  const type = item.discount_type || DISCOUNT_TYPES.NONE
  const { discount_amount, net_amount } = computeLineDiscount(item)
  const hasDiscount = type !== DISCOUNT_TYPES.NONE && discount_amount > 0

  const setType = (newType) => {
    const updates = { discount_type: newType }
    if (newType === DISCOUNT_TYPES.SENIOR_CITIZEN || newType === DISCOUNT_TYPES.PWD) {
      updates.discount_value = SC_PWD_RATE * 100
    } else if (newType === DISCOUNT_TYPES.NONE) {
      updates.discount_value = 0
      updates.discount_id_number = ''
      updates.discount_person_name = ''
      updates.discount_reason = ''
    }
    onChange(updates)
  }

  return (
    <div className="mt-1.5 rounded-md border border-slate-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-slate-50 transition-colors">
        <span className="flex items-center gap-1.5 text-slate-600">
          <Tag className="w-3 h-3" />
          {hasDiscount ? <span className="text-pink font-medium">{DISCOUNT_LABELS[type]} −₱{discount_amount.toFixed(2)}</span> : <span>Add discount</span>}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-2 pb-2 pt-1 space-y-2 border-t border-slate-100">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={DISCOUNT_TYPES.NONE}>None</SelectItem>
              <SelectItem value={DISCOUNT_TYPES.SENIOR_CITIZEN} disabled={!eligible}>Senior Citizen (20%){!eligible ? ' — not eligible' : ''}</SelectItem>
              <SelectItem value={DISCOUNT_TYPES.PWD} disabled={!eligible}>PWD (20%){!eligible ? ' — not eligible' : ''}</SelectItem>
              <SelectItem value={DISCOUNT_TYPES.CUSTOM_PERCENT}>Custom %</SelectItem>
              <SelectItem value={DISCOUNT_TYPES.CUSTOM_AMOUNT}>Custom Amount</SelectItem>
            </SelectContent>
          </Select>

          {isStatutory(type) && (
            <div className="space-y-1.5">
              <div><Label className="text-[10px] text-slate-500">SC/PWD ID Number *</Label><Input className="h-8 text-xs" placeholder="e.g. SC-1234567" value={item.discount_id_number || ''} onChange={(e) => onChange({ discount_id_number: e.target.value })} /></div>
              <div><Label className="text-[10px] text-slate-500">Qualified Person Name *</Label><Input className="h-8 text-xs" placeholder="Full name as on ID" value={item.discount_person_name || ''} onChange={(e) => onChange({ discount_person_name: e.target.value })} /></div>
            </div>
          )}
          {type === DISCOUNT_TYPES.CUSTOM_PERCENT && (
            <div className="space-y-1.5">
              <div><Label className="text-[10px] text-slate-500">Discount %</Label><Input type="number" min="0" max="100" step="0.5" className="h-8 text-xs" value={item.discount_value || ''} onChange={(e) => onChange({ discount_value: Number(e.target.value) })} /></div>
              <div><Label className="text-[10px] text-slate-500">Reason *</Label><Input className="h-8 text-xs" placeholder="e.g. Manager override, promo" value={item.discount_reason || ''} onChange={(e) => onChange({ discount_reason: e.target.value })} /></div>
            </div>
          )}
          {type === DISCOUNT_TYPES.CUSTOM_AMOUNT && (
            <div className="space-y-1.5">
              <div><Label className="text-[10px] text-slate-500">Discount Amount (₱)</Label><Input type="number" min="0" step="0.01" className="h-8 text-xs" value={item.discount_value || ''} onChange={(e) => onChange({ discount_value: Number(e.target.value) })} /></div>
              <div><Label className="text-[10px] text-slate-500">Reason *</Label><Input className="h-8 text-xs" placeholder="e.g. Damaged goods, manager override" value={item.discount_reason || ''} onChange={(e) => onChange({ discount_reason: e.target.value })} /></div>
            </div>
          )}
          {hasDiscount && (
            <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100"><span>Net after discount</span><span className="font-medium text-slate-700">₱{net_amount.toFixed(2)}</span></div>
          )}
        </div>
      )}
    </div>
  )
}
