// Purchase order lifecycle, weighted-average cost, AP tracking (ported from Base44).
import { base44 } from '@/api/base44Client'
import { ensureChartOfAccounts, INV_CODE, INPUT_VAT_CODE, CASH_CODE, AP_CODE, createJournalEntry } from '@/lib/bookkeeping'
import { manilaParts } from '@/lib/manilaTime'
import { computeInputVat } from '@/lib/vat'
const TERM_DAYS = { COD: 0, 'Net 7': 7, 'Net 15': 15, 'Net 30': 30, 'Net 60': 60 }

export function termDays(terms) {
  return TERM_DAYS[terms] ?? 0
}

export function dueDate(orderDateStr, terms) {
  const d = orderDateStr ? new Date(`${orderDateStr}T00:00:00`) : new Date()
  d.setDate(d.getDate() + termDays(terms))
  return d
}

export async function generatePoNumber(tenantId) {
  const p = manilaParts(new Date())
  const prefix = `PO-${p.y}${String(p.m).padStart(2, '0')}${String(p.day).padStart(2, '0')}`
  const todays = await base44.entities.PurchaseOrder.filter({ tenant_id: tenantId }, '-created_date', 200)
  const count = todays.filter((po) => String(po.po_number || '').startsWith(prefix)).length + 1
  return `${prefix}-${String(count).padStart(3, '0')}`
}

export async function createPurchaseOrder(tenantId, { supplier, order_date, expected_delivery_date, payment_terms, notes, items }) {
  const po_number = await generatePoNumber(tenantId)
  const po = await base44.entities.PurchaseOrder.create({
    po_number,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    order_date,
    expected_delivery_date: expected_delivery_date || '',
    status: 'draft',
    payment_terms: payment_terms || supplier.payment_terms || 'COD',
    paid: false,
    notes: notes || '',
    tenant_id: tenantId,
  })
  const lineDocs = items.map((it) => ({
    po_id: po.id,
    product_id: it.product_id,
    product_name: it.product_name,
    quantity_ordered: Number(it.quantity_ordered) || 0,
    unit_of_purchase: it.unit_of_purchase,
    unit_cost: Number(it.unit_cost) || 0,
    quantity_received: 0,
    line_total: (Number(it.quantity_ordered) || 0) * (Number(it.unit_cost) || 0),
    tenant_id: tenantId,
  }))
  if (lineDocs.length) await base44.entities.PurchaseOrderItem.bulkCreate(lineDocs)
  return po
}

export async function updatePurchaseOrder(tenantId, po, { supplier, order_date, expected_delivery_date, payment_terms, notes, items }) {
  await base44.entities.PurchaseOrder.update(po.id, {
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    order_date,
    expected_delivery_date: expected_delivery_date || '',
    payment_terms: payment_terms || supplier.payment_terms || 'COD',
    notes: notes || '',
  })
  const existing = await base44.entities.PurchaseOrderItem.filter({ po_id: po.id, tenant_id: tenantId })
  const keepIds = new Set(items.filter((i) => i.id).map((i) => i.id))
  const toDelete = existing.filter((e) => !keepIds.has(e.id))
  if (toDelete.length) await base44.entities.PurchaseOrderItem.deleteMany({ id: { $in: toDelete.map((d) => d.id) } })
  for (const it of items) {
    const payload = {
      po_id: po.id,
      product_id: it.product_id,
      product_name: it.product_name,
      quantity_ordered: Number(it.quantity_ordered) || 0,
      unit_of_purchase: it.unit_of_purchase,
      unit_cost: Number(it.unit_cost) || 0,
      line_total: (Number(it.quantity_ordered) || 0) * (Number(it.unit_cost) || 0),
      tenant_id: tenantId,
    }
    if (it.id) await base44.entities.PurchaseOrderItem.update(it.id, payload)
    else await base44.entities.PurchaseOrderItem.create({ ...payload, quantity_received: 0 })
  }
  return po
}

export async function sendPurchaseOrder(tenantId, po) {
  return base44.entities.PurchaseOrder.update(po.id, { status: 'sent' })
}

