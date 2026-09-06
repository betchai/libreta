import CategoryManager from '@/components/expenses/CategoryManager'
import ExpenseForm from '@/components/expenses/ExpenseForm'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useExpenses, useExpenseCategories, useSaveExpense, useDeleteExpense } from '@/hooks/useExpenseData'
import { useSettings } from '@/hooks/useSettings'
import { useTenantId } from '@/hooks/useTenantId'
import { downloadCSV } from '@/lib/bookkeeping'
import { toManilaDisplayDate } from '@/lib/manilaTime'
import { format } from 'date-fns'
import { Plus, Download, Pencil, Trash2 } from 'lucide-react'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`
const fmt = (d) => format(toManilaDisplayDate(d), 'MM-dd-yyyy')

export default function Expenses() {
  const tenantId = useTenantId()
  const { data: settings } = useSettings()
  const { data: expenses = [], isLoading } = useExpenses()
  const { data: categories = [] } = useExpenseCategories()
  const saveExpense = useSaveExpense()
  const deleteExpense = useDeleteExpense()
  const [tab, setTab] = useState('records')
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(() => expenses.filter((e) => {
    const d = new Date(e.date)
    if (from && d < new Date(`${from}T00:00:00`)) return false
    if (to && d > new Date(`${to}T23:59:59`)) return false
    return true
  }).sort((a, b) => new Date(b.date) - new Date(a.date)), [expenses, from, to])

  const total = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const inputVatTotal = filtered.reduce((s, e) => s + (Number(e.input_vat) || 0), 0)

  const summary = useMemo(() => {
    const ca = categories.length ? categories : expenses.map((e) => ({ name: e.category, account_code: e.account_code }))
    return ca.map((c) => {
      const amt = filtered.filter((e) => e.category === c.name).reduce((s, e) => s + (Number(e.amount) || 0), 0)
      return { ...c, amount: amt }
    }).filter((c) => c.amount > 0)
  }, [categories, filtered, expenses])

  const tabs = [['records', 'Expense Records'], ['summary', 'Summary Report'], ['categories', 'Categories']]

  const doDelete = (e) => {
    if (!confirm('Delete this expense and its journal entry?')) return
    deleteExpense.mutate(e, { onSuccess: () => toast.success('Deleted'), onError: (err) => toast.error(err.message) })
  }

  const exportCSV = () => downloadCSV('expenses.csv', ['Date', 'Category', 'Description', 'Amount', 'VAT', 'Net', 'Method', 'Payee'], filtered.map((e) => [fmt(e.date), e.category, e.description || '', (Number(e.amount) || 0).toFixed(2), (Number(e.input_vat) || 0).toFixed(2), ((Number(e.amount) || 0) - (Number(e.input_vat) || 0)).toFixed(2), e.payment_method, e.payee || '']))

  const handleSave = async (form) => {
    await saveExpense.mutateAsync({ data: form, existing: editing })
    toast.success(editing ? 'Expense updated' : 'Expense recorded')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-plum">Expenses</h1>
          <p className="text-slate-500">Record operating expenses and manage categories</p>
        </div>
        {tab === 'records' && <Button onClick={() => { setEditing(null); setShowForm(true) }} className="bg-pink hover:bg-pink/90"><Plus className="w-4 h-4 mr-2" />Record Expense</Button>}
      </div>

      <div className="flex gap-2">
        {tabs.map(([val, label]) => <Button key={val} variant={tab === val ? 'default' : 'outline'} size="sm" onClick={() => setTab(val)}>{label}</Button>)}
      </div>

      {tab === 'records' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="Total (range)" value={MONEY(total)} color="pink" />
            <Stat label="Total Net (ex VAT)" value={MONEY(total - inputVatTotal)} color="blue" />
            <Stat label="Creditable Input VAT" value={MONEY(inputVatTotal)} color="purple" />
          </div>
          <div className="flex gap-2 items-center">
            <input type="date" className="h-9 rounded-md border border-input px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="h-9 rounded-md border border-input px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button variant="outline" size="sm" onClick={exportCSV} className="ml-auto"><Download className="w-4 h-4 mr-1" />Export</Button>
          </div>
          {isLoading ? <div className="py-10 text-center text-slate-400">Loading…</div> : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-orange-50 text-left text-xs uppercase text-orange-600">
                    <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Method</th><th className="px-4 py-3" /></tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-4 py-3 text-slate-500">{fmt(e.date)}</td>
                        <td className="px-4 py-3">{e.category}</td>
                        <td className="px-4 py-3 text-slate-500">{e.description || '—'}</td>
                        <td className="px-4 py-3 text-right font-medium">{MONEY(e.amount)}</td>
                        <td className="px-4 py-3">{e.payment_method}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setEditing(e); setShowForm(true) }}><Pencil className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" title="Delete" onClick={() => doDelete(e)}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No expenses</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'summary' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-50 text-left text-xs uppercase text-orange-500"><tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Code</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
              <tbody>
                {summary.map((s) => <tr key={s.name + s.account_code} className="border-t"><td className="px-4 py-3">{s.name}</td><td className="px-4 py-3 text-slate-500">{s.account_code}</td><td className="px-4 py-3 text-right font-medium">{MONEY(s.amount)}</td></tr>)}
                {summary.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No expenses in range</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'categories' && <CategoryManager />}

      <ExpenseForm
        open={showForm}
        onOpenChange={(o) => { if (!o) { setShowForm(false); setEditing(null) } }}
        categories={categories}
        editing={editing}
        onSave={handleSave}
        vatRegistered={settings?.vat_registered !== false}
      />
    </div>
  )
}

function Stat({ label, value, color = 'pink' }) {
  const STAT_COLORS = {
    pink: { bg: 'bg-pink-50', border: 'border-pink-100', accent: 'bg-pink-500', text: 'text-pink-600' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-100', accent: 'bg-blue-500', text: 'text-blue-600' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-100', accent: 'bg-purple-500', text: 'text-purple-600' },
    peach: { bg: 'bg-orange-50', border: 'border-orange-100', accent: 'bg-orange-400', text: 'text-orange-600' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-100', accent: 'bg-rose-400', text: 'text-rose-600' },
  }
  const c = STAT_COLORS[color] || STAT_COLORS.pink
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4 transition-all`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${c.accent}`} />
        <span className="text-xs uppercase font-semibold tracking-wide text-slate-400">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${c.text}`}>{value}</div>
    </div>
  )
}
