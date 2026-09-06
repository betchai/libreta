import { base44 } from '@/api/base44Client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCustomers } from '@/hooks/useCustomers'
import { useProducts } from '@/hooks/useProducts'
import { useSettings } from '@/hooks/useSettings'
import { useTenantId } from '@/hooks/useTenantId'
import { buildManualSalesPreview, executeManualSalesImport, downloadManualSalesTemplate } from '@/lib/manualSalesImport'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { FileText, Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
export default function ManualSalesImport({ open, onOpenChange }) {
  const [step, setStep] = useState('upload')
  const [csvText, setCsvText] = useState('')
  const [filename, setFilename] = useState('')
  const [preview, setPreview] = useState(null)
  const queryClient = useQueryClient()
  const { settings } = useSettings()
  const tenantId = useTenantId()

  const { data: products = [] } = useProducts()
  const { data: customers = [] } = useCustomers()

  const reset = () => { setStep('upload'); setCsvText(''); setFilename(''); setPreview(null) }
  const handleClose = () => { if (step === 'committing') return; reset(); onOpenChange(false) }

  const handleFile = async (file) => {
    if (!file) return
    setFilename(file.name)
    const text = await file.text()
    setCsvText(text)
    try { setPreview(buildManualSalesPreview(text, products, customers, settings)); setStep('preview') }
    catch (e) { toast.error('Failed to parse CSV: ' + e.message) }
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      const me = await base44.auth.me()
      return executeManualSalesImport(preview, tenantId, me, settings)
    },
    onSuccess: (result) => {
      toast.success(`${result.imported} manual sale(s) imported successfully`)
      queryClient.invalidateQueries(['sales', tenantId])
      queryClient.invalidateQueries(['products', tenantId])
      queryClient.invalidateQueries(['movements', tenantId])
      queryClient.invalidateQueries(['ledger', tenantId])
      reset(); onOpenChange(false)
    },
    onError: (e) => { toast.error('Import failed: ' + e.message); setStep('preview') },
  })

  const handleCommit = () => { setStep('committing'); importMutation.mutate() }
  const fmt = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Import Manual Sales</DialogTitle></DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">Backfill sales recorded on paper/spreadsheet during an outage. Each sale runs through the same logic as a live POS sale — stock deducted, discounts computed, journal entries posted (tagged <Badge variant="outline" className="text-xs">manual_offline_import</Badge>).</p>
            <div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={downloadManualSalesTemplate}><Download className="w-4 h-4 mr-2" /> Download Template</Button></div>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-pink/60 hover:bg-pink/10/30 transition-colors cursor-pointer" onClick={() => document.getElementById('manual-sales-upload')?.click()}>
              <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-700">Click to select a CSV file</p>
              <p className="text-xs text-slate-500 mt-1">Group rows by manual_ref — same ref = one multi-item sale</p>
              <Input id="manual-sales-upload" type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <ScrollArea className="flex-1">
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg bg-pink/10 border border-pink/15 p-3"><div className="text-xs text-pink font-medium">Valid Sales</div><div className="text-xl font-bold text-plum">{preview.summary.salesCount}</div></div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3"><div className="text-xs text-blue-700 font-medium">Products</div><div className="text-xl font-bold text-blue-800">{preview.summary.productCount}</div></div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3"><div className="text-xs text-slate-600 font-medium">Total Amount</div><div className="text-xl font-bold text-slate-800">{fmt(preview.summary.totalAmount)}</div></div>
                <div className={`rounded-lg border p-3 ${preview.summary.salesWithErrors > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}><div className={`text-xs font-medium ${preview.summary.salesWithErrors > 0 ? 'text-amber-700' : 'text-slate-600'}`}>With Errors</div><div className={`text-xl font-bold ${preview.summary.salesWithErrors > 0 ? 'text-amber-800' : 'text-slate-800'}`}>{preview.summary.salesWithErrors}</div></div>
              </div>

              {preview.errors.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1 max-h-32 overflow-y-auto">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-amber-800 mb-1"><AlertTriangle className="w-4 h-4" /> {preview.errors.length} error(s) — these sales will be skipped</div>
                  {preview.errors.map((e, i) => <div key={i} className="text-xs text-amber-700 pl-5">{e}</div>)}
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-700">Sales Preview</h4>
                {preview.sales.map((sale) => (
                  <div key={sale.manualRef} className={`rounded-lg border p-3 ${sale.errors.length > 0 ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-white'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2"><span className="font-medium text-sm text-slate-800">{sale.manualRef}</span>{sale.errors.length > 0 ? <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">Skipped</Badge> : <Badge variant="outline" className="text-xs text-pink border-pink/40 bg-pink/10">OK</Badge>}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{sale.items.length} item(s) • {sale.paymentMethod} • {sale.cashierName}{sale.customerName ? ` • ${sale.customerName}` : ''}</div>
                      </div>
                      <div className="text-right"><div className="text-sm font-bold text-slate-800">{fmt(sale.total)}</div>{sale.totalDiscount > 0 && <div className="text-xs text-rose-600">−{fmt(sale.totalDiscount)} discount</div>}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}

        {step === 'committing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3"><div className="w-8 h-8 border-4 border-slate-200 border-t-pink rounded-full animate-spin"></div><p className="text-sm text-slate-600">Processing manual sales...</p></div>
        )}

        <DialogFooter>
          {step === 'preview' && (<><Button variant="outline" onClick={handleClose}>Cancel</Button><Button className="bg-pink hover:bg-pink/90" onClick={handleCommit} disabled={preview.summary.salesCount === 0}><CheckCircle2 className="w-4 h-4 mr-2" />Import {preview.summary.salesCount} Sale(s)</Button></>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
