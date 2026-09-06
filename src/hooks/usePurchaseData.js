import { base44 } from '@/api/base44Client'
import { useTenantId } from '@/hooks/useTenantId'
import { createPurchaseOrder, updatePurchaseOrder, sendPurchaseOrder, cancelPurchaseOrder, closePurchaseOrderShort, recordSupplierPayment } from '@/lib/purchaseOrders'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
export function useSuppliers() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['suppliers', tenantId],
    enabled: !!tenantId,
    queryFn: () => base44.entities.Supplier.filter({ tenant_id: tenantId }, 'name'),
  })
}

export function useCreateSupplier() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => base44.entities.Supplier.create({ ...data, tenant_id: tenantId }),
    onSuccess: () => qc.invalidateQueries(['suppliers', tenantId]),
  })
}

export function useUpdateSupplier() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => base44.entities.Supplier.update(id, data),
    onSuccess: () => qc.invalidateQueries(['suppliers', tenantId]),
  })
}

export function usePurchaseOrders() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['pos', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const pos = await base44.entities.PurchaseOrder.filter({ tenant_id: tenantId }, '-created_date', 1000)
      const poIds = pos.map((p) => p.id)
      let items = []
      if (poIds.length) items = await base44.entities.PurchaseOrderItem.filter({ po_id: { $in: poIds }, tenant_id: tenantId })
      const byPo = items.reduce((m, i) => { (m[i.po_id] = m[i.po_id] || []).push(i); return m }, {})
      return pos.map((po) => ({ ...po, items: byPo[po.id] || [] }))
    },
  })
}

export function useStockMovements() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['movements', tenantId],
    enabled: !!tenantId,
    queryFn: () => base44.entities.StockMovement.filter({ tenant_id: tenantId }, '-created_date', 5000),
  })
}

export function useSupplierPayments() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['supayments', tenantId],
    enabled: !!tenantId,
    queryFn: () => base44.entities.SupplierPayment.filter({ tenant_id: tenantId }, '-created_date', 5000),
  })
}

export function useProductCostHistory() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['costHistory', tenantId],
    enabled: !!tenantId,
    queryFn: () => base44.entities.ProductCostHistory.filter({ tenant_id: tenantId }, '-created_date', 5000),
  })
}

export function useCreatePO() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args) => createPurchaseOrder(tenantId, args),
    onSuccess: () => { qc.invalidateQueries(['pos', tenantId]); qc.invalidateQueries(['products', tenantId]) },
  })
}

export function useUpdatePO() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ po, args }) => updatePurchaseOrder(tenantId, po, args),
    onSuccess: () => { qc.invalidateQueries(['pos', tenantId]); qc.invalidateQueries(['products', tenantId]) },
  })
}

export function useSendPO() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (po) => sendPurchaseOrder(tenantId, po),
    onSuccess: () => qc.invalidateQueries(['pos', tenantId]),
  })
}

export function useCancelPO() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ po, reason }) => cancelPurchaseOrder(tenantId, po, reason),
    onSuccess: () => qc.invalidateQueries(['pos', tenantId]),
  })
}

export function useClosePOShort() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ po, reason }) => closePurchaseOrderShort(tenantId, po, reason),
    onSuccess: () => qc.invalidateQueries(['pos', tenantId]),
  })
}

// Atomic receive through the receive_goods RPC. payment args handled after.
export function useReceiveGoods() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ po, receipts, options }) => {
      const { data, error } = await base44.rpc('receive_goods', {
        p_tenant: tenantId,
        p_po_id: po.id,
        p_receipts: receipts,
        p_options: options,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => { qc.invalidateQueries(['pos', tenantId]); qc.invalidateQueries(['products', tenantId]); qc.invalidateQueries(['movements', tenantId]) },
  })
}

export function useSupplierPayment() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args) => recordSupplierPayment(tenantId, args),
    onSuccess: () => { qc.invalidateQueries(['pos', tenantId]); qc.invalidateQueries(['supayments', tenantId]); qc.invalidateQueries(['movements', tenantId]) },
  })
}
