-- ============================================================================
-- Libreta by Blink — Fix restock_goods: Add VAT handling (Input VAT)
-- Matches receive_goods logic: Input VAT creditable only when:
--   1. Business is VAT-registered
--   2. Supplier is VAT-registered
--   3. Invoice number provided
-- ============================================================================

create or replace function public.restock_goods(
  p_tenant uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_supplier_id uuid default null,
  p_supplier_name text default '',
  p_paid boolean default true,
  p_recorded_by text default 'Admin',
  -- NEW VAT parameters
  p_invoice_number text default '',
  p_is_vat_registered_supplier boolean default false,
  p_non_creditable boolean default false
)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_supplier public.suppliers%rowtype;
  v_business_vat boolean;
  v_qty numeric;
  v_cost numeric;
  v_new_avg numeric;
  v_gross numeric;
  v_input_vat numeric := 0;
  v_inventory_net numeric;
  v_creditable boolean;
  v_has_invoice boolean;
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

  -- Check if business is VAT-registered
  select vat_registered into v_business_vat
  from public.business_settings
  where tenant_id = p_tenant;
  v_business_vat := coalesce(v_business_vat, true);

  -- Weighted-average cost
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

  -- Resolve supplier
  if p_supplier_id is not null then
    select * into v_supplier from public.suppliers
    where id = p_supplier_id and tenant_id = p_tenant;
    if not found then
      p_supplier_id := null; p_supplier_name := '';
      p_is_vat_registered_supplier := false;
    end if;
  end if;

  -- Determine if Input VAT is creditable (same logic as receive_goods)
  v_has_invoice := btrim(coalesce(p_invoice_number, '')) <> '';
  v_creditable := v_business_vat and p_is_vat_registered_supplier and v_has_invoice and not p_non_creditable;
  v_input_vat := case when v_creditable then round(v_gross / 1.12 * 0.12, 2) else 0 end;
  v_inventory_net := v_gross - v_input_vat;

  insert into public.stock_movements (
    tenant_id, product_id, product_name, quantity, direction, reason,
    reference_id, recorded_by, supplier_id, supplier_name, supplier_tin,
    po_id, paid, invoice_or_receipt_number, is_vat_registered_supplier,
    purchase_cost, input_vat, non_creditable
  ) values (
    p_tenant, v_product.id, v_product.name, v_qty, 'in', 'restock',
    null, -- no PO reference for manual restock
    coalesce(btrim(p_recorded_by), 'Admin'), p_supplier_id,
    coalesce(btrim(p_supplier_name), ''), null, -- supplier_tin
    null, -- no PO
    p_paid, coalesce(btrim(p_invoice_number), ''), v_creditable,
    v_gross, v_input_vat, not v_creditable
  );

  -- Journal entry with Input VAT line
  perform public.post_journal_entry(
    p_tenant, now(), 'purchase', v_product.id::text,
    'Restock ' || v_product.name,
    coalesce(btrim(p_supplier_name), v_product.name),
    case when p_paid then 'Cash' else 'On Account' end,
    jsonb_build_array(
      jsonb_build_object('code', '1200', 'account_name', 'Inventory Asset', 'debit', round(v_inventory_net, 2), 'credit', 0),
      jsonb_build_object('code', '1500', 'account_name', 'Input VAT', 'debit', round(v_input_vat, 2), 'credit', 0),
      jsonb_build_object('code', case when p_paid then '1000' else '2000' end,
        'account_name', case when p_paid then 'Cash' else 'Accounts Payable' end,
        'debit', 0, 'credit', round(v_gross, 2))
    )
  );

  return round(v_new_avg, 4);
end;
$$;

revoke all on function public.restock_goods(uuid, uuid, numeric, numeric, uuid, text, boolean, text, text, boolean, boolean) from public;
grant execute on function public.restock_goods(uuid, uuid, numeric, numeric, uuid, text, boolean, text, text, boolean, boolean) to authenticated;