export async function cancelPurchaseOrder(tenantId, po, reason) {
  return base44.entities.PurchaseOrder.update(po.id, {
    status: 'cancelled',
    notes: ((po.notes || '') + (reason ? `\nCancelled: ${reason}` : '')).trim(),
  })
}

export async function closePurchaseOrderShort(tenantId, po, reason) {
  return base44.entities.PurchaseOrder.update(po.id, {
    status: 'fully_received',
    notes: ((po.notes || '') + (reason ? `\nClosed short: ${reason}` : '')).trim(),
  })
}

export function weightedAverageCost(existingQty, existingCost, recvQty, actualCost) {
  const eq = Number(existingQty) || 0
  const ec = Number(existingCost) || 0
  const rq = Number(recvQty) || 0
  const ac = Number(actualCost) || 0
  if (eq + rq <= 0) return ec
  return ((eq * ec) + (rq * ac)) / (eq + rq)
}

export async function receiveGoods(tenantId, po, receipts, options = {}) {
  await ensureChartOfAccounts(tenantId)
  const {
    paid_now = po.payment_terms === 'COD',
    invoice_number = '',
    over_receipt = false,
    cost_threshold = 0.15,
    user = 'Admin',
  } = options

  const items = await base44.entities.PurchaseOrderItem.filter({ po_id: po.id, tenant_id: tenantId })
  const supplier = (await base44.entities.Supplier.filter({ id: po.supplier_id, tenant_id: tenantId }))[0] || { name: po.supplier_name, is_vat_registered: false, tin: '' }

  const isVatRegistered = !!supplier.is_vat_registered
  const hasInvoice = !!invoice_number.trim()
  const creditable = isVatRegistered && hasInvoice

  const warnings = []
  let totalInventoryNet = 0
  let totalInputVat = 0
  let totalGross = 0
  const movementsCreated = []

  for (const r of receipts) {
    const item = items.find((i) => i.id === r.item_id)
    if (!item) continue
    const remaining = (Number(item.quantity_ordered) || 0) - (Number(item.quantity_received) || 0)
    let qty = Number(r.quantity_received) || 0
    if (qty <= 0) continue
    if (qty > remaining && !over_receipt) {
      throw new Error(`Cannot receive ${qty} ${item.unit_of_purchase} of ${item.product_name} — only ${remaining} remaining.`)
    }
    const actualCost = Number(r.actual_unit_cost)
    if (!(actualCost >= 0)) throw new Error(`Enter a valid unit cost for ${item.product_name}`)

    const product = (await base44.entities.Product.filter({ id: item.product_id, tenant_id: tenantId }))[0]
    if (!product) throw new Error(`Product not found for ${item.product_name}`)

    const existingQty = Number(product.stock_quantity) || 0
    const existingCost = Number(product.cost_price) || 0
    const newAvgCost = weightedAverageCost(existingQty, existingCost, qty, actualCost)

    if (existingCost > 0) {
      const drift = Math.abs(actualCost - existingCost) / existingCost
      if (drift > cost_threshold) {
        const dir = actualCost > existingCost ? 'increased' : 'decreased'
        warnings.push(`${item.product_name}: unit cost ${dir} ${Math.round(drift * 100)}% from last average (₱${existingCost.toFixed(2)} → ₱${actualCost.toFixed(2)})`)
      }
    }

    const gross = qty * actualCost
    const inputVat = creditable ? computeInputVat(gross, true) : 0
    const inventoryNet = creditable ? gross - inputVat : gross

    await base44.entities.Product.update(product.id, { stock_quantity: existingQty + qty, cost_price: Number(newAvgCost.toFixed(4)) })

    await base44.entities.ProductCostHistory.create({
      product_id: product.id,
      product_name: product.name,
      date: new Date().toISOString(),
      previous_average_cost: existingCost,
      new_average_cost: Number(newAvgCost.toFixed(4)),
      quantity_received: qty,
      actual_unit_cost: actualCost,
      triggering_po_id: po.id,
      tenant_id: tenantId,
    })

    const movement = await base44.entities.StockMovement.create({
      product_id: product.id,
      product_name: product.name,
      quantity: qty,
      direction: 'in',
      reason: 'restock',
      reference_id: po.id,
      recorded_by: user,
      supplier_id: supplier.id || '',
      supplier_name: supplier.name,
      supplier_tin: supplier.tin || '',
      po_id: po.id,
      paid: paid_now,
      invoice_or_receipt_number: invoice_number.trim(),
      is_vat_registered_supplier: isVatRegistered,
      purchase_cost: gross,
      input_vat: inputVat,
      non_creditable: !creditable,
      tenant_id: tenantId,
    })
    movementsCreated.push(movement)

    await base44.entities.PurchaseOrderItem.update(item.id, { quantity_received: (Number(item.quantity_received) || 0) + qty })

    totalGross += gross
    totalInputVat += inputVat
    totalInventoryNet += inventoryNet
  }

  if (movementsCreated.length === 0) throw new Error('Nothing received — enter a quantity for at least one line.')

  const lines = [{ code: INV_CODE, debit: Number(totalInventoryNet.toFixed(2)) }]
  if (creditable && totalInputVat > 0) lines.push({ code: INPUT_VAT_CODE, debit: Number(totalInputVat.toFixed(2)) })
  lines.push({ code: paid_now ? CASH_CODE : AP_CODE, credit: Number(totalGross.toFixed(2)) })

  await createJournalEntry(tenantId, {
    date: new Date().toISOString(),
    reference_type: 'purchase',
    reference_id: po.id,
    description: `PO ${po.po_number} receipt — ${supplier.name}`,
    party: supplier.name,
    payment_method: paid_now ? 'Cash' : 'On Account',
    lines,
  })

  const refreshedItems = await base44.entities.PurchaseOrderItem.filter({ po_id: po.id, tenant_id: tenantId })
  const allFullyReceived = refreshedItems.every((i) => (Number(i.quantity_received) || 0) >= (Number(i.quantity_ordered) || 0))
  const anyReceived = refreshedItems.some((i) => (Number(i.quantity_received) || 0) > 0)
  const newStatus = allFullyReceived ? 'fully_received' : anyReceived ? 'partially_received' : po.status
  await base44.entities.PurchaseOrder.update(po.id, { status: newStatus, paid: paid_now && newStatus === 'fully_received' ? true : po.paid })

  return { warnings, status: newStatus, gross: totalGross, inputVat: totalInputVat, inventoryNet: totalInventoryNet }
}

