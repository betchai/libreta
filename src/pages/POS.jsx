import { base44 } from '@/api/base44Client'
import Cart from '@/components/pos/Cart'
import ProductGrid from '@/components/pos/ProductGrid'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProducts } from '@/hooks/useProducts'
import { useSettings } from '@/hooks/useSettings'
import { useTenantId } from '@/hooks/useTenantId'
import { useAuth } from '@/lib/AuthContext'
import { summarizeSaleDiscounts } from '@/lib/discounts'
import { printReceipt } from '@/lib/printReceipt'
import { processSale } from '@/lib/processSale'
import { summarizeVat } from '@/lib/vat'
import { useQuery } from '@tanstack/react-query'
import { Scale } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
const MONEY = (n) => `₱${(Number(n) || 0).toFixed(2)}`

export default function POS() {
  const tenantId = useTenantId()
  const { user } = useAuth()
  const { data: products = [], isLoading } = useProducts()
  const { data: settings } = useSettings()
  const { data: ledgerEntries = [] } = useLedgerQuery(tenantId)

  const [cart, setCart] = useState([])
  const [unitTarget, setUnitTarget] = useState(null)
  const [weighTarget, setWeighTarget] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Net total = gross − all line discounts.
  const summary = summarizeSaleDiscounts(cart.map((l) => ({ ...l })))
  // VAT-registered business charging VAT-exclusive prices: add the 12% on top.
  const vatRegistered = settings?.vat_registered !== false
  const vatInclusive = settings?.vat_inclusive !== false
  const vatTotals = summarizeVat(cart, {
    vat_inclusive: vatInclusive,
    vat_rate: settings?.vat_rate ?? 0.12,
    vat_registered: vatRegistered,
  })
  const total = vatRegistered && !vatInclusive
    ? +(summary.net_total + vatTotals.total_output_vat).toFixed(2)
    : summary.net_total

  const mkLine = (product, unit_sold, price, qty, multiplier = 1) => ({
    product_id: product.id, product_name: product.name, unit_sold,
    price_at_sale: price, quantity: qty, fraction_multiplier: multiplier,
    cost_price: product.cost_price || 0, vat_exempt: product.vat_exempt,
    base_unit: product.base_unit, fraction_unit: product.fraction_unit,
    sell_by_weight: !!product.sell_by_weight,
    sc_pwd_discount_eligible: product.sc_pwd_discount_eligible !== false,
    discount_type: 'none', discount_value: 0, discount_id_number: '', discount_person_name: '', discount_reason: '',
    subtotal: +(price * qty).toFixed(2),
  })

  const addToCart = (product) => {
    if (taskOut(product)) return
    if (product.has_fractions && !product.sell_by_weight) return setUnitTarget(product)
    if (product.has_fractions && product.sell_by_weight) return setWeighTarget(product)
    setCart((c) => [...c, mkLine(product, 'base', Number(product.base_price), 1)])
  }

  const taskOut = (p) => {
    if (p.stock_quantity <= 0) { toast.error(`No stock for ${p.name}`); return true }
    return false
  }

  const updateQuantity = (idx, delta) => setCart((c) => c.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, +(l.quantity + delta).toFixed(3)), subtotal: +(l.price_at_sale * Math.max(1, +(l.quantity + delta).toFixed(3))).toFixed(2) } : l))
  const updateDiscount = (idx, partial) => setCart((c) => c.map((l, i) => i === idx ? { ...l, ...partial } : l))
  const removeItem = (idx) => setCart((c) => c.filter((_, i) => i !== idx))

  const handleCheckout = async ({ paymentMethod, receiptWidth, customer, cashMethod, cashAmount, creditAmount, amountTendered }) => {
    if (cart.length === 0) return
    setIsProcessing(true)
    try {
      const stale = cart.find((l) => l.product_id && !products.some((p) => p.id === l.product_id))
      if (stale) {
        setCart([])
        throw new Error('Cart contained items from another store and was cleared. Please re-add your items.')
      }
      const sale = await processSale(tenantId, {
        items: cart.map((l) => ({ ...l })),
        total,
        paymentMethod,
        cashMethod: cashMethod || '',
        cashier: user?.full_name || user?.email,
        customer: creditAmount > 0 ? customer : null,
        creditAmount,
        cashAmount,
        settings,
      })
      const receiptSale = { ...sale, created_date: sale.created_date || new Date().toISOString(), customer_name: customer?.name, credit_amount: creditAmount, cash_amount: cashAmount, cashier_name: user?.full_name, amount_tendered: amountTendered }
      printReceipt({ sale: receiptSale, items: cart, settings, width: receiptWidth })
      toast.success('Sale completed')
      setCart([])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="h-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full min-h-0">
        <div className="lg:col-span-2 h-full min-h-0">
          {isLoading ? <div className="py-10 text-center text-slate-400">Loading products…</div> : <ProductGrid products={products} onAddToCart={addToCart} />}
        </div>
        <div className="h-full min-h-0">
          <Cart items={cart} onUpdateQuantity={updateQuantity} onUpdateDiscount={updateDiscount} onRemoveItem={removeItem} onCheckout={handleCheckout} total={total} isProcessing={isProcessing} settings={settings || {}} />
        </div>
      </div>

      <UnitDialog target={unitTarget} onPick={(unit, price, mult) => { if (unitTarget) setCart((c) => [...c, mkLine(unitTarget, unit, price, 1, mult)]); setUnitTarget(null) }} onClose={() => setUnitTarget(null)} />
      <WeighDialog target={weighTarget} onPick={(qty, price, mult) => { if (weighTarget) setCart((c) => [...c, mkLine(weighTarget, 'fraction', price, qty, mult)]); setWeighTarget(null) }} onClose={() => setWeighTarget(null)} />
    </div>
  )
}

