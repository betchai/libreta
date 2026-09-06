-- Libreta Intelligence: forecast knobs + superadmin store snapshot.
-- Adds per-tenant demand-forecast / reorder-planning settings and a trusted
-- RPC that lets platform admins see a digest of every store (RLS blocks the
-- anon client from cross-tenant reads, so this runs as security definer and
-- refuses anything that isn't a superadmin).

alter table public.business_settings
  add column if not exists window_days int,
  add column if not exists lead_time_days int,
  add column if not exists safety_stock_days int,
  add column if not exists review_interval_days int;

create or replace function public.admin_store_snapshot()
returns table (
  id uuid,
  business_name text,
  revenue_30d numeric,
  txns_30d bigint,
  sales_pct numeric,
  atv numeric,
  products bigint,
  low_stock bigint,
  outstanding numeric,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select tenant_id,
           coalesce(sum(total_amount), 0)::numeric as rev,
           count(*)::bigint as tx
    from sales
    where status = 'Completed' and created_date >= now() - interval '7 days'
    group by tenant_id
  ),
  prev as (
    select tenant_id, coalesce(sum(total_amount), 0)::numeric as rev
    from sales
    where status = 'Completed'
      and created_date >= now() - interval '14 days'
      and created_date < now() - interval '7 days'
    group by tenant_id
  ),
  rev30 as (
    select tenant_id,
           coalesce(sum(total_amount), 0)::numeric as rev,
           count(*)::bigint as tx
    from sales
    where status = 'Completed' and created_date >= now() - interval '30 days'
    group by tenant_id
  ),
  cust_bal as (
    select customer_id,
           sum(case
             when type = 'payment' then -abs(coalesce(amount, 0))
             else coalesce(amount, 0)
           end)::numeric as bal
    from customer_ledger_entries
    group by customer_id
  ),
  outstanding as (
    select c.tenant_id, coalesce(sum(greatest(cb.bal, 0)), 0)::numeric as total
    from customers c
    left join cust_bal cb on cb.customer_id = c.id
    group by c.tenant_id
  ),
  plist as (
    select tenant_id,
           count(*)::bigint as pc,
           count(*) filter (where stock_quantity <= coalesce(low_stock_threshold, 0))::bigint as ls
    from products
    group by tenant_id
  )
  select
    t.id,
    coalesce(t.business_name, ''),
    coalesce(r30.rev, 0)::numeric(14, 2),
    coalesce(r30.tx, 0)::bigint,
    case
      when coalesce(p.rev, 0) > 0 then round(((coalesce(r.rev, 0) - p.rev) / p.rev) * 100, 2)
      when coalesce(r.rev, 0) > 0 then 100
      else 0
    end,
    case
      when coalesce(r.tx, 0) > 0 then round(coalesce(r.rev, 0) / r.tx, 2)
      else 0
    end,
    coalesce(pl.pc, 0)::bigint,
    coalesce(pl.ls, 0)::bigint,
    coalesce(o.total, 0)::numeric(14, 2),
    case
      when coalesce(r.rev, 0) > 0 and
           round(((coalesce(r.rev, 0) - coalesce(p.rev, 0)) / nullif(p.rev, 0)) * 100, 2) <= -25 then 'critical'
      when coalesce(pl.ls, 0) > 0 then 'attention'
      when coalesce(r.rev, 0) > 0 and
           round(((coalesce(r.rev, 0) - coalesce(p.rev, 0)) / nullif(p.rev, 0)) * 100, 2) <= -10 then 'attention'
      else 'good'
    end
  from tenants t
  left join recent r on r.tenant_id = t.id
  left join prev p on p.tenant_id = t.id
  left join rev30 r30 on r30.tenant_id = t.id
  left join outstanding o on o.tenant_id = t.id
  left join plist pl on pl.tenant_id = t.id
  where public.auth_is_superadmin();
$$;

revoke all on function public.admin_store_snapshot() from public;
grant execute on function public.admin_store_snapshot() to authenticated;