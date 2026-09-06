-- ============================================================================
-- Libreta by BLink — Manual restock atomic RPC
-- Inventory "Restock" modal path. Updates product stock with weighted-average
-- cost, inserts a product_cost_history audit record + stock movement, and posts
-- the journal entry — all in one transaction so a failure never half-applies.
-- ============================================================================

-- p_product_id: product to restock
-- p_quantity:   quantity received
-- p_unit_cost:  actual unit cost entered in the modal
-- p_supplier_id / p_supplier_name: optional selected supplier
-- p_paid:       COD (true) or on-account (false)
-- p_recorded_by: user label
create or replace function public.restock_goods(
  p_tenant uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_supplier_id uuid default null,
  p_supplier_name text default '',
  p_paid boolean default true,
  p_recorded_by text default 'Admin'
)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_supplier public.suppliers%rowtype;
  v_qty numeric;
  v_cost numeric;
  v_new_avg numeric;
  v_gross numeric;
begin
  if not public.auth_is_admin() then
    raise exception 'Admin access required to restock';
  end if;

  v_qty := coalesce(p_quantity, 0);
  v_cost := coalesce(p_unit_cost, 0);
  if v_qty <= 0 then raise exception 'Enter a quantity to restock'; end if;
  if v_cost < 0 then raise exception 'Enter a valid unit cost'; end if;

  select * into v_product from public.products
  where id = p_product_id and tenant_id = p_tenant;
  if not found then raise exception 'Product not found'; end if;

  -- Weighted-average cost (same formula as receive_goods)
  v_new_avg := ((coalesce(v_product.stock_quantity,0) * coalesce(v_product.cost_price,0)) + (v_qty * v_cost))
               / (coalesce(v_product.stock_quantity,0) + v_qty);
  v_gross := v_qty * v_cost;

  update public.products
  set stock_quantity = coalesce(v_product.stock_quantity,0) + v_qty,
      cost_price = round(v_new_avg, 4)
  where id = v_product.id and tenant_id = p_tenant;

  insert into public.product_cost_history (
    tenant_id, product_id, product_name, date, previous_average_cost,
    new_average_cost, quantity_received, actual_unit_cost
  ) values (
    p_tenant, v_product.id, v_product.name, now(), v_product.cost_price,
    round(v_new_avg, 4), v_qty, v_cost
  );

  -- Resolve supplier for the movement (supplier_id may be null for free text)
  if p_supplier_id is not null then
    select * into v_supplier from public.suppliers
    where id = p_supplier_id and tenant_id = p_tenant;
    if not found then
      p_supplier_id := null; p_supplier_name := '';
    end if;
  end if;

  insert into public.stock_movements (
    tenant_id, product_id, product_name, quantity, direction, reason,
    recorded_by, supplier_id, supplier_name, paid, purchase_cost
  ) values (
    p_tenant, v_product.id, v_product.name, v_qty, 'in', 'restock',
    coalesce(btrim(p_recorded_by), 'Admin'), p_supplier_id,
    coalesce(btrim(p_supplier_name), ''), p_paid, v_gross
  );

  -- Journal entry: Inventory Asset (Dr) against Cash / Accounts Payable (Cr)
  perform public.post_journal_entry(
    p_tenant, now(), 'purchase', v_product.id::text,
    'Restock ' || v_product.name,
    coalesce(btrim(p_supplier_name), v_product.name),
    case when p_paid then 'Cash' else 'On Account' end,
    jsonb_build_array(
      jsonb_build_object('code', '1200', 'account_name', 'Inventory Asset', 'debit', round(v_gross, 2), 'credit', 0),
      jsonb_build_object('code', case when p_paid then '1000' else '2000' end,
        'account_name', case when p_paid then 'Cash' else 'Accounts Payable' end,
        'debit', 0, 'credit', round(v_gross, 2))
    )
  );

  return round(v_new_avg, 4);
end;
$$;
