import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useCustomers } from '@/hooks/useCustomers'
import { useLedgerEntries } from '@/hooks/useCustomerData'
import { useTenantId } from '@/hooks/useTenantId'
import { isAdmin } from '@/lib/auth-roles'
import { useAuth } from '@/lib/AuthContext'
import { fifoAging, entriesForCustomer } from '@/lib/customerCredit'
import { downloadCSV } from '@/lib/bookkeeping'
import { format } from 'date-fns'
import { Download, AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`

const AGING_BUCKETS = [
  { key: 'current', label: 'Current', color: 'text-emerald-600' },
  { key: 'd1_30', label: '1–30 Days', color: 'text-amber-600' },
  { key: 'd31_60', label: '31–60 Days', color: 'text-orange-600' },
  { key: 'd61_90', label: '61–90 Days', color: 'text-red-600' },
  { key: 'd90plus', label: '90+ Days', color: 'text-rose-700' },
]

export default function ArAgingReport() {
  const { user } = useAuth()
  const admin = isAdmin(user)
  const tenantId = useTenantId()
  const { data: customers = [], isLoading: custLoading } = useCustomers()
  const { data: ledgerEntries = [], isLoading: ledgerLoading } = useLedgerEntries()
  const [asOfDate, setAsOfDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [filterCustomer, setFilterCustomer] = useState('')

  const isLoading = custLoading || ledgerLoading

  const activeCustomers = useMemo(() => customers.filter(c => c.is_active !== false), [customers])

  const agingData = useMemo(() => {
    const asOf = new Date(`${asOfDate}T23:59:59`)
    return activeCustomers.map(cust => {
      const custEntries = entriesForCustomer(ledgerEntries, cust.id)
      const aging = fifoAging(custEntries, cust.id, asOf)
      return {
        customer: cust,
        ...aging,
        total: aging.total,
      }
    }).filter(r => r.total > 0.01)
  }, [activeCustomers, ledgerEntries, asOfDate])

  const filteredAging = useMemo(() => {
    if (!filterCustomer) return agingData
    const q = filterCustomer.toLowerCase()
    return agingData.filter(r =>
      r.customer.name.toLowerCase().includes(q) ||
      (r.customer.nickname_or_alias || '').toLowerCase().includes(q)
    )
  }, [agingData, filterCustomer])

  const totals = useMemo(() => {
    return AGING_BUCKETS.reduce((acc, b) => {
      acc[b.key] = filteredAging.reduce((s, r) => s + (Number(r[b.key]) || 0), 0)
      return acc
    }, { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 })
  }, [filteredAging])

  totals.total = filteredAging.reduce((s, r) => s + (Number(r.total) || 0), 0)

  const exportCSV = () => {
    const headers = ['Customer', 'Phone', 'Credit Limit', 'Current', '1–30 Days', '31–60 Days', '61–90 Days', '90+ Days', 'Total Outstanding']
    const rows = filteredAging.map(r => [
      r.customer.name,
      r.customer.phone || '',
      MONEY(r.customer.credit_limit),
      MONEY(r.current),
      MONEY(r.d1_30),
      MONEY(r.d31_60),
      MONEY(r.d61_90),
      MONEY(r.d90plus),
      MONEY(r.total),
    ])
    rows.push(['TOTAL', '', '', MONEY(totals.current), MONEY(totals.d1_30), MONEY(totals.d31_60), MONEY(totals.d61_90), MONEY(totals.d90plus), MONEY(totals.total)])
    downloadCSV(`ar_aging_${asOfDate}.csv`, headers, rows)
  }

  if (!admin) return <div className="py-20 text-center text-slate-500">Admin access required.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-plum">AR Aging Report</h1>
          <p className="text-slate-500">FIFO-based aging of customer outstanding balances</p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={filteredAging.length === 0}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div className="space-y-1.5">
            <Label>As of Date</Label>
            <Input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="w-[180px]" />
          </div>
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label>Search Customer</Label>
            <Input placeholder="Name or alias…" value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-slate-400">Loading…</div>
        ) : filteredAging.length === 0 ? (
          <div className="py-10 text-center text-slate-400">No outstanding balances as of {format(new Date(asOfDate), 'MMM dd, yyyy')}</div>
        ) : (
          <>
            <div className="grid grid-cols-6 gap-3 mb-4 text-sm">
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                <div className="text-xs text-emerald-700 font-medium">Current</div>
                <div className="font-bold text-emerald-600">{MONEY(totals.current)}</div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                <div className="text-xs text-amber-700 font-medium">1–30 Days</div>
                <div className="font-bold text-amber-600">{MONEY(totals.d1_30)}</div>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                <div className="text-xs text-orange-600 font-medium">31–60 Days</div>
                <div className="font-bold text-orange-600">{MONEY(totals.d31_60)}</div>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                <div className="text-xs text-red-600 font-medium">61–90 Days</div>
                <div className="font-bold text-red-600">{MONEY(totals.d61_90)}</div>
              </div>
              <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-center">
                <div className="text-xs text-rose-700 font-medium">90+ Days</div>
                <div className="font-bold text-rose-700">{MONEY(totals.d90plus)}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-600 font-medium">TOTAL</div>
                <div className="font-bold text-slate-800">{MONEY(totals.total)}</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3 text-right">Credit Limit</th>
                    <th className="px-4 py-3 text-right">Current</th>
                    <th className="px-4 py-3 text-right">1–30</th>
                    <th className="px-4 py-3 text-right">31–60</th>
                    <th className="px-4 py-3 text-right">61–90</th>
                    <th className="px-4 py-3 text-right">90+</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAging.map(r => (
                    <tr key={r.customer.id} className="border-t hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium">{r.customer.name}</td>
                      <td className="px-4 py-3 text-slate-500">{r.customer.phone || '—'}</td>
                      <td className="px-4 py-3 text-right">{MONEY(r.customer.credit_limit)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{MONEY(r.current)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{MONEY(r.d1_30)}</td>
                      <td className="px-4 py-3 text-right text-orange-600">{MONEY(r.d31_60)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{MONEY(r.d61_90)}</td>
                      <td className="px-4 py-3 text-right text-rose-700">{MONEY(r.d90plus)}</td>
                      <td className="px-4 py-3 text-right font-bold">{MONEY(r.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold border-t-2">
                    <td className="px-4 py-3" colSpan={3}>TOTALS</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{MONEY(totals.current)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{MONEY(totals.d1_30)}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{MONEY(totals.d31_60)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{MONEY(totals.d61_90)}</td>
                    <td className="px-4 py-3 text-right text-rose-700">{MONEY(totals.d90plus)}</td>
                    <td className="px-4 py-3 text-right">{MONEY(totals.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}