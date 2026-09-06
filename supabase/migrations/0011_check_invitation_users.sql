-- ============================================================================
-- Libreta — broaden check_invitation_exists for registered users.
--
-- 0010 gated magic links strictly on tenant_invitations, but accounts created
-- before the invite system (and the demo admin) have no invitation row yet.
-- Treat any existing auth user as invited: if they already have an account the
-- admin/superadmin put them there. Unknown, never-invited emails stay blocked.
-- ============================================================================

create or replace function public.check_invitation_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tenant_invitations where email = lower(p_email)
  ) or exists (
    select 1 from auth.users where email = lower(p_email)
  );
$$;

revoke all on function public.check_invitation_exists(text) from public;
grant execute on function public.check_invitation_exists(text) to anon, authenticated;