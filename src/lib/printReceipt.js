import { toManilaDisplayDate } from '@/lib/manilaTime'
import { computeLineVat } from '@/lib/vat'
import { format } from 'date-fns'
// Thermal receipt HTML generation (ported verbatim from Base44 app).





function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function printReceipt({ sale, items = [], settings = {}, width = '80mm' }) {
  const biz = settings.business_name || 'My Store'
  const bizType = settings.business_type || ''
  const sym = settings.currency_symbol || '₱'
  const money = (n) => `${sym}${(Number(n) || 0).toFixed(2)}`
  const dateStr = format(toManilaDisplayDate(sale.created_date), 'MMM dd, yyyy HH:mm')
  const txn = String(sale.id || '').slice(0, 8).toUpperCase()

  const vatInclusive = settings.vat_inclusive ?? true
  const vatRegistered = settings.vat_registered ?? true
  const vatRate = settings.vat_rate ?? 0.12
  const vatPct = `${Math.round((Number(vatRate) || 0) * 100)}%`

  let totalVatable = 0, totalOutputVat = 0, totalExempt = 0
  items.forEach((i) => {
    const hasPrecomputed = i.output_vat !== undefined && i.vatable_sales !== undefined
    const vat = hasPrecomputed
      ? { vatable_sales: i.vatable_sales, output_vat: i.output_vat, vat_exempt_sales: i.vat_exempt_sales || 0 }
      : computeLineVat(i.subtotal, { vat_exempt: i.vat_exempt, vat_inclusive: vatInclusive, vat_rate: vatRate, vat_registered: vatRegistered })
    totalVatable += Number(vat.vatable_sales) || 0
    totalOutputVat += Number(vat.output_vat) || 0
    totalExempt += Number(vat.vat_exempt_sales) || 0
  })

  const showVatBreakdown = totalOutputVat > 0 || totalExempt > 0

  const itemRows = items.map((i) => {
    const unitLabel = i.unit_sold === 'fraction' ? ` (${i.unit_sold})` : ''
    const hasDiscount = i.discount_type && i.discount_type !== 'none' && Number(i.discount_amount) > 0
    const netAmt = hasDiscount ? (Number(i.net_amount) || (Number(i.subtotal) - Number(i.discount_amount))) : i.subtotal
    let discountLine = ''
    if (hasDiscount) {
      const label = i.discount_type === 'senior_citizen' ? 'SC 20%' : i.discount_type === 'pwd' ? 'PWD 20%' : i.discount_type === 'custom_percent' ? `Custom ${i.discount_value}%` : 'Custom Discount'
      discountLine = `<tr><td class="qty" style="color:#555;">  ${label} −${money(i.discount_amount)}</td><td class="amt" style="text-decoration:line-through;color:#999;">${money(i.subtotal)}</td></tr>`
    }
    return `
            <tr><td colspan="2" class="name">${escapeHtml(i.product_name)}${unitLabel}</td></tr>
            <tr>
                <td class="qty">${i.quantity} &times; ${money(i.price_at_sale)}</td>
                <td class="amt">${money(netAmt)}</td>
            </tr>${discountLine}`
  }).join('')

  const scPwdItems = items.filter((i) => (i.discount_type === 'senior_citizen' || i.discount_type === 'pwd') && Number(i.discount_amount) > 0)
  const scPwdBlock = scPwdItems.length > 0 ? `
        <div class="dashed"></div>
        <div class="center" style="font-size:11px;font-weight:bold;">SC/PWD DISCOUNT DETAILS</div>
        ${scPwdItems.map((i) => `
            <div class="row"><span>Name</span><span>${escapeHtml(i.discount_person_name || '')}</span></div>
            <div class="row"><span>ID Number</span><span>${escapeHtml(i.discount_id_number || '')}</span></div>
            <div class="row"><span>Discount</span><span>−${money(i.discount_amount)}</span></div>
        `).join('')}
    ` : ''

  const totalDiscount = items.reduce((s, i) => s + (Number(i.discount_amount) || 0), 0)
  const grossAmount = items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0)
  const discountSummary = totalDiscount > 0 ? `
        <div class="row"><span>Gross</span><span>${money(grossAmount)}</span></div>
        <div class="row"><span>Discount</span><span>−${money(totalDiscount)}</span></div>
    ` : ''

  const vatBreakdown = showVatBreakdown ? `
        <div class="dashed"></div>
        ${totalVatable > 0 ? `<div class="row"><span>Vatable Sales</span><span>${money(totalVatable)}</span></div>` : ''}
        ${totalOutputVat > 0 ? `<div class="row"><span>VAT (${vatPct})</span><span>${money(totalOutputVat)}</span></div>` : ''}
        ${totalExempt > 0 ? `<div class="row"><span>VAT-Exempt Sales</span><span>${money(totalExempt)}</span></div>` : ''}` : ''

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${txn}</title>
    <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body { font-family: 'Courier New', monospace; color: #000; padding: 3mm; }
        @page { size: ${width} auto; margin: 0; }
        .wrap { width: ${width}; }
        .center { text-align: center; }
        .biz { font-size: 16px; font-weight: bold; }
        .muted { font-size: 11px; color: #000; }
        .row { display: flex; justify-content: space-between; font-size: 12px; line-height: 1.4; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        td { padding: 0; vertical-align: top; }
        .name { font-weight: bold; padding-top: 2px; }
        .qty { width: 70%; }
        .amt { text-align: right; white-space: nowrap; }
        .dashed { border-top: 1px dashed #000; margin: 4px 0; }
        .total { font-size: 14px; font-weight: bold; }
        .foot { margin-top: 6px; }
        @media print { body { padding: 0; } }
    </style></head><body>
        <div class="wrap">
            <div class="center">
                <div class="biz">${escapeHtml(biz)}</div>
                ${bizType ? `<div class="muted">${escapeHtml(bizType)}</div>` : ''}
            </div>
            <div class="dashed"></div>
            <div class="row"><span>Date</span><span>${dateStr}</span></div>
            <div class="row"><span>Txn</span><span>${txn}</span></div>
            <div class="row"><span>Cashier</span><span>${escapeHtml(sale.cashier_name || '')}</span></div>
            <div class="dashed"></div>
            <table>${itemRows}</table>
            <div class="dashed"></div>
            ${discountSummary}
            <div class="row total"><span>TOTAL</span><span>${money(sale.total_amount)}</span></div>
            ${vatBreakdown}
            ${scPwdBlock}
            <div class="dashed"></div>
            <div class="row"><span>Payment</span><span>${escapeHtml(sale.payment_method || '')}</span></div>
            ${Number(sale.amount_tendered) > 0 ? `<div class="row"><span>Cash Tendered</span><span>${money(sale.amount_tendered)}</span></div>` : ''}
            ${Number(sale.amount_tendered) > 0 ? `<div class="row total"><span>Change</span><span>${money(Number(sale.amount_tendered) - Number(sale.total_amount))}</span></div>` : ''}
            ${sale.customer_name ? `<div class="row"><span>Customer</span><span>${escapeHtml(sale.customer_name)}</span></div>` : ''}
            ${Number(sale.credit_amount) > 0 ? `
                <div class="row"><span>Cash Paid Now</span><span>${money(sale.cash_amount || 0)}</span></div>
                <div class="row"><span>Charged to Account</span><span>${money(sale.credit_amount)}</span></div>
                ${sale.customer_balance != null ? `<div class="row"><span>Balance Due</span><span>${money(sale.customer_balance)}</span></div>` : ''}
            ` : ''}
            ${sale.status === 'Voided' ? '<div class="center muted" style="margin-top:6px;font-weight:bold;">** VOIDED **</div>' : ''}
            <div class="dashed"></div>
            <div class="center muted foot">Thank you, come again!</div>
        </div>
    </body></html>`

  const win = window.open('', '_blank', 'width=420,height=640')
  if (!win) { alert('Please allow pop-ups to print the receipt.'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 350)
}

export function printPaymentAck({ customer, payment, settings = {}, width = '80mm' }) {
  const biz = settings.business_name || 'My Store'
  const sym = settings.currency_symbol || '₱'
  const money = (n) => `${sym}${(Number(n) || 0).toFixed(2)}`
  const dateStr = format(toManilaDisplayDate(payment.date), 'MMM dd, yyyy HH:mm')
  const txn = String(payment.id || '').slice(0, 8).toUpperCase()
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payment Ack ${txn}</title>
    <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body { font-family: 'Courier New', monospace; color: #000; padding: 3mm; }
        @page { size: ${width} auto; margin: 0; }
        .wrap { width: ${width}; }
        .center { text-align: center; }
        .biz { font-size: 16px; font-weight: bold; }
        .muted { font-size: 11px; color: #000; }
        .row { display: flex; justify-content: space-between; font-size: 12px; line-height: 1.4; }
        .dashed { border-top: 1px dashed #000; margin: 4px 0; }
        .total { font-size: 14px; font-weight: bold; }
        .foot { margin-top: 6px; }
        @media print { body { padding: 0; } }
    </style></head><body>
        <div class="wrap">
            <div class="center"><div class="biz">${escapeHtml(biz)}</div></div>
            <div class="dashed"></div>
            <div class="row"><span>Date</span><span>${dateStr}</span></div>
            <div class="row"><span>Ack No</span><span>${txn}</span></div>
            <div class="row"><span>Customer</span><span>${escapeHtml(customer.name || '')}</span></div>
            <div class="dashed"></div>
            <div class="row total"><span>Payment Received</span><span>${money(payment.amount)}</span></div>
            <div class="row"><span>Method</span><span>${escapeHtml(payment.method || 'Cash')}</span></div>
            ${payment.reference ? `<div class="row"><span>Reference</span><span>${escapeHtml(payment.reference)}</span></div>` : ''}
            <div class="row"><span>New Balance</span><span>${money(payment.running_balance)}</span></div>
            <div class="dashed"></div>
            <div class="center muted foot">Payment recorded. Thank you!</div>
        </div>
    </body></html>`
  const win = window.open('', '_blank', 'width=420,height=640')
  if (!win) { alert('Please allow pop-ups to print the acknowledgment.'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 350)
}
