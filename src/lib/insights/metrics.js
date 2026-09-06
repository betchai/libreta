import { parseStoredDate } from '../manilaTime.js'

const DAY_MS = 86400000

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const fmtPeso = (n) => `₱${(Number(n) || 0).toFixed(2)}`

export const fmtPesoK = (n) => {
  const v = Number(n) || 0
  return v >= 1000 ? `₱${(v / 1000).toFixed(1)}K` : fmtPeso(v)
}

export const isCompleted = (s) => (s?.status || 'Completed') === 'Completed'

const ts = (d) => parseStoredDate(d).getTime()

export const between = (d, fromMs, toMs) => {
  const t = ts(d)
  return Number.isFinite(t) && t >= fromMs && t < toMs
}

export const nowMs = (now = new Date()) => new Date(now).getTime()

export function windowBounds(now = new Date(), daysRecent = 7, daysBaseline = 7) {
  const end = nowMs(now)
  const recentFrom = end - daysRecent * DAY_MS
  const baselineFrom = recentFrom - daysBaseline * DAY_MS
  return {
    recent: { from: recentFrom, to: end },
    baseline: { from: baselineFrom, to: recentFrom },
    recentDays: daysRecent,
    baselineDays: daysBaseline,
  }
}

export const selectSales = (sales, from, to) => ((sales || []).filter((s) => isCompleted(s) && between(s.created_date, from, to)))
export const selectItems = (items, salesInWindow) => {
  const ids = new Set((salesInWindow || []).map((s) => s.id))
  return (items || []).filter((i) => ids.has(i.sale_id))
}
export const selectExpenses = (expenses, from, to) => ((expenses || []).filter((e) => between(e.date || e.created_date, from, to)))

export const sumAmount = (sales) => round2((sales || []).reduce((a, s) => a + (Number(s.total_amount) || 0), 0))
export const sumGross = (sales) => round2((sales || []).reduce((a, s) => a + (Number(s.gross_amount) || 0), 0))
export const sumDiscounts = (sales) => round2((sales || []).reduce((a, s) => a + (Number(s.total_discount_amount) || 0), 0))
export const countSales = (sales) => (sales || []).length

export const atv = (sales) => {
  const n = countSales(sales)
  return n ? round2(sumAmount(sales) / n) : 0
}

export function compareWindows(currentTotal, baselineTotal, recentDays, baselineDays) {
  const baselineRate = baselineTotal / Math.max(1, baselineDays)
  const expected = baselineRate * recentDays
  const pct = expected > 0 ? round2(((currentTotal - expected) / expected) * 100) : currentTotal > 0 ? 100 : 0
  return { current: round2(currentTotal), baseline: round2(expected), pct }
}

export const cogsForItems = (items) => round2((items || []).reduce((a, i) => a + (Number(i.cost_price_at_sale) || 0) * (Number(i.quantity) || 0), 0))
export const grossProfit = (netRevenue, cogs) => round2(netRevenue - cogs)
export const marginPct = (netRevenue, cogs) => (netRevenue > 0 ? round2(((netRevenue - cogs) / netRevenue) * 100) : 0)

export const pctPointChange = (recentPct, baselinePct) => round2(recentPct - baselinePct)

export function paymentMix(sales) {
  const mix = {}
  for (const s of sales || []) {
    const k = s.payment_method || 'Other'
    mix[k] = round2((mix[k] || 0) + (Number(s.total_amount) || 0))
  }
  return mix
}

export const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function dayOfWeekTotals(sales) {
  const totals = {}
  const counts = {}
  for (const k of DAY_KEYS) { totals[k] = 0; counts[k] = 0 }
  for (const s of sales || []) {
    const day = parseStoredDate(s.created_date).getUTCDay()
    const key = DAY_KEYS[day]
    totals[key] += Number(s.total_amount) || 0
    counts[key] += 1
  }
  for (const k of DAY_KEYS) { totals[k] = round2(totals[k]) }
  return { totals, counts }
}

