import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useJournalEntries, useChartOfAccounts } from '@/hooks/useJournalData'
import { useTenantId } from '@/hooks/useTenantId'
import { downloadCSV } from '@/lib/bookkeeping'
import { toManilaDisplayDate } from '@/lib/manilaTime'
import { format } from 'date-fns'
import { Download } from 'lucide-react'
import { useState, useMemo } from 'react'
const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`
const fmt = (d) => format(toManilaDisplayDate(d), 'MM-dd-yyyy')

export default function Bookkeeping() {
  const tenantId = useTenantId()
  const { data: entries = [], isLoading } = useJournalEntries()
  const { data: coa = [] } = useChartOfAccounts()
  const [tab, setTab] = useState('gl')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const within = (d) => { if (from && d < new Date(`${from}T00:00:00`)) return false; if (to && d > new Date(`${to}T23:59:59`)) return false; return true }
  const inRange = entries.filter((e) => within(new Date(e.date)))

  const sorted = useMemo(() => inRange.sort((a, b) => new Date(a.date) - new Date(b.date)), [inRange])

  const trial = useMemo(() => {
    const balance = {}
    sorted.forEach((e) => (e.lines || []).forEach((l) => {
      balance[l.account] = balance[l.account] || { code: l.account, name: l.account_name, debit: 0, credit: 0 }
      balance[l.account].debit += Number(l.debit_amount) || 0
      balance[l.account].credit += Number(l.credit_amount) || 0
    }))
    const COA = coa.length ? coa : Object.values(balance)
    return Object.values(balance).map((b) => {
      const meta = COA.find((c) => c.code === b.code)
      const debit = b.debit - b.credit
      const credit = b.credit - b.debit
      return { ...b, type: meta?.type, debit: Math.max(0, debit), credit: Math.max(0, credit) }
    }).sort((a, b) => a.code.localeCompare(b.code))
  }, [sorted, coa])

  const trialTotal = (key) => trial.reduce((s, r) => s + (Number(r[key]) || 0), 0)

  // Resolve account names from the Chart of Accounts (some journal lines stored
  // the code as account_name, so we prefer the COA name when available).
  const coaMap = useMemo(() => Object.fromEntries(coa.map((c) => [c.code, c.name])), [coa])
  const acctName = (code, fallback) => coaMap[code] || fallback || code

  const tabs = [['gl', 'General Ledger'], ['crj', 'Cash Receipts Journal'], ['cdj', 'Cash Disbursements Journal'], ['tb', 'Trial Balance']]

  const exportCurrent = () => {
    if (tab === 'gl') downloadCSV('general_ledger.csv', ['Date', 'Reference', 'Account', 'Debit', 'Credit'], sorted.flatMap((e) => (e.lines || []).map((l) => [fmt(e.date), e.reference_type, `${l.account} — ${acctName(l.account, l.account_name)}`, (Number(l.debit_amount) || 0).toFixed(2), (Number(l.credit_amount) || 0).toFixed(2)])))
    else if (tab === 'tb') downloadCSV('trial_balance.csv', ['Account', 'Type', 'Debit', 'Credit'], trial.map((r) => [`${r.code} — ${acctName(r.code, r.name)}`, r.type || '', r.debit.toFixed(2), r.credit.toFixed(2)]))
  }

  // CRJ: journal entries with a Cash debit. CDJ: with a Cash credit.
  const crj = sorted.filter((e) => (e.lines || []).some((l) => l.account === '1000' && Number(l.debit_amount) > 0))
  const cdj = sorted.filter((e) => (e.lines || []).some((l) => l.account === '1000' && Number(l.credit_amount) > 0))

  const needsTb = tab === 'tb'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-plum">Bookkeeping</h1>
          <p className="text-slate-500">Auto-generated journal entries and reports</p>
        </div>
        <Button variant="outline" onClick={exportCurrent} disabled={tab === 'crj' || tab === 'cdj'}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([val, label]) => <Button key={val} variant={tab === val ? 'default' : 'outline'} size="sm" onClick={() => setTab(val)}>{label}</Button>)}
      </div>

      <div className="flex gap-2">
        <Input type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="w-44" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {isLoading ? <div className="py-10 text-center text-slate-400">Loading…</div> : (
        <>
          {(tab === 'gl') && <JournalTable entries={sorted} coaMap={coaMap} />}
          {(tab === 'crj') && <JournalTable entries={crj} coaMap={coaMap} />}
          {(tab === 'cdj') && <JournalTable entries={cdj} coaMap={coaMap} />}
          {needsTb && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-purple-50 text-left text-xs uppercase text-purple-600"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th></tr></thead>
                  <tbody>
                    {trial.map((r) => <tr key={r.code} className="border-t"><td className="px-4 py-3 font-medium">{r.code} — {acctName(r.code, r.name)}</td><td className="px-4 py-3 text-slate-500">{r.type || '—'}</td><td className="px-4 py-3 text-right">{MONEY(r.debit)}</td><td className="px-4 py-3 text-right">{MONEY(r.credit)}</td></tr>)}
                    {trial.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No journal entries</td></tr>}
                  </tbody>
                  <tfoot><tr className="border-t font-semibold"><td colSpan={2} className="px-4 py-3">TOTALS</td><td className="px-4 py-3 text-right">{MONEY(trialTotal('debit'))}</td><td className="px-4 py-3 text-right">{MONEY(trialTotal('credit'))}</td></tr></tfoot>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function JournalTable({ entries, coaMap = {} }) {
  const acctName = (code, fallback) => coaMap[code] || fallback || code
  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <Card key={e.id} className="p-4">
          <div className="flex items-center justify-between text-sm">
            <div><span className="font-mono text-xs text-slate-400">{e.id.slice(0, 8)}</span><span className="ml-2 font-medium text-slate-800">{e.description}</span></div>
            <div className="text-xs text-slate-400">{fmt(e.date)} · <span className="text-slate-500">{e.reference_type}</span></div>
          </div>
          <div className="mt-2 rounded border">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-purple-50 text-left text-xs uppercase text-purple-600"><tr><th className="px-3 py-1.5">Account</th><th className="px-3 py-1.5 text-right">Debit</th><th className="px-3 py-1.5 text-right">Credit</th></tr></thead>
              <tbody>
                {(e.lines || []).map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5">{l.account} — {acctName(l.account, l.account_name)}</td>
                    <td className="px-3 py-1.5 text-right">{Number(l.debit_amount) ? MONEY(l.debit_amount) : ''}</td>
                    <td className="px-3 py-1.5 text-right">{Number(l.credit_amount) ? MONEY(l.credit_amount) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </Card>
      ))}
      {entries.length === 0 && <div className="py-10 text-center text-slate-400">No entries in range</div>}
    </div>
  )
}
