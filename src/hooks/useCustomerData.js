// Combined customers + ledger that exposes `outstandingFor(id)` — the shape
// consumed by the POS Cart's Utang flow.
import { base44 } from '@/api/base44Client'
import { useCustomers } from '@/hooks/useCustomers'
import { useTenantId } from '@/hooks/useTenantId'
import { computeBalance, entriesForCustomer, recordCustomerPayment, recordAdjustment } from '@/lib/customerCredit'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
export function useCustomerData() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  const { data: customers = [] } = useCustomers()
  const { data: entries = [], isLoading } = useLedgerEntries()
  const outstandingFor = (customerId) => computeBalance(entriesForCustomer(entries, customerId))
  const invalidateAll = () => {
    qc.invalidateQueries(['customers', tenantId])
    qc.invalidateQueries(['ledger', tenantId])
    qc.invalidateQueries(['journal', tenantId])
    qc.invalidateQueries(['sales', tenantId])
  }
  return { customers, entries, outstandingFor, invalidateAll, isLoading }
}

export function useLedgerEntries() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['ledger', tenantId],
    enabled: !!tenantId,
    queryFn: () => base44.entities.CustomerLedgerEntry.filter({ tenant_id: tenantId }, '-created_date', 5000),
  })
}

export function useCreateCustomer() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => base44.entities.Customer.create({ ...data, tenant_id: tenantId }),
    onSuccess: () => { qc.invalidateQueries(['customers', tenantId]); qc.invalidateQueries(['ledger', tenantId]) },
  })
}

export function useUpdateCustomer() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => base44.entities.Customer.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['customers', tenantId]); qc.invalidateQueries(['ledger', tenantId]) },
  })
}

export function useRecordPayment() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args) => recordCustomerPayment(tenantId, args),
    onSuccess: () => { qc.invalidateQueries(['ledger', tenantId]); qc.invalidateQueries(['customers', tenantId]) },
  })
}

export function useRecordAdjustment() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args) => recordAdjustment(tenantId, args),
    onSuccess: () => { qc.invalidateQueries(['ledger', tenantId]); qc.invalidateQueries(['customers', tenantId]) },
  })
}
