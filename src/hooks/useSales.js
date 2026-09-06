import { base44 } from '@/api/base44Client'
import { useTenantId } from '@/hooks/useTenantId'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
export function useSales() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['sales', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const sales = await base44.entities.Sale.filter({ tenant_id: tenantId }, '-created_date', 1000)
      const ids = sales.map((s) => s.id)
      let items = []
      if (ids.length) {
        items = await base44.entities.SaleItem.filter({ sale_id: { $in: ids }, tenant_id: tenantId }, '-created_date', 5000)
      }
      const bySale = items.reduce((m, i) => {
        ;(m[i.sale_id] = m[i.sale_id] || []).push(i)
        return m
      }, {})
      return sales.map((s) => ({ ...s, items: bySale[s.id] || [] }))
    },
  })
}

export function useVoidSale() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ saleId, reason }) => {
      const { error } = await base44.rpc('void_sale', {
        p_tenant: tenantId,
        p_sale_id: saleId,
        p_voided_by: 'Admin',
        p_reason: reason,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries(['sales', tenantId]),
  })
}
