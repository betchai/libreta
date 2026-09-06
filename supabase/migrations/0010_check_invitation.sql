-- ============================================================================
-- Libreta — allow the (unauthenticated) login page to verify an email was
-- invited before sending a magic link.
--
-- `tenant_invitations` is the single source of truth for invites sent by an
-- admin (Users page) or a platform admin (business creation). RLS restricts
-- direct reads, so this SECURITY DEFINER helper lets the login page check
-- whether an email was ever invited (pending or already accepted).
-- Security: exposes only a boolean over an exact-match email; safe to grant
-- to anon so the sign-in page can gate magic links.
-- ============================================================================

create or replace function public.check_invitation_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tenant_invitations
    where email = lower(p_email)
  );
$$;

revoke all on function public.check_invitation_exists(text) from public;
grant execute on function public.check_invitation_exists(text) to anon, authenticated;