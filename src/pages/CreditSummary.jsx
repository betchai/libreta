import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useLedgerEntries, useRecordPayment } from '@/hooks/useCustomerData'
import { useCustomers } from '@/hooks/useCustomers'
import { useTenantId } from '@/hooks/useTenantId'
import { downloadCSV } from '@/lib/bookkeeping'
import { entriesForCustomer, computeBalance, fifoAging, availableCredit } from '@/lib/customerCredit'
import { Download, AlertTriangle, Gauge, TrendingUp, HandCoins } from 'lucide-react'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`

export default function CreditSummary() {
  const tenantId = useTenantId()
  const { data: customers = [] } = useCustomers()
  const { data: ledgerEntries = [] } = useLedgerEntries()
  const recordPayment = useRecordPayment()
  const [filter, setFilter] = useState('all') // all | near | over | approaching
  const [collect, setCollect] = useState(null)

  const rows = useMemo(() => customers
    .filter((c) => c.is_active !== false)
    .map((c) => {
      const entries = entriesForCustomer(ledgerEntries, c.id)
      const balance = computeBalance(entries)
      const credit_limit = Number(c.credit_limit) || 0
      const utilization = credit_limit > 0 ? (balance / credit_limit) : balance > 0 ? 1 : 0
      const aging = fifoAging(ledgerEntries, c.id)
      const u = credit_limit > 0 ? balance / credit_limit : 1
      const bucket = credit_limit > 0 && u >= 0.8 ? 'near' : credit_limit > 0 && u > 1 ? 'over' : credit_limit > 0 && u >= 0.5 ? 'approaching' : 'ok'
      return { ...c, customer: c, balance, credit_limit, utilization, aging, bucket }
    })
    .filter((r) => r.balance > 0.01 || r.bucket === 'ok')
  , [customers, ledgerEntries])

  const totalOutstanding = rows.reduce((s, r) => s + r.balance, 0)
  const totalLimit = rows.reduce((s, r) => s + r.credit_limit, 0)
  const overLimit = rows.filter((r) => r.bucket === 'over').length
  const nearLimit = rows.filter((r) => r.bucket === 'near' || r.bucket === 'over').length
  const over60 = rows.filter((r) => r.aging.total > 0 && (r.aging.d61_90 + r.aging.d90plus) > 0.01).length

  const filtered = rows.filter((r) => filter === 'all' ? r.balance > 0.01 : r.bucket === filter)

  const exportCSV = () => {
    downloadCSV('credit_summary.csv', ['Customer', 'Balance', 'Limit', 'Utilization %', 'Available', '1-30', '31-60', '61-90', '90+'],
      filtered.map((r) => [r.name, r.balance.toFixed(2), r.credit_limit.toFixed(2), (r.utilization * 100).toFixed(0), availableCredit(r, r.balance).toFixed(2), r.aging.d1_30.toFixed(2), r.aging.d31_60.toFixed(2), r.aging.d61_90.toFixed(2), r.aging.d90plus.toFixed(2)]))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-plum">Credit Summary</h1>
          <p className="text-slate-500">Outstanding receivables and credit-limit utilization</p>
        </div>
        <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export</Button>
      </div>

      {over60 > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4" /> {over60} customer(s) have receivables aged over 60 days.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={<Gauge className="w-5 h-5" />} label="Outstanding" value={MONEY(totalOutstanding)} color="pink" />
        <Stat icon={<TrendingUp className="w-5 h-5" />} label="Total Limit" value={MONEY(totalLimit)} color="blue" />
        <Stat icon={<AlertTriangle className="w-5 h-5" />} label="Near/Over Limit" value={String(nearLimit)} color="peach" />
        <Stat icon={<HandCoins className="w-5 h-5" />} label="Over Limit" value={String(overLimit)} color="rose" />
      </div>

      <div className="flex gap-2">
        {[['all', 'All with balance'], ['near', 'Near limit (≥80%)'], ['over', 'Over limit'], ['approaching', 'Approaching (≥50%)']].map(([val, label]) => (
          <Button key={val} variant={filter === val ? 'default' : 'outline'} size="sm" onClick={() => setFilter(val)}>{label}</Button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-orange-50 text-left text-xs uppercase text-orange-600">
              <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3 text-right">Limit</th><th className="px-4 py-3 w-1/4">Utilization</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-right font-semibold">{MONEY(r.balance)}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{MONEY(r.credit_limit)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden"><div className={`h-2 rounded-full ${r.bucket === 'over' ? 'bg-rose-500' : r.bucket === 'near' ? 'bg-amber-500' : r.bucket === 'approaching' ? 'bg-yellow-400' : 'bg-pink'}`} style={{ width: `${Math.min(100, r.utilization * 100)}%` }} /></div>
                      <span className="text-xs text-slate-400 w-10 text-right">{Math.round(r.utilization * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{MONEY(availableCredit(r, r.balance))}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setCollect(r)}>Collect</Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No customers match this filter</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {collect && <CollectDialog customer={collect} onClose={() => setCollect(null)} onSave={(args) => recordPayment.mutate(args, { onSuccess: () => { toast.success('Payment recorded'); setCollect(null) }, onError: (e) => toast.error(e.message) })} />}
    </div>
  )
}

function Stat({ icon, label, value, color = 'pink' }) {
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
        <span className="text-xs uppercase font-semibold tracking-wide text-slate-400">{icon}{label}</span>
      </div>
      <div className={`text-2xl font-bold ${c.text}`}>{value}</div>
    </div>
  )
}

function CollectDialog({ customer, onClose, onSave }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Cash')
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4">
      <Card className="w-full max-w-sm my-12 p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-800">Collect — {customer.name}</h2>
        <div className="text-sm text-slate-500">Balance: <b>{MONEY(customer.balance)}</b></div>
        <div className="space-y-2"><label className="text-sm">Amount</label><input type="number" step="0.01" className="h-9 w-full rounded-md border border-input px-3 text-sm" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
        <div className="space-y-2"><label className="text-sm">Method</label>
          <select className="h-9 w-full rounded-md border border-input px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>{['Cash', 'Card', 'Gcash', 'Bank'].map((m) => <option key={m}>{m}</option>)}</select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { const amt = Number(amount); if (!amt || amt <= 0) return toast.error('Enter a valid amount'); onSave({ customer: { id: customer.id, name: customer.name }, amount: amt, paymentMethod: method, receivedBy: 'Admin', paymentDate: new Date().toISOString().slice(0, 10) }) }} className="bg-pink hover:bg-pink/90">Collect</Button>
        </div>
      </Card>
    </div>
  )
}
