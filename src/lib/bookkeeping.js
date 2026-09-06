// Double-entry bookkeeping engine (ported from Base44, adapted to atomic RPC).
import { base44 } from '@/api/base44Client'
export const ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset' },
  { code: '1200', name: 'Inventory Asset', type: 'asset' },
  { code: '1300', name: 'Bank', type: 'asset' },
  { code: '1500', name: 'Input VAT', type: 'asset' },
  { code: '2000', name: 'Accounts Payable', type: 'liability' },
  { code: '2300', name: 'Output VAT', type: 'liability' },
  { code: '3000', name: "Owner's Equity", type: 'equity' },
  { code: '4000', name: 'Sales Revenue', type: 'revenue' },
  { code: '4100', name: 'Sales Discount — Senior Citizen/PWD', type: 'revenue' },
  { code: '4101', name: 'Sales Discount — Other', type: 'revenue' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
  { code: '6000', name: 'Rent Expense', type: 'expense' },
  { code: '6100', name: 'Utilities Expense', type: 'expense' },
  { code: '6200', name: 'Salaries & Wages Expense', type: 'expense' },
  { code: '6300', name: 'Transportation & Delivery Expense', type: 'expense' },
  { code: '6400', name: 'Repairs & Maintenance Expense', type: 'expense' },
  { code: '6500', name: 'Office Supplies Expense', type: 'expense' },
  { code: '6600', name: 'Professional Fees Expense', type: 'expense' },
  { code: '6700', name: 'Taxes & Licenses Expense', type: 'expense' },
  { code: '6800', name: 'Depreciation Expense', type: 'expense' },
  { code: '6900', name: 'Insurance Expense', type: 'expense' },
  { code: '7000', name: 'Marketing & Advertising Expense', type: 'expense' },
  { code: '7100', name: 'Miscellaneous Expense', type: 'expense' },
]

export const CASH_CODE = '1000'
export const AR_CODE = '1100'
export const INV_CODE = '1200'
export const BANK_CODE = '1300'
export const INPUT_VAT_CODE = '1500'
export const AP_CODE = '2000'
export const OUTPUT_VAT_CODE = '2300'
export const SALES_CODE = '4000'
export const SC_PWD_DISCOUNT_CODE = '4100'
export const OTHER_DISCOUNT_CODE = '4101'
export const COGS_CODE = '5000'

const accountByCode = (code) => ACCOUNTS.find((a) => a.code === code)

export async function ensureChartOfAccounts(tenantId) {
  if (!tenantId) return []
  await base44.rpc('ensure_chart_of_accounts', { p_tenant: tenantId })
  const existing = await base44.entities.ChartOfAccounts.filter({ tenant_id: tenantId })
  return existing
}

// Post a journal entry header + lines atomically via the post_journal_entry RPC.
// lines: [{ code, debit, credit }]. Returns { id }.
export async function createJournalEntry(tenantId, { date, reference_type, reference_id, description, party, payment_method, lines }) {
  const liveLines = (lines || [])
    .filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0)
    .map((l) => ({
      code: l.code,
      account_name: accountByCode(l.code)?.name || l.account_name || l.code,
      debit: l.debit || 0,
      credit: l.credit || 0,
    }))
  const { data, error } = await base44.rpc('post_journal_entry', {
    p_tenant: tenantId,
    p_date: date || new Date().toISOString(),
    p_reference_type: reference_type,
    p_reference_id: reference_id || '',
    p_description: description || '',
    p_party: party || '',
    p_payment_method: payment_method || '',
    p_lines: liveLines,
  })
  if (error) throw new Error(error.message)
  return { id: data }
}

export function computeCOGS(items) {
  return (items || []).reduce((sum, it) => {
    const cost = Number(it.cost_price) || 0
    const qty = Number(it.quantity) || 0
    if (it.unit_sold === 'fraction') {
      const mult = Number(it.fraction_multiplier) || 1
      return sum + (cost / mult) * qty
    }
    return sum + cost * qty
  }, 0)
}

