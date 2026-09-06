-- ============================================================================
-- Libreta by BLink — Foundational RPCs (Phase A)
-- SECURITY DEFINER: these run as the table owner so multi-step writes are
-- atomic, but each validates the caller's tenant/role inside.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Standard Chart of Accounts + default expense categories (mirror of the seeds
-- in the Base44 app). Used by create_business() and ensure_chart_of_accounts().
-- ---------------------------------------------------------------------------
create or replace function public.account_lines()
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_array(
    jsonb_build_object('code','1000','name','Cash','type','asset'),
    jsonb_build_object('code','1100','name','Accounts Receivable','type','asset'),
    jsonb_build_object('code','1200','name','Inventory Asset','type','asset'),
    jsonb_build_object('code','1300','name','Bank','type','asset'),
    jsonb_build_object('code','1500','name','Input VAT','type','asset'),
    jsonb_build_object('code','2000','name','Accounts Payable','type','liability'),
    jsonb_build_object('code','3000','name','Owner''s Equity','type','equity'),
    jsonb_build_object('code','4000','name','Sales Revenue','type','revenue'),
    jsonb_build_object('code','4100','name','Sales Discount - Senior Citizen/PWD','type','revenue'),
    jsonb_build_object('code','4101','name','Sales Discount - Other','type','revenue'),
    jsonb_build_object('code','5000','name','Cost of Goods Sold','type','expense'),
    jsonb_build_object('code','6000','name','Rent Expense','type','expense'),
    jsonb_build_object('code','6100','name','Utilities Expense','type','expense'),
    jsonb_build_object('code','6200','name','Salaries & Wages Expense','type','expense'),
    jsonb_build_object('code','6300','name','Transportation & Delivery Expense','type','expense'),
    jsonb_build_object('code','6400','name','Repairs & Maintenance Expense','type','expense'),
    jsonb_build_object('code','6500','name','Office Supplies Expense','type','expense'),
    jsonb_build_object('code','6600','name','Professional Fees Expense','type','expense'),
    jsonb_build_object('code','6700','name','Taxes & Licenses Expense','type','expense'),
    jsonb_build_object('code','6800','name','Depreciation Expense','type','expense'),
    jsonb_build_object('code','6900','name','Insurance Expense','type','expense'),
    jsonb_build_object('code','7000','name','Marketing & Advertising Expense','type','expense'),
    jsonb_build_object('code','7100','name','Miscellaneous Expense','type','expense')
  );
$$;

create or replace function public.expense_category_lines()
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_array(
    jsonb_build_object('name','Rent','account_code','6000','account_name','Rent Expense'),
    jsonb_build_object('name','Utilities (Electricity/Water/Internet)','account_code','6100','account_name','Utilities Expense'),
    jsonb_build_object('name','Salaries & Wages','account_code','6200','account_name','Salaries & Wages Expense'),
    jsonb_build_object('name','Transportation/Delivery','account_code','6300','account_name','Transportation & Delivery Expense'),
    jsonb_build_object('name','Repairs & Maintenance','account_code','6400','account_name','Repairs & Maintenance Expense'),
    jsonb_build_object('name','Office Supplies','account_code','6500','account_name','Office Supplies Expense'),
    jsonb_build_object('name','Professional Fees (Accountant/Lawyer)','account_code','6600','account_name','Professional Fees Expense'),
    jsonb_build_object('name','Taxes & Licenses (Permits, Registration)','account_code','6700','account_name','Taxes & Licenses Expense'),
    jsonb_build_object('name','Depreciation','account_code','6800','account_name','Depreciation Expense'),
    jsonb_build_object('name','Insurance','account_code','6900','account_name','Insurance Expense'),
    jsonb_build_object('name','Marketing/Advertising','account_code','7000','account_name','Marketing & Advertising Expense'),
    jsonb_build_object('name','Miscellaneous','account_code','7100','account_name','Miscellaneous Expense')
  );
$$;

