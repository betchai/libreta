import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useLedgerEntries } from '@/hooks/useCustomerData'
import { useCustomers } from '@/hooks/useCustomers'
import { useSales } from '@/hooks/useSales'
import { useTenantId } from '@/hooks/useTenantId'
import { downloadCSV } from '@/lib/bookkeeping'
import { entriesForCustomer, computeBalance, fifoAging } from '@/lib/customerCredit'
import { toManilaDisplayDate } from '@/lib/manilaTime'
import { format } from 'date-fns'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`
const fmt = (d) => format(toManilaDisplayDate(d), 'MM-dd-yyyy')

export default function CustomerReports() {
  const tenantId = useTenantId()
  const { data: customers = [] } = useCustomers()
  const { data: ledgerEntries = [] } = useLedgerEntries()
  const { data: sales = [] } = useSales()
  const [tab, setTab] = useState('outstanding')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const completed = useMemo(() => customers
    .filter((c) => c.is_active !== false)
    .map((c) => {
      const entries = entriesForCustomer(ledgerEntries, c.id)
      let lastCharge = null, lastPayment = null
      entries.forEach((e) => { if (e.type === 'charge') lastCharge = e.date; if (e.type === 'payment') lastPayment = e.date })
      return { ...c, balance: computeBalance(entries), lastCharge, lastPayment, aging: fifoAging(ledgerEntries, c.id) }
    }), [customers, ledgerEntries])

  const within = (d) => {
    if (from && d < new Date(`${from}T00:00:00`)) return false
    if (to && d > new Date(`${to}T23:59:59`)) return false
    return true
  }

  const payments = useMemo(() => ledgerEntries
    .filter((e) => e.type === 'payment' && within(new Date(e.date)))
    .sort((a, b) => new Date(a.date) - new Date(b.date)), [ledgerEntries, from, to])

  const creditSales = useMemo(() => sales
    .filter((s) => s.status === 'Completed' && Number(s.credit_amount) > 0 && within(new Date(s.created_date))), [sales, from, to])

  const tabs = [
    ['outstanding', 'Outstanding Balances'], ['aging', 'Receivables Aging'], ['collections', 'Collections'], ['credit', 'Credit Sales'],
  ]

  const doExport = () => {
    if (tab === 'outstanding') {
      downloadCSV('outstanding_balances.csv', ['Customer', 'Balance', 'Last Charge', 'Last Payment'], completed.filter((r) => r.balance > 0.01).map((r) => [r.name, r.balance.toFixed(2), r.lastCharge ? fmt(r.lastCharge) : '', r.lastPayment ? fmt(r.lastPayment) : '']))
    } else if (tab === 'aging') {
      downloadCSV('receivables_aging.csv', ['Customer', 'Current', '1-30', '31-60', '61-90', '90+', 'Total'], completed.map((r) => [r.name, r.aging.current.toFixed(2), r.aging.d1_30.toFixed(2), r.aging.d31_60.toFixed(2), r.aging.d61_90.toFixed(2), r.aging.d90plus.toFixed(2), r.aging.total.toFixed(2)]))
    } else if (tab === 'collections') {
      downloadCSV('collections.csv', ['Date', 'Customer', 'Amount', 'Method'], payments.map((p) => [fmt(p.date), p.customer_name, p.amount.toFixed(2), p.note || '']))
    } else {
      downloadCSV('credit_sales.csv', ['Date', 'Customer', 'Cash', 'Credit', 'Total'], creditSales.map((s) => [fmt(s.created_date), s.customer_name || '—', (Number(s.cash_amount) || 0).toFixed(2), (Number(s.credit_amount) || 0).toFixed(2), (Number(s.total_amount) || 0).toFixed(2)]))
    }
    toast.success('Exported CSV')
  }

  const totalAging = completed.reduce((s, r) => ({ current: s.current + r.aging.current, d1_30: s.d1_30 + r.aging.d1_30, d31_60: s.d31_60 + r.aging.d31_60, d61_90: s.d61_90 + r.aging.d61_90, d90plus: s.d90plus + r.aging.d90plus, total: s.total + r.aging.total }), { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-plum">Credit Reports</h1>
          <p className="text-slate-500">Outstanding balances, receivables aging, collections, and credit sales</p>
        </div>
        <Button variant="outline" onClick={doExport} disabled={!['outstanding', 'aging', 'collections', 'credit'].includes(tab)}>Export CSV</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([val, label]) => <Button key={val} variant={tab === val ? 'default' : 'outline'} size="sm" onClick={() => setTab(val)}>{label}</Button>)}
      </div>

      <div className="flex gap-2">
        <Input type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="w-44" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {tab === 'outstanding' && (
        <Table headers={['Customer', 'Balance', 'Last Charge', 'Last Payment']}
          rows={completed.filter((r) => r.balance > 0.01).map((r) => [r.name, MONEY(r.balance), r.lastCharge ? fmt(r.lastCharge) : '—', r.lastPayment ? fmt(r.lastPayment) : '—'])}
          empty="No outstanding balances" />
      )}

      {tab === 'aging' && (
        <Table headers={['Customer', 'Current', '1-30', '31-60', '61-90', '90+', 'Total']}
          rows={completed.map((r) => [r.name, MONEY(r.aging.current), MONEY(r.aging.d1_30), MONEY(r.aging.d31_60), MONEY(r.aging.d61_90), MONEY(r.aging.d90plus), MONEY(r.aging.total)])}
          empty="No customers"
          footer={['TOTAL', MONEY(totalAging.current), MONEY(totalAging.d1_30), MONEY(totalAging.d31_60), MONEY(totalAging.d61_90), MONEY(totalAging.d90plus), MONEY(totalAging.total)]} />
      )}

      {tab === 'collections' && (
        <Table headers={['Date', 'Customer', 'Amount', 'Method']}
          rows={payments.map((p) => [fmt(p.date), p.customer_name, MONEY(p.amount), p.note || ''])}
          empty="No payments in range" />
      )}

      {tab === 'credit' && (
        <Table headers={['Date', 'Customer', 'Cash', 'Credit', 'Total']}
          rows={creditSales.map((s) => [fmt(s.created_date), s.customer_name || '—', MONEY(s.cash_amount), MONEY(s.credit_amount), MONEY(s.total_amount)])}
          empty="No credit sales in range" />
      )}
    </div>
  )
}

function Table({ headers, rows, empty, footer }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-orange-50 text-left text-xs uppercase text-orange-600"><tr>{headers.map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => <tr key={i} className="border-t">{r.map((cell, j) => <td key={j} className="px-4 py-3">{cell}</td>)}</tr>)}
            {rows.length === 0 && <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-slate-400">{empty}</td></tr>}
          </tbody>
          {footer && <tfoot><tr className="border-t font-semibold">{footer.map((cell, j) => <td key={j} className="px-4 py-3">{cell}</td>)}</tr></tfoot>}
        </table>
      </div>
    </Card>
  )
}
