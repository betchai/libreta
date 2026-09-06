// Libreta Intelligence — Phase 2: deterministic demand forecast + reorder planner.
// Pure ESM, no aliases, no randomness. Unit conversion honors unit_sold (fraction).

import { parseStoredDate, manilaStartOfToday } from '../manilaTime.js'
import { round2 } from './metrics.js'

export const DAY_MS = 86400000

// Bucket key = number of Manila days since epoch (stable across DST/UTC shifts).
const buck = (d) => Math.floor((parseStoredDate(d).getTime() + 8 * 3600000) / DAY_MS)

// Average daily demand split by weekday over the trailing `windowDays` (excludes today).
function weekdayProfile(seriesMap, todayKey, windowDays) {
  let total = 0
  const sums = new Array(7).fill(0)
  const counts = new Array(7).fill(0)
  for (let k = todayKey - windowDays; k < todayKey; k++) {
    const v = seriesMap.get(k) || 0
    const wd = new Date(k * DAY_MS).getUTCDay()
    total += v
    sums[wd] += v
    counts[wd]++
  }
  if (!counts.some((c) => c)) return null
  const avg = total / windowDays
  if (avg <= 0) return null
  const factor = new Array(7).fill(0)
  for (let w = 0; w < 7; w++) factor[w] = counts[w] ? round2(sums[w] / counts[w] / avg) : 1
  return { avg, factor }
}

function forecastUnits(profile, todayKey, days) {
  let total = 0
  for (let d = 1; d <= days; d++) {
    const wd = new Date((todayKey + d) * DAY_MS).getUTCDay()
    total += profile.avg * profile.factor[wd]
  }
  return total
}

function revenuePerUnit(prod) {
  if (prod && prod.has_fractions && !prod.sell_by_weight && Number(prod.fraction_price) > 0) {
    return Number(prod.fraction_price)
  }
  return Number(prod?.base_price) || 0
}

function forecastProduct(prod, seriesMap, todayKey, settings) {
  // Clamp the divisor to the product's real history span so stores younger
  // than the configured window aren't diluted by empty trailing days.
  const keys = [...(seriesMap?.keys() || [])].filter((k) => k < todayKey)
  const minKey = keys.length ? Math.min(...keys) : todayKey
  const spanDays = Math.max(7, todayKey - minKey)
  const windowDays = Math.min(Math.max(7, Number(settings.window_days) || 90), spanDays)
  const leadTime = Math.max(0, Number(settings.lead_time_days) || 3)
  const safetyDays = Math.max(0, Number(settings.safety_stock_days) || 5)
  const review = Math.max(1, Number(settings.review_interval_days) || 7)
  const stock = Number(prod.stock_quantity) || 0
  const profile = weekdayProfile(seriesMap || new Map(), todayKey, windowDays)

  const empty = {
    product_id: prod.id, product_name: prod.name, daily_rate: 0, has_history: false,
    next_7_units: 0, next_30_units: 0, projected_7_revenue: 0, projected_30_revenue: 0,
    stock, days_of_cover: stock > 0 ? 99 : 0, suggest_reorder: false, order_qty: 0, order_up_to: stock,
  }
  if (!profile) return empty

  const next7 = forecastUnits(profile, todayKey, 7)
  const next30 = forecastUnits(profile, todayKey, 30)
  const pu = revenuePerUnit(prod)
  const dailyRate = profile.avg

  // Stock is held in base units; fraction sales run in sold units (meters, pieces).
  const mult = prod?.has_fractions && !prod?.sell_by_weight ? Math.max(1, Number(prod.fraction_multiplier) || 1) : 1
  const dailyBase = dailyRate / mult

  // (s,S) policy: order up to expected demand over lead time + safety + review cycle.
  const orderUpTo = Math.ceil(dailyBase * (leadTime + safetyDays + review))
  const suggest = stock < orderUpTo
  const orderQty = suggest ? Math.max(orderUpTo - Math.floor(stock), 0) : 0

  return {
    product_id: prod.id, product_name: prod.name, daily_rate: round2(dailyRate),
    daily_rate_base: round2(dailyBase),
    has_history: true, next_7_units: round2(next7), next_30_units: round2(next30),
    projected_7_revenue: round2(next7 * pu), projected_30_revenue: round2(next30 * pu),
    stock, days_of_cover: round2(dailyBase > 0 ? stock / dailyBase : 99),
    suggest_reorder: suggest, order_qty: orderQty, order_up_to: orderUpTo,
    order_cost: round2(orderQty * (Number(prod.cost_price) || 0)),
    lead_time_days: leadTime,
  }
}

export function buildForecast({
  products = [],
  items = [],
  sales = [],
  settings = {},
} = {}) {
  const today = manilaStartOfToday()
  const todayKey = buck(today)
  const saleDate = new Map()
  for (const s of sales || []) saleDate.set(s.id, s.created_date || s.created_at)

  const series = new Map() // product_id -> Map(bucket -> units)
  for (const i of items || []) {
    const date = saleDate.get(i.sale_id)
    if (!date) continue
    const key = buck(date)
    if (key > todayKey) continue
    let m = series.get(i.product_id)
    if (!m) {
      m = new Map()
      series.set(i.product_id, m)
    }
    m.set(key, (m.get(key) || 0) + (Number(i.quantity) || 0))
  }

  const perProduct = products.map((p) => forecastProduct(p, series.get(p.id), todayKey, settings.kpis || settings))
  const hasData = perProduct.filter((p) => p.has_history)
  const sum = (key, src = hasData) => round2(src.reduce((a, p) => a + (Number(p[key]) || 0), 0))
  const reorder = perProduct.filter((p) => p.suggest_reorder).sort((a, b) => b.order_cost - a.order_cost)

  return {
    generated_at: today.toISOString(),
    window_days: Math.max(7, Number(settings.window_days) || 90),
    lead_time_days: Math.max(0, Number(settings.lead_time_days) || 3),
    store: {
      products_with_history: hasData.length,
      daily_rate: sum('daily_rate'),
      next_7: { units: sum('next_7_units'), revenue: sum('projected_7_revenue') },
      next_30: { units: sum('next_30_units'), revenue: sum('projected_30_revenue') },
    },
    reorder: {
      count: reorder.length,
      qty: round2(reorder.reduce((a, p) => a + p.order_qty, 0)),
      cost: sum('order_cost', reorder),
      lines: reorder.slice(0, 8),
    },
    products: perProduct,
  }
}