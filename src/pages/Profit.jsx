import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useSales } from '@/hooks/useSales'
import { useSettings } from '@/hooks/useSettings'
import { downloadCSV } from '@/lib/bookkeeping'
import { Download } from 'lucide-react'
import { useState, useMemo } from 'react'
const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`

const PRESETS = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'month', label: 'This Month', days: 30 },
  { id: 'quarter', label: 'This Quarter', days: 90 },
  { id: 'all', label: 'All Time', days: null },
]

export default function Profit() {
  const { data: sales = [], isLoading } = useSales()
  const { data: settings } = useSettings()
  const [preset, setPreset] = useState('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const inRange = useMemo(() => {
    const startOfDay = (offsetDays = 0) => {
      const t = new Date()
      t.setHours(0, 0, 0, 0)
      t.setDate(t.getDate() - offsetDays)
      return t.getTime()
    }
    const p = PRESETS.find((x) => x.id === preset)
    const start = p?.days != null ? startOfDay(p.days) : 0
    return sales.filter((s) => {
      if (s.status !== 'Completed') return false
      const d = new Date(s.created_date).getTime()
      if (from && d < new Date(`${from}T00:00:00`)) return false
      if (to && d > new Date(`${to}T23:59:59`)) return false
      if (from || to || preset !== 'all') {
        if (d < start) return false
      }
      return true
    })
  }, [sales, preset, from, to])

  const byProduct = useMemo(() => {
    const acc = {}
    inRange.forEach((s) => (s.items || []).forEach((i) => {
      const qty = Number(i.quantity) || 0
      const revenue = Number(i.net_amount ?? i.subtotal) || 0
      const cost = (Number(i.cost_price_at_sale) || 0) * qty
      acc[i.product_id] = acc[i.product_id] || { product_name: i.product_name, unit: '', qty: 0, revenue: 0, cost: 0 }
      acc[i.product_id].qty += qty
      acc[i.product_id].revenue += revenue
      acc[i.product_id].cost += cost
    }))
    return Object.values(acc).map((r) => ({ ...r, profit: r.revenue - r.cost, margin: r.revenue ? ((r.revenue - r.cost) / r.revenue) * 100 : 0 })).sort((a, b) => b.profit - a.profit)
  }, [inRange])

  const revenue = inRange.reduce((s, x) => s + (Number(x.total_amount) || 0), 0)
  const cogs = byProduct.reduce((s, x) => s + x.cost, 0)
  const totalProfit = revenue - cogs
  const margin = revenue ? (totalProfit / revenue) * 100 : 0

  const exportCSV = () => downloadCSV('profit_report.csv', ['Product', 'Units', 'Revenue', 'COGS', 'Profit', 'Margin %'], byProduct.map((r) => [r.product_name, r.qty.toFixed(2), r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(1)]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-plum">Profit Report</h1><p className="text-slate-500">Revenue, COGS, and margin by product</p></div>
        <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => <Button key={p.id} variant={preset === p.id ? 'default' : 'outline'} size="sm" onClick={() => setPreset(p.id)}>{p.label}</Button>)}
        <div className="flex items-center gap-2 ml-2">
          <Input type="date" className="w-40 h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-400">to</span>
          <Input type="date" className="w-40 h-9" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Revenue" value={MONEY(revenue)} color="pink" />
        <Stat label="Cost of Goods" value={MONEY(cogs)} color="blue" />
        <Stat label="Total Profit" value={MONEY(totalProfit)} color="purple" />
        <Stat label="Margin" value={`${margin.toFixed(1)}%`} color="peach" />
      </div>

      {isLoading ? <div className="py-10 text-center text-slate-400">Loading…</div> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-pink-50 text-left text-xs uppercase text-pink-600"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Units</th><th className="px-4 py-3 text-right">Revenue</th><th className="px-4 py-3 text-right">COGS</th><th className="px-4 py-3 text-right">Profit</th><th className="px-4 py-3 text-right">Margin</th></tr></thead>
              <tbody>
                {byProduct.map((r) => <tr key={r.product_name} className="border-t"><td className="px-4 py-3 font-medium">{r.product_name}</td><td className="px-4 py-3 text-right">{r.qty.toFixed(2)}</td><td className="px-4 py-3 text-right">{MONEY(r.revenue)}</td><td className="px-4 py-3 text-right">{MONEY(r.cost)}</td><td className="px-4 py-3 text-right font-semibold text-pink">{MONEY(r.profit)}</td><td className="px-4 py-3 text-right">{r.margin.toFixed(1)}%</td></tr>)}
                {byProduct.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No sales in range</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
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
