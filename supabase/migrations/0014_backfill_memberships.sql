-- ============================================================================
-- Libreta — backfill memberships for pre-existing profiles.
--
-- The sync trigger only records memberships when profiles are inserted/updated,
-- so accounts created before multi-tenancy have NO membership for their current
-- tenant and would never see the business switcher. Record a membership for
-- every profile that already has an active tenant (idempotent).
-- ============================================================================

insert into public.memberships (user_id, tenant_id, role)
select id, tenant_id, role
from public.profiles
where tenant_id is not null
on conflict (user_id, tenant_id)
do update set role = excluded.role, updated_at = now();