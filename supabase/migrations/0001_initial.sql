-- ============================================================================
-- Libreta by BLink — Postgres schema (Phase A)
-- Multi-tenant platform: every business-scoped table carries tenant_id and is
-- isolated at the DB level via Supabase RLS (see 0002_functions.sql).
-- Tables are ordered so FK references always point to already-created tables.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin create type user_role as enum ('admin', 'cashier', 'user');
exception when duplicate_object then null; end $$;
do $$ begin create type platform_role as enum ('superadmin');
exception when duplicate_object then null; end $$;
do $$ begin create type tenant_status as enum ('active', 'suspended');
exception when duplicate_object then null; end $$;
do $$ begin create type payment_method as enum ('Cash', 'Card', 'Gcash', 'Utang', 'Split');
exception when duplicate_object then null; end $$;
do $$ begin create type cash_method as enum ('Cash', 'Card', 'Gcash');
exception when duplicate_object then null; end $$;
do $$ begin create type sale_status as enum ('Completed', 'Voided');
exception when duplicate_object then null; end $$;
do $$ begin create type sale_unit as enum ('base', 'fraction');
exception when duplicate_object then null; end $$;
do $$ begin create type discount_type as enum ('none', 'senior_citizen', 'pwd', 'custom_percent', 'custom_amount');
exception when duplicate_object then null; end $$;
do $$ begin create type ledger_entry_type as enum ('charge', 'payment', 'adjustment');
exception when duplicate_object then null; end $$;
do $$ begin create type ledger_reference_type as enum ('sale', 'payment', 'adjustment', 'void');
exception when duplicate_object then null; end $$;
do $$ begin create type movement_direction as enum ('in', 'out');
exception when duplicate_object then null; end $$;
do $$ begin create type movement_reason as enum ('sale', 'void', 'restock', 'csv_import', 'manual_adjustment');
exception when duplicate_object then null; end $$;
do $$ begin create type po_status as enum ('draft', 'sent', 'partially_received', 'fully_received', 'cancelled');
exception when duplicate_object then null; end $$;
do $$ begin create type journal_reference_type as enum ('sale', 'void', 'purchase', 'expense', 'supplier_payment', 'customer_payment', 'manual', 'manual_offline_import');
exception when duplicate_object then null; end $$;
do $$ begin create type account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');
exception when duplicate_object then null; end $$;
do $$ begin create type invitation_status as enum ('pending', 'accepted');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Profiles (extends auth.users). One row per authenticated user.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role user_role not null default 'user',
  platform_role platform_role,
  tenant_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Tenants (a business)
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  business_type text,
  owner_id uuid references public.profiles(id) on delete set null,
  status tenant_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Business settings (per-tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.business_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  business_name text,
  business_type text,
  currency text not null default 'PHP',
  currency_symbol text not null default '₱',
  categories jsonb not null default '["Feed","Medicine","Tools","Supplement","Other"]'::jsonb,
  units jsonb not null default '["Sack","Bottle","Piece","Kg","Box","Pack"]'::jsonb,
  low_stock_default numeric not null default 5,
  default_markup_percentage numeric not null default 20,
  vat_inclusive boolean not null default true,
  vat_rate numeric not null default 0.12,
  enforce_credit_limit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  sku text,
  barcode text,
  category text not null,
  base_unit text not null,
  base_price numeric not null default 0,
  cost_price numeric not null default 0,
  markup_percentage numeric not null default 20,
  has_fractions boolean not null default false,
  fraction_unit text,
  fraction_multiplier numeric,
  fraction_price numeric,
  sell_by_weight boolean not null default false,
  stock_quantity numeric not null default 0,
  low_stock_threshold numeric not null default 5,
  image_url text,
  vat_exempt boolean not null default false,
  sc_pwd_discount_eligible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  nickname_or_alias text,
  phone text,
  address text,
  credit_limit numeric not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Customer Ledger Entries (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  customer_name text,
  date timestamptz not null default now(),
  type ledger_entry_type not null,
  amount numeric not null default 0,
  reference_type ledger_reference_type not null default 'sale',
  reference_id text,
  running_balance numeric not null default 0,
  recorded_by text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  tin text,
  is_vat_registered boolean not null default false,
  payment_terms text not null default 'COD',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Journal Entries
-- ---------------------------------------------------------------------------
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  date timestamptz not null default now(),
  reference_type journal_reference_type not null,
  reference_id text,
  description text,
  party text,
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Journal Entry Lines
-- ---------------------------------------------------------------------------
create table if not exists public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account text not null,
  account_name text,
  debit_amount numeric not null default 0,
  credit_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Expense Categories
-- ---------------------------------------------------------------------------
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  account_code text not null,
  account_name text,
  is_default boolean not null default false,
  non_deductible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Purchase Orders
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_number text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  order_date timestamptz not null default now(),
  expected_delivery_date timestamptz,
  status po_status not null default 'draft',
  payment_terms text not null default 'COD',
  paid boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Supplier Payments
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  po_id uuid references public.purchase_orders(id) on delete set null,
  payment_date timestamptz not null default now(),
  amount numeric not null default 0,
  payment_method text not null default 'Cash',
  reference_number text,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Purchase Order Items
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  quantity_ordered numeric not null default 0,
  quantity_received numeric not null default 0,
  unit_of_purchase text,
  unit_cost numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Product Cost History (weighted-average audit)
-- ---------------------------------------------------------------------------
create table if not exists public.product_cost_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  product_name text,
  date timestamptz not null default now(),
  previous_average_cost numeric not null default 0,
  new_average_cost numeric not null default 0,
  quantity_received numeric not null default 0,
  actual_unit_cost numeric not null default 0,
  triggering_po_id uuid references public.purchase_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stock Movements
-- ---------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  product_name text,
  quantity numeric not null default 0,
  direction movement_direction not null,
  reason movement_reason not null,
  reference_id text,
  recorded_by text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  supplier_tin text,
  po_id uuid references public.purchase_orders(id) on delete set null,
  paid boolean not null default false,
  invoice_or_receipt_number text,
  is_vat_registered_supplier boolean not null default false,
  purchase_cost numeric not null default 0,
  input_vat numeric not null default 0,
  non_creditable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Chart of Accounts
-- ---------------------------------------------------------------------------
create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  type account_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  date timestamptz not null default now(),
  category text,
  category_id uuid references public.expense_categories(id) on delete set null,
  account_code text,
  description text,
  amount numeric not null default 0,
  payment_method text not null default 'Cash',
  payee text,
  receipt_or_invoice_number text,
  is_vat_registered_payee boolean not null default false,
  input_vat numeric not null default 0,
  non_creditable boolean not null default false,
  recurring boolean not null default false,
  attached_receipt_image text,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  total_amount numeric not null default 0,
  gross_amount numeric not null default 0,
  total_discount_amount numeric not null default 0,
  sc_pwd_discount_amount numeric not null default 0,
  other_discount_amount numeric not null default 0,
  payment_method payment_method not null default 'Cash',
  cash_method cash_method,
  cashier_name text,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  credit_amount numeric not null default 0,
  cash_amount numeric not null default 0,
  status sale_status not null default 'Completed',
  voided_at timestamptz,
  voided_by text,
  void_reason text,
  created_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sale Items
-- ---------------------------------------------------------------------------
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  quantity numeric not null default 0,
  unit_sold sale_unit not null default 'base',
  price_at_sale numeric not null default 0,
  cost_price_at_sale numeric not null default 0,
  subtotal numeric not null default 0,
  discount_type discount_type not null default 'none',
  discount_value numeric not null default 0,
  discount_amount numeric not null default 0,
  net_amount numeric not null default 0,
  discount_id_number text,
  discount_person_name text,
  discount_reason text,
  vatable_sales numeric not null default 0,
  output_vat numeric not null default 0,
  vat_exempt_sales numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tenant Invitations
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tenant_name text,
  email text not null,
  role user_role not null default 'cashier',
  status invitation_status not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

-- ---------------------------------------------------------------------------
-- Import Batches (CSV inventory import audit)
-- ---------------------------------------------------------------------------
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  date timestamptz not null default now(),
  uploaded_by text,
  filename text,
  stock_mode_used text,
  products_created_count integer not null default 0,
  products_updated_count integer not null default 0,
  rows_skipped_count integer not null default 0,
  status text not null default 'completed',
  undone_at timestamptz,
  undone_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Import Change Logs
-- ---------------------------------------------------------------------------
create table if not exists public.import_change_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  action text,
  field_changes jsonb not null default '[]'::jsonb,
  stock_delta numeric not null default 0,
  stock_movement_id uuid references public.stock_movements(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename not in ('profiles')
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t.tablename);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()',
      t.tablename
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Indexes for tenant isolation + hot queries
-- ---------------------------------------------------------------------------
create index if not exists idx_profiles_tenant on public.profiles(tenant_id);
create index if not exists idx_settings_tenant on public.business_settings(tenant_id);
create index if not exists idx_products_tenant on public.products(tenant_id);
create index if not exists idx_products_sku on public.products(tenant_id, lower(sku));
create index if not exists idx_products_barcode on public.products(tenant_id, barcode);
create index if not exists idx_products_name on public.products(tenant_id, lower(name));
create index if not exists idx_sales_tenant on public.sales(tenant_id);
create index if not exists idx_sales_status on public.sales(tenant_id, status);
create index if not exists idx_sales_date on public.sales(tenant_id, created_date);
create index if not exists idx_sale_items_sale on public.sale_items(sale_id);
create index if not exists idx_sale_items_tenant on public.sale_items(tenant_id);
create index if not exists idx_stock_product on public.stock_movements(product_id);
create index if not exists idx_stock_tenant on public.stock_movements(tenant_id);
create index if not exists idx_stock_po on public.stock_movements(po_id);
create index if not exists idx_customers_tenant on public.customers(tenant_id);
create index if not exists idx_ledger_customer on public.customer_ledger_entries(customer_id);
create index if not exists idx_ledger_tenant on public.customer_ledger_entries(tenant_id);
create index if not exists idx_suppliers_tenant on public.suppliers(tenant_id);
create index if not exists idx_po_tenant on public.purchase_orders(tenant_id);
create index if not exists idx_po_items_po on public.purchase_order_items(po_id);
create index if not exists idx_po_items_tenant on public.purchase_order_items(tenant_id);
create index if not exists idx_cost_hist_product on public.product_cost_history(product_id);
create index if not exists idx_cost_hist_tenant on public.product_cost_history(tenant_id);
create index if not exists idx_ap_supplier on public.supplier_payments(supplier_id);
create index if not exists idx_ap_tenant on public.supplier_payments(tenant_id);
create index if not exists idx_coa_tenant on public.chart_of_accounts(tenant_id);
create index if not exists idx_je_tenant on public.journal_entries(tenant_id);
create index if not exists idx_je_ref on public.journal_entries(reference_type, reference_id);
create index if not exists idx_jel_entry on public.journal_entry_lines(journal_entry_id);
create index if not exists idx_jel_tenant on public.journal_entry_lines(tenant_id);
create index if not exists idx_expense_tenant on public.expenses(tenant_id);
create index if not exists idx_expense_date on public.expenses(tenant_id, date);
create index if not exists idx_expcat_tenant on public.expense_categories(tenant_id);
create index if not exists idx_inv_tenant on public.tenant_invitations(tenant_id);
create index if not exists idx_inv_email on public.tenant_invitations(email);
create index if not exists idx_import_tenant on public.import_batches(tenant_id);
create index if not exists idx_changelog_batch on public.import_change_logs(batch_id);
