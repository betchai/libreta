import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Plus, Pencil, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import React, { useState, Fragment } from 'react'
import { Line } from 'recharts'
export default function ImportPreview({ preview, stockModeLabel }) {
  const { creates, updates, errors } = preview
  const [openRow, setOpenRow] = useState(null)
  const updatedWithChanges = updates.filter((u) => !u.noChange)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm rounded-lg bg-slate-50 border p-3">
        <span className="text-pink font-semibold flex items-center gap-1"><Plus className="w-4 h-4" /> {creates.length} will be created</span>
        <span className="text-blue-700 font-semibold flex items-center gap-1"><Pencil className="w-4 h-4" /> {updatedWithChanges.length} will be updated</span>
        {updates.some((u) => u.noChange) && <span className="text-slate-500 font-medium">{updates.filter((u) => u.noChange).length} no change</span>}
        <span className="text-red-700 font-semibold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {errors.length} rows with errors</span>
        <span className="text-slate-500 ml-auto">Stock mode: <b>{stockModeLabel}</b></span>
      </div>

      {errors.length > 0 && (
        <div className="border border-red-200 bg-red-50/50 rounded-lg p-3 max-h-44 overflow-auto">
          <p className="text-xs font-semibold text-red-700 mb-2">Rows that will be skipped:</p>
          {errors.map((item, i) => <p key={i} className="text-xs text-red-600">Line {item.index}: {item.errors.join('; ')}</p>)}
        </div>
      )}

      {creates.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">New products</h4>
          <div className="border rounded-lg overflow-auto max-h-52">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Stock</TableHead></TableRow></TableHeader>
              <TableBody>{creates.map((c, i) => <TableRow key={i}><TableCell className="font-medium">{c.data.name}</TableCell><TableCell>{c.data.sku || '—'}</TableCell><TableCell>{c.data.category}</TableCell><TableCell className="text-right">₱{Number(c.data.base_price || 0).toFixed(2)}</TableCell><TableCell className="text-right">{c.data.stock_quantity ?? 0}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </div>
      )}

      {updatedWithChanges.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Updates (click a row to see field changes)</h4>
          <div className="border rounded-lg overflow-auto max-h-72">
            <Table>
              <TableHeader><TableRow><TableHead className="w-8"></TableHead><TableHead>Product</TableHead><TableHead className="text-right">Fields Changed</TableHead><TableHead className="text-right">Stock Change</TableHead></TableRow></TableHeader>
              <TableBody>{updatedWithChanges.map((u, i) => {
                const isOpen = openRow === `u-${i}`
                return (
                  <React.Fragment key={i}>
                    <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenRow(isOpen ? null : `u-${i}`)}>
                      <TableCell className="text-slate-400">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</TableCell>
                      <TableCell className="font-medium">{u.existing.name}<span className="text-xs text-slate-400 ml-2">{u.existing.sku ? `SKU: ${u.existing.sku}` : ''}</span></TableCell>
                      <TableCell className="text-right">{u.fieldDiffs.length}</TableCell>
                      <TableCell className="text-right">{u.stockDelta !== 0 ? <span className={u.stockDelta > 0 ? 'text-pink font-medium' : 'text-red-600 font-medium'}>{u.stockDelta > 0 ? '+' : ''}{u.stockDelta.toFixed(2)}</span> : <span className="text-slate-400">—</span>}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-slate-50/70"><TableCell colSpan={4} className="p-3"><div className="space-y-1.5">{u.fieldDiffs.map((d, j) => <div key={j} className="flex items-center gap-2 text-xs"><span className="font-mono text-slate-500 w-40">{d.field}</span><span className="text-red-500 line-through">{d.old || '∅'}</span><span className="text-slate-400">→</span><span className="text-pink font-medium">{d.new || '∅'}</span></div>)}</div></TableCell></TableRow>
                    )}
                  </React.Fragment>
                )
              })}</TableBody>
            </Table>
          </div>
        </div>
      )}

      {creates.length === 0 && updatedWithChanges.length === 0 && errors.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-6">No changes to import.</p>
      )}
    </div>
  )
}
