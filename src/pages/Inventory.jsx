import ImportInventory from '@/components/inventory/ImportInventory'
import ProductForm from '@/components/inventory/ProductForm'
import StockMovements from '@/components/inventory/StockMovements'
import RestockSupplierSelect from '@/components/pos/RestockSupplierSelect'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useProducts, useDeleteProduct, useRestockProduct } from '@/hooks/useProducts'
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
  const [qty, setQty] = useState(1)
  const [unitCost, setUnitCost] = useState(product.cost_price || 0)
  const [supplier, setSupplier] = useState(null)
  const [paid, setPaid] = useState(true)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md my-16">
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-800">Restock — {product.name}</h2>
          <div className="space-y-2"><Label>Quantity Received</Label><Input type="number" step="0.01" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label>Unit Cost</Label><Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label>Supplier</Label><RestockSupplierSelect value={supplier} onChange={setSupplier} /></div>
          <div className="flex items-center justify-between"><Label>Paid now (COD)</Label><Switch checked={paid} onCheckedChange={setPaid} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave({ quantity: qty, unitCost, supplierId: supplier?.id || '', supplierName: supplier?.name || '', paid })} className="bg-pink hover:bg-pink/90">Restock</Button></div>
        </div>
      </Card>
    </div>
  )
}