export async function recordSupplierPayment(tenantId, { supplier, poId, payment_date, amount, payment_method, reference_number }) {
  await ensureChartOfAccounts(tenantId)
  const amt = Number(amount) || 0
  if (amt <= 0) throw new Error('Enter a payment amount')

  // Guard: a payment may never exceed the actual outstanding payable. Goods
  // received with "Paid now (Cash)" create no AP (movement paid=true, journal
  // credits Cash), so paying those again would push AP into phantom negatives.
  let owed
  if (poId) {
    const po = (await base44.entities.PurchaseOrder.filter({ id: poId, tenant_id: tenantId }))[0]
    if (!po) throw new Error('Purchase order not found')
    const pos = await base44.entities.PurchaseOrder.filter({ supplier_id: po.supplier_id, tenant_id: tenantId }, '-created_date', 1000)
    const movements = await base44.entities.StockMovement.filter({ tenant_id: tenantId }, '-created_date', 5000)
    const payments = await base44.entities.SupplierPayment.filter({ tenant_id: tenantId }, '-created_date', 5000)
    owed = poEffectiveOutstanding(poId, pos, movements, payments)
  } else {
    const pos = await base44.entities.PurchaseOrder.filter({ supplier_id: supplier.id, tenant_id: tenantId }, '-created_date', 1000)
    const movements = await base44.entities.StockMovement.filter({ tenant_id: tenantId }, '-created_date', 5000)
    const payments = await base44.entities.SupplierPayment.filter({ supplier_id: supplier.id, tenant_id: tenantId }, '-created_date', 5000)
    owed = computeSupplierAp(supplier.id, pos, movements, payments)
  }
  if (owed <= 0.01) throw new Error(`No outstanding payable for ${supplier.name} — nothing to pay`)
  if (amt > owed + 0.01) throw new Error(`Payment of ₱${amt.toFixed(2)} exceeds the outstanding payable of ₱${owed.toFixed(2)}`)

  const entry = await createJournalEntry(tenantId, {
    date: payment_date ? new Date(`${payment_date}T00:00:00`).toISOString() : new Date().toISOString(),
    reference_type: 'supplier_payment',
    reference_id: poId || '',
    description: `Supplier payment — ${supplier.name}${poId ? ' (PO)' : ''}`,
    party: supplier.name,
    payment_method: payment_method || 'Cash',
    lines: [
      { code: AP_CODE, debit: Number(amt.toFixed(2)) },
      { code: CASH_CODE, credit: Number(amt.toFixed(2)) },
    ],
  })

  const payment = await base44.entities.SupplierPayment.create({
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    po_id: poId || '',
    payment_date: payment_date || new Date().toISOString().slice(0, 10),
    amount: amt,
    payment_method: payment_method || 'Cash',
    reference_number: reference_number || '',
    journal_entry_id: entry.id,
    tenant_id: tenantId,
  })

  if (poId) {
    const po = (await base44.entities.PurchaseOrder.filter({ id: poId, tenant_id: tenantId }))[0]
    if (po && owed - amt <= 0.01) await base44.entities.PurchaseOrder.update(poId, { paid: true })
  }
  return payment
}

