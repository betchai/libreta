import { base44 } from '@/api/base44Client'
import { useTenantId } from '@/hooks/useTenantId'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
export function useCustomers() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['customers', tenantId],
    enabled: !!tenantId,
    queryFn: () => base44.entities.Customer.filter({ tenant_id: tenantId }, 'name'),
  })
}

export function useCreateCustomer() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => base44.entities.Customer.create({ ...data, tenant_id: tenantId }),
    onSuccess: () => qc.invalidateQueries(['customers', tenantId]),
  })
}
