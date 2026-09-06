-- ============================================================================
-- Libreta — multi-business support (one account, many stores).
--
-- One account can be a member of many tenants (e.g. a solo entrepreneur with a
-- hardware store + sari-sari store + shooting range). The account keeps an
-- ACTIVE tenant on profiles; every tenant-scoped RLS policy (tenant_id =
-- auth_tenant()) and all queries in the app read that active context, so
-- switching businesses is instant and stores stay strictly isolated.
--
-- Memberships:
--   * memberships(user_id, tenant_id, role) unique per pair is the membership
--     ledger. A profile trigger keeps it in sync with the active tenant/role.
--   * switch_business(tenant) validates the membership then flips profiles to
--     that tenant+role, which re-points auth_tenant() for every policy.
--   * tenants SELECT now also grants access to any tenant the user belongs to
--     (required so the business switcher can list store names by membership).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Memberships table
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role user_role not null default 'cashier',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);

create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_memberships_tenant on public.memberships(tenant_id);

-- ---------------------------------------------------------------------------
-- Keep memberships in sync with the active tenant / role on profiles. Any path
-- that sets profiles.tenant_id (signup join, invite join, switch) records or
-- updates a membership so no membership is ever forgotten.
-- ---------------------------------------------------------------------------
create or replace function public.sync_membership()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.tenant_id is not null then
    insert into public.memberships (user_id, tenant_id, role)
    values (new.id, new.tenant_id, new.role)
    on conflict (user_id, tenant_id)
    do update set role = excluded.role, updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists sync_membership_on_profile on public.profiles;
create trigger sync_membership_on_profile
  after insert or update of tenant_id, role on public.profiles
  for each row execute procedure public.sync_membership();

-- ---------------------------------------------------------------------------
-- Switch the account's ACTIVE business. Validates membership first, then
-- re-points the profile (tenant + per-tenant role). Setting p_tenant = null
-- clears the active store (e.g. a superadmin going back to platform view).
-- ---------------------------------------------------------------------------
create or replace function public.switch_business(p_tenant uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_mem public.memberships%rowtype;
begin
  if p_tenant is null then
    update public.profiles set tenant_id = null, role = 'user' where id = auth.uid();
    return;
  end if;

  select * into v_mem
  from public.memberships
  where user_id = auth.uid() and tenant_id = p_tenant;

  if not found then
    raise exception 'You are not a member of this business. Ask your admin to add you first.';
  end if;

  update public.profiles set tenant_id = v_mem.tenant_id, role = v_mem.role where id = auth.uid();
end;
$$;

revoke all on function public.switch_business(uuid) from public;
grant execute on function public.switch_business(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS on memberships: read own memberships; admin/superadmin manage them.
-- ---------------------------------------------------------------------------
alter table public.memberships enable row level security;

drop policy if exists "mem_select_self" on public.memberships;
create policy "mem_select_self" on public.memberships for select to authenticated
  using (user_id = auth.uid() or auth_is_superadmin());

drop policy if exists "mem_insert_admin" on public.memberships;
create policy "mem_insert_admin" on public.memberships for insert to authenticated
  with check (auth_is_superadmin() or is_admin_of(tenant_id));

drop policy if exists "mem_update_admin" on public.memberships;
create policy "mem_update_admin" on public.memberships for update to authenticated
  using (auth_is_superadmin() or is_admin_of(tenant_id))
  with check (auth_is_superadmin() or is_admin_of(tenant_id));

drop policy if exists "mem_delete_admin" on public.memberships;
create policy "mem_delete_admin" on public.memberships for delete to authenticated
  using (auth_is_superadmin() or is_admin_of(tenant_id));

-- ---------------------------------------------------------------------------
-- Tenants: members may read stores they belong to (drives the business
-- switcher). Combines with the existing active-tenant / owner / superadmin rule.
-- ---------------------------------------------------------------------------
drop policy if exists "tenants_read_member" on public.tenants;
create policy "tenants_read_member" on public.tenants for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.tenant_id = tenants.id and m.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- create_business: when the admin email already has an account, also grant the
-- membership immediately (no re-join needed). Invitation still recorded for
-- brand-new accounts.
-- ---------------------------------------------------------------------------
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

    insert into public.memberships (user_id, tenant_id, role)
    select id, v_tenant, p_admin_role
    from public.profiles
    where lower(email) = lower(p_admin_email)
    on conflict (user_id, tenant_id) do update set role = excluded.role;
  end if;

  return v_tenant;
end;
$$;