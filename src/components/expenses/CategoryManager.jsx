import React, { useState } from 'react'
import { base44 } from '@/api/base44Client'
import { useExpenseData } from '@/hooks/useExpenseData'
import { useTenantId } from '@/hooks/useTenantId'
import { ensureExpenseCategories } from '@/lib/expenses'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { ACCOUNTS } from '@/lib/bookkeeping'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const EXPENSE_ACCOUNTS = ACCOUNTS.filter((a) => a.type === 'expense')

export default function CategoryManager() {
    const { categories = [], isLoading } = useExpenseData()
    const tenantId = useTenantId()
    const queryClient = useQueryClient()
    const [newCat, setNewCat] = useState({ name: '', account_code: '7100', non_deductible: false })
    const [busy, setBusy] = useState(false)

    const refresh = () => queryClient.invalidateQueries(['expenseCategories', tenantId])

    const handleAdd = async (e) => {
        e.preventDefault()
        if (!newCat.name.trim()) { toast.error('Category name is required'); return }
        setBusy(true)
        try {
            const acct = ACCOUNTS.find((a) => a.code === newCat.account_code)
            await base44.entities.ExpenseCategory.create({
                name: newCat.name.trim(),
                account_code: newCat.account_code,
                account_name: acct?.name || newCat.account_code,
                is_default: false,
                non_deductible: newCat.non_deductible,
                tenant_id: tenantId,
            })
            toast.success('Category added')
            setNewCat({ name: '', account_code: '7100', non_deductible: false })
            refresh()
        } catch (err) {
            toast.error('Failed to add category: ' + (err?.message || err))
        } finally { setBusy(false) }
    }

    const handleDelete = async (cat) => {
        if (cat.is_default) { toast.error('Default categories cannot be deleted'); return }
        if (!confirm(`Delete "${cat.name}"? Existing expenses will keep their category label.`)) return
        try {
            await base44.entities.ExpenseCategory.delete(cat.id)
            refresh()
            toast.success('Category deleted')
        } catch (err) { toast.error('Failed to delete: ' + (err?.message || err)) }
    }

    const handleToggleNonDeductible = async (cat) => {
        try {
            await base44.entities.ExpenseCategory.update(cat.id, { non_deductible: !cat.non_deductible })
            refresh()
        } catch (err) { toast.error('Failed to update: ' + (err?.message || err)) }
    }

    const handleReseed = async () => {
        setBusy(true)
        try {
            await ensureExpenseCategories(tenantId)
            refresh()
            toast.success('Default categories ensured')
        } catch (err) { toast.error('Failed: ' + (err?.message || err)) }
        finally { setBusy(false) }
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Add Custom Category</CardTitle>
                            <CardDescription>Map it to a Chart of Accounts expense account</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleReseed} disabled={busy}>
                            {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                            Ensure Defaults
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1 flex-1 min-w-[180px]">
                            <Label className="text-xs">Category Name</Label>
                            <Input placeholder="e.g., Fuel & Gasoline" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
                        </div>
                        <div className="space-y-1 w-[240px]">
                            <Label className="text-xs">Chart of Accounts</Label>
                            <Select value={newCat.account_code} onValueChange={(v) => setNewCat({ ...newCat, account_code: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {EXPENSE_ACCOUNTS.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2 pb-2">
                            <Switch id="non-deduct" checked={newCat.non_deductible} onCheckedChange={(v) => setNewCat({ ...newCat, non_deductible: v })} />
                            <Label htmlFor="non-deduct" className="text-xs">Non-deductible</Label>
                        </div>
                        <Button type="submit" className="bg-pink hover:bg-pink/90" disabled={busy}>
                            <Plus className="w-4 h-4 mr-1" /> Add
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Expense Categories</CardTitle></CardHeader>
                <CardContent>
                    {isLoading ? <p className="text-center py-6 text-slate-500">Loading…</p> : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Account</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-center">Non-Deductible</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {categories.map((cat) => {
                                    const acct = ACCOUNTS.find((a) => a.code === cat.account_code)
                                    return (
                                        <TableRow key={cat.id}>
                                            <TableCell className="font-medium">{cat.name}</TableCell>
                                            <TableCell className="text-xs font-mono">{cat.account_code} — {acct?.name || cat.account_name}</TableCell>
                                            <TableCell>{cat.is_default ? <span className="text-xs text-slate-500">Default</span> : <span className="text-xs text-plum font-medium">Custom</span>}</TableCell>
                                            <TableCell className="text-center"><Switch checked={!!cat.non_deductible} onCheckedChange={() => handleToggleNonDeductible(cat)} /></TableCell>
                                            <TableCell className="text-right">
                                                {!cat.is_default && <button onClick={() => handleDelete(cat)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
