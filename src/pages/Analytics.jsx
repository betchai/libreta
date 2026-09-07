import { base44 } from '@/api/base44Client'
import { Card } from '@/components/ui/card'
import { isAdmin } from '@/lib/auth-roles'
import { useAuth } from '@/lib/AuthContext'
import { downloadCSV } from '@/lib/bookkeeping'
import { dashboardNarrative } from '@/lib/insights/report-narrator'
import { QUARTERS } from '@/lib/vat'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Download, Landmark, Lightbulb, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  DEMO_LEDGER_ENTRIES,
  DEMO_PRODUCTS,
  DEMO_SALES,
  DEMO_SETTINGS,
} from '@/lib/demoData'

const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`
const round2 = (n) => Math.round(Number(n) * 100) / 100

const SNAP_STYLE = {
  critical: { pill: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500', label: 'Critical' },
  attention: { pill: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', label: 'Needs attention' },
  good: { pill: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', label: 'Healthy' },
}

// Demo-mode fallback: one synthesized store row from the bundled demo data so
// the page isn't empty in /demo (where RPCs are stubbed out).
function demoSnapshot() {
  const now = Date.now()
  const day = 86400000
  const completed = DEMO_SALES.filter((s) => s.status === 'Completed')
  const inDays = (n) => completed.filter((s) => now - new Date(s.created_date).getTime() <= n * day)
  const last30 = inDays(30)
  const last7 = inDays(7)
  const prior7 = completed.filter((s) => {
    const age = now - new Date(s.created_date).getTime()
    return age > 7 * day && age <= 14 * day
  })
  const rev = (rows) => rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
  const rev7 = rev(last7)
  const revPrev = rev(prior7)
  const pct = revPrev > 0 ? ((rev7 - revPrev) / revPrev) * 100 : rev7 > 0 ? 100 : 0
  const low = DEMO_PRODUCTS.filter((p) => (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 0)).length
  const balByCust = {}
  for (const e of DEMO_LEDGER_ENTRIES) {
    const v = e.type === 'payment' ? -Math.abs(Number(e.amount) || 0) : Number(e.amount) || 0
    balByCust[e.customer_id] = (balByCust[e.customer_id] || 0) + v
  }
  const outstanding = Object.values(balByCust).reduce((s, b) => s + Math.max(b, 0), 0)
  const status = pct <= -25 && rev7 > 0 ? 'critical' : low > 0 || pct <= -10 ? 'attention' : 'good'
  return [{
    id: 'demo-tenant-id',
    business_name: DEMO_SETTINGS.business_name,
    revenue_30d: rev(last30),
    txns_30d: last30.length,
    sales_pct: Math.round(pct * 100) / 100,
    atv: last7.length ? Math.round((rev7 / last7.length) * 100) / 100 : 0,
    products: DEMO_PRODUCTS.length,
    low_stock: low,
    outstanding,
    status,
  }]
}

// Current quarter/year in Manila time (BIR filings run on Philippine time).
function currentManilaPeriod() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
  return { year: now.getFullYear(), quarter: `Q${Math.floor(now.getMonth() / 3) + 1}` }
}

// Demo-mode fallback: estimate the demo store's VAT posture from gross sales
// (VAT-inclusive 12%: vatable = gross / 1.12). Demo data carries no input-VAT
// records, so creditable input is 0 — same honest-zero the worksheets show.
function demoTaxSnapshot(year, qNum) {
  const months = [(qNum - 1) * 3, (qNum - 1) * 3 + 1, (qNum - 1) * 3 + 2]
  const inQuarter = (d) => {
    const dt = new Date(d)
    return dt.getFullYear() === year && months.includes(dt.getMonth())
  }
  const gross = DEMO_SALES.filter((s) => s.status === 'Completed' && inQuarter(s.created_date))
    .reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
  const vatable = gross / 1.12
  const output = gross - vatable
  return [{
    id: 'demo-tenant-id',
    business_name: DEMO_SETTINGS.business_name,
    vat_registered: DEMO_SETTINGS.vat_registered !== false,
    vatable_sales: round2(vatable),
    output_vat: round2(output),
    exempt_sales: 0,
    input_vat: 0,
    net_vat: round2(output),
    gross_receipts: round2(gross),
    percentage_tax: round2(gross * 0.03),
  }]
}

export default function Analytics() {
  const { user } = useAuth()
  const admin = isAdmin(user)

  const [taxPeriod, setTaxPeriod] = useState(currentManilaPeriod)
  const qNum = QUARTERS.findIndex((q) => q.id === taxPeriod.quarter) + 1
  const qLabel = QUARTERS.find((q) => q.id === taxPeriod.quarter)?.label || taxPeriod.quarter

  const demoRows = useMemo(() => (window.__DEMO__ ? demoSnapshot() : null), [])

  // ---- Multi-store snapshot (member-scoped RPC; superadmins see all stores) ----
  const { data: live = [], isLoading: snapLoading, error: snapErr } = useQuery({
    queryKey: ['myStoresSnapshot'],
    enabled: admin && !window.__DEMO__,
    queryFn: async () => {
      const { data, error } = await base44.rpc('my_stores_snapshot')
      if (error) throw new Error(error.message)
      return data || []
    },
  })

  const snapshots = window.__DEMO__ ? demoRows || [] : live

  // ---- Tax posture (member-scoped RPC; superadmins see all stores) ----
  const { data: liveTax = [], isLoading: taxLoading, error: taxErr } = useQuery({
    queryKey: ['myTaxSnapshot', taxPeriod.year, taxPeriod.quarter],
    enabled: admin && !window.__DEMO__ && qNum >= 1,
    queryFn: async () => {
      const { data, error } = await base44.rpc('my_tax_snapshot', { p_year: taxPeriod.year, p_quarter: qNum })
      if (error) throw new Error(error.message)
      return data || []
    },
  })

  const taxRows = useMemo(
    () => (window.__DEMO__ ? demoTaxSnapshot(taxPeriod.year, qNum) : liveTax),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveTax, taxPeriod.year, taxPeriod.quarter],
  )

  // ---- Tax narratives: deterministic text from the quarter snapshot ----
  const taxNarratives = (() => {
    if (!taxRows.length) return null
    const lines = []
    const vatStores = taxRows.filter((r) => r.vat_registered !== false)
    const nonVat = taxRows.filter((r) => r.vat_registered === false)
    if (vatStores.length) {
      const out = vatStores.reduce((s, r) => s + (Number(r.output_vat) || 0), 0)
      const inp = vatStores.reduce((s, r) => s + (Number(r.input_vat) || 0), 0)
      const net = out - inp
      lines.push(
        net >= 0
          ? `Across ${vatStores.length} VAT-registered store${vatStores.length === 1 ? '' : 's'}, output VAT of ${MONEY(out)} against ${MONEY(inp)} creditable input VAT leaves net VAT payable of ${MONEY(net)} for ${taxPeriod.quarter} ${taxPeriod.year}.`
          : `Across ${vatStores.length} VAT-registered store${vatStores.length === 1 ? '' : 's'}, creditable input VAT of ${MONEY(inp)} exceeds output VAT of ${MONEY(out)} — excess input VAT of ${MONEY(Math.abs(net))} to carry over for ${taxPeriod.quarter} ${taxPeriod.year}.`,
      )
      const top = [...vatStores].sort((a, b) => (Number(b.net_vat) || 0) - (Number(a.net_vat) || 0))[0]
      if (top && Number(top.net_vat) > 0) {
        lines.push(`${top.business_name} carries the highest net VAT payable at ${MONEY(top.net_vat)}.`)
      }
      const excess = vatStores.filter((r) => Number(r.net_vat) < 0)
      if (excess.length) {
        lines.push(`${excess.length} store${excess.length === 1 ? '' : 's'} with excess input VAT: ${excess.map((r) => r.business_name).join(', ')}.`)
      }
    }
    if (nonVat.length) {
      const pct = nonVat.reduce((s, r) => s + (Number(r.percentage_tax) || 0), 0)
      lines.push(
        `${nonVat.length} non-VAT store${nonVat.length === 1 ? '' : 's'} (${nonVat.map((r) => r.business_name).join(', ')}) carr${nonVat.length === 1 ? 'ies' : 'y'} an estimated ${MONEY(pct)} in percentage tax (3% of gross) for ${taxPeriod.quarter} ${taxPeriod.year}.`,
      )
    }
    lines.push('Estimates from recorded sales, purchases, and expenses — verify with your tax preparer before filing.')
    return lines
  })()

  const exportTaxCSV = () => {
    downloadCSV(
      `tax_insights_${taxPeriod.quarter}_${taxPeriod.year}.csv`,
      ['Business', 'Regime', 'Vatable Sales', 'Output VAT', 'Input VAT', 'Net VAT', 'Gross Receipts', 'Percentage Tax (3%)'],
      taxRows.map((r) => [
        r.business_name,
        r.vat_registered === false ? 'Non-VAT' : 'VAT',
        (Number(r.vatable_sales) || 0).toFixed(2),
        (Number(r.output_vat) || 0).toFixed(2),
        (Number(r.input_vat) || 0).toFixed(2),
        (Number(r.net_vat) || 0).toFixed(2),
        (Number(r.gross_receipts) || 0).toFixed(2),
        (Number(r.percentage_tax) || 0).toFixed(2),
      ]),
    )
  }

  // ---- Narratives: deterministic text from the live snapshot ----
  const narratives = (() => {
    if (!snapshots.length) return null
    const totalRev = snapshots.reduce((s, r) => s + (Number(r.revenue_30d) || 0), 0)
    const totalTxns = snapshots.reduce((s, r) => s + (Number(r.txns_30d) || 0), 0)
    const avgPct = snapshots.reduce((s, r) => s + (Number(r.sales_pct) || 0), 0) / snapshots.length
    const lowRisk = snapshots.filter((r) => Number(r.low_stock) > 0)
    const credit = snapshots.reduce((s, r) => s + (Number(r.outstanding) || 0), 0)
    return [
      `Across ${snapshots.length} store${snapshots.length === 1 ? '' : 's'}, 30-day revenue is ${MONEY(totalRev)} from ${totalTxns} transactions.`,
      dashboardNarrative({ sales_pct: avgPct }, []),
      lowRisk.length
        ? `${lowRisk.length} store${lowRisk.length === 1 ? ' has' : 's have'} low-stock items: ${lowRisk.map((r) => r.business_name).join(', ')}.`
        : 'No store has low-stock items right now.',
      credit > 0 ? `Outstanding customer credit across stores is ${MONEY(credit)}.` : 'No outstanding customer credit across stores.',
    ]
  })()

  if (!admin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-plum">Analytics</h1>
          <p className="text-slate-500">Multi-store insights for admins</p>
        </div>
        <Card className="p-8 text-center">
          <ShieldCheck className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">Analytics requires a store admin account.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-plum">Analytics</h1>
        <p className="text-slate-500">Multi-store insights and narratives across your businesses</p>
      </div>

      {/* ---- Multi-store insights (my_stores_snapshot RPC) ---- */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-slate-800"><BarChart3 className="w-4 h-4" /> Multi-Store Insights</h3>
          <span className="text-xs text-slate-400">30d revenue · 7d vs prior-7d sales trend · outstanding credit</span>
        </div>
        {snapErr ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Snapshot unavailable.</p>
        ) : snapLoading ? (
          <div className="py-10 text-center text-slate-400 text-sm">Loading snapshot…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-purple-50 text-left text-xs uppercase text-purple-600">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3 text-right">30d Revenue</th>
                  <th className="px-4 py-3 text-right">Txns</th>
                  <th className="px-4 py-3 text-right">7d Trend</th>
                  <th className="px-4 py-3 text-right">ATV</th>
                  <th className="px-4 py-3 text-right">Products</th>
                  <th className="px-4 py-3 text-right">Low Stock</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => {
                  const pill = SNAP_STYLE[s.status] || SNAP_STYLE.good
                  const pct = Number(s.sales_pct) || 0
                  const pctCls = pct < 0 ? 'text-rose-600' : pct > 0 ? 'text-emerald-600' : 'text-slate-500'
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{s.business_name}</td>
                      <td className="px-4 py-3 text-right">{MONEY(s.revenue_30d)}</td>
                      <td className="px-4 py-3 text-right">{s.txns_30d}</td>
                      <td className={`px-4 py-3 text-right ${pctCls}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right">{MONEY(s.atv)}</td>
                      <td className="px-4 py-3 text-right">{s.products}</td>
                      <td className="px-4 py-3 text-right">
                        {Number(s.low_stock) > 0 ? <span className="text-rose-600 font-semibold">{s.low_stock}</span> : 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {Number(s.outstanding) > 0 ? <span className="text-amber-600">{MONEY(s.outstanding)}</span> : MONEY(0)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.pill}`}>
                          <span className={`w-2 h-2 rounded-full ${pill.dot}`} />{pill.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {snapshots.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No snapshot data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---- Narratives (deterministic, from the live snapshot) ---- */}
      <Card className="p-4">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800"><Lightbulb className="w-4 h-4" /> Narratives</h3>
        <p className="text-xs text-slate-500 mb-4">Deterministic narratives from your live multi-store data</p>
        {narratives ? (
          <div className="space-y-2">
            {narratives.map((line, idx) => (
              <p key={idx} className="text-sm text-slate-600">{line}</p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Snapshot data will appear here once stores record sales.</p>
        )}
      </Card>

      {/* ---- Tax Insights (my_tax_snapshot RPC, quarter-scoped) ---- */}
      <Card className="overflow-hidden" id="tax-insights">
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-slate-800"><Landmark className="w-4 h-4" /> Tax Insights</h3>
            <p className="text-xs text-slate-500 mt-0.5">Per-store VAT posture across your businesses · {qLabel} {taxPeriod.year}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              aria-label="Tax year"
              value={taxPeriod.year}
              onChange={(e) => setTaxPeriod((p) => ({ ...p, year: Number(e.target.value) }))}
              className="h-9 w-24 rounded-md border border-input px-3 text-sm"
            />
            <select
              aria-label="Tax quarter"
              value={taxPeriod.quarter}
              onChange={(e) => setTaxPeriod((p) => ({ ...p, quarter: e.target.value }))}
              className="h-9 rounded-md border border-input px-3 text-sm"
            >
              {QUARTERS.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
            </select>
            <button
              type="button"
              onClick={exportTaxCSV}
              disabled={!taxRows.length}
              className="inline-flex items-center gap-1.5 h-9 rounded-md border border-input px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />Export
            </button>
          </div>
        </div>
        {taxErr ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Tax snapshot unavailable.</p>
        ) : taxLoading ? (
          <div className="py-10 text-center text-slate-400 text-sm">Loading tax snapshot…</div>
        ) : taxRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">No tax data for this quarter yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-purple-50 text-left text-xs uppercase text-purple-600">
                  <tr>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3">Regime</th>
                    <th className="px-4 py-3 text-right">Vatable Sales</th>
                    <th className="px-4 py-3 text-right">Output VAT</th>
                    <th className="px-4 py-3 text-right">Input VAT</th>
                    <th className="px-4 py-3 text-right">Net VAT</th>
                    <th className="px-4 py-3 text-right">% Tax (3%)</th>
                  </tr>
                </thead>
                <tbody>
                  {taxRows.map((r) => {
                    const nonVat = r.vat_registered === false
                    const net = Number(r.net_vat) || 0
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-4 py-3 font-medium">{r.business_name}</td>
                        <td className="px-4 py-3">
                          {nonVat
                            ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-cyan-100 text-cyan-700">Non-VAT</span>
                            : <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700">VAT</span>}
                        </td>
                        <td className="px-4 py-3 text-right">{nonVat ? <span className="text-slate-300">—</span> : MONEY(r.vatable_sales)}</td>
                        <td className="px-4 py-3 text-right">{nonVat ? <span className="text-slate-300">—</span> : MONEY(r.output_vat)}</td>
                        <td className="px-4 py-3 text-right">{nonVat ? <span className="text-slate-300">—</span> : MONEY(r.input_vat)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${nonVat ? 'text-slate-300' : net > 0 ? 'text-rose-600' : net < 0 ? 'text-blue-700' : 'text-slate-500'}`}>
                          {nonVat ? '—' : net < 0 ? `(${MONEY(Math.abs(net))})` : MONEY(net)}
                        </td>
                        <td className="px-4 py-3 text-right">{nonVat ? MONEY(r.percentage_tax) : <span className="text-slate-300">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t bg-slate-50/60 space-y-2">
              {taxNarratives.map((line, idx) => (
                <p key={idx} className="text-sm text-slate-600">{line}</p>
              ))}
              <p className="text-xs text-slate-400 pt-1">Filing worksheets per store live under BIR Compliance for the active business.</p>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
