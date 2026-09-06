import ManualSalesImport from '@/components/inventory/ManualSalesImport'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useSales, useVoidSale } from '@/hooks/useSales'
import { useSettings } from '@/hooks/useSettings'
import { isAdmin } from '@/lib/auth-roles'
import { useAuth } from '@/lib/AuthContext'
import { downloadCSV } from '@/lib/bookkeeping'
import { toManilaDisplayDate } from '@/lib/manilaTime'
import { printReceipt } from '@/lib/printReceipt'
import { format } from 'date-fns'
import { ReceiptText, Download, Eye, Ban } from 'lucide-react'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`

export default function Sales() {
  const { user } = useAuth()
  const admin = isAdmin(user)
  const { data: sales = [], isLoading } = useSales()
  const { data: settings } = useSettings()
  const voidSale = useVoidSale()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState(null)
  const [msiOpen, setMsiOpen] = useState(false)

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      const d = new Date(s.created_date)
      if (from && d < new Date(`${from}T00:00:00`)) return false
      if (to && d > new Date(`${to}T23:59:59`)) return false
      if (search && !(s.cashier_name || '').toLowerCase().includes(search.toLowerCase()) && !s.id.includes(search)) return false
      return true
    })
  }, [sales, from, to, search])

  const completed = filtered.filter((s) => s.status === 'Completed')
  const revenue = completed.reduce((s, x) => s + (Number(x.total_amount) || 0), 0)
  const aov = completed.length ? revenue / completed.length : 0
  const voided = filtered.filter((s) => s.status === 'Voided').length

  const doVoid = (s) => {
    const reason = prompt(`Void sale ${s.id.slice(0, 8)}? Enter a reason:`)
    if (reason === null) return
    if (!reason.trim()) return toast.error('A reason is required to void a sale')
    voidSale.mutate({ saleId: s.id, reason: reason.trim() }, { onSuccess: () => toast.success('Sale voided'), onError: (e) => toast.error(e.message) })
  }

  const exportCSV = () => {
    downloadCSV('sales.csv', ['Date', 'Txn', 'Cashier', 'Method', 'Items', 'Total', 'Status', 'Reason'], filtered.map((s) => [
      format(toManilaDisplayDate(s.created_date), 'yyyy-MM-dd HH:mm'),
      s.id.slice(0, 8), s.cashier_name || '', s.payment_method || '', (s.items || []).length,
      (Number(s.total_amount) || 0).toFixed(2), s.status, s.void_reason || '',
    ]))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-plum">Sales</h1>
          <p className="text-slate-500">Review transactions, view receipts, and void sales</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMsiOpen(true)}><ReceiptText className="w-4 h-4 mr-2" />Import Manual Sales</Button>
          <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Revenue" value={MONEY(revenue)} color="pink" />
        <Stat label="Transactions" value={String(completed.length)} color="blue" />
        <Stat label="Avg Order" value={MONEY(aov)} color="purple" />
        <Stat label="Voided" value={String(voided)} color="rose" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" /></div>
        <div className="flex items-center gap-2"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" /></div>
        <Input placeholder="Search cashier or txn…" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
      </div>

      {isLoading ? <div className="py-10 text-center text-slate-400">Loading…</div> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-pink-50 text-left text-xs uppercase text-pink-600">
                <tr>
                  <th className="px-4 py-3">Txn</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Cashier</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className={`border-t ${s.status === 'Voided' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs">{s.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-slate-500">{format(toManilaDisplayDate(s.created_date), 'MM-dd HH:mm')}</td>
                    <td className="px-4 py-3">{s.cashier_name || '—'}</td>
                    <td className="px-4 py-3">{s.payment_method || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">{MONEY(s.total_amount)}</td>
                    <td className="px-4 py-3"><span className={s.status === 'Voided' ? 'text-rose-500' : 'text-pink'}>{s.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" title="View receipt" onClick={() => setView(s)}><Eye className="w-4 h-4" /></Button>
                        {admin && s.status === 'Completed' && <Button size="icon" variant="ghost" title="Void" onClick={() => doVoid(s)}><Ban className="w-4 h-4" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No sales found</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {view && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ReceiptText className="w-5 h-5" /> Sale {view.id.slice(0, 8)}</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => printReceipt({ sale: view, items: view.items || [], settings, width: '80mm' })}>Print</Button>
                <Button size="sm" variant="outline" onClick={() => setView(null)}>Close</Button>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {(view.items || []).map((i, idx) => (
                <div key={idx} className="flex justify-between text-slate-600 gap-3">
                  <span className="min-w-0 truncate">{i.product_name} × {Number(i.quantity).toFixed(3)}</span>
                  <span className="whitespace-nowrap">{MONEY(i.net_amount || i.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Total</span><span>{MONEY(view.total_amount)}</span></div>
            {view.status === 'Voided' && <p className="text-sm text-rose-500">Voided: {view.void_reason}</p>}
          </Card>
        </div>
      )}

      <ManualSalesImport open={msiOpen} onOpenChange={setMsiOpen} />
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
