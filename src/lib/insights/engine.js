import {
  windowBounds, selectSales, selectItems, selectExpenses, sumAmount,
  countSales, compareWindows, atv, cogsForItems, marginPct, pctPointChange,
  round2,
} from './metrics.js'
import { collectDetectors } from './detectors.js'
import { severityRank, sortBySeverity } from './schema.js'

export function generateInsights({
  tenant_id,
  sales = [],
  items = [],
  products = [],
  customers = [],
  ledgerEntries = [],
  expenses = [],
  settings = {},
  now = new Date(),
  daysRecent = 7,
  daysBaseline = 7,
}) {
  const bounds = windowBounds(now, daysRecent, daysBaseline)
  const recentSales = selectSales(sales, bounds.recent.from, bounds.recent.to)
  const baselineSales = selectSales(sales, bounds.baseline.from, bounds.baseline.to)
  const recentItems = selectItems(items, recentSales)
  const baselineItems = selectItems(items, baselineSales)
  const recentExpenses = selectExpenses(expenses, bounds.recent.from, bounds.recent.to)
  const baselineExpenses = selectExpenses(expenses, bounds.baseline.from, bounds.baseline.to)

  const ctx = {
    tenant_id, settings, now,
    bounds, recentDays: daysRecent, baselineDays: daysBaseline,
    recentSales, baselineSales, recentItems, baselineItems,
    recentExpenses, baselineExpenses,
    products, customers, ledgerEntries,
  }

  const insights = sortBySeverity(collectDetectors(ctx))
  const digest = digestMetrics(ctx)
  const briefing = buildBriefing(insights, digest)

  return { tenant_id, generated_at: new Date(now).toISOString(), digest, insights, briefing }
}

export function buildHealthStatement(digest, insights) {
  const worst = insights.reduce((m, i) => Math.max(m, severityRank(i.severity)), 0)
  let status = 'steady'
  if (worst >= 4) status = 'needs-attention'
  else if (worst >= 3) status = 'watch'
  else if (digest.sales_pct >= 5) status = 'improving'

  const titles = {
    'needs-attention': 'Your business needs attention today',
    watch: 'Some parts of the business are worth a look',
    improving: 'Your business is performing better than usual',
    steady: 'Your business is running steadily',
  }
  const positive = insights.filter((i) => i.severity === 'positive').length
  const critical = insights.filter((i) => i.severity === 'critical').length
  const warning = insights.filter((i) => i.severity === 'warning').length

  let summary = ''
  if (critical) summary += `${critical} critical issue${critical > 1 ? 's' : ''} need your immediate attention. `
  if (warning) summary += `${warning} item${warning > 1 ? 's' : ''} to watch. `
  if (positive) summary += `${positive} good development${positive > 1 ? 's' : ''}. `
  summary += `Sales are ${digest.sales_pct >= 0 ? 'up' : 'down'} ${Math.abs(digest.sales_pct)}% versus your recent pace, ` +
    `gross margin ${digest.margin_delta_pp >= 0 ? 'up' : 'down'} ${Math.abs(digest.margin_delta_pp)} points, ` +
    `and outstanding credit ${digest.credit_pct >= 0 ? 'up' : 'down'} ${Math.abs(digest.credit_pct)}%.`

  return { status, title: titles[status], summary }
}

function digestMetrics(ctx) {
  const { recentDays, baselineDays } = ctx.bounds
  const salesCmp = compareWindows(sumAmount(ctx.recentSales), sumAmount(ctx.baselineSales), recentDays, baselineDays)
  const baselineNet = sumAmount(ctx.baselineSales)
  const recentNet = sumAmount(ctx.recentSales)
  const recentMargin = marginPct(recentNet, cogsForItems(ctx.recentItems))
  const baselineMargin = marginPct(baselineNet, cogsForItems(ctx.baselineItems))

  const outstandingAt = (cutoff) => {
    const totals = new Map()
    for (const e of ctx.ledgerEntries || []) {
      const t = new Date(e.created_date || e.date).getTime()
      if (!Number.isFinite(t) || t > cutoff) continue
      const amt = e.type === 'payment' ? -Math.abs(Number(e.amount) || 0) : Number(e.amount) || 0
      totals.set(e.customer_id, (totals.get(e.customer_id) || 0) + amt)
    }
    return round2([...totals.values()].reduce((s, b) => s + Math.max(0, b), 0))
  }

  const outstandingNow = outstandingAt(ctx.bounds.recent.to)
  const outstandingThen = outstandingAt(ctx.bounds.recent.to - recentDays * 86400000)
  const creditPct = outstandingThen > 0 ? round2(((outstandingNow - outstandingThen) / outstandingThen) * 100) : 0

  return {
    sales_pct: salesCmp.pct,
    sales_recent: recentNet,
    sales_baseline: salesCmp.baseline,
    transactions: countSales(ctx.recentSales),
    atv: atv(ctx.recentSales),
    margin_pct: recentMargin,
    margin_delta_pp: pctPointChange(recentMargin, baselineMargin),
    outstanding: outstandingNow,
    credit_pct: creditPct,
    credit_expected: outstandingThen,
  }
}

export function buildBriefing(insights, digest) {
  const counts = { critical: 0, warning: 0, positive: 0, info: 0 }
  for (const i of insights) counts[i.severity] = (counts[i.severity] || 0) + 1
  return {
    headline: counts.critical
      ? `${counts.critical} critical, ${counts.warning} worth watching`
      : counts.warning
        ? `${counts.warning} items worth your attention`
        : 'Everything looks healthy',
    counts,
    metric_signals: {
      sales: digest.sales_pct >= 5 ? 'up' : digest.sales_pct <= -5 ? 'down' : 'stable',
      margin: digest.margin_delta_pp <= -1 ? 'down' : 'stable',
      credit: digest.credit_pct >= 5 ? 'up' : 'stable',
    },
  }
}

export function accountSummary(stores, now = new Date()) {
  const statuses = []
  for (const store of stores) {
    const worst = store.insights.reduce((m, i) => Math.max(m, severityRank(i.severity)), 0)
    let status = 'good'
    if (worst >= 4) status = 'critical'
    else if (worst >= 3) status = 'attention'
    else if (worst >= 2) status = 'good'

    const top = sortBySeverity(store.insights)[0]
    statuses.push({
      tenant_id: store.tenant_id,
      business_name: store.business_name,
      status,
      headline: top ? top.title : 'No issues detected',
      summary: store.digest ? healthLine(store.digest) : 'Stable',
      insights: store.insights,
    })
  }
  const needsAttention = statuses.filter((s) => s.status === 'critical' || s.status === 'attention').length
  return {
    generated_at: new Date(now).toISOString(),
    needs_attention_count: needsAttention,
    stores: statuses,
  }
}

function healthLine(d) {
  return `Sales ${d.sales_pct >= 0 ? 'up' : 'down'} ${Math.abs(d.sales_pct)}%, margin ${d.margin_pct}%`
}