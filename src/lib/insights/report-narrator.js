// Libreta Intelligence — Report Narrator
// Generates human-readable explanations from verified detector outputs
// Pure deterministic text — no LLM, no API keys, no syntax errors

// Format a number as Philippine Peso currency
const cur = (n) => `₱${Number(n).toFixed(2)}`

// ---- Profit Narrative ----
// Maps thin-margin products + margin trend into a concise narrative
const profitNarrative = (top5) => {
  if (!top5 || top5.length === 0) return 'No thin-margin products identified.'
  const lines = top5.map((p) => `${p.product_name}: ${p.margin_pct}% margin on ₺${p.revenue.toFixed(0)}`)
  const avgMargin = top5.reduce((sum, p) => sum + p.margin_pct, 0) / top5.length
  const changeDesc = avgMargin >= 25 ? 'significant improvement' : avgMargin >= 10 ? 'moderate improvement' : 'slight change'
  return `Thin-margin products: ${lines.join('; ')}. Gross margin ${changeDesc} ${avgMargin.toFixed(2)} percentage points.`
}

// ---- Stock Narrative ----
// Explains the single critical stockout item
const stockNarrative = (critical) => {
  if (!critical || critical.length === 0) return 'No critical stockout risks identified.'
  const item = critical[0]
  const summary = item.summary || ''
  return `${item.name} is at risk of stockout in ${item.days_of_cover.toFixed(2)} days with ${item.on_hand} on hand and velocity ${item.velocity}. ${summary}`
}

// ---- Dashboard Narrative ---
// Assembles the key indicators from briefing + insights into a summary
const dashboardNarrative = (briefing, insights) => {
  const lines = []

  // Sales trend
  if (briefing.sales_pct !== undefined) {
    const dir = briefing.sales_pct < 0 ? 'down' : 'up'
    lines.push(`Sales are ${dir} ${Math.abs(briefing.sales_pct).toFixed(2)}% versus baseline`)
  }

  // Margin change
  if (briefing.margin_delta_pp !== undefined) {
    const dir = briefing.margin_delta_pp >= 0 ? 'improved' : 'declined'
    lines.push(`Gross margin ${dir} ${Math.abs(briefing.margin_delta_pp).toFixed(2)} percentage points`)
  }

  // Credit position
  if (briefing.credit_pct !== undefined) {
    lines.push(`Credit position: ${briefing.credit_pct.toFixed(2)}% outstanding, ₺${briefing.credit_expected.toFixed(0)} expected`)
  }

  // Sunday spike (from insights array)
  if (insights && insights.some(i => i.title && i.title.includes('Sunday'))) {
    const sunday = insights.find(i => i.title && i.title.includes('Sunday'))
    if (sunday && sunday.summary) {
      lines.push(sunday.summary)
    }
  }

  return lines.length > 0 ? lines.join('. ') + '.' : 'No key indicators detected.'
}

// ---- Exports ---
export { profitNarrative, stockNarrative, dashboardNarrative }