export function aggregateItems(items) {
  const by = new Map()
  for (const i of items || []) {
    const key = i.product_id || `anon_${i.product_name || '?'}`
    let a = by.get(key)
    if (!a) {
      a = { product_id: i.product_id || null, product_name: i.product_name || 'Unknown', qty: 0, revenue: 0, cogs: 0, count: 0, unit_sold: i.unit_sold }
      by.set(key, a)
    }
    a.qty += Number(i.quantity) || 0
    a.revenue += (Number(i.subtotal) || 0) - (Number(i.discount_amount) || 0)
    a.cogs += (Number(i.cost_price_at_sale) || 0) * (Number(i.quantity) || 0)
    a.count += 1
  }
  return [...by.values()].map((a) => ({ ...a, qty: round2(a.qty), revenue: round2(a.revenue), cogs: round2(a.cogs) }))
}

export function totalQty(items) {
  return round2((items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0))
}

export function itemMarginPct(item) {
  return item.revenue > 0 ? round2(((item.revenue - item.cogs) / item.revenue) * 100) : 0
}

export function avgCost(items) {
  const q = totalQty(items)
  return q > 0 ? round2((items || []).reduce((a, i) => a + (Number(i.cost_price_at_sale) || 0) * (Number(i.quantity) || 0), 0) / q) : 0
}

export const entryDelta = (e) => (e?.type === 'payment' ? -Math.abs(Number(e.amount) || 0) : Number(e.amount) || 0)

export const computeBalance = (entries) => round2((entries || []).reduce((a, e) => a + entryDelta(e), 0))

export function fifoAging(entries, customerId, now = new Date()) {
  const own = (entries || [])
    .filter((e) => e.customer_id === customerId)
    .sort((a, b) => ts(a.created_date || a.date) - ts(b.created_date || b.date))
  const charges = []
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 }
  const nowT = nowMs(now)
  for (const e of own) {
    const amt = Number(e.amount) || 0
    if (isCompletedLedger(e) && e.type !== 'payment') {
      charges.push({ amt, date: ts(e.created_date || e.date) })
    } else if (e.type === 'payment') {
      let remaining = Math.abs(amt)
      while (remaining > 0 && charges.length) {
        const c = charges[0]
        const take = Math.min(c.amt, remaining)
        c.amt -= take
        remaining -= take
        if (c.amt <= 0) charges.shift()
      }
    }
  }
  for (const c of charges) {
    if (c.amt <= 0) continue
    const days = Math.floor((nowT - c.date) / DAY_MS)
    if (days < 1) buckets.current += c.amt
    else if (days <= 30) buckets.d1_30 += c.amt
    else if (days <= 60) buckets.d31_60 += c.amt
    else if (days <= 90) buckets.d61_90 += c.amt
    else buckets.d90plus += c.amt
    buckets.total += c.amt
  }
  for (const k of Object.keys(buckets)) buckets[k] = round2(buckets[k])
  return buckets
}

export function utilization(customer, balance) {
  const limit = Number(customer?.credit_limit) || 0
  return limit > 0 ? round2((Math.max(0, balance) / limit) * 100) : 0
}

export function expenseByCategory(expenses) {
  const by = new Map()
  for (const e of expenses || []) {
    const k = e.category_id || e.category || 'Uncategorized'
    const rec = by.get(k) || { key: k, label: e.category || k, total: 0, count: 0 }
    rec.total += Number(e.amount) || 0
    rec.count += 1
    by.set(k, rec)
  }
  return [...by.values()].map((r) => ({ ...r, total: round2(r.total) }))
}

export function recurringExpenses(expenses) {
  return (expenses || []).filter((e) => !!e.recurring)
}

export function mean(xs) {
  const arr = (xs || []).filter(Number.isFinite)
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function isCompletedLedger() {
  return true
}

export function confidenceFromSamples(n, min = 25) {
  if (!n || n <= 0) return 0.25
  return Math.min(0.97, Math.max(0.3, n / min))
}

export function nullishMax(...xs) {
  let m = 0
  for (const x of xs) if (Number.isFinite(x)) m = Math.max(m, x)
  return m
}