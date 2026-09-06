import { Card } from '@/components/ui/card'
import { useLedgerEntries } from '@/hooks/useCustomerData'
import { useCustomers } from '@/hooks/useCustomers'
import { useExpenses } from '@/hooks/useExpenseData'
import { useProducts } from '@/hooks/useProducts'
import { useSales } from '@/hooks/useSales'
import { useSettings } from '@/hooks/useSettings'
import { useTenantId } from '@/hooks/useTenantId'
import { computeBalance, entriesForCustomer } from '@/lib/customerCredit'
import { toManilaDisplayDate } from '@/lib/manilaTime'
import { buildHealthStatement, generateInsights } from '@/lib/insights/engine'
import { buildForecast } from '@/lib/insights/forecast'
import { format } from 'date-fns'
import { Download } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar, Cell } from 'recharts'

const PAYMENT_COLORS = {
  Cash: '#ed4f9b',
  Gcash: '#4d9de0',
  GCash: '#4d9de0',
  Card: '#9a7bd1',
  Utang: '#f59b78',
  'Bank Transfer': '#5dc9a4',
  Split: '#ff82b8',
  Credit: '#f59b78',
  Other: '#c4b5fd',
}
const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`

export default function Dashboard() {
  const tenantId = useTenantId()
  const { data: sales = [], isLoading } = useSales()
  const { data: products = [] } = useProducts()
  const { data: customers = [] } = useCustomers()
  const { data: ledgerEntries = [] } = useLedgerEntries()
  const { data: expenses = [] } = useExpenses()
  const { settings } = useSettings()

  const completed = sales.filter((s) => s.status === 'Completed')
  const revenue = completed.reduce((s, x) => s + (Number(x.total_amount) || 0), 0)
  const outstanding = customers.reduce((s, c) => s + Math.max(0, computeBalance(entriesForCustomer(ledgerEntries, c.id))), 0)
  const lowStock = products.filter((p) => p.stock_quantity <= p.low_stock_threshold)

  const insights = useMemo(() => {
    if (isLoading || !tenantId) return null
    const items = sales.flatMap((s) => s.items || [])
    try {
      const input = { tenant_id: tenantId, sales, items, products, customers, ledgerEntries, expenses, settings: settings || {} }
      const report = generateInsights(input)
      return {
        ...report,
        health: buildHealthStatement(report.digest, report.insights),
        forecast: buildForecast(input),
      }
    } catch {
      return null
    }
  }, [tenantId, isLoading, sales, products, customers, ledgerEntries, expenses, settings])

  const chart = useMemo(() => {
    const byMethod = {}
    completed.forEach((s) => { const m = s.payment_method || 'Other'; byMethod[m] = (byMethod[m] || 0) + (Number(s.total_amount) || 0) })
    return Object.entries(byMethod).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
  }, [completed])

  const recent = [...completed].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 10)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-plum">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Recent Revenue" value={MONEY(revenue)} color="pink" />
        <Stat label="Transactions" value={String(completed.length)} color="blue" />
        <Stat label="Total Products" value={String(products.length)} color="purple" />
        <Stat label="Outstanding Receivables" value={MONEY(outstanding)} color="peach" />
      </div>

      {insights && <InsightsPanel report={insights} />}

      {lowStock.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <b>{lowStock.length}</b> product(s) at or below their low-stock threshold.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold text-plum mb-3">Sales Overview</h3>
          <div className="flex flex-wrap gap-3 mb-4">
            {chart.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1.5 text-xs font-medium">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: PAYMENT_COLORS[entry.name] || '#c4b5fd' }} />
                <span className="text-slate-600">{entry.name}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => MONEY(v)} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chart.map((entry) => (
                  <Cell key={entry.name} fill={PAYMENT_COLORS[entry.name] || '#c4b5fd'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-plum mb-4">Low Stock Alerts</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between border border-pink/10 rounded-lg p-2 text-sm">
                <span className="font-medium text-plum">{p.name}</span>
                <span className={`font-semibold ${p.stock_quantity <= 0 ? 'text-rose-600' : 'text-amber-600'}`}>{Number(p.stock_quantity).toFixed(2)} {p.base_unit}</span>
              </div>
            ))}
            {lowStock.length === 0 && <p className="text-sm text-slate-400 text-center py-6">All stock levels healthy 🎉</p>}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-6">
        <h3 className="font-semibold text-plum mb-3">Recent Transactions</h3>
        {isLoading ? <div className="py-6 text-center text-slate-400">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-pink-50 text-left text-xs uppercase text-pink-600"><tr><th className="px-4 py-2">Txn</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Cashier</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2">Payment</th></tr></thead>
              <tbody>
                {recent.map((s) => <tr key={s.id} className="border-t"><td className="px-4 py-2 font-mono text-xs">{s.id.slice(0, 8)}</td><td className="px-4 py-2 text-slate-500">{format(toManilaDisplayDate(s.created_date), 'MM-dd HH:mm')}</td><td className="px-4 py-2">{s.cashier_name || '—'}</td><td className="px-4 py-2 text-right font-medium">{MONEY(s.total_amount)}</td><td className="px-4 py-2"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: PAYMENT_COLORS[s.payment_method] || '#c4b5fd' }} />{s.payment_method}</span></td></tr>)}
                {recent.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No transactions yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

const STAT_COLORS = {
  pink: { bg: 'bg-pink-50', border: 'border-pink-100', accent: 'bg-pink-500', text: 'text-pink-600' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-100', accent: 'bg-blue-500', text: 'text-blue-600' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-100', accent: 'bg-purple-500', text: 'text-purple-600' },
  peach: { bg: 'bg-orange-50', border: 'border-orange-100', accent: 'bg-orange-400', text: 'text-orange-600' },
}

const SEVERITY_STYLE = {
  critical: { pill: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  warning: { pill: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  positive: { pill: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  info: { pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
}
const STATUS_STYLE = {
  'needs-attention': { pill: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500', label: 'Attention needed' },
  watch: { pill: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', label: 'Worth a look' },
  improving: { pill: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', label: 'Improving' },
  steady: { pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', label: 'Running steady' },
}
const SIGN_STYLE = (v) => (v > 0 ? 'text-emerald-600' : v < 0 ? 'text-rose-600' : 'text-slate-500')

function exportInsightsCsv(report) {
  const { health, digest, insights, forecast } = report
  const f = forecast?.store
  const lines = []
  const csv = (r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')
  lines.push(csv(['Libreta Insights export', new Date().toISOString()]))
  lines.push(csv([`Status: ${health.status}`, health.summary]))
  lines.push('')
  lines.push(csv(['Metric', 'Value']))
  lines.push(csv(['Sales change (7d)', `${digest.sales_pct >= 0 ? '+' : ''}${digest.sales_pct}%`]))
  lines.push(csv(['Sales baseline pace', digest.sales_baseline]))
  lines.push(csv(['Gross margin', `${digest.margin_pct}% (${digest.margin_delta_pp >= 0 ? '+' : ''}${digest.margin_delta_pp} pts)`]))
  lines.push(csv(['Avg transaction', digest.atv]))
  lines.push(csv(['Transactions (7d)', digest.transactions]))
  lines.push(csv(['Outstanding credit', digest.outstanding]))
  lines.push(csv(['Credit share', `${digest.credit_pct >= 0 ? '+' : ''}${digest.credit_pct}%`]))
  lines.push(csv(['Forecast revenue 7d', f?.next_7?.revenue]))
  lines.push(csv(['Forecast units 7d', f?.next_7?.units]))
  lines.push(csv(['Forecast revenue 30d', f?.next_30?.revenue]))
  lines.push(csv(['Forecast units 30d', f?.next_30?.units]))
  lines.push('')
  lines.push(csv(['Insights', 'Severity', 'Title', 'Summary']))
  insights.forEach((i) => lines.push(csv([i.id, i.severity, i.title, i.summary])))
  lines.push('')
  lines.push(csv(['Reorder suggestions', 'Qty (base units)', 'Order cost', 'Days of cover']))
  ;(forecast?.reorder?.lines || []).forEach((r) => lines.push(csv([r.product_name, r.order_qty, r.order_cost, `${r.days_of_cover}d`])))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `libreta-insights-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function InsightsPanel({ report }) {
  const { health, digest, insights, forecast } = report
  const status = STATUS_STYLE[health.status] || STATUS_STYLE.steady
  const d = digest
  const f = forecast?.store
  const reorders = forecast?.reorder?.lines || []
  return (
    <Card className={`p-6 border-l-4 ${health.status === 'needs-attention' ? 'border-l-rose-500' : health.status === 'watch' ? 'border-l-amber-400' : 'border-l-emerald-500'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="font-semibold text-plum">Libreta Insights</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportInsightsCsv(report)}><Download className="w-3.5 h-3.5 mr-1.5" />CSV</Button>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status.pill}`}>
            <span className={`w-2 h-2 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>
      </div>
      <p className="text-sm text-slate-600">{health.summary}</p>
      {forecast?.generated_at && (
        <p className="text-[11px] text-slate-400 mt-0.5">
          Computed {format(new Date(forecast.generated_at), 'MMM d, h:mm a')} · {f?.products_with_history ?? 0} products with sales history
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <MiniStat label="Sales (7d)" value={`${d.sales_pct >= 0 ? '+' : ''}${d.sales_pct}%`} tone={SIGN_STYLE(d.sales_pct)} sub={`vs ${MONEY(d.sales_baseline)} pace`} />
        <MiniStat label="Gross Margin" value={`${d.margin_pct}%`} tone={SIGN_STYLE(d.margin_delta_pp)} sub={`${d.margin_delta_pp >= 0 ? '+' : ''}${d.margin_delta_pp} pts`} />
        <MiniStat label="Avg Transaction" value={MONEY(d.atv)} sub={`${d.transactions} txns`} />
        <MiniStat label="Outstanding Credit" value={MONEY(d.outstanding)} tone={d.credit_pct > 0 ? 'text-amber-600' : 'text-slate-500'} sub={`${d.credit_pct >= 0 ? '+' : ''}${d.credit_pct}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-5">
        <div>
          <h4 className="text-xs uppercase font-semibold tracking-wide text-slate-400 mb-2">What to look at</h4>
          {insights.length ? (
            <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {insights.slice(0, 8).map((i) => {
                const s = SEVERITY_STYLE[i.severity] || SEVERITY_STYLE.info
                return (
                  <li key={i.id} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                      <span className="text-sm font-medium text-plum">{i.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 pl-4">{i.summary}</p>
                    {i.evidence?.length > 0 && (
                      <ul className="mt-1.5 pl-4 space-y-0.5">
                        {i.evidence.slice(0, 3).map((e, idx) => (
                          <li key={idx} className="text-xs text-slate-500 flex items-baseline gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0 self-center" />
                            <span className="break-words">{e}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 py-6 text-center">Nothing unusual detected.</p>
          )}
        </div>

        <div>
          <h4 className="text-xs uppercase font-semibold tracking-wide text-slate-400 mb-2">Demand forecast & reorder</h4>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Next 7 days" value={MONEY(f?.next_7?.revenue)} sub={`${f?.next_7?.units ?? 0} units`} />
            <MiniStat label="Next 30 days" value={MONEY(f?.next_30?.revenue)} sub={`${f?.next_30?.units ?? 0} units`} />
          </div>
          {reorders.length ? (
            <ul className="mt-3 space-y-1.5">
              {reorders.map((r) => (
                <li key={r.product_id} className="flex items-center justify-between gap-2 text-sm rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                  <span className="font-medium text-plum truncate">{r.product_name}</span>
                  <span className="text-xs whitespace-nowrap">
                    <b className="text-amber-700">+{r.order_qty}</b> {MONEY(r.order_cost)} · {r.days_of_cover}d cover
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            forecast?.reorder?.count === 0 && <p className="text-sm text-slate-400 py-4 text-center">Stock comfortably covers forecast demand.</p>
          )}
        </div>
      </div>
    </Card>
  )
}

function MiniStat({ label, value, tone = 'text-slate-700', sub = '' }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">{label}</div>
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-400">{sub}</div>
    </div>
  )
}

function Stat({ label, value, color = 'pink' }) {
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