function useLedgerQuery(tenantId) {
  return useQuery({ queryKey: ['ledger', tenantId], enabled: !!tenantId, queryFn: () => base44.entities.CustomerLedgerEntry.filter({ tenant_id: tenantId }, '-created_date', 5000) })
}

function UnitDialog({ target, onPick, onClose }) {
  if (!target) return null
  const perBase = Number(target.base_price) || 0
  const perFraction = Number(target.fraction_price) || 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-800">{target.name}</h2>
        <p className="text-sm text-slate-500">Choose a unit to sell in.</p>
        <Button className="w-full" onClick={() => onPick('base', perBase, 1)}>Per {target.base_unit} — {MONEY(perBase)}</Button>
        <Button className="w-full" variant="outline" onClick={() => onPick('fraction', perFraction, Number(target.fraction_multiplier) || 1)}>Per {target.fraction_unit} — {MONEY(perFraction)}</Button>
        <Button variant="ghost" className="w-full" onClick={onClose}>Cancel</Button>
      </Card>
    </div>
  )
}

function WeighDialog({ target, onPick, onClose }) {
  const [weight, setWeight] = useState('')
  const [tare, setTare] = useState('')
  if (!target) return null
  const net = Math.max(0, (Number(weight) || 0) - (Number(tare) || 0))
  const price = Number(target.fraction_price) || 0
  const amount = net * price
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Scale className="w-5 h-5" /> Weigh — {target.name}</h2>
        <div className="space-y-2"><Label>Weight ({target.fraction_unit})</Label><Input type="number" step="0.001" value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus /></div>
        <div className="space-y-2"><Label>Tare</Label><Input type="number" step="0.001" value={tare} onChange={(e) => setTare(e.target.value)} /></div>
        <div className="flex justify-between text-sm"><span>Net weight</span><b>{net.toFixed(3)} {target.fraction_unit}</b></div>
        <div className="flex justify-between text-lg font-bold"><span>Amount</span><span>{MONEY(amount)}</span></div>
        <div className="flex gap-2 justify-end"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={net <= 0} onClick={() => onPick(net, price, Number(target.fraction_multiplier) || 1)} className="bg-pink hover:bg-pink/90">Add</Button></div>
      </Card>
    </div>
  )
}
