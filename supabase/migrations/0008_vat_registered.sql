-- ============================================================================
-- Libreta by BLink — Separate business VAT registration from pricing mode.
-- Prior to this migration, vat_inclusive was overloaded: businesses that turned
-- it OFF were assumed to be non-VAT (percentage tax), which conflated "how prices
-- are quoted" with "what tax regime the business files under".
--
-- This migration:
--   1. Adds business_settings.vat_registered (the tax-registration flag).
--   2. Backfills existing rows: vat_inclusive=false rows were the old non-VAT
--      signal, so those become vat_registered=false.
--   3. Adds the 2300 Output VAT liability account to the standard chart and to
--      every existing tenant's chart_of_accounts.
--   4. Redefines receive_goods so input VAT is only creditable when the business
--      itself is VAT-registered (previously it depended only on the supplier).
-- ============================================================================

alter table public.business_settings
  add column if not exists vat_registered boolean not null default true;

-- Backfill from the legacy conflation: vat_inclusive=false meant non-VAT.
update public.business_settings
set vat_registered = vat_inclusive
where vat_inclusive is not null;

-- Standard chart of accounts gains the Output VAT liability account.
create or replace function public.account_lines()
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_array(
    jsonb_build_object('code','1000','name','Cash','type','asset'),
    jsonb_build_object('code','1100','name','Accounts Receivable','type','asset'),
    jsonb_build_object('code','1200','name','Inventory Asset','type','asset'),
    jsonb_build_object('code','1300','name','Bank','type','asset'),
    jsonb_build_object('code','1500','name','Input VAT','type','asset'),
    jsonb_build_object('code','2000','name','Accounts Payable','type','liability'),
    jsonb_build_object('code','2300','name','Output VAT','type','liability'),
    jsonb_build_object('code','3000','name','Owner''s Equity','type','equity'),
    jsonb_build_object('code','4000','name','Sales Revenue','type','revenue'),
    jsonb_build_object('code','4100','name','Sales Discount - Senior Citizen/PWD','type','revenue'),
    jsonb_build_object('code','4101','name','Sales Discount - Other','type','revenue'),
    jsonb_build_object('code','5000','name','Cost of Goods Sold','type','expense'),
    jsonb_build_object('code','6000','name','Rent Expense','type','expense'),
    jsonb_build_object('code','6100','name','Utilities Expense','type','expense'),
    jsonb_build_object('code','6200','name','Salaries & Wages Expense','type','expense'),
    jsonb_build_object('code','6300','name','Transportation & Delivery Expense','type','expense'),
    jsonb_build_object('code','6400','name','Repairs & Maintenance Expense','type','expense'),
    jsonb_build_object('code','6500','name','Office Supplies Expense','type','expense'),
    jsonb_build_object('code','6600','name','Professional Fees Expense','type','expense'),
    jsonb_build_object('code','6700','name','Taxes & Licenses Expense','type','expense'),
    jsonb_build_object('code','6800','name','Depreciation Expense','type','expense'),
    jsonb_build_object('code','6900','name','Insurance Expense','type','expense'),
    jsonb_build_object('code','7000','name','Marketing & Advertising Expense','type','expense'),
    jsonb_build_object('code','7100','name','Miscellaneous Expense','type','expense')
  );
$$;

-- Backfill the 2300 account for tenants created before this migration.
-- ensure_chart_of_accounts() only runs on demand, so this guarantees existing
-- tenants get the account even if they never call it again.
insert into public.chart_of_accounts (tenant_id, code, name, type)
select t.id, '2300', 'Output VAT', 'liability'::account_type
from public.tenants t
where not exists (
  select 1 from public.chart_of_accounts coa
  where coa.tenant_id = t.id and coa.code = '2300'
);

-- Receive goods: input VAT is creditable only if the BUSINESS is VAT-registered
-- (and the supplier is VAT-registered and an invoice exists). Non-VAT businesses
-- (percentage-tax payers) cannot claim input VAT at all.
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
  v_business_vat boolean;
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

  -- Only VAT-registered businesses can claim input VAT from their purchases.
  select true into v_business_vat
  from public.business_settings
  where tenant_id = p_tenant and vat_registered = true;
  v_business_vat := coalesce(v_business_vat, false);

  v_paid_now := coalesce((p_options->>'paid_now')::boolean, v_po.payment_terms = 'COD');
  v_has_invoice := btrim(coalesce(p_options->>'invoice_number', '')) <> '';
  v_creditable := v_business_vat and v_supplier.is_vat_registered and v_has_invoice;
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