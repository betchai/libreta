-- Analytics: quarter-scoped per-store tax posture (BIR worksheets digest).
-- Mirrors the math of the single-store BIR reports (VatSummaryReport /
-- PercentageTaxReport) but aggregated per tenant and scoped to the caller's
-- memberships, so store admins see only their own stores. Superadmins see all.
--
-- Output VAT comes from sale_items of Completed sales in the quarter;
-- creditable input VAT from restock movements + expenses (non_creditable = false);
-- percentage-tax estimate (3% of gross) is computed for every store but only
-- meaningful for non-VAT ones. Runs as security definer (RLS blocks
-- cross-tenant reads from the client).

create or replace function public.my_tax_snapshot(p_year int, p_quarter int)
returns table (
  id uuid,
  business_name text,
  vat_registered boolean,
  vatable_sales numeric,
  output_vat numeric,
  exempt_sales numeric,
  input_vat numeric,
  net_vat numeric,
  gross_receipts numeric,
  percentage_tax numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      make_date(p_year, (p_quarter - 1) * 3 + 1, 1)::timestamptz as qstart,
      (make_date(p_year, (p_quarter - 1) * 3 + 1, 1) + interval '3 months')::timestamptz as qend
  ),
  output as (
    select si.tenant_id,
           coalesce(sum(si.vatable_sales), 0)::numeric as vatable,
           coalesce(sum(si.output_vat), 0)::numeric as output,
           coalesce(sum(si.vat_exempt_sales), 0)::numeric as exempt
    from sale_items si
    join sales s on s.id = si.sale_id
    cross join bounds b
    where s.status = 'Completed'
      and s.created_date >= b.qstart and s.created_date < b.qend
    group by si.tenant_id
  ),
  purchase_input as (
    select tenant_id,
           coalesce(sum(input_vat), 0)::numeric as input
    from stock_movements, bounds b
    where reason::text = 'restock'
      and non_creditable = false
      and created_at >= b.qstart and created_at < b.qend
    group by tenant_id
  ),
  expense_input as (
    select tenant_id,
           coalesce(sum(input_vat), 0)::numeric as input
    from expenses, bounds b
    where non_creditable = false
      and date >= b.qstart and date < b.qend
    group by tenant_id
  ),
  gross as (
    select tenant_id,
           coalesce(sum(total_amount), 0)::numeric as gross
    from sales, bounds b
    where status = 'Completed'
      and created_date >= b.qstart and created_date < b.qend
    group by tenant_id
  )
  select
    t.id,
    coalesce(t.business_name, ''),
    coalesce(bs.vat_registered, true),
    coalesce(o.vatable, 0)::numeric(14, 2),
    coalesce(o.output, 0)::numeric(14, 2),
    coalesce(o.exempt, 0)::numeric(14, 2),
    (coalesce(pi.input, 0) + coalesce(ei.input, 0))::numeric(14, 2),
    (coalesce(o.output, 0) - coalesce(pi.input, 0) - coalesce(ei.input, 0))::numeric(14, 2),
    coalesce(g.gross, 0)::numeric(14, 2),
    round(coalesce(g.gross, 0) * 0.03, 2)::numeric(14, 2)
  from tenants t
  left join business_settings bs on bs.tenant_id = t.id
  left join output o on o.tenant_id = t.id
  left join purchase_input pi on pi.tenant_id = t.id
  left join expense_input ei on ei.tenant_id = t.id
  left join gross g on g.tenant_id = t.id
  where p_quarter between 1 and 4
    and (public.auth_is_superadmin()
      or exists (
        select 1 from public.memberships m
        where m.tenant_id = t.id and m.user_id = auth.uid()
      ));
$$;

revoke all on function public.my_tax_snapshot(int, int) from public;
grant execute on function public.my_tax_snapshot(int, int) to authenticated;
