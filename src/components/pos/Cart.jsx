import CustomerSelect from '@/components/customers/CustomerSelect'
import LineDiscountControl from '@/components/pos/LineDiscountControl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useCustomerData } from '@/hooks/useCustomerData'
import { summarizeSaleDiscounts } from '@/lib/discounts'
import { computeLineVat } from '@/lib/vat'
import { format } from 'date-fns'
import { CreditCard, Trash2, Scale, Minus, Plus, Banknote, Smartphone, HandCoins, AlertTriangle, Printer, Receipt, Check } from 'lucide-react'
import React, { useState } from 'react'
export default function Cart({ items, onUpdateQuantity, onUpdateDiscount, onRemoveItem, onCheckout, total, isProcessing, settings = {}, isOffline, saleFailedMidRequest }) {
  const [paymentMethod, setPaymentMethod] = React.useState('Cash')
  const [amountTendered, setAmountTendered] = React.useState('')
  const [receiptWidth, setReceiptWidth] = React.useState('80mm')
  const [customer, setCustomer] = React.useState(null)
  const [utangCash, setUtangCash] = React.useState('')
  const { customers = [], outstandingFor } = useCustomerData()

  const fmt = (amount) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)

  const vatInclusive = settings.vat_inclusive ?? true
  const vatRegistered = settings.vat_registered ?? true
  const vatRate = settings.vat_rate ?? 0.12
  const vatPct = `${Math.round((Number(vatRate) || 0) * 100)}%`
  let totalVatable = 0, totalOutputVat = 0, totalExempt = 0
  items.forEach((i) => {
    const vat = computeLineVat(i.subtotal, { vat_exempt: i.vat_exempt, vat_inclusive: vatInclusive, vat_rate: vatRate, vat_registered: vatRegistered })
    totalVatable += vat.vatable_sales
    totalOutputVat += vat.output_vat
    totalExempt += vat.vat_exempt_sales
  })
  const showVat = items.length > 0 && (totalOutputVat > 0 || totalExempt > 0)
  const discountSummary = summarizeSaleDiscounts(items)
  const hasDiscounts = discountSummary.total_discount_amount > 0
  const grossTotal = discountSummary.gross_amount

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
        <h2 className="font-semibold text-base text-plum">Current Sale</h2>
        <Badge variant="outline" className="bg-white">{items.length} items</Badge>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
              <div className="p-4 bg-plum/5 rounded-full mb-2"><CreditCard className="w-8 h-8 text-plum/30" /></div>
              <p>Cart is empty</p>
              <p className="text-sm text-slate-300">Select items to start sale</p>
            </div>
          ) : items.map((item, index) => (
            <div key={`${item.product_id}-${item.unit_sold}`} className="flex flex-col gap-1.5 p-2.5 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors bg-slate-50/30">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium text-sm text-plum">{item.product_name}</h4>
                  <p className="text-xs text-slate-500">{item.unit_sold === 'base' ? item.base_unit : item.fraction_unit} @ {fmt(item.price_at_sale)}</p>
                </div>
                <button onClick={() => onRemoveItem(index)} aria-label="Remove item" className="p-1.5 -m-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-5 h-5" /></button>
              </div>
              <div className="flex justify-between items-center mt-1">
                {item.sell_by_weight ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2.5 py-1 text-sm font-medium text-slate-700"><Scale className="w-3.5 h-3.5 text-slate-400" />{item.quantity} {item.fraction_unit}</span>
                ) : (
                  <div className="flex items-center gap-2 bg-white rounded-md border border-slate-200 p-0.5">
                    <button className="p-1 hover:bg-slate-100 rounded text-slate-600 disabled:opacity-30" onClick={() => onUpdateQuantity(index, -1)} disabled={item.quantity <= 1}><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
                    <button className="p-1 hover:bg-slate-100 rounded text-slate-600" onClick={() => onUpdateQuantity(index, 1)}><Plus className="w-3 h-3" /></button>
                  </div>
                )}
                <span className="text-sm font-semibold text-pink">{fmt(item.subtotal)}</span>
              </div>
              {onUpdateDiscount && <LineDiscountControl item={item} eligible={item.sc_pwd_discount_eligible !== false} onChange={(partial) => onUpdateDiscount(index, partial)} />}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl space-y-3">
        <div className="flex justify-between items-center text-sm text-slate-600"><span>Subtotal</span><span>{fmt(grossTotal)}</span></div>
        {hasDiscounts && (
          <div className="space-y-1">
            <div className="flex justify-between items-center text-sm text-rose-600"><span>Discounts</span><span>−{fmt(discountSummary.total_discount_amount)}</span></div>
            {discountSummary.sc_pwd_discount_amount > 0 && <div className="flex justify-between items-center text-[11px] text-slate-500 pl-2"><span>SC/PWD (statutory)</span><span>−{fmt(discountSummary.sc_pwd_discount_amount)}</span></div>}
            {discountSummary.other_discount_amount > 0 && <div className="flex justify-between items-center text-[11px] text-slate-500 pl-2"><span>Other (custom)</span><span>−{fmt(discountSummary.other_discount_amount)}</span></div>}
          </div>
        )}
        {showVat && (
          <div className="space-y-1 text-xs text-slate-500 pl-1">
            {totalVatable > 0 && <div className="flex justify-between"><span>Vatable Sales (net)</span><span>{fmt(totalVatable)}</span></div>}
            {totalOutputVat > 0 && <div className="flex justify-between"><span>VAT ({vatPct})</span><span>{fmt(totalOutputVat)}</span></div>}
            {totalExempt > 0 && <div className="flex justify-between"><span>VAT-Exempt Sales</span><span>{fmt(totalExempt)}</span></div>}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Payment Method</label>
          <div className="grid grid-cols-4 gap-2">
            {[{ m: 'Cash', icon: Banknote }, { m: 'Gcash', icon: Smartphone }, { m: 'Card', icon: CreditCard }, { m: 'Utang', icon: HandCoins }].map(({ m, icon: Icon }) => (
              <button key={m} onClick={() => setPaymentMethod(m)} className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs gap-1 transition-all ${paymentMethod === m ? 'bg-plum/10 border-plum/30 text-plum font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <Icon className="w-4 h-4" />{m}
              </button>
            ))}
          </div>
        </div>

        {paymentMethod === 'Cash' && (
          <div className="space-y-2 pt-2">
            <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Amount Tendered</span><div className="flex items-center gap-1"><span className="text-sm text-slate-500">₱</span><input type="number" min={total} value={amountTendered} onChange={(e) => setAmountTendered(e.target.value)} className="w-24 text-right border rounded p-1 text-sm outline-pink" placeholder="0.00" /></div></div>
            {parseFloat(amountTendered) >= total && <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Change</span><span className="text-sm font-bold text-pink">{fmt(parseFloat(amountTendered) - total)}</span></div>}
          </div>
        )}

        {paymentMethod === 'Utang' && (
          <div className="space-y-2 pt-1">
            <CustomerSelect customers={customers.filter((c) => c.is_active !== false)} value={customer} onChange={setCustomer} />
            {customer && (() => {
              const bal = outstandingFor(customer.id) || 0
              const limit = Number(customer.credit_limit) || 0
              const newCharge = total - (parseFloat(utangCash) || 0)
              const wouldExceed = limit > 0 && (bal + newCharge) > limit + 0.01
              return (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600"><span>Current balance</span><span className={`font-medium ${bal > 0 ? 'text-rose-600' : bal < 0 ? 'text-pink' : ''}`}>{fmt(bal)}</span></div>
                  {limit > 0 && <div className="flex justify-between text-slate-600"><span>Available credit</span><span className="font-medium">{fmt(Math.max(0, limit - bal))}</span></div>}
                  {wouldExceed && <div className="flex items-start gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded p-2"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span>This charge would exceed the credit limit by {fmt((bal + newCharge) - limit)}.</span></div>}
                </div>
              )
            })()}
            <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Cash Paid Now (optional)</span><div className="flex items-center gap-1"><span className="text-sm text-slate-500">₱</span><input type="number" min={0} max={total} value={utangCash} onChange={(e) => setUtangCash(e.target.value)} className="w-24 text-right border rounded p-1 text-sm outline-pink" placeholder="0.00" /></div></div>
            {parseFloat(utangCash) > 0 && parseFloat(utangCash) < total && <div className="flex justify-between text-xs text-slate-500"><span>Charged to account</span><span className="font-medium text-pink">{fmt(total - parseFloat(utangCash))}</span></div>}
          </div>
        )}

        <Separator />

        <div className="flex justify-between items-end"><span className="text-base font-bold text-plum">Total</span><span className="text-xl font-bold text-pink">{fmt(total)}</span></div>

        {/* Receipt size, just above / aligned with the Complete Sale button */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs font-medium text-slate-500 uppercase tracking-wide"><Printer className="w-3.5 h-3.5" /> Receipt</span>
          <Select value={receiptWidth} onValueChange={setReceiptWidth}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="58mm">58mm (portable)</SelectItem>
              <SelectItem value="80mm">80mm (standard)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {saleFailedMidRequest && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-1">
            <div className="font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Sale could not be completed</div>
            <p className="text-xs">Connection was lost mid-request. Check Sales history to see if the sale went through before retrying.</p>
          </div>
        )}

        <Button
          className="w-full h-11 text-base bg-pink hover:bg-pink/90 shadow-lg shadow-pink/20"
          title={isOffline ? 'Checkout disabled — no internet connection' : ''}
          onClick={() => {
            const cashNow = paymentMethod === 'Utang' ? (parseFloat(utangCash) || 0) : total
            const creditAmt = paymentMethod === 'Utang' ? Math.max(0, total - cashNow) : 0
            const method = paymentMethod === 'Utang' ? (creditAmt > 0 ? (cashNow > 0 ? 'Split' : 'Utang') : 'Cash') : paymentMethod
            onCheckout({ paymentMethod: method, receiptWidth, customer: creditAmt > 0 ? customer : null, cashMethod: paymentMethod === 'Utang' ? 'Cash' : paymentMethod, cashAmount: cashNow, creditAmount: creditAmt, amountTendered: paymentMethod === 'Cash' ? (parseFloat(amountTendered) || 0) : 0 })
            setAmountTendered(''); setUtangCash(''); setCustomer(null)
          }}
          disabled={(() => {
            if (isOffline) return true
            if (items.length === 0 || isProcessing) return true
            if (paymentMethod === 'Cash' && (!amountTendered || parseFloat(amountTendered) < total)) return true
            if (paymentMethod === 'Utang' && !customer) return true
            if (paymentMethod === 'Utang' && customer) {
              const bal = outstandingFor(customer.id) || 0
              const newCharge = total - (parseFloat(utangCash) || 0)
              if (Number(customer.credit_limit) > 0 && settings.enforce_credit_limit && (bal + newCharge) > Number(customer.credit_limit) + 0.01) return true
            }
            return false
          })()}
        >
          {isProcessing ? 'Processing...' : isOffline ? 'Offline — Cannot Complete Sale' : paymentMethod === 'Utang' ? 'Complete Credit Sale' : 'Complete Sale'}
        </Button>
      </div>
    </div>
  )
}
