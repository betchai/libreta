// VAT computation — single source of truth (ported verbatim from Base44 app).

export const VAT_RATE = 0.12

export const QUARTERS = [
  { id: 'Q1', label: 'Q1 (Jan–Mar)', months: [0, 1, 2] },
  { id: 'Q2', label: 'Q2 (Apr–Jun)', months: [3, 4, 5] },
  { id: 'Q3', label: 'Q3 (Jul–Sep)', months: [6, 7, 8] },
  { id: 'Q4', label: 'Q4 (Oct–Dec)', months: [9, 10, 11] },
]

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function quarterRange(year, qId) {
  const q = QUARTERS.find((x) => x.id === qId)
  const start = new Date(year, q.months[0], 1)
  const end = new Date(year, q.months[2] + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

export function cumulativeRange(year, qId) {
  const q = QUARTERS.find((x) => x.id === qId)
  const start = new Date(year, 0, 1)
  const end = new Date(year, q.months[2] + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

export function computeLineVat(subtotal, { vat_exempt, vat_inclusive, vat_rate, vat_registered }) {
  const amt = Number(subtotal) || 0
  const rate = Number(vat_rate) || VAT_RATE
  if (vat_exempt) {
    return { vatable_sales: 0, output_vat: 0, vat_exempt_sales: amt }
  }
  // Non-VAT businesses (percentage-tax payers) do not charge or remit VAT:
  // the full amount is just gross — never split out as output VAT, even if the
  // store quotes prices "inclusive" out of habit.
  if (vat_registered === false) {
    return { vatable_sales: 0, output_vat: 0, vat_exempt_sales: amt }
  }
  if (vat_inclusive) {
    const vatable = amt / (1 + rate)
    return { vatable_sales: vatable, output_vat: amt - vatable, vat_exempt_sales: 0 }
  }
  // VAT-registered selling at VAT-exclusive prices: tax is added on top.
  const vatable = amt
  const output = Number((amt * rate).toFixed(2))
  return { vatable_sales: vatable, output_vat: output, vat_exempt_sales: 0 }
}

export function computeInputVat(purchaseCost, isVatRegistered) {
  if (!isVatRegistered) return 0
  const amt = Number(purchaseCost) || 0
  return (amt / 1.12) * 0.12
}

const round2 = (n) => Math.round(Number(n) * 100) / 100

// Totals of the per-line VAT split for a set of cart items. Used by the POS and
// the manual offline-sales import to decide how much to charge on top.
export function summarizeVat(items, { vat_exempt, vat_inclusive, vat_rate, vat_registered }) {
  let totalVatable = 0, totalOutputVat = 0, totalExempt = 0
  ;(items || []).forEach((i) => {
    const vat = computeLineVat(i.subtotal, { vat_exempt: i.vat_exempt, vat_inclusive, vat_rate, vat_registered })
    totalVatable += Number(vat.vatable_sales) || 0
    totalOutputVat += Number(vat.output_vat) || 0
    totalExempt += Number(vat.vat_exempt_sales) || 0
  })
  return { total_vatable: round2(totalVatable), total_output_vat: round2(totalOutputVat), total_exempt: round2(totalExempt) }
}
