// Customer Credit (Utang) ledger logic (ported verbatim from Base44 app).
import { base44 } from '@/api/base44Client'
import { createJournalEntry, CASH_CODE, AR_CODE } from '@/lib/bookkeeping'
export function entryDelta(entry) {
  const amt = Number(entry.amount) || 0
  if (entry.type === 'payment') return -amt
  return amt
}

export function computeBalance(entries) {
  return Number(entries.reduce((s, e) => s + entryDelta(e), 0).toFixed(2))
}

export function entriesForCustomer(entries, customerId) {
  return entries
    .filter((e) => e.customer_id === customerId)
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
}

export function customerOutstanding(entries, customerId) {
  return computeBalance(entriesForCustomer(entries, customerId))
}

export function availableCredit(customer, balance) {
  const limit = Number(customer.credit_limit) || 0
  if (limit <= 0) return 0
  return Number((limit - Math.max(0, balance)).toFixed(2))
}

export async function recordCreditCharge(tenantId, { customer, sale, creditAmount, recordedBy, note }) {
  const amt = Number(creditAmount) || 0
  if (amt <= 0 || !customer?.id) return null
  const all = await base44.entities.CustomerLedgerEntry.filter({ customer_id: customer.id, tenant_id: tenantId }, '-created_date', 5000)
  const balance = computeBalance(all)
  const running = Number((balance + amt).toFixed(2))
  return base44.entities.CustomerLedgerEntry.create({
    customer_id: customer.id,
    customer_name: customer.name,
    date: sale?.created_date || new Date().toISOString(),
    type: 'charge',
    amount: amt,
    reference_type: 'sale',
    reference_id: sale?.id || '',
    running_balance: running,
    recorded_by: recordedBy || 'Admin',
    note: note || `Sale ${String(sale?.id || '').slice(0, 8)}`,
    tenant_id: tenantId,
  })
}

export async function recordCustomerPayment(tenantId, { customer, paymentDate, amount, paymentMethod, referenceNumber, receivedBy, allowOverpay }) {
  const amt = Number(amount) || 0
  if (amt <= 0) throw new Error('Enter a payment amount')
  const all = await base44.entities.CustomerLedgerEntry.filter({ customer_id: customer.id, tenant_id: tenantId }, '-created_date', 5000)
  const balance = computeBalance(all)
  if (amt > balance + 0.01 && !allowOverpay) {
    throw new Error(`Payment ₱${amt.toFixed(2)} exceeds outstanding balance ₱${balance.toFixed(2)}. Tick "Allow overpayment" to record a credit-in-hand.`)
  }
  const date = paymentDate ? new Date(`${paymentDate}T00:00:00`).toISOString() : new Date().toISOString()
  const entry = await base44.entities.CustomerLedgerEntry.create({
    customer_id: customer.id,
    customer_name: customer.name,
    date,
    type: 'payment',
    amount: amt,
    reference_type: 'payment',
    reference_id: '',
    running_balance: Number((balance - amt).toFixed(2)),
    recorded_by: receivedBy || 'Admin',
    note: referenceNumber ? `Payment received (ref: ${referenceNumber})` : 'Payment received',
    tenant_id: tenantId,
  })

  await createJournalEntry(tenantId, {
    date,
    reference_type: 'customer_payment',
    reference_id: entry.id,
    description: `Customer payment — ${customer.name}`,
    party: customer.name,
    payment_method: paymentMethod || 'Cash',
    lines: [
      { code: CASH_CODE, debit: Number(amt.toFixed(2)) },
      { code: AR_CODE, credit: Number(amt.toFixed(2)) },
    ],
  })
  return entry
}

export async function recordAdjustment(tenantId, { customer, amount, note, recordedBy }) {
  const amt = Number(amount) || 0
  if (!amt) throw new Error('Enter a non-zero adjustment amount')
  if (!note?.trim()) throw new Error('A reason is required for manual adjustments')
  const all = await base44.entities.CustomerLedgerEntry.filter({ customer_id: customer.id, tenant_id: tenantId }, '-created_date', 5000)
  const balance = computeBalance(all)
  return base44.entities.CustomerLedgerEntry.create({
    customer_id: customer.id,
    customer_name: customer.name,
    date: new Date().toISOString(),
    type: 'adjustment',
    amount: amt,
    reference_type: 'adjustment',
    reference_id: '',
    running_balance: Number((balance + amt).toFixed(2)),
    recorded_by: recordedBy || 'Admin',
    note: note.trim(),
    tenant_id: tenantId,
  })
}

export async function reverseCreditSale(tenantId, saleId, recordedBy) {
  const charges = await base44.entities.CustomerLedgerEntry.filter({ reference_id: saleId, reference_type: 'sale', type: 'charge', tenant_id: tenantId })
  if (!charges.length) return null
  const charge = charges[0]
  const all = await base44.entities.CustomerLedgerEntry.filter({ customer_id: charge.customer_id, tenant_id: tenantId }, '-created_date', 5000)
  const balance = computeBalance(all)
  const adj = -Number(charge.amount)
  return base44.entities.CustomerLedgerEntry.create({
    customer_id: charge.customer_id,
    customer_name: charge.customer_name,
    date: new Date().toISOString(),
    type: 'adjustment',
    amount: adj,
    reference_type: 'void',
    reference_id: saleId,
    running_balance: Number((balance + adj).toFixed(2)),
    recorded_by: recordedBy || 'Admin',
    note: `Reversal of voided sale ${String(saleId).slice(0, 8)}`,
    tenant_id: tenantId,
  })
}

export function fifoAging(entries, customerId, now = new Date()) {
  const cust = entriesForCustomer(entries, customerId)
  const charges = cust.filter((e) => e.type === 'charge').sort((a, b) => new Date(a.date) - new Date(b.date))
  const payments = cust.filter((e) => e.type === 'payment').sort((a, b) => new Date(a.date) - new Date(b.date))
  let payPool = payments.reduce((s, p) => s + Number(p.amount) || 0, 0)
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 }
  charges.forEach((ch) => {
    const chAmt = Number(ch.amount) || 0
    const applied = Math.min(chAmt, payPool)
    const unpaid = chAmt - applied
    payPool -= applied
    if (unpaid > 0.01) {
      const days = Math.floor((now - new Date(ch.date)) / 86400000)
      if (days <= 0) buckets.current += unpaid
      else if (days <= 30) buckets.d1_30 += unpaid
      else if (days <= 60) buckets.d31_60 += unpaid
      else if (days <= 90) buckets.d61_90 += unpaid
      else buckets.d90plus += unpaid
      buckets.total += unpaid
    }
  })
  return buckets
}