export async function recordSale(tenantId, sale, items, paymentMethod, creditInfo = {}, referenceType = 'sale') {
  await ensureChartOfAccounts(tenantId)
  const gross = Number(sale.gross_amount) || Number(sale.total_amount) || 0
  const scPwdDiscount = Number(sale.sc_pwd_discount_amount) || 0
  const otherDiscount = Number(sale.other_discount_amount) || 0
  const totalDiscount = scPwdDiscount + otherDiscount
  const net = Number((gross - totalDiscount).toFixed(2))
  const cogs = computeCOGS(items)
  const creditAmount = Number(creditInfo.creditAmount) || 0
  const lines = []
  if (creditAmount > 0) {
    const cashPortion = Number((net - creditAmount).toFixed(2))
    if (cashPortion > 0) lines.push({ code: CASH_CODE, debit: cashPortion })
    lines.push({ code: AR_CODE, debit: Number(creditAmount.toFixed(2)) })
  } else {
    lines.push({ code: CASH_CODE, debit: net })
  }
  lines.push({ code: SALES_CODE, credit: gross })
  if (scPwdDiscount > 0) lines.push({ code: SC_PWD_DISCOUNT_CODE, debit: scPwdDiscount })
  if (otherDiscount > 0) lines.push({ code: OTHER_DISCOUNT_CODE, debit: otherDiscount })
  lines.push({ code: COGS_CODE, debit: cogs })
  lines.push({ code: INV_CODE, credit: cogs })
  return createJournalEntry(tenantId, {
    date: sale.created_date || new Date().toISOString(),
    reference_type: referenceType,
    reference_id: sale.id,
    description: `Sale ${String(sale.id || '').slice(0, 8)}`,
    party: sale.customer_name || sale.cashier_name || 'Walk-in customer',
    payment_method: paymentMethod || sale.payment_method || 'Cash',
    lines,
  })
}

export async function reverseSale(tenantId, saleId) {
  await ensureChartOfAccounts(tenantId)
  const entries = await base44.entities.JournalEntry.filter({ reference_id: saleId, reference_type: 'sale', tenant_id: tenantId })
  const original = entries[0]
  if (!original) return null
  const lines = await base44.entities.JournalEntryLine.filter({ journal_entry_id: original.id, tenant_id: tenantId })
  const reversed = lines.map((l) => ({ code: l.account, debit: l.credit_amount, credit: l.debit_amount }))
  return createJournalEntry(tenantId, {
    date: new Date().toISOString(),
    reference_type: 'void',
    reference_id: saleId,
    description: `Void / reversal of sale ${String(saleId).slice(0, 8)}`,
    party: original.party || '',
    payment_method: original.payment_method || '',
    lines: reversed,
  })
}

export async function recordRestock(tenantId, movement, unitCost, paid) {
  await ensureChartOfAccounts(tenantId)
  const qty = Number(movement.quantity) || 0
  const amount = qty * (Number(unitCost) || 0)
  return createJournalEntry(tenantId, {
    date: new Date().toISOString(),
    reference_type: 'purchase',
    reference_id: movement.id,
    description: `Restock ${movement.product_name || ''}`.trim(),
    party: movement.supplier || '',
    payment_method: paid ? 'Cash' : 'On Account',
    lines: [
      { code: INV_CODE, debit: amount },
      { code: paid ? CASH_CODE : AP_CODE, credit: amount },
    ],
  })
}

export function downloadCSV(filename, headers, rows) {
  const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadFilingCSV(filename, headerLines, tableHeaders, tableRows) {
  const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`
  const lines = []
  headerLines.forEach(([label, value]) => lines.push([escape(label), escape(value)].join(',')))
  lines.push('')
  lines.push(tableHeaders.map(escape).join(','))
  tableRows.forEach((r) => lines.push(r.map(escape).join(',')))
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
