import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  DEMO_PRODUCTS, DEMO_SALES, DEMO_SALE_ITEMS, DEMO_CUSTOMERS,
  DEMO_LEDGER_ENTRIES, DEMO_SUPPLIERS, DEMO_PURCHASE_ORDERS,
  DEMO_EXPENSES, DEMO_EXPENSE_CATEGORIES, DEMO_STOCK_MOVEMENTS,
  DEMO_SUPPLIER_PAYMENTS, DEMO_CHART_OF_ACCOUNTS, DEMO_JOURNAL_ENTRIES,
  DEMO_SETTINGS,
} from '@/lib/demoData'

const TENANT_ID = 'demo-tenant-id'

export default function DemoDataLoader({ children }) {
  const qc = useQueryClient()

  useEffect(() => {
    qc.setQueryData(['settings', TENANT_ID], DEMO_SETTINGS)
    qc.setQueryData(['products', TENANT_ID], DEMO_PRODUCTS)
    qc.setQueryData(['customers', TENANT_ID], DEMO_CUSTOMERS)
    qc.setQueryData(['suppliers', TENANT_ID], DEMO_SUPPLIERS)
    qc.setQueryData(['expenseCategories', TENANT_ID], DEMO_EXPENSE_CATEGORIES)
    qc.setQueryData(['coa', TENANT_ID], DEMO_CHART_OF_ACCOUNTS)

    const salesWithItems = DEMO_SALES.map((s) => ({
      ...s,
      items: DEMO_SALE_ITEMS.filter((i) => i.sale_id === s.id),
    }))
    qc.setQueryData(['sales', TENANT_ID], salesWithItems)
    qc.setQueryData(['ledger', TENANT_ID], DEMO_LEDGER_ENTRIES)
    qc.setQueryData(['pos', TENANT_ID], DEMO_PURCHASE_ORDERS)
    qc.setQueryData(['expenses', TENANT_ID], DEMO_EXPENSES)
    qc.setQueryData(['movements', TENANT_ID], DEMO_STOCK_MOVEMENTS)
    qc.setQueryData(['supayments', TENANT_ID], DEMO_SUPPLIER_PAYMENTS)

    const journalWithLines = DEMO_JOURNAL_ENTRIES.map((e) => ({ ...e }))
    qc.setQueryData(['journal', TENANT_ID], journalWithLines)
  }, [qc])

  return children
}