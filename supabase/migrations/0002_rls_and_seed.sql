-- ============================================================================
-- Libreta by BLink — RLS policies + foundational RPCs (Phase A)
-- Translates Base44's per-entity RLS rules into Supabase policy SQL.
-- Security model:
--   * Every business row is scoped by tenant_id.
--   * Cashiers may CREATE sales/sale_items/customer_ledger_entries (stamp tenant).
--   * Admin/superadmin required to create products, settings, COA, categories,
--     tenants, invitations.
--   * Tenants: superadmin reads all; a user reads own tenant (id or owner_id).
--   * Invitations: read/update by matching email (onboarding join) or admin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Auth helper functions (SECURITY DEFINER reads profiles for the current user)
-- ---------------------------------------------------------------------------
create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_tenant()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and platform_role = 'superadmin');
$$;

-- Admin = role 'admin' OR platform superadmin (superadmins may also operate stores).
create or replace function public.auth_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid()
                and (role = 'admin' or platform_role = 'superadmin'));
$$;

-- ---------------------------------------------------------------------------
-- Reusable policy predicates
-- ---------------------------------------------------------------------------
create or replace function public.is_tenant_user(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth_tenant() = p_tenant;
$$;

create or replace function public.is_admin_of(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth_is_admin() and auth_tenant() = p_tenant;
$$;

-- ===========================================================================
-- RLS: enable + policies
-- ===========================================================================
alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.business_settings enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.customers enable row level security;
alter table public.customer_ledger_entries enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.product_cost_history enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.chart_of_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_categories enable row level security;
alter table public.tenant_invitations enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_change_logs enable row level security;

-- --------------------------------- profiles --------------------------------
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or auth_is_superadmin() or (auth_tenant() is not null and tenant_id = auth_tenant()));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_delete_superadmin" on public.profiles;
create policy "profiles_delete_superadmin" on public.profiles for delete to authenticated
  using (auth_is_superadmin());

-- --------------------------------- tenants ---------------------------------
drop policy if exists "tenants_read" on public.tenants;
create policy "tenants_read" on public.tenants for select to authenticated
  using (id = auth_tenant() or owner_id = auth.uid() or auth_is_superadmin());

drop policy if exists "tenants_create_superadmin" on public.tenants;
create policy "tenants_create_superadmin" on public.tenants for insert to authenticated
  with check (auth_is_superadmin());

drop policy if exists "tenants_update" on public.tenants;
create policy "tenants_update" on public.tenants for update to authenticated
  using (auth_is_superadmin() or (is_admin_of(id)))
  with check (auth_is_superadmin() or (is_admin_of(id)));

drop policy if exists "tenants_delete_superadmin" on public.tenants;
create policy "tenants_delete_superadmin" on public.tenants for delete to authenticated
  using (auth_is_superadmin());

-- -------------------------- business_settings ------------------------------
drop policy if exists "settings_select" on public.business_settings;
create policy "settings_select" on public.business_settings for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "settings_insert_admin" on public.business_settings;
create policy "settings_insert_admin" on public.business_settings for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "settings_update_admin" on public.business_settings;
create policy "settings_update_admin" on public.business_settings for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "settings_delete_admin" on public.business_settings;
create policy "settings_delete_admin" on public.business_settings for delete to authenticated
  using (is_admin_of(tenant_id));

-- --------------------------------- products --------------------------------
drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "products_insert_admin" on public.products;
create policy "products_insert_admin" on public.products for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

-- Mirrors Base44: update is tenant-scoped (admin-free). Flagged for review —
-- cashiers have no UI, but the rule does not block them at the DB level.
drop policy if exists "products_update" on public.products;
create policy "products_update" on public.products for update to authenticated
  using (tenant_id = auth_tenant())
  with check (tenant_id = auth_tenant());

drop policy if exists "products_delete_admin" on public.products;
create policy "products_delete_admin" on public.products for delete to authenticated
  using (is_admin_of(tenant_id));

-- ---------------------------------- sales ----------------------------------
-- Cashiers may ring up sales: insert gated by tenant, no role check.
drop policy if exists "sales_select" on public.sales;
create policy "sales_select" on public.sales for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "sales_insert" on public.sales;
create policy "sales_insert" on public.sales for insert to authenticated
  with check (tenant_id = auth_tenant());

drop policy if exists "sales_update_admin" on public.sales;
create policy "sales_update_admin" on public.sales for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "sales_delete_admin" on public.sales;
create policy "sales_delete_admin" on public.sales for delete to authenticated
  using (is_admin_of(tenant_id));

-- ------------------------------- sale_items --------------------------------
drop policy if exists "sale_items_select" on public.sale_items;
create policy "sale_items_select" on public.sale_items for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "sale_items_insert" on public.sale_items;
create policy "sale_items_insert" on public.sale_items for insert to authenticated
  with check (tenant_id = auth_tenant());

drop policy if exists "sale_items_update_admin" on public.sale_items;
create policy "sale_items_update_admin" on public.sale_items for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "sale_items_delete_admin" on public.sale_items;
create policy "sale_items_delete_admin" on public.sale_items for delete to authenticated
  using (is_admin_of(tenant_id));

-- ----------------------------- stock_movements -----------------------------
drop policy if exists "stock_select" on public.stock_movements;
create policy "stock_select" on public.stock_movements for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "stock_insert" on public.stock_movements;
create policy "stock_insert" on public.stock_movements for insert to authenticated
  with check (tenant_id = auth_tenant());

drop policy if exists "stock_update_admin" on public.stock_movements;
create policy "stock_update_admin" on public.stock_movements for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "stock_delete_admin" on public.stock_movements;
create policy "stock_delete_admin" on public.stock_movements for delete to authenticated
  using (is_admin_of(tenant_id));

-- -------------------------------- customers --------------------------------
drop policy if exists "customers_select" on public.customers;
create policy "customers_select" on public.customers for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "customers_insert" on public.customers;
create policy "customers_insert" on public.customers for insert to authenticated
  with check (tenant_id = auth_tenant());

drop policy if exists "customers_update_admin" on public.customers;
create policy "customers_update_admin" on public.customers for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "customers_delete_admin" on public.customers;
create policy "customers_delete_admin" on public.customers for delete to authenticated
  using (is_admin_of(tenant_id));

-- ------------------------- customer_ledger_entries -------------------------
drop policy if exists "ledger_select" on public.customer_ledger_entries;
create policy "ledger_select" on public.customer_ledger_entries for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "ledger_insert" on public.customer_ledger_entries;
create policy "ledger_insert" on public.customer_ledger_entries for insert to authenticated
  with check (tenant_id = auth_tenant());

drop policy if exists "ledger_update_admin" on public.customer_ledger_entries;
create policy "ledger_update_admin" on public.customer_ledger_entries for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "ledger_delete_admin" on public.customer_ledger_entries;
create policy "ledger_delete_admin" on public.customer_ledger_entries for delete to authenticated
  using (is_admin_of(tenant_id));

-- -------------------------------- suppliers --------------------------------
drop policy if exists "suppliers_select" on public.suppliers;
create policy "suppliers_select" on public.suppliers for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "suppliers_insert_admin" on public.suppliers;
create policy "suppliers_insert_admin" on public.suppliers for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "suppliers_update_admin" on public.suppliers;
create policy "suppliers_update_admin" on public.suppliers for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "suppliers_delete_admin" on public.suppliers;
create policy "suppliers_delete_admin" on public.suppliers for delete to authenticated
  using (is_admin_of(tenant_id));

-- ----------------------------- purchase_orders -----------------------------
drop policy if exists "po_select" on public.purchase_orders;
create policy "po_select" on public.purchase_orders for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "po_insert_admin" on public.purchase_orders;
create policy "po_insert_admin" on public.purchase_orders for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "po_update_admin" on public.purchase_orders;
create policy "po_update_admin" on public.purchase_orders for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "po_delete_admin" on public.purchase_orders;
create policy "po_delete_admin" on public.purchase_orders for delete to authenticated
  using (is_admin_of(tenant_id));

-- --------------------------- purchase_order_items --------------------------
drop policy if exists "po_items_select" on public.purchase_order_items;
create policy "po_items_select" on public.purchase_order_items for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "po_items_insert_admin" on public.purchase_order_items;
create policy "po_items_insert_admin" on public.purchase_order_items for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "po_items_update_admin" on public.purchase_order_items;
create policy "po_items_update_admin" on public.purchase_order_items for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "po_items_delete_admin" on public.purchase_order_items;
create policy "po_items_delete_admin" on public.purchase_order_items for delete to authenticated
  using (is_admin_of(tenant_id));

-- --------------------------- product_cost_history --------------------------
drop policy if exists "cost_hist_select" on public.product_cost_history;
create policy "cost_hist_select" on public.product_cost_history for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "cost_hist_insert_admin" on public.product_cost_history;
create policy "cost_hist_insert_admin" on public.product_cost_history for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "cost_hist_delete_admin" on public.product_cost_history;
create policy "cost_hist_delete_admin" on public.product_cost_history for delete to authenticated
  using (is_admin_of(tenant_id));

-- ---------------------------- supplier_payments ----------------------------
drop policy if exists "ap_select" on public.supplier_payments;
create policy "ap_select" on public.supplier_payments for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "ap_insert_admin" on public.supplier_payments;
create policy "ap_insert_admin" on public.supplier_payments for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "ap_update_admin" on public.supplier_payments;
create policy "ap_update_admin" on public.supplier_payments for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "ap_delete_admin" on public.supplier_payments;
create policy "ap_delete_admin" on public.supplier_payments for delete to authenticated
  using (is_admin_of(tenant_id));

-- ---------------------------- chart_of_accounts ----------------------------
drop policy if exists "coa_select" on public.chart_of_accounts;
create policy "coa_select" on public.chart_of_accounts for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "coa_insert_admin" on public.chart_of_accounts;
create policy "coa_insert_admin" on public.chart_of_accounts for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "coa_update_admin" on public.chart_of_accounts;
create policy "coa_update_admin" on public.chart_of_accounts for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "coa_delete_admin" on public.chart_of_accounts;
create policy "coa_delete_admin" on public.chart_of_accounts for delete to authenticated
  using (is_admin_of(tenant_id));

-- ------------------------------ journal_entries ----------------------------
drop policy if exists "je_select" on public.journal_entries;
create policy "je_select" on public.journal_entries for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "je_insert" on public.journal_entries;
create policy "je_insert" on public.journal_entries for insert to authenticated
  with check (tenant_id = auth_tenant());

drop policy if exists "je_update_admin" on public.journal_entries;
create policy "je_update_admin" on public.journal_entries for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "je_delete_admin" on public.journal_entries;
create policy "je_delete_admin" on public.journal_entries for delete to authenticated
  using (is_admin_of(tenant_id));

-- --------------------------- journal_entry_lines ---------------------------
drop policy if exists "jel_select" on public.journal_entry_lines;
create policy "jel_select" on public.journal_entry_lines for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "jel_insert" on public.journal_entry_lines;
create policy "jel_insert" on public.journal_entry_lines for insert to authenticated
  with check (tenant_id = auth_tenant());

drop policy if exists "jel_update_admin" on public.journal_entry_lines;
create policy "jel_update_admin" on public.journal_entry_lines for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "jel_delete_admin" on public.journal_entry_lines;
create policy "jel_delete_admin" on public.journal_entry_lines for delete to authenticated
  using (is_admin_of(tenant_id));

-- -------------------------------- expenses --------------------------------
drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "expenses_insert_admin" on public.expenses;
create policy "expenses_insert_admin" on public.expenses for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "expenses_update_admin" on public.expenses;
create policy "expenses_update_admin" on public.expenses for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "expenses_delete_admin" on public.expenses;
create policy "expenses_delete_admin" on public.expenses for delete to authenticated
  using (is_admin_of(tenant_id));

-- ----------------------------- expense_categories --------------------------
drop policy if exists "expcat_select" on public.expense_categories;
create policy "expcat_select" on public.expense_categories for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "expcat_insert_admin" on public.expense_categories;
create policy "expcat_insert_admin" on public.expense_categories for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "expcat_update_admin" on public.expense_categories;
create policy "expcat_update_admin" on public.expense_categories for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "expcat_delete_admin" on public.expense_categories;
create policy "expcat_delete_admin" on public.expense_categories for delete to authenticated
  using (is_admin_of(tenant_id));

-- ---------------------------- tenant_invitations ---------------------------
drop policy if exists "inv_select" on public.tenant_invitations;
create policy "inv_select" on public.tenant_invitations for select to authenticated
  using (auth_is_superadmin() or (email = auth.jwt() ->> 'email') or is_admin_of(tenant_id));

drop policy if exists "inv_insert_admin" on public.tenant_invitations;
create policy "inv_insert_admin" on public.tenant_invitations for insert to authenticated
  with check (auth_is_admin());

drop policy if exists "inv_update" on public.tenant_invitations;
create policy "inv_update" on public.tenant_invitations for update to authenticated
  using (auth_is_superadmin() or (email = auth.jwt() ->> 'email') or is_admin_of(tenant_id))
  with check (auth_is_superadmin() or (email = auth.jwt() ->> 'email') or is_admin_of(tenant_id));

drop policy if exists "inv_delete_admin" on public.tenant_invitations;
create policy "inv_delete_admin" on public.tenant_invitations for delete to authenticated
  using (auth_is_superadmin() or is_admin_of(tenant_id));

-- ------------------------------ import_batches -----------------------------
drop policy if exists "import_select" on public.import_batches;
create policy "import_select" on public.import_batches for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "import_insert_admin" on public.import_batches;
create policy "import_insert_admin" on public.import_batches for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "import_update_admin" on public.import_batches;
create policy "import_update_admin" on public.import_batches for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "import_delete_admin" on public.import_batches;
create policy "import_delete_admin" on public.import_batches for delete to authenticated
  using (is_admin_of(tenant_id));

-- ---------------------------- import_change_logs ---------------------------
drop policy if exists "changelog_select" on public.import_change_logs;
create policy "changelog_select" on public.import_change_logs for select to authenticated
  using (tenant_id = auth_tenant());

drop policy if exists "changelog_insert_admin" on public.import_change_logs;
create policy "changelog_insert_admin" on public.import_change_logs for insert to authenticated
  with check (auth_is_admin() and tenant_id = auth_tenant());

drop policy if exists "changelog_update_admin" on public.import_change_logs;
create policy "changelog_update_admin" on public.import_change_logs for update to authenticated
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

drop policy if exists "changelog_delete_admin" on public.import_change_logs;
create policy "changelog_delete_admin" on public.import_change_logs for delete to authenticated
  using (is_admin_of(tenant_id));
