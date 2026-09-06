import { useStockMovements } from '@/hooks/usePurchaseData'
import { downloadCSV } from '@/lib/bookkeeping'
import { toManilaDisplayDate } from '@/lib/manilaTime'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { format } from 'date-fns'
import { Download, ArrowDownToLine, ArrowUpFromLine, Package } from 'lucide-react'
import { useState, useMemo } from 'react'
const REASONS = ['sale', 'void', 'restock', 'csv_import', 'manual_adjustment']
const REASON_STYLE = {
  sale: 'bg-rose-50 text-rose-600',
  void: 'bg-slate-100 text-slate-600',
  restock: 'bg-emerald-50 text-emerald-700',
  csv_import: 'bg-cyan-50 text-cyan-700',
  manual_adjustment: 'bg-amber-50 text-amber-700',
}

export default function StockMovements() {
  const { data: movements = [], isLoading } = useStockMovements()
  const [search, setSearch] = useState('')
  const [dir, setDir] = useState('all')
  const [reason, setReason] = useState('all')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return movements
      .filter(m => (dir === 'all' || m.direction === dir))
      .filter(m => (reason === 'all' || m.reason === reason))
      .filter(m => !q || (m.product_name || '').toLowerCase().includes(q) || (m.supplier_name || '').toLowerCase().includes(q) || (m.reference_id || '').toLowerCase().includes(q))
      .sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')))
  }, [movements, search, dir, reason])

  const stats = useMemo(() => {
    let inQty = 0, outQty = 0, inCost = 0, outRef = 0
    rows.forEach(m => {
      const q = Number(m.quantity) || 0
      const c = Number(m.purchase_cost) || 0
      if (m.direction === 'in') { inQty += q; inCost += c } else { outQty += q; outRef += 1 }
    })
    return { inQty, outQty, inCost, net: inQty - outQty }
  }, [rows])

  const exportCsv = () => downloadCSV('stock_movements.csv',
    ['Date', 'Product', 'Qty', 'Direction', 'Reason', 'Reference', 'Supplier', 'Paid', 'Purchase Cost', 'Input VAT', 'By'],
    rows.map(m => [format(toManilaDisplayDate(m.created_date), 'MMM dd, yyyy HH:mm'), m.product_name, Number(m.quantity), m.direction, m.reason, m.reference_id || '', m.supplier_name || '', m.paid ? 'Paid' : 'On Account', (Number(m.purchase_cost) || 0).toFixed(2), (Number(m.input_vat) || 0).toFixed(2), m.recorded_by || ''])
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-emerald-50/60 border-emerald-100"><div className="p-4"><p className="text-xs text-emerald-700"><ArrowDownToLine className="w-3 h-3 inline mr-1" />Stock In</p><p className="text-xl font-bold text-emerald-700">{stats.inQty.toFixed(2)}</p></div></Card>
        <Card className="bg-rose-50/60 border-rose-100"><div className="p-4"><p className="text-xs text-rose-600"><ArrowUpFromLine className="w-3 h-3 inline mr-1" />Stock Out</p><p className="text-xl font-bold text-rose-600">{stats.outQty.toFixed(2)}</p></div></Card>
        <Card className="bg-pink/10 border-pink/20"><div className="p-4"><p className="text-xs text-pink"><Package className="w-3 h-3 inline mr-1" />Net Movement</p><p className="text-xl font-bold text-plum">{stats.net.toFixed(2)}</p></div></Card>
        <Card className="bg-violet-50 border-violet-100"><div className="p-4"><p className="text-xs text-violet-700">Inflow Value</p><p className="text-xl font-bold text-violet-700">₱{stats.inCost.toFixed(2)}</p></div></Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product, supplier, reference…" /></div>
        <div className="space-y-0.5"><label className="text-xs text-slate-500">Direction</label><Select value={dir} onValueChange={setDir}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="in">In</SelectItem><SelectItem value="out">Out</SelectItem></SelectContent></Select></div>
        <div className="space-y-0.5"><label className="text-xs text-slate-500">Reason</label><Select value={reason} onValueChange={setReason}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Reasons</SelectItem>{REASONS.map(r => <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blue-50 text-left text-xs uppercase text-blue-600">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Terms</th><th className="px-4 py-3 text-right">Purchase Cost</th><th className="px-4 py-3 text-right">Input VAT</th><th className="px-4 py-3">By</th></tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No stock movements yet</td></tr>}
              {rows.map(m => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">{format(toManilaDisplayDate(m.created_date), 'MMM dd, yyyy HH:mm')}</td>
                  <td className="px-4 py-3 font-medium">{m.product_name}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${m.direction === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>{m.direction === 'in' ? '+' : '−'}{Number(m.quantity).toFixed(2)}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${REASON_STYLE[m.reason] || 'bg-slate-100 text-slate-600'}`}>{m.reason.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.reason === 'sale' || m.reason === 'void' ? (m.reference_id ? m.reference_id.slice(0, 8) : '—') : (m.po_id ? 'PO ' + (m.reference_id || '').slice(0, 8) : '—')}</td>
                  <td className="px-4 py-3 text-slate-600">{m.supplier_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{m.reason === 'restock' ? (m.paid ? 'Paid/Cash' : 'On Account') : '—'}</td>
                  <td className="px-4 py-3 text-right">{(m.direction === 'in' && Number(m.purchase_cost)) ? `₱${Number(m.purchase_cost).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 text-right">{Number(m.input_vat) ? `₱${Number(m.input_vat).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{m.recorded_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}