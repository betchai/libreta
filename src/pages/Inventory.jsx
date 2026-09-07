import ImportInventory from '@/components/inventory/ImportInventory'
import ProductForm from '@/components/inventory/ProductForm'
import StockMovements from '@/components/inventory/StockMovements'
import RestockSupplierSelect from '@/components/pos/RestockSupplierSelect'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useProducts, useDeleteProduct, useRestockProduct } from '@/hooks/useProducts'
import { useSettings } from '@/hooks/useSettings'
import { isAdmin } from '@/lib/auth-roles'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Search, ArrowDownToLine, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
export default function Inventory() {
  const { user } = useAuth()
  const admin = isAdmin(user)
  const { data: products = [], isLoading } = useProducts()
  const deleteProduct = useDeleteProduct()
  const restock = useRestockProduct()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [restocking, setRestocking] = useState(null)
  const [tab, setTab] = useState('products')

  const sorted = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (p) => { setEditing(p); setFormOpen(true) }

  const remove = (p) => {
    if (!confirm(`Delete ${p.name}?`)) return
    deleteProduct.mutate(p.id, { onError: (e) => toast.error(e.message) })
  }

  if (!admin) return <div className="py-20 text-center text-slate-500">Admin access required.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-plum">Inventory</h1>
          <p className="text-slate-500">Manage your products and stock levels</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportInventory />
          <Button onClick={openCreate} className="bg-pink hover:bg-pink/90"><Plus className="w-4 h-4 mr-2" />Add Product</Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={tab === 'products' ? 'default' : 'outline'} onClick={() => setTab('products')}>Products</Button>
        <Button size="sm" variant={tab === 'movements' ? 'default' : 'outline'} onClick={() => setTab('movements')}>Stock Movements</Button>
      </div>

      {tab === 'movements' ? (
        <StockMovements />
      ) : (<>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? <div className="py-10 text-center text-slate-400">Loading…</div> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 text-left text-xs uppercase text-blue-600">
                <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-slate-500">{p.category}</td>
                    <td className="px-4 py-3 text-slate-500">{p.sku || '—'}</td>
                    <td className="px-4 py-3 text-right">{Number(p.cost_price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-medium">{Number(p.base_price).toFixed(2)}</td>
                    <td className={`px-4 py-3 text-right ${p.stock_quantity <= p.low_stock_threshold ? 'text-rose-600 font-semibold' : ''}`}>{Number(p.stock_quantity).toFixed(2)}</td>
                    <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Restock" onClick={() => setRestocking(p)}><ArrowDownToLine className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" title="Delete" onClick={() => remove(p)}><Trash2 className="w-4 h-4" /></Button>
                    </div></td>
                  </tr>
                ))}
                {sorted.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No products yet</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      </>)}

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Product' : 'Add New Product'}</DialogTitle></DialogHeader>
          <ProductForm initialData={editing || null} onSuccess={() => { setFormOpen(false); setEditing(null) }} onCancel={() => { setFormOpen(false); setEditing(null) }} />
        </DialogContent>
      </Dialog>

      {restocking && <RestockDialog product={restocking} onClose={() => setRestocking(null)} onSave={(payload) => restock.mutate({ ...payload, product: restocking }, { onSuccess: () => { toast.success('Restocked'); setRestocking(null) }, onError: (e) => toast.error(e.message) })} />}    </div>
  )
}

function RestockDialog({ product, onClose, onSave }) {
  const { settings } = useSettings()
  const [qty, setQty] = useState(1)
  const [unitCost, setUnitCost] = useState(product.cost_price || 0)
  const [supplier, setSupplier] = useState(null)
  const [paid, setPaid] = useState(true)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [supplierVatRegistered, setSupplierVatRegistered] = useState(false)
  const [nonCreditable, setNonCreditable] = useState(false)
  const businessVatRegistered = settings?.vat_registered !== false

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-semibold">Restock — {product.name}</DialogTitle>
          <p className="text-sm text-slate-500">Record received stock and update inventory</p>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); onSave({ quantity: qty, unitCost, supplierId: supplier?.id || '', supplierName: supplier?.name || '', paid, invoiceNumber: invoiceNo, isVatRegisteredSupplier: supplierVatRegistered, nonCreditable }) }}>
          <div className="grid gap-4 py-4">
            {/* Basic Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">Basic Information</h4>
              
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="qty">Quantity Received</Label>
                  <Input
                    id="qty"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value) || 0)}
                    placeholder="Enter quantity"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unitCost">Unit Cost</Label>
                  <Input
                    id="unitCost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitCost}
                    onChange={(e) => setUnitCost(Number(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <RestockSupplierSelect value={supplier} onChange={setSupplier} />
              </div>
            </div>

            <Separator />

            {/* VAT & Invoice Section */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mt-1">VAT & Invoice</h4>
                {!businessVatRegistered && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Your business is not VAT-registered</span>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invoiceNo">Invoice / Receipt No.</Label>
                <Input
                  id="invoiceNo"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="Required to claim input VAT"
                  disabled={!supplierVatRegistered}
                />
                {!supplierVatRegistered && (
                  <p className="text-xs text-slate-400">Enter invoice number when supplier is VAT-registered</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="supplierVatRegistered"
                    checked={supplierVatRegistered}
                    onChange={(e) => setSupplierVatRegistered(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-pink focus:ring-pink"
                  />
                  <Label htmlFor="supplierVatRegistered" className="cursor-pointer text-sm font-medium">Supplier is VAT-registered</Label>
                </div>
                <Info className="w-4 h-4 text-slate-300" />
              </div>

              {supplierVatRegistered && businessVatRegistered && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="nonCreditable"
                      checked={nonCreditable}
                      onChange={(e) => setNonCreditable(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-pink focus:ring-pink"
                    />
                    <Label htmlFor="nonCreditable" className="cursor-pointer text-sm">Non-creditable (no valid invoice)</Label>
                  </div>
                  <Info className="w-4 h-4 text-slate-300" title="Check if you don't have a valid VAT invoice from supplier" />
                </div>
              )}
            </div>

            <Separator />

            {/* Payment */}
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">Payment</h4>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="paid"
                    checked={paid}
                    onChange={(e) => setPaid(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-pink focus:ring-pink"
                  />
                  <Label htmlFor="paid" className="cursor-pointer text-sm font-medium">Paid now (COD)</Label>
                </div>
                {paid && <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Cash on Delivery</span>}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-pink hover:bg-pink/90">Restock</Button>
          </DialogFooter>
        </form>

        <DialogClose asChild>
          <button className="absolute top-4 right-4 text-slate-400 hover:text-slate-600" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
