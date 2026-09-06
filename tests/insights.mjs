// Libreta Intelligence — Phase 1 local unit tests.
// Run: node tests/insights.mjs   (pure, no live DB involved)

import { generateInsights, buildHealthStatement, accountSummary } from '../src/lib/insights/engine.js'
import { buildInsight, sortBySeverity } from '../src/lib/insights/schema.js'

const DAY = 86400000
const T0 = new Date('2026-09-06T12:00:00+08:00')
const HOUR = 3600000
const at = (daysBefore) => new Date(T0.getTime() - daysBefore * DAY - HOUR).toISOString()

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} ${extra}`) }
}

const product = (id, name, stock, threshold = 5, basePrice = 100, cost = 80) => ({
  id, name, sku: id, category: 'Test', base_unit: 'PCS', base_price: basePrice, cost_price: cost,
  stock_quantity: stock, low_stock_threshold: threshold, has_fractions: false, sell_by_weight: false,
})

const itemsFor = (saleId, pid, qty, price, cost, name = pid) => ({
  id: `${saleId}-${pid}`, sale_id: saleId, product_id: pid, product_name: name,
  quantity: qty, price_at_sale: price, cost_price_at_sale: cost, subtotal: price * qty,
  unit_sold: 'base', discount_amount: 0, tenant_id: 't',
})

const dailySales = (prefix, dayStart, dayEnd, perDay, qtyPerDay, productCost) => {
  const sales = []
  const items = []
  for (let d = dayStart; d <= dayEnd; d++) {
    const id = `${prefix}-${d}`
    sales.push({
      id, status: 'Completed', created_date: at(d), tenant_id: 't',
      total_amount: perDay, gross_amount: perDay, total_discount_amount: 0, payment_method: 'Cash',
    })
    items.push(itemsFor(id, 'p1', qtyPerDay, perDay / qtyPerDay, productCost, 'Widget'))
  }
  return { sales, items }
}

// ---------- schema + sorting ----------
{
  const a = buildInsight({ tenant_id: 't', type: 'x', severity: 'warning', title: 'w', summary: 's', now: T0 })
  const b = buildInsight({ tenant_id: 't', type: 'x', severity: 'critical', title: 'c', summary: 's', now: T0 })
  const c = buildInsight({ tenant_id: 't', type: 'x', severity: 'positive', title: 'p', summary: 's', now: T0 })
  check('insight has full schema', !!(a.id && a.tenant_id === 't' && a.created_at && Array.isArray(a.evidence)))
  check('insight ids unique', a.id !== b.id && b.id !== c.id)
  check('severity ordering', sortBySeverity([a, b, c]).map((i) => i.severity).join() === 'critical,warning,positive')
  check('confidence clamped', buildInsight({ tenant_id: 't', severity: 'info', confidence: 5, now: T0 }).confidence === 1)
}

// ---------- sales spike ----------
{
  const base = dailySales('sp-base', 7, 13, 2000, 20, 100)
  const rec = dailySales('sp-rec', 0, 6, 4000, 30, 100)
  const out = generateInsights({
    tenant_id: 't', sales: [...base.sales, ...rec.sales], items: [...base.items, ...rec.items],
    products: [product('p1', 'Widget', 500)], customers: [], ledgerEntries: [], expenses: [],
    settings: {}, now: T0,
  })
  const spike = out.insights.find((i) => i.type === 'sales' && i.title === 'Sales are unusually strong')
  check('sales spike detected', !!spike)
  check('sales spike pct is 100', spike?.metric_values?.pct === 100)
  check('confidence not naive', spike ? spike.confidence >= 0.3 : false)
  check('digest sales up', out.digest.sales_pct === 100)
  check('digest transactions', out.digest.transactions === 7)
}

// ---------- sales drop ----------
{
  const base = dailySales('dp-base', 7, 13, 4000, 30, 100)
  const rec = dailySales('dp-rec', 0, 6, 2000, 20, 100)
  const out = generateInsights({
    tenant_id: 't', sales: [...base.sales, ...rec.sales], items: [...base.items, ...rec.items],
    products: [product('p1', 'Widget', 500)], customers: [], ledgerEntries: [], expenses: [],
    settings: {}, now: T0,
  })
  const drop = out.insights.find((i) => i.type === 'sales' && i.title === 'Sales are below the usual pace')
  check('sales drop detected', !!drop)
  check('sales drop pct -50', drop?.metric_values?.pct === -50)
}

// ---------- margin decline ----------
{
  const base = dailySales('mg-base', 7, 13, 4000, 40, 60)
  const rec = dailySales('mg-rec', 0, 6, 4000, 40, 90)
  const out = generateInsights({
    tenant_id: 't', sales: [...base.sales, ...rec.sales], items: [...base.items, ...rec.items],
    products: [product('p1', 'Widget', 500)], customers: [], ledgerEntries: [], expenses: [],
    settings: {}, now: T0,
  })
  const margin = out.insights.find((i) => i.type === 'profit')
  check('margin decline detected', !!margin && margin.severity === 'warning')
  check('cost rise detected', out.insights.some((i) => i.type === 'profit' && i.title === 'Product costs are rising'))
}

// ---------- stockout risk ----------
{
  const rec = dailySales('so-rec', 0, 6, 1000, 30, 90)
  const out = generateInsights({
    tenant_id: 't', sales: rec.sales, items: rec.items,
    products: [product('p1', 'Widget', 10, 5, 100, 90)], customers: [], ledgerEntries: [], expenses: [],
    settings: {}, now: T0,
  })
  const inv = out.insights.find((i) => i.type === 'inventory')
  check('stockout risk detected', !!inv)
  check('days of cover ~0.33', Math.abs((inv?.metric_values?.products?.[0]?.days_of_cover ?? 99) - 10 / 30) < 0.01)
}

// ---------- fraction unit conversion (stock in base units, demand in sold units) ----------
{
  // Kopiko-style: 30 pcs/day sold as sachets, held in boxes of 36, 3 boxes on hand
  // => ~3.6 days cover; WITHOUT conversion it would look like 0.1 days (false stockout).
  const rec = dailySales('so-frac', 0, 6, 1000, 30, 90)
  const frac = {
    ...product('p2', 'Kopiko', 3, 5, 100, 90),
    has_fractions: true, sell_by_weight: false, fraction_multiplier: 36, fraction_price: 90,
  }
  const fracItems = rec.items.map((i) => ({ ...i, product_id: 'p2', product_name: 'Kopiko' }))
  const out = generateInsights({
    tenant_id: 't', sales: rec.sales, items: fracItems,
    products: [frac], customers: [], ledgerEntries: [], expenses: [],
    settings: {}, now: T0,
  })
  const inv = out.insights.find((i) => i.type === 'inventory')
  const p = inv?.metric_values?.products?.find((x) => x.name === 'Kopiko')
  check('fraction days of cover ~3.6', Math.abs((p?.days_of_cover ?? 99) - 3 / (30 / 36)) < 0.01)
  check('no stockout risk for fraction stock', !(inv && inv.severity === 'critical'))
}

// ---------- credit aging ----------
{
  const ledger = [
    { id: 'l1', customer_id: 'c1', type: 'charge', amount: 10000, created_date: at(70), tenant_id: 't' },
    { id: 'l2', customer_id: 'c1', type: 'charge', amount: 2000, created_date: at(2), tenant_id: 't' },
  ]
  const out = generateInsights({
    tenant_id: 't', sales: [], items: [], products: [], customers: [{ id: 'c1', name: 'Jun', credit_limit: 50000 }],
    ledgerEntries: ledger, expenses: [], settings: {}, now: T0,
  })
  const credit = out.insights.find((i) => i.type === 'credit')
  check('credit aging critical', !!credit && credit.severity === 'critical')
  check('credit names customer', credit?.evidence?.[0]?.includes('Jun') === true)
}

// ---------- expense spike ----------
{
  const baseDays = [7, 8, 9, 10, 11, 12, 13].map((d) => ({ id: `e${d}`, tenant_id: 't', category: 'Utilities', amount: 100, date: at(d), recurring: true }))
  const recDays = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ id: `eu${d}`, tenant_id: 't', category: 'Utilities', amount: 300, date: at(d), recurring: true }))
  const out = generateInsights({
    tenant_id: 't', sales: [], items: [], products: [], customers: [], ledgerEntries: [],
    expenses: [...baseDays, ...recDays], settings: {}, now: T0,
  })
  const exp = out.insights.find((i) => i.type === 'expense')
  check('expense spike detected', !!exp)
  check('expense pct +200%', exp?.metric_values?.pct === 200)
}

// ---------- health statement ----------
{
  const out = generateInsights({ tenant_id: 't', sales: [], items: [], products: [], customers: [], ledgerEntries: [], expenses: [], settings: {}, now: T0 })
  const health = buildHealthStatement(out.digest, out.insights)
  check('health statement returns status', ['steady', 'watch', 'improving', 'needs-attention'].includes(health.status))
  check('health statement has summary', health.summary.length > 10)
}

// ---------- account summary ----------
{
  const mk = (tenant_id, business_name, bad) => ({
    tenant_id, business_name,
    digest: { sales_pct: 5 },
    insights: bad
      ? [buildInsight({ tenant_id, type: 'credit', severity: 'critical', title: 'Overdue', summary: 'x', now: T0 })]
      : [buildInsight({ tenant_id, type: 'sales', severity: 'positive', title: 'Strong', summary: 'y', now: T0 })],
  })
  const acc = accountSummary([mk('a', 'Grocery', true), mk('b', 'Range', false)], T0)
  check('account needs_attention_count = 1', acc.needs_attention_count === 1)
  check('stores statused', acc.stores.some((s) => s.business_name === 'Grocery' && s.status === 'critical'))
}

console.log(`\nRESULT: ${pass}/${pass + fail} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)