const SEVERITY_RANK = { critical: 4, warning: 3, positive: 2, info: 1 }

let _seq = 0

export function buildInsight({
  tenant_id,
  type = 'health',
  severity = 'info',
  title,
  summary,
  evidence = [],
  metric_values = {},
  comparison_period = null,
  confidence = 0.5,
  now = new Date(),
}) {
  _seq += 1
  return {
    id: `ins_${type}_${Date.now().toString(36)}_${(_seq % 1296).toString(36).padStart(2, '0')}`,
    tenant_id,
    type,
    severity,
    title,
    summary,
    evidence: [...evidence],
    metric_values: { ...metric_values },
    comparison_period,
    confidence: Math.min(1, Math.max(0, Number(confidence) || 0)),
    created_at: new Date(now).toISOString(),
  }
}

export function severityRank(severity) {
  return SEVERITY_RANK[severity] ?? 1
}

export function severityLabel(severity) {
  return { critical: 'critical', warning: 'warning', positive: 'positive', info: 'info' }[severity] ?? 'info'
}

export function sortBySeverity(insights) {
  return [...insights].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
}