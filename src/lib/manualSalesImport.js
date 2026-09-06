// Manual Offline Sales Import (ported from Base44). Rebuilds sales from a CSV.
import { validateLineDiscount, summarizeSaleDiscounts } from '@/lib/discounts'
import { parseCSV, extractDataRows } from '@/lib/inventoryImport'
import { processSale } from '@/lib/processSale'
import { summarizeVat } from '@/lib/vat'
export const MANUAL_SALE_COLUMNS = [
  'manual_ref', 'date', 'time', 'cashier_name',
  'product_sku', 'product_name', 'quantity', 'unit_sold', 'price_per_unit',
  'payment_method', 'cash_amount', 'credit_amount',
  'customer_name', 'customer_id_or_phone',
  'discount_type', 'discount_value', 'discount_id_number', 'discount_person_name', 'discount_reason',
  'notes',
]

const VALID_PAYMENT_METHODS = ['Cash', 'Card', 'Gcash', 'Utang', 'Split']
const VALID_DISCOUNT_TYPES = ['none', 'senior_citizen', 'pwd', 'custom_percent', 'custom_amount']

export function downloadManualSalesTemplate() {
  const header = MANUAL_SALE_COLUMNS.join(',')
  const example = [
    'MANUAL-001', '2026-08-10', '14:30', 'Rhena Beth Mateo',
    'FEED-001', 'Hog Grower Feed', '2', 'base', '1350',
    'Cash', '2700', '0',
    '', '',
    'none', '', '', '', '',
    'Backfilled from paper receipt',
  ].join(',')
  const guide =
    '# Manual Offline Sales Import Template — Libreta\n' +
    '# RULES:\n' +
    '#   - Group rows by manual_ref: all rows sharing a ref become ONE multi-item sale.\n' +
    '#   - date (YYYY-MM-DD) and time (HH:MM) set the sale timestamp — NOT the import time.\n' +
    '#   - product_sku is the primary match key; falls back to product_name if SKU is blank.\n' +
    '#   - unit_sold: "base" or "fraction".\n' +
    '#   - payment_method: Cash, Card, Gcash, Utang, or Split.\n' +
    '#   - For Utang/Split: fill customer_name + customer_id_or_phone (customer ID or phone).\n' +
    '#   - discount_type: none, senior_citizen, pwd, custom_percent, custom_amount.\n' +
    '#   - discount_value: 20 for senior_citizen/pwd (auto); % for custom_percent; peso for custom_amount.\n' +
    '#   - discount_id_number + discount_person_name required for senior_citizen/pwd.\n' +
    '#   - discount_reason required for custom_percent/custom_amount.\n'
  const csv = guide + header + '\n' + example + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'libreta_manual_sales_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const norm = (v) => (v ?? '').toString().trim().toLowerCase()

export function buildManualSalesPreview(csvText, products, customers, settings) {
  const allRows = parseCSV(csvText)
  const { headers, body } = extractDataRows(allRows)
  const bySku = new Map(); const byName = new Map()
  products.forEach((p) => {
    if (p.sku) bySku.set(norm(p.sku), p)
    byName.set(norm(p.name), p)
  })
  const byCustomerId = new Map(); const byPhone = new Map(); const byCustName = new Map()
  customers.forEach((c) => {
    byCustomerId.set(c.id, c)
    if (c.phone) byPhone.set(c.phone.trim(), c)
    byCustName.set(norm(c.name), c)
  })
  const rowObjs = body.map((row, idx) => {
    const obj = { _rowNum: idx + 2 }
    headers.forEach((h, i) => { obj[h] = (row[i] ?? '').trim() })
    return obj
  })
  const groups = {}; const groupOrder = []
  rowObjs.forEach((r) => {
    const ref = r.manual_ref
    if (!ref) return
    if (!groups[ref]) { groups[ref] = []; groupOrder.push(ref) }
    groups[ref].push(r)
  })
  const sales = []; const errors = []
  groupOrder.forEach((ref) => {
    const rows = groups[ref]
    const firstRow = rows[0]
    const saleErrors = []
    const dateStr = firstRow.date
    const timeStr = firstRow.time || '00:00'
    let saleDate = null
    if (!dateStr) saleErrors.push(`Sale ${ref}: missing date`)
    else {
      const d = new Date(`${dateStr}T${String(timeStr).padStart(5, '0')}:00`)
      if (isNaN(d.getTime())) saleErrors.push(`Sale ${ref}: invalid date/time "${dateStr} ${timeStr}"`)
      else saleDate = d.toISOString()
    }
    const paymentMethod = firstRow.payment_method || 'Cash'
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) saleErrors.push(`Sale ${ref}: invalid payment_method "${paymentMethod}"`)
    const cashAmount = Number(firstRow.cash_amount) || 0
    const creditAmount = Number(firstRow.credit_amount) || 0
    let customer = null
    const customerRef = firstRow.customer_id_or_phone || ''
    const customerName = firstRow.customer_name || ''
    if (customerRef) customer = byCustomerId.get(customerRef) || byPhone.get(customerRef)
    if (!customer && customerName) customer = byCustName.get(norm(customerName))
    if (creditAmount > 0 && !customer) saleErrors.push(`Sale ${ref}: credit sale but customer "${customerName || customerRef}" not found`)
    const items = []
    rows.forEach((r) => {
      let product = null
      if (r.product_sku) product = bySku.get(norm(r.product_sku))
      if (!product && r.product_name) product = byName.get(norm(r.product_name))
      if (!product) { saleErrors.push(`Row ${r._rowNum}: product not found (SKU: "${r.product_sku || '—'}", name: "${r.product_name || '—'}")`); return }
      const quantity = Number(r.quantity) || 0
      if (quantity <= 0) saleErrors.push(`Row ${r._rowNum}: quantity must be greater than 0`)
      const unitSold = r.unit_sold === 'fraction' ? 'fraction' : 'base'
      const pricePerUnit = Number(r.price_per_unit) || 0
      if (pricePerUnit <= 0) saleErrors.push(`Row ${r._rowNum}: price_per_unit must be greater than 0`)
      const subtotal = +(quantity * pricePerUnit).toFixed(2)
      const discountType = VALID_DISCOUNT_TYPES.includes(r.discount_type) ? r.discount_type : 'none'
      let discountValue = Number(r.discount_value) || 0
      if (discountType === 'senior_citizen' || discountType === 'pwd') discountValue = 20
      const itemObj = {
        product_id: product.id, product_name: product.name, quantity, unit_sold: unitSold,
        price_at_sale: pricePerUnit, subtotal, base_unit: product.base_unit,
        fraction_unit: product.fraction_unit, fraction_multiplier: product.fraction_multiplier,
        cost_price: product.cost_price || 0, vat_exempt: product.vat_exempt || false,
        sc_pwd_discount_eligible: product.sc_pwd_discount_eligible !== false,
        discount_type: discountType, discount_value: discountValue,
        discount_id_number: r.discount_id_number || '', discount_person_name: r.discount_person_name || '',
        discount_reason: r.discount_reason || '',
      }
      const { valid, errors: discErrors } = validateLineDiscount(itemObj)
      if (!valid) discErrors.forEach((de) => saleErrors.push(`Row ${r._rowNum}: ${de}`))
      items.push(itemObj)
    })
    if (items.length === 0) saleErrors.push(`Sale ${ref}: no valid line items`)
    const summary = summarizeSaleDiscounts(items)
    // VAT-registered business charging VAT-exclusive prices: add the 12% on top.
    const vatRegistered = settings?.vat_registered !== false
    const vatInclusive = settings?.vat_inclusive !== false
    const addVatOnTop = vatRegistered && !vatInclusive
    const vatTotals = summarizeVat(items, {
      vat_inclusive: vatInclusive,
      vat_rate: settings?.vat_rate ?? 0.12,
      vat_registered: vatRegistered,
    })
    const computedTotal = addVatOnTop
      ? +(summary.net_total + vatTotals.total_output_vat).toFixed(2)
      : summary.net_total
    let effectivePaymentMethod = paymentMethod
    let effectiveCashMethod = ''
    if (creditAmount > 0 && cashAmount > 0) { effectivePaymentMethod = 'Split'; effectiveCashMethod = 'Cash' }
    else if (creditAmount > 0) effectivePaymentMethod = 'Utang'
    const sale = {
      manualRef: ref, saleDate, cashierName: firstRow.cashier_name || 'Unknown',
      paymentMethod: effectivePaymentMethod, cashMethod: effectiveCashMethod,
      cashAmount: cashAmount > 0 ? cashAmount : computedTotal - creditAmount,
      creditAmount, customer, customerName, items,
      grossAmount: summary.gross_amount, totalDiscount: summary.total_discount_amount,
      total: computedTotal, notes: firstRow.notes || '', errors: saleErrors,
    }
    sales.push(sale)
    if (saleErrors.length > 0) saleErrors.forEach((e) => errors.push(e))
  })
  const validSales = sales.filter((s) => s.errors.length === 0)
  const productCount = new Set(validSales.flatMap((s) => s.items.map((i) => i.product_id))).size
  const totalAmount = validSales.reduce((s, sale) => s + sale.total, 0)
  return { sales, errors, summary: { salesCount: validSales.length, salesWithErrors: sales.filter((s) => s.errors.length > 0).length, productCount, totalAmount } }
}

export async function executeManualSalesImport(preview, tenantId, user, settings) {
  const validSales = preview.sales.filter((s) => s.errors.length === 0)
  const results = []
  for (const sale of validSales) {
    const result = await processSale(tenantId, {
      items: sale.items, total: sale.total, paymentMethod: sale.paymentMethod,
      cashMethod: sale.cashMethod, cashier: sale.cashierName, customer: sale.customer,
      creditAmount: sale.creditAmount, cashAmount: sale.cashAmount, settings,
      saleDate: sale.saleDate, referenceType: 'manual_offline_import',
    })
    results.push({ manualRef: sale.manualRef, saleId: result.id })
  }
  return { imported: results.length, skipped: preview.sales.filter((s) => s.errors.length > 0).length, results }
}
