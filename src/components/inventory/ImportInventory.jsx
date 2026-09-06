import { base44 } from '@/api/base44Client'
import ImportPreview from '@/components/inventory/ImportPreview'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useSettings } from '@/hooks/useSettings'
import { useTenantId } from '@/hooks/useTenantId'
import { useAuth } from '@/lib/AuthContext'
import { STOCK_MODES, parseCSV, extractDataRows, buildPreview, executeImport, downloadTemplate, STOCK_MODE_LABELS } from '@/lib/inventoryImport'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Download, Upload, History, FileUp, ArrowLeft, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
const RECOGNIZED = ['name', 'sku', 'barcode', 'category', 'base_unit', 'base_price', 'cost_price', 'stock_quantity']

export default function ImportInventory() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('upload')
  const [filename, setFilename] = useState('')
  const [csvRows, setCsvRows] = useState(null)
  const [headers, setHeaders] = useState([])
  const [stockMode, setStockMode] = useState(STOCK_MODES.SET)
  const [preview, setPreview] = useState(null)
  const [building, setBuilding] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const tenantId = useTenantId()
  const { user } = useAuth()

  const reset = () => { setStep('upload'); setFilename(''); setCsvRows(null); setHeaders([]); setPreview(null); setStockMode(STOCK_MODES.SET) }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const rows = parseCSV(evt.target.result)
      const { headers: h, body } = extractDataRows(rows)
      if (h.length === 0 || body.length === 0) { toast.error('CSV seems empty or missing header row'); return }
      const known = h.filter((hdr) => RECOGNIZED.includes(hdr))
      if (known.length === 0) { toast.error('No recognized columns found. Download the template for the correct headers.'); return }
      setCsvRows(body); setHeaders(h); setStep('stockMode')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const buildPreviewNow = async () => {
    setBuilding(true)
    try {
      const existing = await base44.entities.Product.list('-name', 10000)
      const p = buildPreview(csvRows, headers, existing, settings, stockMode)
      setPreview(p); setStep('preview')
    } catch (err) {
      toast.error('Failed to read products: ' + err.message)
    } finally { setBuilding(false) }
  }

  const importMutation = useMutation({
    mutationFn: () => executeImport(preview, stockMode, tenantId, user, filename),
    onSuccess: ({ created, updated, skipped }) => {
      queryClient.invalidateQueries(['products', tenantId])
      toast.success(`Import complete: ${created} created, ${updated} updated${skipped ? `, ${skipped} skipped` : ''}`)
      setOpen(false); reset()
    },
    onError: (err) => toast.error('Import failed: ' + err.message),
  })

  const hasStockColumn = headers.includes('stock_quantity')

  return (
    <>
      <Button variant="outline" onClick={downloadTemplate}><Download className="w-4 h-4 mr-2" /> Download Template</Button>
      <Button variant="outline" onClick={() => { setOpen(true); reset() }}><Upload className="w-4 h-4 mr-2" /> Import CSV</Button>
      <Button variant="ghost" onClick={() => navigate('/ImportHistory')}><History className="w-4 h-4 mr-2" /> Import History</Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{step === 'upload' ? 'Import Products from CSV' : step === 'stockMode' ? 'Choose Stock Handling' : 'Review Import Preview'}</DialogTitle></DialogHeader>

          {step === 'upload' && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-slate-500">
                Download the template, fill it with your products, then upload the file here. Blank cells keep existing values; type <code className="bg-slate-100 px-1 rounded">&lt;clear&gt;</code> to erase a field. Required for new products: name, sku, category, base_unit, base_price.
              </p>
              <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-xl p-10 cursor-pointer hover:border-pink/60 hover:bg-pink/10/30 transition-colors">
                <FileUp className="w-8 h-8 text-slate-400" /><span className="text-sm text-slate-600 font-medium">Click to select a CSV file</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
              </label>
            </div>
          )}

          {step === 'stockMode' && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-slate-500">Your CSV {hasStockColumn ? <>includes a <b>stock_quantity</b> column. Choose how it should be applied to <b>all</b> rows in this import:</> : <>does not include a stock_quantity column. Stock will not be changed regardless of this choice.</>}</p>
              <RadioGroup value={stockMode} onValueChange={setStockMode} className="space-y-2" disabled={!hasStockColumn}>
                {[STOCK_MODES.SET, STOCK_MODES.ADD, STOCK_MODES.SKIP].map((m) => (
                  <label key={m} className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${stockMode === m ? 'border-pink/60 bg-pink/10/40' : 'border-slate-200'}`}>
                    <RadioGroupItem value={m} className="mt-1" />
                    <div><div className="text-sm font-medium">{STOCK_MODE_LABELS[m]}</div><p className="text-xs text-slate-500">{m === STOCK_MODES.SET ? 'Replaces current stock with the CSV value. Use for physical recounts.' : m === STOCK_MODES.ADD ? 'Adds the CSV value to existing stock. Use to record a bulk delivery via CSV.' : 'Ignores the stock column entirely. Use for price-only or info-only updates.'}</p></div>
                  </label>
                ))}
              </RadioGroup>
              <p className="text-xs text-slate-400">Every stock change creates a stock movement log (reason: csv_import), just like any other stock change.</p>
              <div className="flex justify-between pt-2"><Button variant="outline" onClick={() => setStep('upload')}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button><Button onClick={buildPreviewNow} disabled={building} className="bg-pink hover:bg-pink/90">{building ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Generate Preview</Button></div>
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-4 py-2">
              <ImportPreview preview={preview} stockModeLabel={STOCK_MODE_LABELS[stockMode]} />
              <div className="flex justify-between pt-2 border-t">
                <Button variant="outline" onClick={() => setStep('stockMode')} disabled={importMutation.isPending}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => { setOpen(false); reset() }} disabled={importMutation.isPending}>Cancel</Button>
                  <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending || (preview.creates.length === 0 && preview.updates.filter((u) => !u.noChange).length === 0)} className="bg-pink hover:bg-pink/90">{importMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirm Import</Button>
                </div>
              </div>
              <p className="text-xs text-slate-400">Confirming writes all changes to the database and creates an auditable import batch. Cancel now and nothing is saved.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
