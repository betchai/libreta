import { base44 } from '@/api/base44Client'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useTenantId } from '@/hooks/useTenantId'
import { useAuth } from '@/lib/AuthContext'
import { undoBatch, STOCK_MODE_LABELS } from '@/lib/inventoryImport'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { History, ChevronDown, ChevronRight, Undo2, AlertTriangle, Loader2 } from 'lucide-react'
import React, { useState, Fragment } from 'react'
import { toast } from 'sonner'
export default function ImportHistory() {
  const tenantId = useTenantId()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [expandedBatch, setExpandedBatch] = useState(null)
  const [undoTarget, setUndoTarget] = useState(null)
  const [deleteCreated, setDeleteCreated] = useState(false)

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['importBatches', tenantId],
    queryFn: () => base44.entities.ImportBatch.filter({ tenant_id: tenantId }, '-created_date', 200),
    enabled: !!tenantId,
  })

  const { data: changeLogs = [] } = useQuery({
    queryKey: ['importChangeLogs', expandedBatch],
    queryFn: () => base44.entities.ImportChangeLog.filter({ batch_id: expandedBatch }),
    enabled: !!expandedBatch,
  })

  const undoMutation = useMutation({
    mutationFn: ({ batchId, delCreated }) => undoBatch(batchId, tenantId, user, { deleteCreatedProducts: delCreated }),
    onSuccess: ({ revertedFields, reversedStock, deletedProducts }) => {
      queryClient.invalidateQueries(['importBatches', tenantId])
      queryClient.invalidateQueries(['products', tenantId])
      queryClient.invalidateQueries(['importChangeLogs'])
      toast.success(`Import undone: ${revertedFields} products reverted, ${reversedStock} stock movements reversed${deletedProducts ? `, ${deletedProducts} products deleted` : ''}`)
      setUndoTarget(null); setDeleteCreated(false)
    },
    onError: (err) => toast.error('Undo failed: ' + err.message),
  })

  const openUndo = (batch) => { setDeleteCreated(false); setUndoTarget(batch) }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-plum flex items-center gap-2"><History className="w-7 h-7 text-pink" /> Import History</h1>
        <p className="text-slate-500">Audit trail of every inventory CSV import. Expand a batch to see exactly what changed.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Import Batches</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-center py-8 text-slate-500">Loading…</p> : batches.length === 0 ? <p className="text-center py-8 text-slate-500">No imports yet.</p> : (
            <Table>
              <TableHeader>
                <TableRow><TableHead className="w-8"></TableHead><TableHead>Date</TableHead><TableHead>File</TableHead><TableHead>By</TableHead><TableHead>Stock Mode</TableHead><TableHead className="text-right">Created</TableHead><TableHead className="text-right">Updated</TableHead><TableHead className="text-right">Skipped</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const isOpen = expandedBatch === b.id
                  return (
                    <React.Fragment key={b.id}>
                      <TableRow className={isOpen ? 'bg-slate-50' : 'cursor-pointer hover:bg-slate-50'} onClick={() => setExpandedBatch(isOpen ? null : b.id)}>
                        <TableCell className="text-slate-400">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{new Date(b.created_date).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate" title={b.filename}>{b.filename || '—'}</TableCell>
                        <TableCell className="text-sm">{b.uploaded_by}</TableCell>
                        <TableCell className="text-sm">{STOCK_MODE_LABELS[b.stock_mode_used] || b.stock_mode_used}</TableCell>
                        <TableCell className="text-right">{b.products_created_count}</TableCell>
                        <TableCell className="text-right">{b.products_updated_count}</TableCell>
                        <TableCell className="text-right">{b.rows_skipped_count}</TableCell>
                        <TableCell>{b.status === 'undone' ? <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Undone</span> : <span className="text-xs font-medium text-pink bg-pink/10 px-2 py-0.5 rounded">Completed</span>}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{b.status === 'completed' && <Button variant="outline" size="sm" onClick={() => openUndo(b)}><Undo2 className="w-3.5 h-3.5 mr-1" /> Undo</Button>}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-slate-50/70"><TableCell colSpan={10} className="p-4"><ChangeLogDetail batch={b} logs={changeLogs} loading={changeLogs.length === 0 && expandedBatch === b.id} /></TableCell></TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!undoTarget} onOpenChange={(o) => !o && setUndoTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Undo Import?</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>This will reverse the field changes and stock movements made by this import batch.</p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800"><b>Warning:</b> Undoing will <b>not</b> reverse any sales that happened using the updated data since the import. Only the product record changes and stock movements from the import itself are reverted.</div>
            {undoTarget?.products_created_count > 0 && (
              <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={deleteCreated} onCheckedChange={setDeleteCreated} /><span>Also delete {undoTarget.products_created_count} product(s) that were newly created by this batch</span></label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUndoTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => undoMutation.mutate({ batchId: undoTarget.id, delCreated: deleteCreated })} disabled={undoMutation.isPending}>{undoMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Undo2 className="w-4 h-4 mr-2" />}Confirm Undo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ChangeLogDetail({ batch, logs, loading }) {
  if (loading) return <p className="text-sm text-slate-400">Loading change details…</p>
  if (logs.length === 0) return <p className="text-sm text-slate-400">No change records for this batch.</p>
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500">{logs.length} product(s) affected</p>
      <div className="border rounded-lg overflow-auto max-h-72 bg-white">
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Action</TableHead><TableHead>Field Changes</TableHead><TableHead className="text-right">Stock Δ</TableHead></TableRow></TableHeader>
          <TableBody>
            {logs.map((cl) => (
              <TableRow key={cl.id}>
                <TableCell className="font-medium text-sm">{cl.product_name}</TableCell>
                <TableCell>{cl.action === 'created' ? <span className="text-xs text-pink font-medium">Created</span> : <span className="text-xs text-blue-600 font-medium">Updated</span>}</TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    {(cl.field_changes || []).slice(0, 4).map((fc, i) => (
                      <div key={i} className="text-xs flex items-center gap-1.5"><span className="font-mono text-slate-500">{fc.field}:</span><span className="text-red-400 line-through">{fc.old_value || '∅'}</span><span className="text-slate-400">→</span><span className="text-pink">{fc.new_value || '∅'}</span></div>
                    ))}
                    {(cl.field_changes || []).length > 4 && <span className="text-xs text-slate-400">+{(cl.field_changes || []).length - 4} more</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right">{cl.stock_delta ? <span className={cl.stock_delta > 0 ? 'text-pink text-xs font-medium' : 'text-red-600 text-xs font-medium'}>{cl.stock_delta > 0 ? '+' : ''}{cl.stock_delta.toFixed(2)}</span> : <span className="text-slate-300">—</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
