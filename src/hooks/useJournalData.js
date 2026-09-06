import { base44 } from '@/api/base44Client'
import { useTenantId } from '@/hooks/useTenantId'
import { useQuery } from '@tanstack/react-query'
export function useChartOfAccounts() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['coa', tenantId],
    enabled: !!tenantId,
    queryFn: () => base44.entities.ChartOfAccounts.filter({ tenant_id: tenantId }, 'code'),
  })
}

export function useJournalEntries() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['journal', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const entries = await base44.entities.JournalEntry.filter({ tenant_id: tenantId }, '-created_date', 5000)
      const ids = entries.map((e) => e.id)
      let lines = []
      if (ids.length) {
        lines = await base44.entities.JournalEntryLine.filter({ journal_entry_id: { $in: ids }, tenant_id: tenantId }, '-created_date', 20000)
      }
      const byEntry = lines.reduce((m, l) => { (m[l.journal_entry_id] = m[l.journal_entry_id] || []).push(l); return m }, {})
      return entries.map((e) => ({ ...e, lines: byEntry[e.id] || [] }))
    },
  })
}
