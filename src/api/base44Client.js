// Supabase adapter that mimics the Base44 SDK surface used by the ported
// lib/*.js modules. Exposes `base44.entities.*`, `base44.auth.*`, `base44.users.*`
// so the framework-agnostic business logic ports nearly verbatim.
//
// Notable mappings:
//   * created_date / updated_date           -> created_at / updated_at
//   * { id: { $in: [...] } } filter dialect -> Supabase .in()
//   * sort strings like '-created_date'     -> order by created_at desc
import { supabase } from '@/api/supabaseClient'
import {
  DEMO_PRODUCTS, DEMO_SALES, DEMO_SALE_ITEMS, DEMO_CUSTOMERS,
  DEMO_LEDGER_ENTRIES, DEMO_SUPPLIERS, DEMO_PURCHASE_ORDERS,
  DEMO_EXPENSES, DEMO_EXPENSE_CATEGORIES, DEMO_STOCK_MOVEMENTS,
  DEMO_SUPPLIER_PAYMENTS, DEMO_CHART_OF_ACCOUNTS, DEMO_JOURNAL_ENTRIES,
  DEMO_SETTINGS,
} from '@/lib/demoData'

const DEMO_DATA_MAP = {
  Product: DEMO_PRODUCTS,
  Sale: DEMO_SALES,
  SaleItem: DEMO_SALE_ITEMS,
  Customer: DEMO_CUSTOMERS,
  CustomerLedgerEntry: DEMO_LEDGER_ENTRIES,
  Supplier: DEMO_SUPPLIERS,
  PurchaseOrder: DEMO_PURCHASE_ORDERS,
  Expense: DEMO_EXPENSES,
  ExpenseCategory: DEMO_EXPENSE_CATEGORIES,
  StockMovement: DEMO_STOCK_MOVEMENTS,
  SupplierPayment: DEMO_SUPPLIER_PAYMENTS,
  ChartOfAccounts: DEMO_CHART_OF_ACCOUNTS,
  JournalEntry: DEMO_JOURNAL_ENTRIES,
  Settings: [DEMO_SETTINGS],
}

function demoFilter(data, filters) {
  if (!filters) return data
  return data.filter((row) =>
    Object.entries(filters).every(([k, v]) => row[k] === v)
  )
}
const COLUMN_ALIAS = {
  created_date: 'created_at',
  created_at: 'created_at',
  updated_date: 'updated_at',
  updated_at: 'updated_at',
}

// Map a Base44 filter like { id: { $in: [...] }, tenant_id } to a supabase query.
function applyWhere(query, filters) {
  if (!filters) return query
  for (const [key, val] of Object.entries(filters)) {
    const col = COLUMN_ALIAS[key] || key
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      if (val.$in) query = query.in(col, val.$in)
      else if (val.$eq !== undefined) query = query.eq(col, val.$eq)
      else query = query.eq(col, val)
    } else {
      query = query.eq(col, val)
    }
  }
  return query
}

function applySort(query, sort, limit) {
  if (sort) {
    const desc = sort.startsWith('-')
    const col = sort.replace(/^-/, '')
    query = query.order(COLUMN_ALIAS[col] || col, { ascending: !desc })
  }
  if (typeof limit === 'number') query = query.limit(limit)
  return query
}

// Map a DB row back to the Base44 shape. A real business-date column
// (created_date) must win over the insert timestamp (created_at); only fall
// back to created_at when the table has no business-date column (e.g. sale_items).
function toLegacy(row) {
  if (!row) return row
  const out = { ...row }
  if (!('created_date' in row) && 'created_at' in row) out.created_date = row.created_at
  if ('updated_at' in row) out.updated_date = row.updated_at
  return out
}

