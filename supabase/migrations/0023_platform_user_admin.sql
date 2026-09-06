-- ============================================================================
-- Libreta — Platform admin user management.
--
-- Granting/revoking platform_role (Platform Owner) from the Platform Admin
-- console is blocked by RLS: profiles_update_admin requires a shared ACTIVE
-- tenant, and profiles_update_self forbids touching platform_role. The
-- prevent_internal_escalation trigger already permits the platform owner to
-- change platform_role — this security-definer RPC provides the matching
-- allowed path for cross-tenant changes.
--
-- Apply via Dashboard > SQL Editor (safe, idempotent).
-- ============================================================================

create or replace function public.set_platform_role(p_user uuid, p_role platform_role)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.auth_is_superadmin() then
    raise exception 'Only the platform owner can change platform roles.';
  end if;

  -- Prevent locking yourself (or a peer) out of the console by accident.
  if p_user = auth.uid() then
    raise exception 'You cannot change your own platform role.';
  end if;

  update public.profiles
  set platform_role = p_role, updated_at = now()
  where id = p_user;

  return found;
end;
$$;

revoke all on function public.set_platform_role(uuid, platform_role) from public;
grant execute on function public.set_platform_role(uuid, platform_role) to authenticated;
