// Searchable supplier dropdown with an inline "+ Add new supplier" shortcut.
// props: value (supplier_id), onChange(supplier), suppliers, onAddNew, activeOnly
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ChevronsUpDown, Check, Plus } from 'lucide-react'
import { useState, useEffect } from 'react'
export default function SupplierSelect({ value, onChange, suppliers, onAddNew, activeOnly = true }) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')

    const selected = suppliers.find(s => s.id === value) || null
    const list = suppliers
        .filter(s => !activeOnly || s.is_active !== false)
        .filter(s => !query || (s.name || '').toLowerCase().includes(query.toLowerCase()) || (s.contact_person || '').toLowerCase().includes(query.toLowerCase()))

    useEffect(() => { if (!open) setQuery('') }, [open])

    return (
        <div className="flex gap-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="flex-1 justify-between font-normal">
                        <span className={selected ? 'text-slate-900' : 'text-slate-400'}>
                            {selected ? `${selected.name}${selected.is_vat_registered ? ' (VAT)' : ''}` : 'Select supplier…'}
                        </span>
                        <ChevronsUpDown className="w-4 h-4 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[320px]" align="start">
                    <div className="p-2"><Input placeholder="Search suppliers…" value={query} onChange={e => setQuery(e.target.value)} autoFocus /></div>
                    <div className="max-h-56 overflow-auto px-1 pb-1">
                        {list.length === 0 ? <p className="text-sm text-slate-500 px-3 py-4 text-center">No suppliers found</p> : list.map(s => (
                            <button key={s.id} type="button" onClick={() => { onChange(s); setOpen(false) }} className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-slate-100 text-left">
                                <span>{s.name}{!s.is_active && <span className="ml-2 text-xs text-slate-400">(archived)</span>}</span>
                                {selected?.id === s.id && <Check className="w-4 h-4 text-pink" />}
                            </button>
                        ))}
                    </div>
                    {onAddNew && (
                        <div className="border-t p-2">
                            <Button variant="outline" size="sm" className="w-full" onClick={() => { setOpen(false); onAddNew() }}><Plus className="w-4 h-4 mr-1" /> Add New Supplier</Button>
                        </div>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    )
}
