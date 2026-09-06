import { base44 } from '@/api/base44Client'
import { useTenantId } from '@/hooks/useTenantId'
import { ensureExpenseCategories, saveExpense, deleteExpense } from '@/lib/expenses'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'

// Flat convenience hook (matches the reference ExpenseForm/CategoryManager).
export function useExpenseData() {
  const categories = useExpenseCategories()
  return { categories: categories.data || [], categoriesLoading: categories.isLoading, isLoading: categories.isLoading }
}

export function useExpenseCategories() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['expenseCategories', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      await ensureExpenseCategories(tenantId)
      return base44.entities.ExpenseCategory.filter({ tenant_id: tenantId }, 'name')
    },
  })
}

export function useExpenses() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['expenses', tenantId],
    enabled: !!tenantId,
    queryFn: () => base44.entities.Expense.filter({ tenant_id: tenantId }, '-date', 5000),
  })
}

export function useSaveExpense() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ data, existing }) => saveExpense(tenantId, data, existing),
    onSuccess: () => { qc.invalidateQueries(['expenses', tenantId]); qc.invalidateQueries(['journal', tenantId]) },
  })
}

export function useDeleteExpense() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (expense) => deleteExpense(tenantId, expense),
    onSuccess: () => { qc.invalidateQueries(['expenses', tenantId]); qc.invalidateQueries(['journal', tenantId]) },
  })
}

export function useCreateExpenseCategory() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => base44.entities.ExpenseCategory.create({ ...data, tenant_id: tenantId }),
    onSuccess: () => qc.invalidateQueries(['expenseCategories', tenantId]),
  })
}

export function useUpdateExpenseCategory() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => base44.entities.ExpenseCategory.update(id, data),
    onSuccess: () => qc.invalidateQueries(['expenseCategories', tenantId]),
  })
}

export function useDeleteExpenseCategory() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => base44.entities.ExpenseCategory.delete(id),
    onSuccess: () => qc.invalidateQueries(['expenseCategories', tenantId]),
  })
}
