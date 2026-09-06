import React, { useState } from 'react'
import { Search, UserPlus, X, Check } from 'lucide-react'
import { useCreateCustomer } from '@/hooks/useCustomers'
import { toast } from 'sonner'

// Searchable customer dropdown with inline quick-add, for the POS Utang flow.
// Props: customers[], value (selected customer object), onChange(customer|null).
export default function CustomerSelect({ customers = [], value, onChange }) {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
    const [adding, setAdding] = useState(false)
    const [newName, setNewName] = useState('')
    const [newPhone, setNewPhone] = useState('')
    const createCustomer = useCreateCustomer()

    const filtered = query.trim()
        ? customers.filter(c => {
            const q = query.toLowerCase()
            return (c.name || '').toLowerCase().includes(q)
                || (c.nickname_or_alias || '').toLowerCase().includes(q)
                || (c.phone || '').toLowerCase().includes(q)
        })
        : customers

    const select = (c) => { onChange(c); setOpen(false); setQuery('') }

    const handleCreate = () => {
        if (!newName.trim()) { toast.error('Name is required'); return }
        createCustomer.mutate(
            { name: newName.trim(), phone: newPhone.trim(), is_active: true },
            {
                onSuccess: (created) => {
                    select(created)
                    setAdding(false)
                    setNewName(''); setNewPhone('')
                    toast.success('Customer added')
                },
                onError: (e) => toast.error('Could not add customer: ' + (e?.message || e)),
            }
        )
    }

    return (
        <div className="relative">
            {value ? (
                <div className="flex items-center justify-between bg-pink/10 border border-pink/40 rounded-lg p-2">
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-plum truncate">{value.name}</p>
                        {value.nickname_or_alias && <p className="text-xs text-pink truncate">"{value.nickname_or_alias}"</p>}
                    </div>
                    <button onClick={() => onChange(null)} className="text-plum/60 hover:text-red-500 p-1" aria-label="Clear customer">
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
                        Select customer…
                    </button>
                    {open && (
                        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 flex flex-col">
                            <div className="p-2 border-b border-slate-100">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        autoFocus
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        placeholder="Search name / nickname / phone…"
                                        className="w-full pl-8 pr-2 py-1.5 text-sm border rounded-md outline-pink"
                                    />
                                </div>
                            </div>
                            <div className="overflow-auto flex-1">
                                {filtered.length === 0 && !adding && (
                                    <p className="text-center text-xs text-slate-400 py-4">No customers found.</p>
                                )}
                                {filtered.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => select(c)}
                                        className="w-full text-left px-3 py-2 hover:bg-pink/10 border-b border-slate-50 text-sm"
                                    >
                                        <div className="font-medium text-slate-800">{c.name}</div>
                                        {(c.nickname_or_alias || c.phone) && (
                                            <div className="text-xs text-slate-500">
                                                {c.nickname_or_alias ? `"${c.nickname_or_alias}"` : ''} {c.phone ? `· ${c.phone}` : ''}
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
                                            placeholder="Customer name"
                                            className="w-full px-2 py-1.5 text-sm border rounded-md outline-pink"
                                            autoFocus
                                        />
                                        <input
                                            value={newPhone}
                                            onChange={e => setNewPhone(e.target.value)}
                                            placeholder="Phone (optional)"
                                            className="w-full px-2 py-1.5 text-sm border rounded-md outline-pink"
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={() => setAdding(false)} className="flex-1 text-xs px-2 py-1.5 border rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
                                            <button onClick={handleCreate} disabled={createCustomer.isPending} className="flex-1 text-xs px-2 py-1.5 bg-pink text-white rounded-md flex items-center justify-center gap-1 disabled:opacity-50">
                                                <Check className="w-3 h-3" /> {createCustomer.isPending ? 'Adding…' : 'Add'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setAdding(true)}
                                        className="w-full flex items-center justify-center gap-1.5 text-sm text-pink hover:bg-pink/10 py-1.5 rounded-md font-medium"
                                    >
                                        <UserPlus className="w-4 h-4" /> Add new customer
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
