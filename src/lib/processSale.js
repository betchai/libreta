// Shared sale-processing logic (ported from Base44, adapted to the atomic
// post_sale RPC). Used by the POS checkout and the manual offline sales import.
// All business math (discounts, VAT, weighted cost) is computed here; the RPC
// commits the sale + items + stock + journal + ledger in one transaction.
import { base44 } from '@/api/base44Client'
import { computeCOGS, CASH_CODE, AR_CODE, SALES_CODE, OUTPUT_VAT_CODE, SC_PWD_DISCOUNT_CODE, OTHER_DISCOUNT_CODE, COGS_CODE, INV_CODE } from '@/lib/bookkeeping'
import { summarizeSaleDiscounts, computeLineDiscount } from '@/lib/discounts'
import { computeLineVat } from '@/lib/vat'
export function buildJournalLines(sale, items, creditAmount, { vatRegistered, vatInclusive, outputVatTotal } = {}) {
  const gross = Number(sale.gross_amount) || 0
  const scPwd = Number(sale.sc_pwd_discount_amount) || 0
  const other = Number(sale.other_discount_amount) || 0
  const net = Number((gross - scPwd - other).toFixed(2))
  const collected = Number(sale.total_amount) || 0
  const cogs = computeCOGS(items)
  const lines = []

  if (creditAmount > 0) {
    const cashPortion = Number((collected - creditAmount).toFixed(2))
    if (cashPortion > 0) lines.push({ code: CASH_CODE, debit: cashPortion })
    lines.push({ code: AR_CODE, debit: Number(creditAmount.toFixed(2)) })
  } else {
    lines.push({ code: CASH_CODE, debit: collected })
  }
  // VAT-registered sales book an Output VAT liability. When VAT-inclusive the
  // VAT is inside the price charged (revenue = gross − output VAT); when prices
  // are exclusive the 12% is charged on top (revenue = gross, VAT is the extra
  // collected). Non-VAT sales book gross with no Output VAT line.
  const outputVat = vatRegistered && Number(outputVatTotal) > 0 ? Number(outputVatTotal) : 0
  const vatCharged = vatRegistered && !vatInclusive && collected + 0.005 >= net + outputVat
  const exclusiveUncharged = vatRegistered && !vatInclusive && !vatCharged
  const salesCredit = vatCharged
    ? gross
    : exclusiveUncharged
      // Exclusive mode but no VAT charged on top (e.g. offline import that only
      // recorded net): book the collected amount as revenue, no Output VAT, so
      // nothing uncollected/fabricated is booked and the entry stays balanced.
      ? collected
      : Number((gross - outputVat).toFixed(2))
  lines.push({ code: SALES_CODE, credit: salesCredit })
  if (outputVat > 0 && !exclusiveUncharged) lines.push({ code: OUTPUT_VAT_CODE, account_name: 'Output VAT', credit: outputVat })
  if (scPwd > 0) lines.push({ code: SC_PWD_DISCOUNT_CODE, debit: scPwd })
  if (other > 0) lines.push({ code: OTHER_DISCOUNT_CODE, debit: other })
  lines.push({ code: COGS_CODE, debit: cogs })
  lines.push({ code: INV_CODE, credit: cogs })
  return lines
}

export async function processSale(tenantId, {
  items, total, paymentMethod, cashMethod, cashier, customer,
  creditAmount, cashAmount, settings, saleDate, referenceType,
}) {
  const creditAmt = Math.min(Number(creditAmount) || 0, Number(total) || 0)
  const cashAmt = Number(cashAmount) || 0
  const discountSummary = summarizeSaleDiscounts(items)
  const vatRegistered = settings.vat_registered !== false

  // Enrich each item with computed discounts, VAT, per-unit cost, and the
  // base-unit stock deduction (this is what post_sale subtracts from inventory).
  const itemPayloads = items.map((item) => {
    const vat = computeLineVat(item.subtotal, {
      vat_exempt: item.vat_exempt,
      vat_inclusive: settings.vat_inclusive,
      vat_rate: settings.vat_rate,
      vat_registered: vatRegistered,
    })
    const { discount_amount, net_amount } = computeLineDiscount(item)
    const baseUnitQty = item.unit_sold === 'fraction'
      ? (Number(item.quantity) || 0) / (Number(item.fraction_multiplier) || 1)
      : Number(item.quantity) || 0
    return {
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: Number(item.quantity) || 0,
      unit_sold: item.unit_sold,
      price_at_sale: Number(item.price_at_sale) || 0,
      cost_price_at_sale: item.unit_sold === 'fraction'
        ? (Number(item.cost_price) || 0) / (Number(item.fraction_multiplier) || 1)
        : Number(item.cost_price) || 0,
      subtotal: Number(item.subtotal) || 0,
      discount_type: item.discount_type || 'none',
      discount_value: Number(item.discount_value) || 0,
      discount_amount,
      net_amount,
      discount_id_number: item.discount_id_number || '',
      discount_person_name: item.discount_person_name || '',
      discount_reason: item.discount_reason || '',
      vatable_sales: vat.vatable_sales,
      output_vat: vat.output_vat,
      vat_exempt_sales: vat.vat_exempt_sales,
      deduction: Number(baseUnitQty.toFixed(4)),
    }
  })

  const salePayload = {
    total_amount: Number(total) || 0,
    gross_amount: discountSummary.gross_amount,
    total_discount_amount: discountSummary.total_discount_amount,
    sc_pwd_discount_amount: discountSummary.sc_pwd_discount_amount,
    other_discount_amount: discountSummary.other_discount_amount,
    payment_method: paymentMethod,
    cash_method: cashMethod || '',
    cashier_name: cashier,
    customer_id: customer?.id || '',
    customer_name: customer?.name || '',
    credit_amount: creditAmt,
    cash_amount: cashAmt,
    status: 'Completed',
  }

  const outputVatTotal = Number(itemPayloads.reduce((sum, i) => sum + (Number(i.output_vat) || 0), 0).toFixed(2))

  const journal = {
    date: saleDate || new Date().toISOString(),
    reference_type: referenceType || 'sale',
    description: '',
    party: customer?.name || cashier || 'Walk-in customer',
    payment_method: paymentMethod || 'Cash',
    lines: buildJournalLines(salePayload, items, creditAmt, { vatRegistered, vatInclusive: settings.vat_inclusive !== false, outputVatTotal }),
  }

  const ledger = creditAmt > 0 && customer?.id
    ? {
        customer_id: customer.id,
        customer_name: customer.name,
        date: saleDate || new Date().toISOString(),
        amount: creditAmt,
        recorded_by: cashier || 'Admin',
        note: 'Sale on account',
      }
    : null

  const { data, error } = await base44.rpc('post_sale', {
    p_tenant: tenantId,
    p_sale: salePayload,
    p_items: itemPayloads,
    p_journal: journal,
    p_ledger: ledger,
  })
  if (error) throw new Error(error.message)

  // post_sale stamps journal.reference_id = sale id and returns the sale id.
  const sale = { id: data, ...salePayload }
  return sale
}

// Void a sale atomically (admin). Restores stock, reverses journal + ledger,
// and flips the sale status — all in one transaction.
export async function voidSale(tenantId, saleId, reason, voidedBy) {
  const { error } = await base44.rpc('void_sale', {
    p_tenant: tenantId,
    p_sale_id: saleId,
    p_voided_by: voidedBy || 'Admin',
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
  return true
}
