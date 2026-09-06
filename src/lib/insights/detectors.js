import {
  round2, fmtPeso, sumAmount, countSales, compareWindows, atv,
  cogsForItems, marginPct, pctPointChange, aggregateItems, itemMarginPct, avgCost,
  totalQty, computeBalance, fifoAging, utilization, expenseByCategory,
  dayOfWeekTotals, DAY_KEYS, confidenceFromSamples,
} from './metrics.js'
import { buildInsight } from './schema.js'

const SALES_SPIKE_PCT = 15
const SALES_DROP_PCT = 15
const MARGIN_DROP_PP = 2
const MARGIN_IMPROVE_PP = 2
const LOW_MARGIN_PCT = 12
const COST_RISE_PCT = 10
const STOCKOUT_DAYS = 5
const STOCKOUT_CRITICAL_DAYS = 2
const FAST_MOVER_MULT = 1.4
const EXPENSE_SPIKE_PCT = 20
const CREDIT_UTIL_PCT = 90

export function detectSales(ctx) {
  const { tenant_id, now } = ctx
  const out = []
  const { recentDays, baselineDays } = ctx.bounds
  const recentSales = ctx.recentSales
  const baselineSales = ctx.baselineSales
  const n = countSales(recentSales) + countSales(baselineSales)

  const cmp = compareWindows(sumAmount(recentSales), sumAmount(baselineSales), recentDays, baselineDays)
  const revenue = sumAmount(recentSales)
  const a = atv(recentSales)

  if (cmp.pct >= SALES_SPIKE_PCT) {
    out.push(buildInsight({
      tenant_id, type: 'sales', severity: 'positive', now,
      title: 'Sales are unusually strong',
      summary: `Sales in the last ${recentDays} days came in ${Math.abs(cmp.pct)}% above your recent pace.`,
      evidence: [`Recent sales (${recentDays} days): ${fmtPeso(revenue)}`, `Expected at baseline pace: ${fmtPeso(cmp.baseline)}`, `${n} recorded sales in view`],
      metric_values: { recent: cmp.current, baseline: cmp.baseline, pct: cmp.pct, atv: a },
      comparison_period: `${recentDays}d_vs_prior_${baselineDays}d`,
      confidence: confidenceFromSamples(n),
    }))
  } else if (cmp.pct <= -SALES_DROP_PCT) {
    out.push(buildInsight({
      tenant_id, type: 'sales', severity: 'warning', now,
      title: 'Sales are below the usual pace',
      summary: `Sales in the last ${recentDays} days are ${Math.abs(cmp.pct)}% lower than your recent average.`,
      evidence: [`Recent sales (${recentDays} days): ${fmtPeso(revenue)}`, `Expected at baseline pace: ${fmtPeso(cmp.baseline)}`],
      metric_values: { recent: cmp.current, baseline: cmp.baseline, pct: cmp.pct, atv: a },
      comparison_period: `${recentDays}d_vs_prior_${baselineDays}d`,
      confidence: confidenceFromSamples(n),
    }))
  }

  if (revenue > 0) {
    const { totals, counts } = dayOfWeekTotals(recentSales)
    const lastDay = DAY_KEYS[parseStoredWday(now)]
    const others = DAY_KEYS.filter((k) => k !== lastDay && counts[k] > 0)
    const othersTotal = others.reduce((s, k) => s + totals[k], 0)
    const othersCount = others.reduce((s, k) => s + counts[k], 0)
    const avgOtherDay = othersCount > 0 ? othersTotal / othersCount : 0
    const thisDay = totals[lastDay]
    if (avgOtherDay > 0 && thisDay > 0) {
      const diff = round2(((thisDay - avgOtherDay) / avgOtherDay) * 100)
      const label = ({ Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' })[lastDay]
      if (Math.abs(diff) >= 20) {
        out.push(buildInsight({
          tenant_id, type: 'sales', severity: diff > 0 ? 'positive' : 'warning', now,
          title: `${label} volume ${diff > 0 ? 'stands out' : 'is light'}`,
          summary: `Sales on this ${label.toLowerCase()} average ${diff > 0 ? '+' : ''}${diff}% versus your other recent days.`,
          evidence: [`Recent ${label}: ${fmtPeso(thisDay)}`, `Average of recent days: ${fmtPeso(round2(avgOtherDay))}`],
          metric_values: { day: lastDay, amount: thisDay, avg_other_days: round2(avgOtherDay), diff_pct: diff },
          comparison_period: `${recentDays}d_by_weekday`,
          confidence: confidenceFromSamples(othersCount),
        }))
      }
    }
  }
  return out
}

export function detectProfit(ctx) {
  const { tenant_id, now } = ctx
  const out = []
  const { recentDays, baselineDays } = ctx.bounds

  const recentNet = sumAmount(ctx.recentSales)
  const baselineNet = sumAmount(ctx.baselineSales)
  const recentCogs = cogsForItems(ctx.recentItems)
  const baselineCogs = cogsForItems(ctx.baselineItems)
  const recentMargin = marginPct(recentNet, recentCogs)
  const baselineMargin = marginPct(baselineNet, baselineCogs)
  const delta = pctPointChange(recentMargin, baselineMargin)

  if (recentNet > 0 && baselineNet > 0 && delta <= -MARGIN_DROP_PP) {
    out.push(buildInsight({
      tenant_id, type: 'profit', severity: 'warning', now,
      title: 'Gross margin is slipping',
      summary: `Gross margin fell ${Math.abs(delta)} percentage points versus the prior period.`,
      evidence: [`Recent gross margin: ${recentMargin}%`, `Prior period: ${baselineMargin}%`, `Recent COGS: ${fmtPeso(recentCogs)} on ${fmtPeso(recentNet)} revenue`],
      metric_values: { recent_margin: recentMargin, baseline_margin: baselineMargin, delta_pp: delta, recent_net: recentNet, recent_cogs: recentCogs },
      comparison_period: `${recentDays}d_vs_prior_${baselineDays}d`,
      confidence: confidenceFromSamples(countSales(ctx.recentSales) + countSales(ctx.baselineSales)),
    }))
  } else if (delta >= MARGIN_IMPROVE_PP) {
    out.push(buildInsight({
      tenant_id, type: 'profit', severity: 'positive', now,
      title: 'Gross margin improved',
      summary: `Gross margin improved ${delta} percentage points versus the prior period.`,
      evidence: [`Recent gross margin: ${recentMargin}%`, `Prior period: ${baselineMargin}%`],
      metric_values: { recent_margin: recentMargin, baseline_margin: baselineMargin, delta_pp: delta },
      comparison_period: `${recentDays}d_vs_prior_${baselineDays}d`,
      confidence: confidenceFromSamples(countSales(ctx.recentSales) + countSales(ctx.baselineSales)),
    }))
  }

  const top = aggregateItems(ctx.recentItems).slice().sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const weak = top.filter((i) => i.revenue >= 200 && itemMarginPct(i) < LOW_MARGIN_PCT && itemMarginPct(i) >= 0)
  if (weak.length >= 2) {
    out.push(buildInsight({
      tenant_id, type: 'profit', severity: 'warning', now,
      title: 'Top sellers with thin margins',
      summary: `${weak.length} of your top products earn less than ${LOW_MARGIN_PCT}% margin while driving most revenue.`,
      evidence: weak.map((i) => `${i.product_name}: ${itemMarginPct(i)}% margin on ${fmtPeso(i.revenue)}`).slice(0, 4),
      metric_values: { products: weak.map((i) => ({ name: i.product_name, margin: itemMarginPct(i), revenue: i.revenue })) },
      comparison_period: `${recentDays}d`,
      confidence: confidenceFromSamples(weak.length, 3),
    }))
  }

  const costShift = ctx.baselineItems.length ? ((avgCost(ctx.recentItems) - avgCost(ctx.baselineItems)) / avgCost(ctx.baselineItems)) * 100 : 0
  if (ctx.baselineItems.length && costShift >= COST_RISE_PCT) {
    out.push(buildInsight({
      tenant_id, type: 'profit', severity: 'warning', now,
      title: 'Product costs are rising',
      summary: `Average unit cost is up ${round2(costShift)}% versus the prior period.`,
      evidence: [`Recent average unit cost: ${fmtPeso(avgCost(ctx.recentItems))}`, `Prior period: ${fmtPeso(avgCost(ctx.baselineItems))}`],
      metric_values: { recent_cost: avgCost(ctx.recentItems), baseline_cost: avgCost(ctx.baselineItems), cost_rise_pct: round2(costShift) },
      comparison_period: `${recentDays}d_vs_prior_${baselineDays}d`,
      confidence: confidenceFromSamples(totalQty(ctx.recentItems) + totalQty(ctx.baselineItems)),
    }))
  }
  return out
}

export function detectInventory(ctx) {
  const { tenant_id, now, recentDays, baselineDays } = ctx
  const out = []

  const aggRecent = aggregateItems(ctx.recentItems)
  const aggBaseline = aggregateItems(ctx.baselineItems)
  const prodMap = new Map((ctx.products || []).map((p) => [p.id, p]))

  const velocity = (id) => {
    const q = aggRecent.filter((i) => i.product_id === id).reduce((s, i) => s + i.qty, 0)
    return recentDays > 0 ? q / recentDays : 0
  }
  const baselineVelocity = (id) => {
    const q = aggBaseline.filter((i) => i.product_id === id).reduce((s, i) => s + i.qty, 0)
    return baselineDays > 0 ? q / baselineDays : 0
  }

  const risky = []
  for (const prod of ctx.products || []) {
    const stock = Number(prod.stock_quantity) || 0
    const v = velocity(prod.id)
    // Stock is held in base units; fraction demand runs in sold units (meters, pieces).
    const mult = prod?.has_fractions && !prod?.sell_by_weight ? Math.max(1, Number(prod.fraction_multiplier) || 1) : 1
    const vBase = v / mult
    if (vBase <= 0) {
      if (stock <= (Number(prod.low_stock_threshold) || 0)) {
        risky.push({ prod, doc: Infinity, v, stale: true })
      }
      continue
    }
    const doc = stock / vBase
    if (doc < STOCKOUT_DAYS) risky.push({ prod, doc, v, stale: false })
  }
  risky.sort((a, b) => a.doc - b.doc)
  if (risky.length) {
    const top = risky.slice(0, 4)
    const criticalCount = risky.filter((r) => r.doc < STOCKOUT_CRITICAL_DAYS).length
    out.push(buildInsight({
      tenant_id, type: 'inventory', severity: criticalCount > 0 ? 'critical' : 'warning', now,
      title: criticalCount > 0 ? 'Stockout risk soon' : 'Stock levels need review',
      summary: `${criticalCount > 0 ? `${criticalCount} products could run out within days.` : `${top.filter((r) => !r.stale).length} products have low projected coverage.`}`,
      evidence: top.map((r) => r.stale
        ? `${r.prod.name}: already at or below low-stock threshold (${r.prod.stock_quantity} on hand, threshold ${r.prod.low_stock_threshold})`
        : `${r.prod.name}: ~${r.doc.toFixed(0)} days of stock at current pace (${r.prod.stock_quantity} on hand, ${r.v.toFixed(2)}/day over ${recentDays}d window)`),
      metric_values: { products: top.map((r) => ({ name: r.prod.name, stock: Number(r.prod.stock_quantity) || 0, velocity: round2(r.v), days_of_cover: r.stale ? null : round2(r.doc) })) },
      comparison_period: `${recentDays}d_velocity`,
      confidence: confidenceFromSamples(top.length, 3),
    }))
  }

  const movers = aggRecent.filter((i) => i.product_id && prodMap.has(i.product_id) && i.qty >= 10)
    .map((i) => ({ ...i, v: velocity(i.product_id), b: baselineVelocity(i.product_id) }))
    .filter((i) => i.b > 0 && i.v >= FAST_MOVER_MULT * i.b)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
  if (movers.length) {
    out.push(buildInsight({
      tenant_id, type: 'inventory', severity: 'positive', now,
      title: 'Fast-moving items',
      summary: `${movers.length} product${movers.length > 1 ? 's' : ''} selling markedly faster than their recent average.`,
      evidence: movers.map((i) => `${i.product_name}: ${round2((i.v / Math.max(0.0001, i.b)) * 100)}% of prior pace`),
      metric_values: { products: movers.map((i) => ({ name: i.product_name, velocity: round2(i.v), prior_velocity: round2(i.b) })) },
      comparison_period: `${recentDays}d_vs_prior_${baselineDays}d`,
      confidence: confidenceFromSamples(movers.length, 3),
    }))
  }
  return out
}

export function detectCredit(ctx) {
  const { tenant_id, now } = ctx
  const out = []
  const customers = ctx.customers || []
  const entries = ctx.ledgerEntries || []
  const withActivity = customers.filter((c) => entries.some((e) => e.customer_id === c.id))

  const aged = []
  const nearLimit = []
  for (const c of withActivity) {
    const balance = computeBalance(entries.filter((e) => e.customer_id === c.id))
    if (balance <= 0) continue
    const aging = fifoAging(entries, c.id, now)
    if (aging.d31_60 + aging.d61_90 + aging.d90plus > 0) aged.push({ customer: c.name, balance, aging })
    const util = utilization(c, balance)
    if (util >= CREDIT_UTIL_PCT) nearLimit.push({ customer: c.name, balance, util })
  }

  const overdueAged = aged.filter((a) => a.aging.d61_90 + a.aging.d90plus > 0)
  if (aged.length) {
    const severity = overdueAged.length ? 'critical' : 'warning'
    out.push(buildInsight({
      tenant_id, type: 'credit', severity, now,
      title: 'Customer balances aging',
      summary: `${aged.length} customer${aged.length > 1 ? 's have' : ' has'} balances past 30 days${overdueAged.length ? `, ${overdueAged.length} beyond 60 days` : ''}.`,
      evidence: aged.slice(0, 4).map((a) => `${a.customer}: ${fmtPeso(a.balance)} outstanding (${fmtPeso(a.aging.d61_90 + a.aging.d90plus)} beyond 60d)`),
      metric_values: { customers: aged.slice(0, 5).map((a) => ({ name: a.customer, balance: a.balance, aging: a.aging })) },
      comparison_period: 'aging_now',
      confidence: confidenceFromSamples(aged.length, 3),
    }))
  }

  if (nearLimit.length) {
    out.push(buildInsight({
      tenant_id, type: 'credit', severity: 'warning', now,
      title: 'Customers near their credit limit',
      summary: `${nearLimit.length} customer${nearLimit.length > 1 ? 's are' : ' is'} above ${CREDIT_UTIL_PCT}% of their credit limit.`,
      evidence: nearLimit.slice(0, 4).map((c) => `${c.customer}: ${c.util}% of limit used`),
      metric_values: { customers: nearLimit.slice(0, 5).map((c) => ({ name: c.customer, balance: c.balance, utilization: c.util })) },
      comparison_period: 'utilization_now',
      confidence: confidenceFromSamples(nearLimit.length, 2),
    }))
  }
  return out
}

export function detectExpenses(ctx) {
  const { tenant_id, now } = ctx
  const out = []
  const { recentDays, baselineDays } = ctx.bounds
  const recentTotal = ctx.recentExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const baselineTotal = ctx.baselineExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const cmp = compareWindows(recentTotal, baselineTotal, recentDays, baselineDays)

  if (cmp.pct >= EXPENSE_SPIKE_PCT) {
    const recBy = expenseByCategory(ctx.recentExpenses)
    const baseBy = new Map(expenseByCategory(ctx.baselineExpenses).map((r) => [r.key, r.total]))
    const risers = recBy
      .map((r) => {
        const baseRate = (baseBy.get(r.key) || 0) / Math.max(1, baselineDays)
        const expected = baseRate * recentDays
        const pct = expected > 0 ? round2(((r.total - expected) / expected) * 100) : 0
        return { ...r, pct }
      })
      .filter((r) => r.pct > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3)

    out.push(buildInsight({
      tenant_id, type: 'expense', severity: 'warning', now,
      title: 'Expenses spiked',
      summary: `Expenses are ${Math.abs(cmp.pct)}% above your recent average.`,
      evidence: risers.length ? risers.map((r) => `${r.label}: +${r.pct}% (${fmtPeso(r.total)})`) : [`Recent total: ${fmtPeso(cmp.current)}`],
      metric_values: { recent: cmp.current, baseline: cmp.baseline, pct: cmp.pct, categories: risers },
      comparison_period: `${recentDays}d_vs_prior_${baselineDays}d`,
      confidence: confidenceFromSamples(recBy.reduce((s, r) => s + r.count, 0), 8),
    }))
  }
  return out
}

function parseStoredWday(d) {
  const p = Number.isFinite(d) ? new Date(d) : new Date(d)
  return p.getUTCDay()
}

export function collectDetectors(ctx) {
  return [
    ...detectSales(ctx),
    ...detectProfit(ctx),
    ...detectInventory(ctx),
    ...detectCredit(ctx),
    ...detectExpenses(ctx),
  ]
}