function makeEntity(name) {
  const table = name.toLowerCase()
  // singular -> plural table name (Sale -> sales). Safe for all our tables.
  const tableName = name === 'Sale' ? 'sales'
    : name === 'SaleItem' ? 'sale_items'
    : name === 'Settings' ? 'business_settings'
    : name === 'ChartOfAccounts' ? 'chart_of_accounts'
    : name === 'SupplierPayment' ? 'supplier_payments'
    : name === 'ProductCostHistory' ? 'product_cost_history'
    : name === 'StockMovement' ? 'stock_movements'
    : name === 'ExpenseCategory' ? 'expense_categories'
    : name === 'TenantInvitation' ? 'tenant_invitations'
    : name === 'CustomerLedgerEntry' ? 'customer_ledger_entries'
    : name === 'JournalEntry' ? 'journal_entries'
    : name === 'JournalEntryLine' ? 'journal_entry_lines'
    : name === 'ImportBatch' ? 'import_batches'
    : name === 'ImportChangeLog' ? 'import_change_logs'
    : name === 'PurchaseOrder' ? 'purchase_orders'
    : name === 'PurchaseOrderItem' ? 'purchase_order_items'
    : name === 'Tenant' ? 'tenants'
    : name === 'User' ? 'profiles'
    : `${table}s`

  const mapWrite = (data) => {
    const out = { ...data }
    if ('created_date' in out) { out.created_at = out.created_date; delete out.created_date }
    if ('updated_date' in out) { out.updated_at = out.updated_date; delete out.updated_date }
    // never let the client stamp tenant_id to something else; RLS enforces anyway
    return out
  }

  return {
    async list(sort, limit) {
      if (window.__DEMO__) {
        const data = DEMO_DATA_MAP[name] || []
        return [...data]
      }
      let q = supabase.from(tableName).select('*')
      q = applySort(q, sort, limit)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data || []).map(toLegacy)
    },
    async filter(filters, sort, limit) {
      if (window.__DEMO__) {
        const all = DEMO_DATA_MAP[name] || []
        return demoFilter(all, filters)
      }
      let q = supabase.from(tableName).select('*')
      q = applyWhere(q, filters)
      q = applySort(q, sort, limit)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data || []).map(toLegacy)
    },
    async get(id) {
      if (window.__DEMO__) {
        const all = DEMO_DATA_MAP[name] || []
        return all.find((r) => r.id === id) || null
      }
      const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single()
      if (error) throw new Error(error.message)
      return toLegacy(data)
    },
    async create(data) {
      if (window.__DEMO__) {
        return { ...data, id: data.id || `demo-${Date.now()}`, created_date: new Date().toISOString() }
      }
      const { data: row, error } = await supabase.from(tableName).insert(mapWrite(data)).select().single()
      if (error) throw new Error(error.message)
      return toLegacy(row)
    },
    async update(id, data) {
      if (window.__DEMO__) {
        return { ...data, id, updated_date: new Date().toISOString() }
      }
      const { data: row, error } = await supabase.from(tableName).update(mapWrite(data)).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return toLegacy(row)
    },
    async delete(id) {
      if (window.__DEMO__) return true
      const { error } = await supabase.from(tableName).delete().eq('id', id)
      if (error) throw new Error(error.message)
      return true
    },
    async bulkCreate(items) {
      if (!items || items.length === 0) return []
      if (window.__DEMO__) {
        return items.map((d, i) => ({ ...d, id: `demo-${Date.now()}-${i}` }))
      }
      const { data, error } = await supabase.from(tableName).insert(items.map(mapWrite)).select()
      if (error) throw new Error(error.message)
      return (data || []).map(toLegacy)
    },
    async bulkUpdate(items) {
      if (!items || items.length === 0) return []
      if (window.__DEMO__) return items.map((d) => ({ ...d }))
      const results = []
      for (const item of items) {
        const { id, ...changes } = item
        const { data, error } = await supabase.from(tableName).update(mapWrite(changes)).eq('id', id).select().single()
        if (error) throw new Error(error.message)
        results.push(toLegacy(data))
      }
      return results
    },
    async deleteMany(filters) {
      if (window.__DEMO__) return true
      let q = supabase.from(tableName).delete()
      q = applyWhere(q, filters)
      const { error } = await q
      if (error) throw new Error(error.message)
      return true
    },
  }
}

// Entities used across the app.
const ENTITIES = [
  'Tenant', 'Settings', 'Product', 'Sale', 'SaleItem', 'StockMovement',
  'Customer', 'CustomerLedgerEntry', 'Supplier', 'PurchaseOrder',
  'PurchaseOrderItem', 'ProductCostHistory', 'SupplierPayment',
  'ChartOfAccounts', 'JournalEntry', 'JournalEntryLine', 'Expense',
  'ExpenseCategory', 'TenantInvitation', 'ImportBatch', 'ImportChangeLog', 'User',
]

async function currentProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return data
}

// Extract the real error message from an edge-function failure. FunctionsHttpError
// carries the response body in error.context; without this the user only sees a
// generic "invite-user failed" toast that hides the actual cause.
async function functionsError(error, fallback) {
  if (error?.context) {
    try {
      const body = await error.context.json().catch(() => null)
      if (body?.error) return new Error(body.error)
      if (body?.message) return new Error(body.message)
    } catch { /* body not JSON — fall through */ }
  }
  return new Error(error?.message || fallback)
}

export const base44 = {
  entities: Object.fromEntries(ENTITIES.map((n) => [n, makeEntity(n)])),
  rpc: (fn, args) => {
    if (window.__DEMO__) return { data: null, error: null }
    return supabase.rpc(fn, args)
  },
  auth: {
    async me() {
      if (window.__DEMO__) return { id: 'demo-user-id', email: 'demo@libreta.app', full_name: 'Demo User', role: 'admin', tenant_id: 'demo-tenant-id' }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const profile = await currentProfile()
      return profile ? { ...profile, email: user.email } : { id: user.id, email: user.email, role: 'user' }
    },
    async updateMe(values) {
      if (window.__DEMO__) return { ...values, id: 'demo-user-id' }
      const { data } = await supabase.auth.getUser()
      if (!data.user) return null
      const { error } = await supabase.from('profiles').update(values).eq('id', data.user.id)
      if (error) throw new Error(error.message)
      return currentProfile()
    },
    async logout(origin) {
      await supabase.auth.signOut()
      window.location.assign(origin || window.location.origin)
    },
    redirectToLogin(href) {
      window.location.assign(href || '/login')
    },
  },
  users: {
    async inviteTo(email, role, tenantId) {
      if (window.__DEMO__) return { id: 'demo-invite', email, role }
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email, role, tenant_id: tenantId },
      })
      if (error) throw await functionsError(error, 'Failed to send invitation')
      return data
    },
    async inviteUser(email, role) {
      if (window.__DEMO__) return { id: 'demo-invite', email, role }
      const profile = await currentProfile()
      if (!profile?.tenant_id) throw new Error('No business linked to invite into.')

      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email, role, tenant_id: profile.tenant_id },
      })
      if (!error) return data

      // Fallback to RPC if edge function fails
      const { data: id, error: rpcErr } = await supabase.rpc('send_invitation', {
        p_tenant: profile.tenant_id,
        p_email: email,
        p_role: role,
      })
      if (rpcErr) throw new Error(rpcErr.message || error?.message || 'Failed to send invitation')
      return id
    },
  },
}
