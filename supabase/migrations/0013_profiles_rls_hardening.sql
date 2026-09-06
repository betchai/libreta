-- ============================================================================
-- Libreta — profile RLS hardening for multi-tenancy.
--
-- Directly setting your own tenant_id/role/platform_role via REST is now the
-- ONLY realistic escalation path (every policy derives context from
-- profiles.tenant_id), so lock it down:
--   * Self updates may NOT change tenant_id, role or platform_role. Switching
--     businesses goes exclusively through switch_business() (membership-checked).
--   * Admins may edit co-workers inside their ACTIVE tenant (Users page role
--     changes were previously blocked by RLS — now they work).
--   * A trigger prevents anyone but the platform owner from changing
--     platform_role, closing admin->superadmin escalation.
-- ============================================================================

create or replace function public.prevent_internal_escalation()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.platform_role is distinct from old.platform_role
     and not public.auth_is_superadmin() then
    raise exception 'Only the platform owner can change platform roles.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_profile_escalation on public.profiles;
create trigger prevent_profile_escalation
  before update of platform_role on public.profiles
  for each row execute procedure public.prevent_internal_escalation();

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and tenant_id is not distinct from (select p.tenant_id from public.profiles p where p.id = auth.uid())
    and role is not distinct from (select p.role from public.profiles p where p.id = auth.uid())
    and platform_role is not distinct from (select p.platform_role from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update to authenticated
  using (id <> auth.uid() and auth_is_admin() and tenant_id = auth_tenant())
  with check (id <> auth.uid() and auth_is_admin() and tenant_id = auth_tenant());