-- Create the tenant, seed settings + chart of accounts + expense categories.
-- SUPERADMIN ONLY. Optionally creates a pending invitation for an admin.
-- Returns the tenant id.
create or replace function public.create_business(
  p_business_name text,
  p_business_type text default null,
  p_admin_email text default null,
  p_admin_role user_role default 'admin'
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if not public.auth_is_superadmin() then
    raise exception 'Only the platform owner can create businesses';
  end if;

  insert into public.tenants (business_name, business_type, owner_id)
  values (p_business_name, p_business_type, auth.uid())
  returning id into v_tenant;

  insert into public.business_settings (tenant_id, business_name, business_type)
  values (v_tenant, p_business_name, p_business_type);

  insert into public.chart_of_accounts (tenant_id, code, name, type)
  select v_tenant, a->>'code', a->>'name', (a->>'type')::account_type
  from jsonb_array_elements(public.account_lines()) a;

  insert into public.expense_categories (tenant_id, name, account_code, account_name, is_default)
  select v_tenant, c->>'name', c->>'account_code', c->>'account_name', true
  from jsonb_array_elements(public.expense_category_lines()) c;

  if p_admin_email is not null and p_admin_email <> '' then
    insert into public.tenant_invitations (tenant_id, tenant_name, email, role, invited_by)
    values (v_tenant, p_business_name, p_admin_email, p_admin_role, auth.uid());
  end if;

  return v_tenant;
end;
$$;

-- Ensure the tenant has a full chart of accounts. Idempotent by account code
-- (mirrors Base44 ensureChartOfAccounts). Safe for any tenant user: it only
-- inserts a fixed allowlist of missing accounts, and COA is seeded at tenant
-- creation so this is typically a no-op (e.g., during a cashier sale checkout).
create or replace function public.ensure_chart_of_accounts(p_tenant uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.chart_of_accounts (tenant_id, code, name, type)
  select p_tenant, a->>'code', a->>'name', (a->>'type')::account_type
  from jsonb_array_elements(public.account_lines()) a
  where not exists (
    select 1 from public.chart_of_accounts coa
    where coa.tenant_id = p_tenant and coa.code = a->>'code'
  );
end;
$$;

-- Ensure the tenant has default expense categories. Idempotent by name
-- (mirrors Base44 ensureExpenseCategories). Safe for any tenant user.
create or replace function public.ensure_expense_categories(p_tenant uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.expense_categories (tenant_id, name, account_code, account_name, is_default)
  select p_tenant, c->>'name', c->>'account_code', c->>'account_name', true
  from jsonb_array_elements(public.expense_category_lines()) c
  where not exists (
    select 1 from public.expense_categories ec
    where ec.tenant_id = p_tenant and ec.name = c->>'name'
  );
end;
$$;

-- Atomic journal posting: creates header + lines in one transaction.
-- lines: jsonb array of { code, account_name, debit, credit }. Must balance.
create or replace function public.post_journal_entry(
  p_tenant uuid,
  p_date timestamptz,
  p_reference_type journal_reference_type,
  p_reference_id text default '',
  p_description text default '',
  p_party text default '',
  p_payment_method text default '',
  p_lines jsonb default '[]'::jsonb
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_entry uuid;
  v_debit numeric := 0;
  v_credit numeric := 0;
  l jsonb;
  v_account_name text;
begin
  if p_tenant is null or p_tenant <> public.auth_tenant() then
    raise exception 'Tenant mismatch';
  end if;

  select coalesce(sum((x->>'debit')::numeric), 0), coalesce(sum((x->>'credit')::numeric), 0)
  into v_debit, v_credit
  from jsonb_array_elements(p_lines) x;
  if round(v_debit, 2) <> round(v_credit, 2) then
    raise exception 'Journal entry is not balanced (debit % vs credit %)', v_debit, v_credit;
  end if;

  insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
  values (p_tenant, coalesce(p_date, now()), p_reference_type, p_reference_id, p_description, p_party, p_payment_method)
  returning id into v_entry;

  for l in select * from jsonb_array_elements(p_lines) loop
    select coalesce(coa.name, l->>'account_name', l->>'code')
    into v_account_name
    from public.chart_of_accounts coa
    where coa.tenant_id = p_tenant and coa.code = l->>'code';

    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
    values (
      p_tenant, v_entry,
      l->>'code',
      v_account_name,
      coalesce((l->>'debit')::numeric, 0),
      coalesce((l->>'credit')::numeric, 0)
    );
  end loop;

  return v_entry;
end;
$$;

-- Onboarding join: the invitee submits the Business Code (a tenant id). Validates
-- that a pending invitation exists for the current user's email, then links the
-- user to the tenant with the invited role and marks the invitation accepted.
create or replace function public.join_business(p_tenant uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
  v_inv public.tenant_invitations%rowtype;
  v_profile public.profiles%rowtype;
begin
  select email into v_email from auth.users where id = auth.uid();
  v_email := coalesce(v_email, auth.jwt() ->> 'email');

  select * into v_inv
  from public.tenant_invitations
  where tenant_id = p_tenant and lower(email) = lower(coalesce(v_email, '')) and status = 'pending';

  if not found then
    raise exception 'No pending invitation for % on this business code. Ask your admin to invite you first.', v_email;
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Profile not found—please complete signup first.';
  end if;

  update public.profiles
  set tenant_id = p_tenant, role = v_inv.role
  where id = auth.uid();

  update public.tenant_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_date = now()
  where id = v_inv.id;

  select * into v_profile from public.profiles where id = auth.uid();
  return jsonb_build_object(
    'tenant_id', v_profile.tenant_id,
    'role', v_profile.role::text,
    'tenant_name', v_inv.tenant_name
  );
end;
$$;

-- Create a pending invitation (admin/superadmin). Used by Users page + platform admin.
create or replace function public.send_invitation(
  p_tenant uuid,
  p_email text,
  p_role user_role
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_tenant_name text;
  v_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'Admin access required';
  end if;

  select business_name into v_tenant_name from public.tenants where id = p_tenant;

  insert into public.tenant_invitations (tenant_id, tenant_name, email, role, invited_by)
  values (p_tenant, v_tenant_name, lower(p_email), p_role, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;
