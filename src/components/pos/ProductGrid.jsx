import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useSettings } from '@/hooks/useSettings'
import { Barcode, Search, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
export default function ProductGrid({ products, onAddToCart }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [scan, setScan] = useState('')
  const { settings } = useSettings()

  const handleScan = (e) => {
    e.preventDefault()
    const code = scan.trim().toLowerCase()
    if (!code) return
    const match = products.find((p) => (p.barcode && p.barcode.toLowerCase() === code) || (p.sku && p.sku.toLowerCase() === code))
    if (match) { onAddToCart(match); toast.success(`${match.name} added`) } else { toast.error('No product matches that barcode') }
    setScan('')
  }

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'All' || p.category === category
    return matchesSearch && matchesCategory
  })

  const categories = ['All', ...(settings.categories || [])]

  return (
    <div className="flex flex-col h-full gap-4">
      <form onSubmit={handleScan} className="flex gap-2">
        <div className="relative flex-1">
          <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-plum/40" />
          <Input placeholder="Scan/enter barcode (SKU) then Enter..." value={scan} onChange={(e) => setScan(e.target.value)} className="pl-9 bg-white border-pink/20" />
        </div>
        <Button type="submit" className="bg-pink hover:bg-pink/90">Add</Button>
      </form>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-white border-slate-200" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[140px] bg-white border-slate-200"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pb-4 pr-1">
        {filteredProducts.map((product) => (
          <Card key={product.id} onClick={() => onAddToCart(product)} className="relative group cursor-pointer hover:shadow-lg hover:border-plum/20 transition-all duration-200 active:scale-95 bg-white border-slate-200">
            <div className="p-4 flex flex-col h-full gap-2">
              <div className="flex justify-between items-start">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider bg-blue-50 text-blue-600">{product.category}</Badge>
                {product.stock_quantity <= product.low_stock_threshold && <Badge variant="destructive" className="text-[10px]">Low Stock</Badge>}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-plum line-clamp-2 leading-tight">{product.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{product.sku}</p>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm font-medium text-pink">₱{product.base_price}<span className="text-xs text-slate-400 font-normal">/{product.base_unit}</span></p>
                    {product.has_fractions && <p className="text-xs text-slate-500">₱{product.fraction_price}/{product.fraction_unit}</p>}
                  </div>
                  <div className="bg-plum/5 p-1.5 rounded-full text-plum/50 group-hover:bg-plum group-hover:text-white transition-colors"><Plus className="w-4 h-4" /></div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
