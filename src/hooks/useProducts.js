import { base44 } from '@/api/base44Client'
import { useTenantId } from '@/hooks/useTenantId'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
export function useProducts() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['products', tenantId],
    enabled: !!tenantId,
    queryFn: () => base44.entities.Product.filter({ tenant_id: tenantId }, 'name'),
  })
}

export function useProduct(id) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['product', id],
    enabled: !!id && !!tenantId,
    queryFn: () => base44.entities.Product.get(id),
  })
}

export function useCreateProduct() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data) => base44.entities.Product.create({ ...data, tenant_id: tenantId }),
    onSuccess: () => qc.invalidateQueries(['products', tenantId]),
  })
}

export function useUpdateProduct() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, data),
    onSuccess: () => qc.invalidateQueries(['products', tenantId]),
  })
}

export function useDeleteProduct() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => qc.invalidateQueries(['products', tenantId]),
  })
}

export function useDeleteAllProducts() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => base44.entities.Product.deleteMany({ tenant_id: tenantId }),
    onSuccess: () => { qc.invalidateQueries(['products', tenantId]); qc.invalidateQueries(['movements', tenantId]); qc.invalidateQueries(['costHistory', tenantId]) },
  })
}

export function useRestockProduct() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ product, quantity, unitCost, supplierId, supplierName, paid, invoiceNumber, isVatRegisteredSupplier, nonCreditable }) => {
      const { data, error } = await base44.rpc('restock_goods', {
        p_tenant: tenantId,
        p_product_id: product.id,
        p_quantity: quantity,
        p_unit_cost: unitCost,
        p_supplier_id: supplierId || null,
        p_supplier_name: supplierName || '',
        p_paid: paid,
        p_recorded_by: 'Admin',
        p_invoice_number: invoiceNumber || '',
        p_is_vat_registered_supplier: isVatRegisteredSupplier || false,
        p_non_creditable: nonCreditable || false,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => { qc.invalidateQueries(['products', tenantId]); qc.invalidateQueries(['movements', tenantId]); qc.invalidateQueries(['costHistory', tenantId]) },
  })
}
