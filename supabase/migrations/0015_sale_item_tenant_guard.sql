-- ============================================================================
-- Libreta — hard guard against cross-store sale items.
--
-- The POS cart lives in client state and can survive a business switch (React
-- reconciles the mounted POS element by type). If a stale cart were ever
-- checked out under a different store, this trigger rejects the write: every
-- sale_item's product must belong to the SAME tenant as the item itself.
-- ============================================================================

create or replace function public.prevent_cross_tenant_sale_item()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product_tenant uuid;
begin
  if new.product_id is not null then
    select tenant_id into v_product_tenant
    from public.products
    where id = new.product_id;

    if v_product_tenant is null or v_product_tenant <> new.tenant_id then
      raise exception 'Product % does not belong to this business. Cross-store sales are not allowed.', new.product_id
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_cross_tenant_sale_item on public.sale_items;

create trigger prevent_cross_tenant_sale_item
  before insert on public.sale_items
  for each row execute function public.prevent_cross_tenant_sale_item();