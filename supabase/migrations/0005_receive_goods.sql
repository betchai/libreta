-- ============================================================================
-- Libreta by BLink — Receive goods atomic RPC (Phase D)
-- Receives against a sent/partially-received PO: updates stock with weighted
-- average cost, inserts a product_cost_history audit record + stock movement,
-- updates line received quantities, AND posts the journal entry — all in one
-- transaction. Client computes value args; this layer guarantees atomicity.
-- ============================================================================

-- receipts: [{ item_id, quantity_received, actual_unit_cost }]
-- options:  { paid_now bool, invoice_number text, over_receipt bool, user text }
create or replace function public.receive_goods(
  p_tenant uuid,
  p_po_id uuid,
  p_receipts jsonb,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_supplier public.suppliers%rowtype;
  r jsonb;
  v_item public.purchase_order_items%rowtype;
  v_product public.products%rowtype;
  v_qty numeric;
  v_remaining numeric;
  v_actual numeric;
  v_new_avg numeric;
  v_gross numeric;
  v_input_vat numeric := 0;
  v_inventory_net numeric;
  v_total_gross numeric := 0;
  v_total_input_vat numeric := 0;
  v_total_net numeric := 0;
  v_creditable boolean;
  v_has_invoice boolean;
  v_paid_now boolean;
  v_threshold numeric;
  v_drift numeric;
  v_warnings jsonb := '[]'::jsonb;
  v_any boolean := false;
  v_all_fully boolean := true;
  v_any_received boolean := false;
  v_new_status text;
begin
  if not public.auth_is_admin() then
    raise exception 'Admin access required to receive goods';
  end if;

  select * into v_po from public.purchase_orders where id = p_po_id and tenant_id = p_tenant;
  if not found then raise exception 'Purchase order not found'; end if;

  select * into v_supplier from public.suppliers where id = v_po.supplier_id and tenant_id = p_tenant;
  if not found then
    v_supplier.id := null; v_supplier.name := v_po.supplier_name; v_supplier.is_vat_registered := false; v_supplier.tin := '';
  end if;

  v_paid_now := coalesce((p_options->>'paid_now')::boolean, v_po.payment_terms = 'COD');
  v_has_invoice := btrim(coalesce(p_options->>'invoice_number', '')) <> '';
  v_creditable := v_supplier.is_vat_registered and v_has_invoice;
  v_threshold := coalesce((p_options->>'cost_threshold')::numeric, 0.15);

  for r in select * from jsonb_array_elements(p_receipts) loop
    select * into v_item from public.purchase_order_items where id = (r->>'item_id')::uuid and tenant_id = p_tenant;
    if not found then continue; end if;

    v_remaining := (coalesce(v_item.quantity_ordered, 0)) - (coalesce(v_item.quantity_received, 0));
    v_qty := coalesce((r->>'quantity_received')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    if v_qty > v_remaining and not coalesce((p_options->>'over_receipt')::boolean, false) then
      raise exception 'Cannot receive % of % — only % remaining', v_qty, v_item.product_name, v_remaining;
    end if;
    v_actual := coalesce((r->>'actual_unit_cost')::numeric, -1);
    if v_actual < 0 then raise exception 'Enter a valid unit cost for %', v_item.product_name; end if;

    select * into v_product from public.products where id = v_item.product_id and tenant_id = p_tenant;
    if not found then raise exception 'Product not found for %', v_item.product_name; end if;

    -- Weighted-average cost
    v_new_avg := ((coalesce(v_product.stock_quantity,0) * coalesce(v_product.cost_price,0)) + (v_qty * v_actual))
                 / (coalesce(v_product.stock_quantity,0) + v_qty);

    if coalesce(v_product.cost_price, 0) > 0 then
      v_drift := abs(v_actual - v_product.cost_price) / v_product.cost_price;
      if v_drift > v_threshold then
        v_warnings := v_warnings || jsonb_build_object(
          'product_name', v_item.product_name,
          'drift', round(v_drift * 100),
          'direction', case when v_actual > v_product.cost_price then 'increased' else 'decreased' end,
          'from', v_product.cost_price, 'to', v_actual
        );
      end if;
    end if;

    update public.products
    set stock_quantity = coalesce(v_product.stock_quantity,0) + v_qty,
        cost_price = round(v_new_avg, 4)
    where id = v_product.id and tenant_id = p_tenant;

    insert into public.product_cost_history (
      tenant_id, product_id, product_name, date, previous_average_cost,
      new_average_cost, quantity_received, actual_unit_cost, triggering_po_id
    ) values (
      p_tenant, v_product.id, v_product.name, now(), v_product.cost_price,
      round(v_new_avg,4), v_qty, v_actual, p_po_id
    );

    v_gross := v_qty * v_actual;
    v_input_vat := case when v_creditable then round(v_gross / 1.12 * 0.12, 2) else 0 end;
    v_inventory_net := v_gross - v_input_vat;

    insert into public.stock_movements (
      tenant_id, product_id, product_name, quantity, direction, reason, reference_id,
      recorded_by, supplier_id, supplier_name, supplier_tin, po_id, paid,
      invoice_or_receipt_number, is_vat_registered_supplier, purchase_cost, input_vat, non_creditable
    ) values (
      p_tenant, v_product.id, v_product.name, v_qty, 'in', 'restock', v_po.id::text,
      coalesce(p_options->>'recorded_by', 'Admin'), v_supplier.id, v_supplier.name, v_supplier.tin,
      p_po_id, v_paid_now, coalesce(p_options->>'invoice_number',''), v_creditable,
      v_gross, v_input_vat, not v_creditable
    );

    update public.purchase_order_items
    set quantity_received = coalesce(v_item.quantity_received,0) + v_qty
    where id = v_item.id and tenant_id = p_tenant;

    v_total_gross := v_total_gross + v_gross;
    v_total_input_vat := v_total_input_vat + v_input_vat;
    v_total_net := v_total_net + v_inventory_net;
    v_any := true;
  end loop;

  if not v_any then raise exception 'Nothing received — enter a quantity for at least one line.'; end if;

  -- Journal entry for the receipt batch
  perform public.post_journal_entry(p_tenant, now(), 'purchase', p_po_id::text,
    'PO ' || v_po.po_number || ' receipt — ' || v_supplier.name,
    v_supplier.name, case when v_paid_now then 'Cash' else 'On Account' end,
    jsonb_build_array(
      jsonb_build_object('code', '1200', 'account_name', 'Inventory Asset', 'debit', round(v_total_net,2), 'credit', 0),
      jsonb_build_object('code', '1500', 'account_name', 'Input VAT', 'debit', round(v_total_input_vat,2), 'credit', 0),
      jsonb_build_object('code', case when v_paid_now then '1000' else '2000' end,
        'account_name', case when v_paid_now then 'Cash' else 'Accounts Payable' end,
        'debit', 0, 'credit', round(v_total_gross,2))
    )
  );

  -- Recompute status
  select count(*) filter (where quantity_received < quantity_ordered) = 0,
         count(*) filter (where quantity_received > 0) > 0
  into v_all_fully, v_any_received
  from public.purchase_order_items where po_id = p_po_id and tenant_id = p_tenant;

  v_new_status := case when v_all_fully then 'fully_received'
                       when v_any_received then 'partially_received'
                       else v_po.status::text end;

  update public.purchase_orders
  set status = v_new_status::po_status,
      paid = case when v_paid_now then v_all_fully else v_po.paid end
  where id = p_po_id and tenant_id = p_tenant;

  return jsonb_build_object('status', v_new_status, 'gross', v_total_gross, 'input_vat', v_total_input_vat, 'inventory_net', v_total_net, 'warnings', v_warnings);
end;
$$;
