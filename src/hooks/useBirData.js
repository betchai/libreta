// Sales with line items (revenue + COGS + VAT details), restocks, expenses,
// expense categories — the inputs for BIR worksheets and the profit report.
import { base44 } from '@/api/base44Client'
import { useQuery } from '@tanstack/react-query'
import { useExpenses, useExpenseCategories } from '@/hooks/useExpenseData'
import { useStockMovements } from '@/hooks/usePurchaseData'
import { useSales } from '@/hooks/useSales'
import { useTenantId } from '@/hooks/useTenantId'
export function useBirData() {
  const tenantId = useTenantId()
  const { data: sales = [], isLoading: salesLoading } = useSales()
  const { data: movements = [], isLoading: movLoading } = useStockMovements()
  const { data: expenses = [], isLoading: expLoading } = useExpenses()
  const { data: categories = [], isLoading: catLoading } = useExpenseCategories()

  const restocks = movements.filter((m) => m.reason === 'restock')
  // Flatten embedded line items into a flat `saleItems` list (no extra query) and
  // alias categories as `expenseCategories` — matching the BIR components' shape.
  const saleItems = sales.flatMap((s) => s.items || [])

  return {
    sales, saleItems, restocks, expenses,
    categories, expenseCategories: categories,
    isLoading: salesLoading || movLoading || expLoading || catLoading,
  }
}

export function useTenant() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['tenant', tenantId],
    enabled: !!tenantId,
    queryFn: () => base44.entities.Tenant.filter({ id: tenantId }),
  })
}
