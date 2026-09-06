// Libreta Intelligence — Phase 2 local unit tests.
// Run: node tests/forecast.mjs  (pure, no live DB)
import { buildForecast } from '../src/lib/insights/forecast.js'
import { manilaStartOfToday } from '../src/lib/manilaTime.js'

const DAY = 86400000
const TODAY = manilaStartOfToday()
const at = (d) => new Date(TODAY.getTime() - d * DAY).toISOString()

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} ${extra}`) }
}

// Demand: Mon-Fri 30, Sat 20, Sun 5 for the last 90 days.
const wkQty = (d) => {
  const wd = new Date(TODAY.getTime() - d * DAY).getUTCDay()
  return wd === 0 ? 5 : wd === 6 ? 20 : 30
}
const sales = []
const items = []
for (let d = 90; d >= 1; d--) {
  const id = `f-${d}`
  sales.push({ id, status: 'Completed', created_date: at(d) })
  items.push({ id: `fi-${d}`, sale_id: id, product_id: 'p1', quantity: wkQty(d), unit_sold: 'base', tenant_id: 't' })
}
const product = { id: 'p1', name: 'Widget', base_price: 50, cost_price: 30, has_fractions: false, stock_quantity: 60 }
const idle = { id: 'p2', name: 'Slow mover', base_price: 10, cost_price: 5, has_fractions: false, stock_quantity: 500 }

const f = buildForecast({ products: [product, idle], items, sales, settings: {} })

check('has history for p1', f.products.find((p) => p.product_id === 'p1')?.has_history === true)
check('no history for p2', f.products.find((p) => p.product_id === 'p2')?.has_history === false)
const p1 = f.products.find((p) => p.product_id === 'p1')
let winAvg = 0
for (let d = 1; d <= 90; d++) winAvg += wkQty(d)
winAvg /= 90
check('daily_rate ~window avg', Math.abs(p1.daily_rate - winAvg) < 0.01, `got ${p1.daily_rate} exp ${winAvg}`)
check('days_of_cover = stock/rate', Math.abs(p1.days_of_cover - 60 / winAvg) < 0.01)

const expectUnits = (days) => {
  let t = 0
  for (let d = 1; d <= days; d++) {
    const wd = new Date(TODAY.getTime() + d * DAY).getUTCDay()
    t += wd === 0 ? 5 : wd === 6 ? 20 : 30
  }
  return t
}
check('next_7_units near exact', Math.abs(p1.next_7_units - expectUnits(7)) / expectUnits(7) < 0.01, `got ${p1.next_7_units} exp ${expectUnits(7)}`)
check('next_30_units within 3%', Math.abs(p1.next_30_units - expectUnits(30)) / expectUnits(30) < 0.03, `got ${p1.next_30_units}`)
check('projected revenue = units * 50', Math.abs(p1.projected_7_revenue - p1.next_7_units * 50) < 1)
check('stock 60 / rate ~25 -> need reorder?', p1.suggest_reorder === true)
check('order_qty positive', p1.order_qty > 0)
check('order_cost = qty * 30', Math.abs(p1.order_cost - p1.order_qty * 30) < 1)

// Well-stocked product should NOT suggest a reorder.
const plenty = buildForecast({ products: [{ ...product, stock_quantity: 5000 }], items, sales, settings: {} })
check('no reorder when stocked', plenty.products[0].suggest_reorder === false && plenty.products[0].order_qty === 0)

// No data at all -> empty store forecast with no rows flagged.
const empty = buildForecast({ products: [product], items: [], sales: [], settings: {} })
check('empty store no history', empty.store.products_with_history === 0 && empty.store.next_7.units === 0)
check('empty still lists product', empty.products.length === 1 && empty.products[0].has_history === false)

// Determinism: same inputs -> byte-identical output.
const f2 = buildForecast({ products: [product, idle], items, sales, settings: {} })
check('deterministic', JSON.stringify(f) === JSON.stringify(f2))

// Settings respected: lead time drives order size up.
const lt3 = buildForecast({ products: [product], items, sales, settings: { lead_time_days: 6, safety_stock_days: 10 } })
const lt1 = buildForecast({ products: [product], items, sales, settings: { lead_time_days: 1, safety_stock_days: 2 } })
check('longer lead time -> larger order', lt3.products[0].order_up_to > lt1.products[0].order_up_to)

// Wider demand window smooths: p1 window=14 recovers the rate too.
const w14 = buildForecast({ products: [product], items, sales, settings: { window_days: 14 } })
let winAvg14 = 0
for (let d = 1; d <= 14; d++) winAvg14 += wkQty(d)
winAvg14 /= 14
check('window 14 rate matches', Math.abs(w14.products[0].daily_rate - winAvg14) < 0.01, `got ${w14.products[0].daily_rate} exp ${winAvg14}`)

// Sparse history: only 30 days of sales yet window_days=90 must NOT dilute the
// rate by empty trailing days (this was the Blink GM "÷90 vs 30 real days" bug).
const sparse = []
const sItems = []
for (let d = 30; d >= 1; d--) {
  sItems.push({ id: `si-${d}`, sale_id: `s-${d}`, product_id: 'p3', quantity: 10, unit_sold: 'base', tenant_id: 't' })
  sparse.push({ id: `s-${d}`, status: 'Completed', created_date: at(d) })
}
const sparseF = buildForecast({ products: [{ ...product, id: 'p3' }], items: sItems, sales: sparse, settings: {} })
sparseF.products[0].has_history === true
const rate30 = 300 / 30
check('sparse 30d history rate ~ total/30', Math.abs(sparseF.products[0].daily_rate - rate30) < 0.01, `got ${sparseF.products[0].daily_rate} exp ${rate30}`)
check('sparse 7d projection = rate*7', Math.abs(sparseF.products[0].next_7_units - rate30 * 7) < 0.1, `got ${sparseF.products[0].next_7_units} exp ${rate30 * 7}`)

// Product introduced late still uses its own (shorter) span, floored at 7 days.
const lateItem = { id: 'li-1', sale_id: 's-3', product_id: 'p4', quantity: 14, unit_sold: 'base', tenant_id: 't' }
const lateF = buildForecast({ products: [{ ...product, id: 'p4' }], items: [lateItem], sales: sparse.filter((s) => s.id === 's-3'), settings: {} })
check('late product clamps to 7-day floor', Math.abs(lateF.products[0].daily_rate - 14 / 7) < 0.01, `got ${lateF.products[0].daily_rate} exp ${14 / 7}`)

console.log(`\nRESULT: ${pass}/${pass + fail} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)