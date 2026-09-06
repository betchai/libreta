import React, { useState } from 'react'
import { Search, Plus, X, Check } from 'lucide-react'
import { useSuppliers, useCreateSupplier } from '@/hooks/usePurchaseData'
import { toast } from 'sonner'

// Searchable supplier dropdown with inline quick-add, for the Inventory Restock modal.
// Mirrors the CustomerSelect used for the POS Utang flow.
// Props: value (supplier name string), onChange(name)
export default function RestockSupplierSelect({ value, onChange }) {
    const { data: suppliers = [] } = useSuppliers()
    const createSupplier = useCreateSupplier()
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
    const [adding, setAdding] = useState(false)
    const [newName, setNewName] = useState('')

    const filtered = query.trim()
        ? suppliers.filter(s => {
            const q = query.toLowerCase()
            return (s.name || '').toLowerCase().includes(q)
                || (s.contact_person || '').toLowerCase().includes(q)
        })
        : suppliers

    const select = (sup) => { onChange(sup); setOpen(false); setQuery('') }

    const handleCreate = () => {
        if (!newName.trim()) { toast.error('Supplier name is required'); return }
        createSupplier.mutate(
            { name: newName.trim(), is_active: true },
            {
                onSuccess: (created) => {
                    select(created)
                    setAdding(false)
                    setNewName('')
                    toast.success('Supplier added')
                },
                onError: (e) => toast.error('Could not add supplier: ' + (e?.message || e)),
            }
        )
    }

    return (
        <div className="relative">
            {value ? (
                <div className="flex items-center justify-between bg-pink/10 border border-pink/40 rounded-lg p-2">
                    <p className="text-sm font-medium text-plum truncate">{value.name}</p>
                    <button onClick={() => onChange(null)} className="text-plum/60 hover:text-red-500 p-1" aria-label="Clear supplier">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <>
                    <button
                        type="button"
                        onClick={() => setOpen(o => !o)}
                        className="w-full flex items-center gap-2 border border-slate-200 rounded-lg p-2 text-sm text-slate-500 hover:border-pink/60 hover:bg-pink/10/30 transition-colors"
                    >
                        <Search className="w-4 h-4" />
                        Select supplier…
                    </button>
                    {open && (
                        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 flex flex-col">
                            <div className="p-2 border-b border-slate-100">
                                <input
                                    autoFocus
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Search supplier…"
                                    className="w-full pl-8 pr-2 py-1.5 text-sm border rounded-md outline-pink"
                                />
                            </div>
                            <div className="overflow-auto flex-1">
                                {filtered.length === 0 && !adding && (
                                    <p className="text-center text-xs text-slate-400 py-4">No suppliers found.</p>
                                )}
                                {filtered.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => select(s)}
                                        className="w-full text-left px-3 py-2 hover:bg-pink/10 border-b border-slate-50 text-sm"
                                    >
                                        <div className="font-medium text-slate-800">{s.name}</div>
                                        {(s.contact_person || s.phone) && (
                                            <div className="text-xs text-slate-500">
                                                {s.contact_person ? s.contact_person : ''} {s.phone ? `· ${s.phone}` : ''}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                            <div className="border-t border-slate-100 p-2">
                                {adding ? (
                                    <div className="space-y-2">
                                        <input
                                            value={newName}
                                            onChange={e => setNewName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                            placeholder="Supplier name"
                                            className="w-full px-2 py-1.5 text-sm border rounded-md outline-pink"
                                            autoFocus
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={() => setAdding(false)} className="flex-1 text-xs px-2 py-1.5 border rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
                                            <button onClick={handleCreate} disabled={createSupplier.isPending} className="flex-1 text-xs px-2 py-1.5 bg-pink text-white rounded-md flex items-center justify-center gap-1 disabled:opacity-50">
                                                <Check className="w-3 h-3" /> {createSupplier.isPending ? 'Adding…' : 'Add'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setAdding(true)}
                                        className="w-full flex items-center justify-center gap-1.5 text-sm text-pink hover:bg-pink/10 py-1.5 rounded-md font-medium"
                                    >
                                        <Plus className="w-4 h-4" /> Add new supplier
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
