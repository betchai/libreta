-- Libreta Intelligence Phase 3: AI provider keys + pool rotation.
-- Keys never reach the browser or the DB in plaintext: secrets go to Supabase
-- Vault (AES at rest, Supabase-managed encrypt key); this table keeps only
-- metadata, and every RPC is gated to platform superadmins (or service role,
-- which is what the ask-libreta Edge Function uses).

create extension if not exists "supabase_vault" with schema "vault";

create table if not exists public.ai_provider_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'groq',
  label text not null default '',
  last4 text not null,
  enabled boolean not null default true,
  error_streak int not null default 0,
  cursor_rank int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_provider_keys enable row level security;

drop policy if exists ai_provider_keys_select on public.ai_provider_keys;
create policy ai_provider_keys_select on public.ai_provider_keys
  for select using (public.auth_is_superadmin());

drop policy if exists ai_provider_keys_insert on public.ai_provider_keys;
create policy ai_provider_keys_insert on public.ai_provider_keys
  for insert with check (public.auth_is_superadmin());

drop policy if exists ai_provider_keys_update on public.ai_provider_keys;
create policy ai_provider_keys_update on public.ai_provider_keys
  for update using (public.auth_is_superadmin());

-- Single-row config: provider, model, per-tenant daily question cap, rotation cursor.
create table if not exists public.ai_provider_config (
  id boolean primary key default true check (id),
  provider text not null default 'groq',
  model text not null default 'llama-3.3-70b-versatile',
  daily_question_limit int not null default 60,
  rotation_counter bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_provider_config (id) values (true)
on conflict (id) do nothing;

-- Shared admin gate: platform superadmin session OR service role (Edge Function).
create or replace function public.ai_admin()
returns boolean
language sql stable security definer set search_path = public, vault
as $$
  select public.auth_is_superadmin() or auth.role() = 'service_role';
$$;

create or replace function public.get_ai_config()
returns table (provider text, model text, daily_question_limit int, rotation_counter bigint)
language sql stable security definer set search_path = public, vault
as $$
  select provider, model, daily_question_limit, rotation_counter
  from public.ai_provider_config
  where id and public.ai_admin();
$$;

create or replace function public.list_ai_keys()
returns table (
  id uuid, provider text, label text, last4 text, enabled boolean,
  error_streak int, cursor_rank int, last_used_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public, vault
as $$
  select id, provider, label, last4, enabled, error_streak, cursor_rank, last_used_at, created_at
  from public.ai_provider_keys
  where public.ai_admin()
  order by cursor_rank, created_at;
$$;

create or replace function public.set_ai_config(p_model text default null, p_provider text default null, p_daily_question_limit int default null)
returns boolean
language plpgsql security definer set search_path = public, vault
as $$
begin
  if not public.ai_admin() then return false; end if;
  if not exists (select 1 from public.ai_provider_config where id) then
    insert into public.ai_provider_config (id) values (true);
  end if;
  update public.ai_provider_config set
    provider = coalesce(p_provider, provider),
    model = coalesce(p_model, model),
    daily_question_limit = coalesce(p_daily_question_limit, daily_question_limit),
    updated_at = now();
  return true;
end;
$$;

create or replace function public.add_ai_key(p_label text, p_secret text)
returns uuid
language plpgsql security definer set search_path = public, vault
as $$
declare
  _id uuid;
  _rank int;
begin
  if not public.ai_admin() then raise exception 'not authorized'; end if;
  if p_secret is null or length(p_secret) < 10 then
    raise exception 'invalid ai key';
  end if;
  select coalesce(max(cursor_rank), 0) + 1 into _rank from public.ai_provider_keys;
  insert into public.ai_provider_keys (label, last4, cursor_rank)
  values (coalesce(nullif(p_label, ''), 'Groq key'), right(p_secret, 4), _rank)
  returning id into _id;
  perform vault.create_secret(p_secret, 'ai_key:' || _id::text);
  return _id;
end;
$$;

create or replace function public.set_ai_key_enabled(p_id uuid, p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public, vault
as $$
begin
  if not public.ai_admin() then return false; end if;
  update public.ai_provider_keys set
    enabled = p_enabled,
    error_streak = case when p_enabled then error_streak else 0 end,
    updated_at = now()
  where id = p_id;
  return found;
end;
$$;

-- Round-robin rotation. Optional disable (on 401/429 / manual) then advance the
-- cursor to the next enabled key, which is returned. Used by the Platform Admin
-- card and by the ask-libreta Edge Function on every request.
create or replace function public.rotate_ai_key(p_disable uuid default null)
returns uuid
language plpgsql security definer set search_path = public, vault
as $$
declare
  _next uuid;
  _cnt int;
begin
  if not public.ai_admin() then return null; end if;
  if p_disable is not null then
    update public.ai_provider_keys set enabled = false, updated_at = now()
    where id = p_disable;
  end if;
  select count(*) into _cnt from public.ai_provider_keys k
    cross join public.ai_provider_config c
  where k.enabled and k.provider = c.provider;
  if _cnt = 0 then return null; end if;
  update public.ai_provider_config set rotation_counter = rotation_counter + 1, updated_at = now()
  where id returning rotation_counter into _next; -- placeholder; real pick below
  select k.id into _next
  from public.ai_provider_keys k
  cross join public.ai_provider_config c
  where k.enabled and k.provider = c.provider
  order by ((c.rotation_counter - 1) % _cnt) = k.cursor_rank - 1 desc
  limit 1;
  return _next;
end;
$$;

-- Called after a successful LLM call so the pool knows which key owns the traffic.
create or replace function public.use_ai_key(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public, vault
as $$
begin
  if not public.ai_admin() then return false; end if;
  update public.ai_provider_keys set
    last_used_at = now(),
    error_streak = 0,
    updated_at = now()
  where id = p_id;
  return found;
end;
$$;

-- Called on 401 (revoked) / 429 (rate-limited): streak++ and auto-disable at 3.
create or replace function public.fail_ai_key(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public, vault
as $$
declare
  r int;
begin
  if not public.ai_admin() then return false; end if;
  update public.ai_provider_keys set error_streak = error_streak + 1, updated_at = now()
  where id = p_id returning error_streak into r;
  if r is not null and r >= 3 then
    update public.ai_provider_keys set enabled = false, updated_at = now() where id = p_id;
  end if;
  return true;
end;
$$;

revoke all on function public.ai_admin() from public;
revoke all on function public.get_ai_config() from public;
revoke all on function public.list_ai_keys() from public;
revoke all on function public.set_ai_config(text, text, int) from public;
revoke all on function public.add_ai_key(text, text) from public;
revoke all on function public.set_ai_key_enabled(uuid, boolean) from public;
revoke all on function public.rotate_ai_key(uuid) from public;
revoke all on function public.use_ai_key(uuid) from public;
revoke all on function public.fail_ai_key(uuid) from public;

grant execute on function public.ai_admin() to authenticated;
grant execute on function public.get_ai_config() to authenticated;
grant execute on function public.list_ai_keys() to authenticated;
grant execute on function public.set_ai_config(text, text, int) to authenticated;
grant execute on function public.add_ai_key(text, text) to authenticated;
grant execute on function public.set_ai_key_enabled(uuid, boolean) to authenticated;
grant execute on function public.rotate_ai_key(uuid) to authenticated;
grant execute on function public.use_ai_key(uuid) to authenticated;
grant execute on function public.fail_ai_key(uuid) to authenticated;

-- PostgREST schema-cache reload: new functions must be visible to /rest/v1/rpc.
notify pgrst, 'reload schema';