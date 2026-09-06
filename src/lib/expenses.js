// Expense module (ported from Base44).
import { base44 } from '@/api/base44Client'
import { ensureChartOfAccounts, CASH_CODE, BANK_CODE, INPUT_VAT_CODE, createJournalEntry, downloadCSV } from '@/lib/bookkeeping'
import { computeInputVat } from '@/lib/vat'
export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Rent', account_code: '6000', account_name: 'Rent Expense' },
  { name: 'Utilities (Electricity/Water/Internet)', account_code: '6100', account_name: 'Utilities Expense' },
  { name: 'Salaries & Wages', account_code: '6200', account_name: 'Salaries & Wages Expense' },
  { name: 'Transportation/Delivery', account_code: '6300', account_name: 'Transportation & Delivery Expense' },
  { name: 'Repairs & Maintenance', account_code: '6400', account_name: 'Repairs & Maintenance Expense' },
  { name: 'Office Supplies', account_code: '6500', account_name: 'Office Supplies Expense' },
  { name: 'Professional Fees (Accountant/Lawyer)', account_code: '6600', account_name: 'Professional Fees Expense' },
  { name: 'Taxes & Licenses (Permits, Registration)', account_code: '6700', account_name: 'Taxes & Licenses Expense' },
  { name: 'Depreciation', account_code: '6800', account_name: 'Depreciation Expense' },
  { name: 'Insurance', account_code: '6900', account_name: 'Insurance Expense' },
  { name: 'Marketing/Advertising', account_code: '7000', account_name: 'Marketing & Advertising Expense' },
  { name: 'Miscellaneous', account_code: '7100', account_name: 'Miscellaneous Expense' },
]

export function computeExpenseInputVat(amount, isVatRegisteredPayee, nonCreditable, businessVatRegistered = true) {
  // A non-VAT business (percentage-tax payer) cannot claim input VAT at all.
  if (!businessVatRegistered || !isVatRegisteredPayee || nonCreditable) return 0
  return computeInputVat(amount, true)
}

async function fetchBusinessVatRegistered(tenantId) {
  try {
    const rows = await base44.entities.Settings.filter({ tenant_id: tenantId })
    return rows?.[0]?.vat_registered !== false
  } catch {
    return true
  }
}

export async function ensureExpenseCategories(tenantId) {
  if (!tenantId) return []
  await base44.rpc('ensure_expense_categories', { p_tenant: tenantId })
  return base44.entities.ExpenseCategory.filter({ tenant_id: tenantId })
}

export async function recordExpense(tenantId, expense, businessVatRegistered) {
  await ensureChartOfAccounts(tenantId)
  const businessVat = businessVatRegistered !== undefined
    ? businessVatRegistered
    : await fetchBusinessVatRegistered(tenantId)
  const gross = Number(expense.amount) || 0
  const inputVat = computeExpenseInputVat(gross, expense.is_vat_registered_payee, expense.non_creditable, businessVat)
  const netExpense = gross - inputVat
  const isCashLike = ['Cash', 'GCash'].includes(expense.payment_method)
  const creditAccount = isCashLike ? CASH_CODE : BANK_CODE

  const lines = [{ code: expense.account_code, debit: netExpense }]
  if (inputVat > 0) lines.push({ code: INPUT_VAT_CODE, debit: inputVat })
  lines.push({ code: creditAccount, credit: gross })

  return createJournalEntry(tenantId, {
    date: new Date(`${expense.date}T12:00:00`).toISOString(),
    reference_type: 'expense',
    reference_id: expense.id || '',
    description: expense.description || expense.category,
    party: expense.payee || '',
    payment_method: expense.payment_method || '',
    lines,
  })
}

export async function deleteExpenseJournal(tenantId, journalEntryId) {
  if (!journalEntryId) return
  const lines = await base44.entities.JournalEntryLine.filter({ journal_entry_id: journalEntryId, tenant_id: tenantId })
  if (lines.length > 0) await Promise.all(lines.map((l) => base44.entities.JournalEntryLine.delete(l.id)))
  await base44.entities.JournalEntry.delete(journalEntryId)
}

export async function saveExpense(tenantId, data, existing = null) {
  const businessVat = await fetchBusinessVatRegistered(tenantId)
  const payload = {
    date: data.date,
    category: data.category,
    category_id: data.category_id || '',
    account_code: data.account_code,
    description: data.description || '',
    amount: Number(data.amount) || 0,
    payment_method: data.payment_method,
    payee: data.payee || '',
    receipt_or_invoice_number: data.receipt_or_invoice_number || '',
    is_vat_registered_payee: !!data.is_vat_registered_payee,
    input_vat: computeExpenseInputVat(data.amount, data.is_vat_registered_payee, data.non_creditable, businessVat),
    non_creditable: !!data.non_creditable,
    recurring: !!data.recurring,
    attached_receipt_image: data.attached_receipt_image || '',
    tenant_id: tenantId,
  }

  let expense
  if (existing) {
    if (existing.journal_entry_id) await deleteExpenseJournal(tenantId, existing.journal_entry_id)
    expense = await base44.entities.Expense.update(existing.id, payload)
  } else {
    expense = await base44.entities.Expense.create(payload)
  }

  const entry = await recordExpense(tenantId, { ...payload, id: expense.id }, businessVat)
  await base44.entities.Expense.update(expense.id, { journal_entry_id: entry.id })
  return { ...expense, journal_entry_id: entry.id }
}

export async function deleteExpense(tenantId, expense) {
  if (expense.journal_entry_id) await deleteExpenseJournal(tenantId, expense.journal_entry_id)
  await base44.entities.Expense.delete(expense.id)
}

export { downloadCSV }
