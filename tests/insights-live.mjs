// Libreta Intelligence — Phase 1 live run against all tenant stores.
// Run: node tests/insights-live.mjs
// Uses the service-role key in .env.deploy (read-only; no writes).

import { readFileSync } from 'node:fs'
import { generateInsights, buildHealthStatement, accountSummary } from '../src/lib/insights/engine.js'
import { buildForecast } from '../src/lib/insights/forecast.js'

for (const line of readFileSync(new URL('../.env.deploy', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const BASE = process.env.SUPABASE_URL + '/rest/v1/'
const HEADERS = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
}

const TENANTS = [
  { id: 'b84c8c69-4e6a-4541-a2fa-e64d89f0b869', name: 'Libreta by Blink' },
  { id: 'a4f64ab7-6c43-4236-880e-b1386290a110', name: 'RMF Firing Range' },
  { id: '8dd01bc5-14dd-4f68-974e-6917f29f44eb', name: 'Blink General Merchandise' },
  { id: '4d22d8a1-8c18-43ea-b08b-867f7f32fb07', name: 'Blink Hardware' },
]

const DAY = 86400000
const since = new Date(Date.now() - 70 * DAY).toISOString()

async function fetchRows(table, tid, select, filterCol = '', filterVal = '') {
  const filters = [`tenant_id=eq.${tid}`]
  if (filterCol) filters.push(`${filterCol}=gte.${encodeURIComponent(filterVal)}`)
  const url = `${BASE}${table}?${filters.join('&')}&select=${select}&limit=100000`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

const PRODUCT_SELECT = 'id,name,sku,category,base_unit,base_price,cost_price,stock_quantity,low_stock_threshold,has_fractions,sell_by_weight'
const SALES_SELECT = 'id,status,created_date,total_amount,gross_amount,total_discount_amount,payment_method'
const ITEM_SELECT = 'id,sale_id,product_id,product_name,quantity,price_at_sale,cost_price_at_sale,subtotal,unit_sold,discount_amount'
const CUSTOMER_SELECT = 'id,name,credit_limit'

async function loadTenant(tid) {
  const [sales, items, products, customers, ledger, expenses] = await Promise.all([
    fetchRows('sales', tid, SALES_SELECT, 'created_date', since),
    fetchRows('sale_items', tid, ITEM_SELECT),
    fetchRows('products', tid, PRODUCT_SELECT),
    fetch(`${BASE}customers?tenant_id=eq.${tid}&select=${CUSTOMER_SELECT}&limit=10000`, { headers: HEADERS }).then((r) => r.json()),
    fetch(`${BASE}customer_ledger_entries?tenant_id=eq.${tid}&select=id,customer_id,type,amount,date&limit=10000`, { headers: HEADERS }).then((r) => r.json()),
    fetch(`${BASE}expenses?tenant_id=eq.${tid}&select=id,category,amount,date,created_at,recurring&limit=10000`, { headers: HEADERS }).then((r) => r.json()),
  ])
  return {
    sales, items, products, customers,
    ledgerEntries: ledger.map((e) => ({ ...e, created_date: e.date })),
    expenses: expenses.map((e) => ({ ...e, created_date: e.date || e.created_at })),
  }
}

const results = []
let failed = 0
for (const t of TENANTS) {
  try {
    const data = await loadTenant(t.id)
    const out = generateInsights({ tenant_id: t.id, ...data, settings: {}, now: new Date() })
    const health = buildHealthStatement(out.digest, out.insights)
    const forecast = buildForecast({ products: data.products, items: data.items, sales: data.sales, settings: {} })
    results.push({ tenant_id: t.id, business_name: t.name, digest: out.digest, insights: out.insights, briefing: out.briefing, health, forecast })
    console.log(`\n=== ${t.name} — ${health.title} (${health.status}) ===`)
    console.log(`  ${health.summary}`)
    console.log(`  Sales ${out.digest.sales_pct >= 0 ? '+' : ''}${out.digest.sales_pct}%, MO margin ${out.digest.margin_pct}%, ATV ₱${out.digest.atv}, tx ${out.digest.transactions}`)
    if (forecast.store.products_with_history > 0) {
      console.log(`  Forecast: next 7d ≈ ₱${Math.round(forecast.store.next_7.revenue).toLocaleString('en-PH')} (${forecast.store.next_7.units.toFixed(0)} units), next 30d ≈ ₱${Math.round(forecast.store.next_30.revenue).toLocaleString('en-PH')} — ${forecast.reorder.count} SKUs to reorder (₱${Math.round(forecast.reorder.cost).toLocaleString('en-PH')})`)
      for (const r of forecast.reorder.lines.slice(0, 3)) {
        console.log(`    reorder ${r.product_name}: +${r.order_qty} @ ₱${Math.round(r.order_cost).toLocaleString('en-PH')} (cover ${r.days_of_cover}d)`)
      }
    }
    for (const i of out.insights.slice(0, 6)) {
      console.log(`  [${i.severity}] ${i.title} — ${i.summary}`)
    }
  } catch (err) {
    failed++
    console.log(`\n=== ${t.name} — ERROR: ${err.message} ===`)
  }
}

if (failed === 0) {
  const acc = accountSummary(results, new Date())
  console.log(`\n=== ACCOUNT — ${acc.stores.length} stores, ${acc.needs_attention_count} need attention ===`)
  for (const s of acc.stores) console.log(`  ${s.business_name}: ${s.status} — ${s.headline}`)
}
process.exit(failed ? 1 : 0)