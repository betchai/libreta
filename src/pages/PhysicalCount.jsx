import { base44 } from '@/api/base44Client'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useProducts } from '@/hooks/useProducts'
import { useTenantId } from '@/hooks/useTenantId'
import { useAuth } from '@/lib/AuthContext'
import { isAdmin } from '@/lib/auth-roles'
import { createJournalEntry, INV_CODE, COGS_CODE, ensureChartOfAccounts } from '@/lib/bookkeeping'
import { downloadCSV } from '@/lib/bookkeeping'
import { format } from 'date-fns'
import { Download, Search, FileText, AlertTriangle, RotateCcw, Loader2, Save, Printer, CheckCircle } from 'lucide-react'
import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'

const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`
const VARIANCE_THRESHOLD = 0.02

const REASON_STYLE = {
  manual_adjustment: 'bg-amber-50 text-amber-700',
}

export default function PhysicalCount() {
  const { user } = useAuth()
  const admin = isAdmin(user)
  const tenantId = useTenantId()
  const { data: products = [], isLoading } = useProducts()

  const [countSheets, setCountSheets] = useState([])
  const [activeSheetId, setActiveSheetId] = useState(null)
  const [blindCount, setBlindCount] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [showOnlyVariance, setShowOnlyVariance] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [posting, setPosting] = useState(false)
  const [printing, setPrinting] = useState(false)

  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))], [products])

  const filteredProducts = useMemo(() => {
    let result = products
    if (filterCategory) result = result.filter(p => p.category === filterCategory)
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [products, filterCategory, filterSearch])

  const sheetProducts = useMemo(() => {
    if (!activeSheetId) return []
    const sheet = countSheets.find(s => s.id === activeSheetId)
    return sheet ? sheet.items : []
  }, [countSheets, activeSheetId])

  const varianceItems = useMemo(() => {
    return sheetProducts.filter(item => {
      const variance = Number(item.actual_qty || 0) - Number(item.system_qty || 0)
      const pct = Number(item.system_qty || 0) > 0
        ? Math.abs(variance) / Number(item.system_qty)
        : variance !== 0 ? 1 : 0
      return pct > VARIANCE_THRESHOLD
    })
  }, [sheetProducts])

  const generateCountSheet = useCallback(async () => {
    if (!filteredProducts.length) {
      toast.error('No products to include in count sheet')
      return
    }
    setGenerating(true)
    try {
      const sheetId = crypto.randomUUID()
      const sheet = {
        id: sheetId,
        name: `Count Sheet ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
        date: new Date().toISOString(),
        blind: blindCount,
        items: filteredProducts.map(p => ({
          product_id: p.id,
          product_name: p.name,
          sku: p.sku || '',
          barcode: p.barcode || '',
          category: p.category || '',
          base_unit: p.base_unit,
          system_qty: Number(p.stock_quantity || 0),
          actual_qty: '',
          variance: 0,
          variance_pct: 0,
          unit_cost: Number(p.cost_price || 0),
          needs_recount: false,
        })),
      }
      setCountSheets(prev => [sheet, ...prev])
      setActiveSheetId(sheetId)
      toast.success('Count sheet generated')
    } catch (err) {
      toast.error('Failed to generate count sheet: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }, [filteredProducts, blindCount])

  const exportCountSheet = useCallback(() => {
    if (!activeSheetId) return
    const sheet = countSheets.find(s => s.id === activeSheetId)
    if (!sheet) return

    const headers = blindCount
      ? ['SKU', 'Barcode', 'Product', 'Category', 'Unit', 'Actual Qty', 'Notes']
      : ['SKU', 'Barcode', 'Product', 'Category', 'Unit', 'System Qty', 'Actual Qty', 'Notes']

    const rows = sheet.items.map(item => blindCount
      ? [item.sku, item.barcode, item.product_name, item.category, item.base_unit, '', '']
      : [item.sku, item.barcode, item.product_name, item.category, item.base_unit, item.system_qty.toFixed(2), '', '']
    )

    downloadCSV(`count_sheet_${sheet.id.slice(0, 8)}.csv`, headers, rows)
  }, [activeSheetId, countSheets, blindCount])

  const printCountSheet = useCallback(() => {
    if (!activeSheetId) return
    setPrinting(true)
    const sheet = countSheets.find(s => s.id === activeSheetId)
    if (!sheet) return

    const printWindow = window.open('', '_blank')
    const rowsHtml = sheet.items.map(item => `
      <tr>
        <td>${item.sku || ''}</td>
        <td>${item.barcode || ''}</td>
        <td>${item.product_name}</td>
        <td>${item.category || ''}</td>
        <td>${item.base_unit}</td>
        ${blindCount ? '<td></td>' : `<td>${Number(item.system_qty).toFixed(2)}</td>`}
        <td></td>
        <td></td>
      </tr>
    `).join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>${sheet.name}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background: #f5f5f5; }
            .header { margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 18px; }
            .meta { color: #666; font-size: 11px; }
          </style>
        </head>
        <body onload="window.print(); window.onafterprint = () => window.close();">
          <div class="header">
            <h1>${sheet.name}</h1>
            <div class="meta">Generated: ${format(new Date(sheet.date), 'MMM dd, yyyy HH:mm')}</div>
            <div class="meta">Blind Count: ${blindCount ? 'Yes' : 'No'}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Barcode</th>
                <th>Product</th>
                <th>Category</th>
                <th>Unit</th>
                ${blindCount ? '<th>Actual Qty</th>' : '<th>System Qty</th><th>Actual Qty</th>'}
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `)
    printWindow.document.close()
    setPrinting(false)
  }, [activeSheetId, countSheets, blindCount])

  const updateActualQty = useCallback((index, value) => {
    setCountSheets(prev => prev.map(sheet => {
      if (sheet.id !== activeSheetId) return sheet
      const items = [...sheet.items]
      const qty = value === '' ? 0 : Number(value)
      const system = Number(items[index].system_qty || 0)
      const variance = qty - system
      const variance_pct = system > 0 ? Math.abs(variance) / system : (variance !== 0 ? 1 : 0)
      items[index] = {
        ...items[index],
        actual_qty: value,
        variance,
        variance_pct,
        needs_recount: variance_pct > VARIANCE_THRESHOLD,
      }
      return { ...sheet, items }
    }))
  }, [activeSheetId])

  const toggleRecount = useCallback((index) => {
    setCountSheets(prev => prev.map(sheet => {
      if (sheet.id !== activeSheetId) return sheet
      const items = [...sheet.items]
      items[index] = { ...items[index], needs_recount: !items[index].needs_recount }
      return { ...sheet, items }
    }))
  }, [activeSheetId])

  const postAdjustments = useCallback(async () => {
    if (!activeSheetId) return
    const sheet = countSheets.find(s => s.id === activeSheetId)
    if (!sheet) return

    const adjustments = sheet.items.filter(item => {
      const actual = Number(item.actual_qty || 0)
      const system = Number(item.system_qty || 0)
      return actual !== system
    })

    if (!adjustments.length) {
      toast.info('No variances to post')
      return
    }

    setPosting(true)
    try {
      await ensureChartOfAccounts(tenantId)

      for (const item of adjustments) {
        const actual = Number(item.actual_qty || 0)
        const system = Number(item.system_qty || 0)
        const variance = actual - system
        const unitCost = Number(item.unit_cost || 0)
        const amount = Math.abs(variance) * unitCost

        if (amount < 0.01) continue

        const movementRef = `PHYS-COUNT-${sheet.id.slice(0, 8)}-${item.product_id.slice(0, 8)}`

        // Stock movement
        await base44.entities.StockMovement.create({
          tenant_id: tenantId,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: Math.abs(variance),
          direction: variance > 0 ? 'in' : 'out',
          reason: 'manual_adjustment',
          reference_id: movementRef,
          recorded_by: user?.full_name || user?.email || 'Admin',
          purchase_cost: amount,
          input_vat: 0,
          non_creditable: true,
          created_at: new Date().toISOString(),
        })

        // Update product stock
        await base44.entities.Product.update(item.product_id, {
          stock_quantity: actual,
        })

        // Product cost history (no cost change, just record)
        await base44.entities.ProductCostHistory.create({
          tenant_id: tenantId,
          product_id: item.product_id,
          product_name: item.product_name,
          date: new Date().toISOString(),
          previous_average_cost: unitCost,
          new_average_cost: unitCost,
          quantity_received: Math.abs(variance),
          actual_unit_cost: unitCost,
        })

        // Journal entry
        const description = `Physical Count Adjustment — ${item.product_name} (${variance > 0 ? 'Gain' : 'Loss'} ${Math.abs(variance)} ${item.base_unit})`
        await createJournalEntry(tenantId, {
          date: new Date().toISOString(),
          reference_type: 'adjustment',
          reference_id: movementRef,
          description,
          party: 'Physical Count',
          payment_method: '',
          lines: variance > 0
            ? [
                { code: INV_CODE, debit: amount },
                { code: COGS_CODE, credit: amount }, // Inventory Gain -> reduce COGS (or use separate gain account)
              ]
            : [
                { code: COGS_CODE, debit: amount }, // Shrinkage Expense
                { code: INV_CODE, credit: amount },
              ],
        })
      }

      toast.success(`${adjustments.length} adjustments posted`)
      setCountSheets(prev => prev.map(s =>
        s.id === activeSheetId
          ? { ...s, items: s.items.map(i => ({ ...i, actual_qty: '', variance: 0, variance_pct: 0, needs_recount: false })) }
          : s
      ))
    } catch (err) {
      toast.error('Failed to post adjustments: ' + err.message)
    } finally {
      setPosting(false)
    }
  }, [activeSheetId, countSheets, tenantId, user])

  const deleteSheet = useCallback((id) => {
    setCountSheets(prev => {
      const next = prev.filter(s => s.id !== id)
      if (activeSheetId === id) setActiveSheetId(next[0]?.id || null)
      return next
    })
  }, [activeSheetId])

  if (!admin) return <div className="py-20 text-center text-slate-500">Admin access required.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-plum">Physical Count</h1>
          <p className="text-slate-500">Generate count sheets, record actuals, post adjustments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={generateCountSheet} disabled={generating || !filteredProducts.length} className="bg-pink hover:bg-pink/90">
            <FileText className="w-4 h-4 mr-2" />{generating ? 'Generating…' : 'New Count Sheet'}
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label>Category</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label>Search</Label>
            <Input placeholder="Name, SKU, Barcode…" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={blindCount} onCheckedChange={setBlindCount} />
            <Label className="cursor-pointer">Blind Count (hide system qty on print)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={showOnlyVariance} onCheckedChange={setShowOnlyVariance} />
            <Label className="cursor-pointer">Show only variances {'>'} {Math.round(VARIANCE_THRESHOLD * 100)}%</Label>
          </div>
        </div>

        {countSheets.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>No count sheets yet. Click "New Count Sheet" to start.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {countSheets.map(sheet => (
                <button
                  key={sheet.id}
                  onClick={() => setActiveSheetId(sheet.id)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    activeSheetId === sheet.id
                      ? 'bg-pink text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {sheet.name} ({sheet.items.length} items)
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSheet(sheet.id) }}
                    className="ml-2 text-slate-400 hover:text-rose-500"
                    title="Delete"
                  >×</button>
                </button>
              ))}
            </div>

            {activeSheetId && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">{sheetProducts.length} items</span>
                    {varianceItems.length > 0 && (
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-xs rounded">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />{varianceItems.length} items with variance {'>'} {Math.round(VARIANCE_THRESHOLD * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={exportCountSheet}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
                    <Button variant="outline" onClick={printCountSheet} disabled={printing}><Printer className="w-4 h-4 mr-1" />{printing ? 'Printing…' : 'Print'}</Button>
                    <Button onClick={postAdjustments} disabled={posting || varianceItems.length === 0} className="bg-pink hover:bg-pink/90">
                      <Save className="w-4 h-4 mr-2" />{posting ? 'Posting…' : 'Post Adjustments'}
                    </Button>
                  </div>
                </div>

                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-50 text-left text-xs uppercase text-blue-600">
                        <tr>
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Unit</th>
                          <th className="px-4 py-3 text-right">System Qty</th>
                          <th className="px-4 py-3 text-right">Actual Qty</th>
                          <th className="px-4 py-3 text-right">Variance</th>
                          <th className="px-4 py-3 text-right">% Var</th>
                          <th className="px-4 py-3 text-right">Value</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheetProducts
                          .filter(item => !showOnlyVariance || item.needs_recount)
                          .map((item, idx) => {
                            const variance = Number(item.actual_qty || 0) - Number(item.system_qty || 0)
                            const variancePct = Number(item.system_qty || 0) > 0
                              ? (Math.abs(variance) / Number(item.system_qty)) * 100
                              : variance !== 0 ? 100 : 0
                            const value = Math.abs(variance) * Number(item.unit_cost || 0)
                            const hasVariance = variance !== 0
                            const needsRecount = item.needs_recount
                            return (
                              <tr key={item.product_id} className={`border-t ${needsRecount ? 'bg-amber-50' : ''} ${hasVariance && !needsRecount ? 'bg-rose-50/50' : ''}`}>
                                <td className="px-4 py-3 font-medium">{item.product_name}</td>
                                <td className="px-4 py-3 text-slate-500">{item.sku || '—'}</td>
                                <td className="px-4 py-3 text-slate-500">{item.category || '—'}</td>
                                <td className="px-4 py-3 text-slate-500">{item.base_unit}</td>
                                <td className="px-4 py-3 text-right">{blindCount ? '—' : Number(item.system_qty).toFixed(2)}</td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={item.actual_qty === '' ? '' : Number(item.actual_qty)}
                                    onChange={e => updateActualQty(idx, e.target.value)}
                                    className="w-24 text-right"
                                    placeholder="Enter qty"
                                  />
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-rose-600">
                                  {hasVariance ? (variance > 0 ? '+' : '') + variance.toFixed(2) : '—'}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-500">
                                  {hasVariance ? variancePct.toFixed(1) + '%' : '—'}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-500">
                                  {hasVariance ? MONEY(value) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {hasVariance && (
                                      <span className={`text-xs px-2 py-0.5 rounded ${needsRecount ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                        {needsRecount ? 'Recount' : 'Variance'}
                                      </span>
                                    )}
                                    {hasVariance && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => toggleRecount(idx)}
                                        className={needsRecount ? 'text-amber-600' : 'text-slate-400'}
                                        title={needsRecount ? 'Mark as reviewed' : 'Flag for recount'}
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                      </Button>
                                    )}
                                    {!hasVariance && <span className="text-xs text-emerald-600"><CheckCircle className="w-3 h-3 inline mr-1" />OK</span>}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        {sheetProducts.length === 0 && (
                          <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No products in this sheet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  )
}