export async function poOutstanding(tenantId, po) {
  const movements = await base44.entities.StockMovement.filter({ po_id: po.id, tenant_id: tenantId }, '-created_date', 2000)
  const onAccountGross = movements
    .filter((m) => m.reason === 'restock' && m.direction === 'in' && m.paid === false)
    .reduce((s, m) => s + (Number(m.purchase_cost) || 0), 0)
  const payments = await base44.entities.SupplierPayment.filter({ po_id: po.id, tenant_id: tenantId }, '-created_date', 2000)
  const paidAmount = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  return onAccountGross - paidAmount
}

export function computeSupplierAp(supplierId, poList, movements, payments) {
  const poIds = new Set(poList.filter((po) => po.supplier_id === supplierId).map((po) => po.id))
  const onAccountGross = movements
    .filter((m) => m.reason === 'restock' && m.direction === 'in' && m.paid === false && poIds.has(m.po_id))
    .reduce((s, m) => s + (Number(m.purchase_cost) || 0), 0)
  const paidAmount = payments
    .filter((p) => p.supplier_id === supplierId)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)
  return onAccountGross - paidAmount
}

// Allocates a supplier's overpayment credit (payments > on-account receipts)
// against that supplier's POs, oldest order date first, so the credit offsets
// newly received POs instead of laying on top of a per-PO balance. Each PO is
// settled by its own allocated payments first; any excess and any unallocated
// payments feed a shared credit pool that is then applied FIFO across POs.
export function supplierPoEffectiveBalances(supplierId, poList, movements, payments) {
  const map = new Map()
  const pos = poList.filter((po) => po.supplier_id === supplierId && po.status !== 'cancelled')
  const poIdSet = new Set(pos.map((po) => po.id))
  const supPays = payments.filter((p) => p.supplier_id === supplierId)

  const onAccountGross = (po) => movements
    .filter((m) => m.po_id === po.id && m.reason === 'restock' && m.direction === 'in' && m.paid === false)
    .reduce((s, m) => s + (Number(m.purchase_cost) || 0), 0)

  let pool = supPays.filter((p) => !poIdSet.has(p.po_id)).reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const byDate = [...pos].sort((a, b) => String(a.order_date || '').localeCompare(String(b.order_date || '')))
  for (const po of byDate) {
    const poPaid = supPays.filter((p) => p.po_id === po.id).reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const rawOut = onAccountGross(po) - poPaid
    let remain = Math.max(rawOut, 0)
    if (rawOut < 0) pool += -rawOut
    const applied = Math.min(remain, pool)
    remain -= applied
    pool -= applied
    map.set(po.id, { outstanding: rawOut, effective: remain, creditApplied: applied })
  }
  return map
}

export function poEffectiveOutstanding(poId, poList, movements, payments) {
  return supplierPoEffectiveBalances(poList.find((po) => po.id === poId)?.supplier_id, poList, movements, payments).get(poId)?.effective ?? 0
}
