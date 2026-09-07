-- ============================================================================
-- Libreta by Blink - Seed "Imprenta Services" (Philippine print shop)
-- Creates the tenant, links betchay.canyas@gmail.com as its admin, and seeds a
-- full printing-services business so every module (POS, inventory, BIR 2550/2551,
-- expenses, POs, AR aging) has realistic data from Jan 2026 to today.
--
-- Business profile: VAT-registered, VAT-inclusive prices. Core products:
--   * Bond paper (A4 / Short / Long) + fasteners (binder clips, paper clips,
--     staple wire, brass fasteners)   [physical, stocked]
--   * Thesis printing & binding, spiral/velo binding, BIR receipts printing,
--     calendars, notebooks, journals, workbooks, B&W/color print, photocopy,
--     lamination, layout design, tarpaulin   [services, no stock]
--
-- SAFE TO RE-RUN: tenant/settings/admin linkage are idempotent; the sales/
-- PO/expense seeding is guarded so a second run does not duplicate data.
-- Existing tenants are never touched.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: seed one sale with full VAT / stock / journal / ledger handling
-- (mirrors processSale + post_sale). Items: [{id, qty, price}]
-- ---------------------------------------------------------------------------
create or replace function public.libreta_seed_sale(
  p_tenant uuid,
  p_date timestamptz,
  p_customer_id uuid default null,
  p_customer_name text default '',
  p_method payment_method default 'Cash',
  p_cash_method cash_method default null,
  p_cashier text default 'Betchay',
  p_items jsonb default '[]'::jsonb
)
returns void language plpgsql set search_path = public
as $$
declare
  it jsonb;
  v_name text;
  v_cost numeric;
  v_qty numeric;
  v_price numeric;
  v_subtotal numeric;
  v_vatable numeric;
  v_vat numeric;
  v_cogs numeric := 0;
  v_total numeric := 0;
  v_vat_total numeric := 0;
  v_rev_total numeric := 0;
  v_cash numeric := 0;
  v_vcredit numeric := 0;
  v_je uuid;
  v_sale uuid;
  v_balance numeric;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty   := (it->>'qty')::numeric;
    v_price := (it->>'price')::numeric;
    select name, cost_price into v_name, v_cost
    from public.products where id = (it->>'id')::uuid and tenant_id = p_tenant;
    if not found then continue; end if;

    v_subtotal := round(v_qty * v_price, 2);
    v_vatable  := round(v_subtotal / 1.12, 2);
    v_vat      := round(v_subtotal - v_vatable, 2);

    v_total := v_total + v_subtotal;
    v_vat_total := v_vat_total + v_vat;
    v_rev_total := v_rev_total + v_vatable;
    v_cogs := v_cogs + round(v_qty * v_cost, 2);
  end loop;

  if v_total <= 0 then return; end if;

  if p_method = 'Utang' then
    v_vcredit := v_total;
  elsif p_method = 'Split' then
    v_vcredit := round(v_total / 2, 2);
  end if;
  v_cash := round(v_total - v_vcredit, 2);

  insert into public.sales (
    tenant_id, total_amount, gross_amount, total_discount_amount,
    sc_pwd_discount_amount, other_discount_amount, payment_method, cash_method,
    cashier_name, customer_id, customer_name, credit_amount, cash_amount,
    status, created_date, created_at
  ) values (
    p_tenant, v_total, v_total, 0, 0, 0, p_method,
    p_cash_method, p_cashier, p_customer_id, coalesce(p_customer_name, ''),
    v_vcredit, v_cash, 'Completed', p_date, p_date
  ) returning id into v_sale;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty   := (it->>'qty')::numeric;
    v_price := (it->>'price')::numeric;
    select name, cost_price into v_name, v_cost
    from public.products where id = (it->>'id')::uuid and tenant_id = p_tenant;
    if not found then continue; end if;

    v_subtotal := round(v_qty * v_price, 2);
    v_vatable  := round(v_subtotal / 1.12, 2);
    v_vat      := round(v_subtotal - v_vatable, 2);

    insert into public.sale_items (
      tenant_id, sale_id, product_id, product_name, quantity, unit_sold,
      price_at_sale, cost_price_at_sale, subtotal, discount_type, discount_value,
      discount_amount, net_amount, vatable_sales, output_vat, vat_exempt_sales,
      created_at
    ) values (
      p_tenant, v_sale, (it->>'id')::uuid, v_name, v_qty, 'base',
      v_price, v_cost, v_subtotal, 'none', 0, 0, v_subtotal,
      v_vatable, v_vat, 0, p_date
    );

    update public.products
    set stock_quantity = greatest(0, stock_quantity - v_qty)
    where id = (it->>'id')::uuid and tenant_id = p_tenant;

    insert into public.stock_movements (
      tenant_id, product_id, product_name, quantity, direction, reason,
      reference_id, recorded_by, created_at
    ) values (
      p_tenant, (it->>'id')::uuid, v_name, v_qty, 'out', 'sale',
      v_sale::text, p_cashier, p_date
    );
  end loop;

  insert into public.journal_entries (
    tenant_id, date, reference_type, reference_id, description, party, payment_method
  ) values (
    p_tenant, p_date, 'sale', v_sale::text, 'Sale ' || left(v_sale::text, 8),
    coalesce(p_customer_name, p_cashier), p_method::text
  ) returning id into v_je;

  if v_cash > 0 then
    if p_cash_method = 'Gcash'::cash_method or p_cash_method = 'Card'::cash_method then
      insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
      values (p_tenant, v_je, '1300', 'Bank', v_cash, 0);
    else
      insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
      values (p_tenant, v_je, '1000', 'Cash', v_cash, 0);
    end if;
  end if;
  if v_vcredit > 0 then
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
    values (p_tenant, v_je, '1100', 'Accounts Receivable', v_vcredit, 0);
  end if;
  if v_rev_total > 0 then
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
    values (p_tenant, v_je, '4000', 'Sales Revenue', 0, v_rev_total);
  end if;
  if v_vat_total > 0 then
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
    values (p_tenant, v_je, '2300', 'Output VAT', 0, v_vat_total);
  end if;
  if v_cogs > 0 then
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
    values (p_tenant, v_je, '5000', 'Cost of Goods Sold', v_cogs, 0);
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
    values (p_tenant, v_je, '1200', 'Inventory Asset', 0, v_cogs);
  end if;

  if v_vcredit > 0 and p_customer_id is not null then
    select coalesce(sum(case when type = 'payment' then -amount else amount end), 0)
    into v_balance from public.customer_ledger_entries
    where customer_id = p_customer_id and tenant_id = p_tenant;

    insert into public.customer_ledger_entries (
      tenant_id, customer_id, customer_name, date, type, amount, reference_type,
      reference_id, running_balance, recorded_by, note, created_at
    ) values (
      p_tenant, p_customer_id, coalesce(p_customer_name, ''), p_date, 'charge',
      v_vcredit, 'sale', v_sale::text, v_balance + v_vcredit, p_cashier,
      'Sale on account', p_date
    );
  end if;
end;
$$;

-- ============================================================================
-- MAIN SEED (idempotent; data sections guarded)
-- ============================================================================
do $$
declare
  v_tenant uuid;
  v_user uuid;
  rec jsonb;
  v_pid uuid;
  v_pname text;
  v_je uuid;
  v_po uuid;
  v_sup_id uuid;
  v_sup_name text;
  v_sup_tin text;
  v_sup_vat boolean;
  v_prev_cost numeric;
  v_cur_stock numeric;
  v_new_avg numeric;
  v_qty numeric;
  v_cost numeric;
  v_gross numeric;
  v_input_vat numeric;
  v_net numeric;
  ln jsonb;
begin

  -- =========================================================================
  -- 1. TENANT + ADMIN
  -- =========================================================================
  select id into v_tenant from public.tenants where business_name = 'Imprenta Services';
  if v_tenant is null then
    insert into public.tenants (business_name, business_type, status)
    values ('Imprenta Services', 'Printing & Copying Services', 'active')
    returning id into v_tenant;
  end if;

  -- Business settings (VAT-registered, inclusive)
  insert into public.business_settings (
    tenant_id, business_name, business_type, currency, currency_symbol,
    categories, units, low_stock_default, default_markup_percentage,
    vat_inclusive, vat_rate, vat_registered, enforce_credit_limit
  )
  select v_tenant, 'Imprenta Services', 'Printing & Copying Services',
    'PHP', '₱',
    '["Printing Services","Photocopy & Copying","Bond Paper","Fasteners","Binding","Custom Products"]'::jsonb,
    '["Page","Ream","Piece","Set","Box","Pack","Book","Copy","Job","sqft"]'::jsonb,
    10, 30, true, 0.12, true, false
  where not exists (select 1 from public.business_settings where tenant_id = v_tenant);

  -- Chart of accounts + expense categories
  insert into public.chart_of_accounts (tenant_id, code, name, type)
  select v_tenant, a->>'code', a->>'name', (a->>'type')::account_type
  from jsonb_array_elements(public.account_lines()) a
  where not exists (
    select 1 from public.chart_of_accounts coa
    where coa.tenant_id = v_tenant and coa.code = a->>'code'
  );
  insert into public.expense_categories (tenant_id, name, account_code, account_name, is_default)
  select v_tenant, c->>'name', c->>'account_code', c->>'account_name', true
  from jsonb_array_elements(public.expense_category_lines()) c
  where not exists (
    select 1 from public.expense_categories ec
    where ec.tenant_id = v_tenant and ec.name = c->>'name'
  );

  -- Link betchay.canyas@gmail.com as admin of this business.
  -- If the account already exists: promote + record membership + accepted invite.
  -- If not: record a pending invitation so she joins as admin on signup.
  select u.id into v_user
  from auth.users u
  where lower(coalesce(u.email, '')) = lower('betchay.canyas@gmail.com');

  if v_user is not null then
    update public.profiles
    set tenant_id = v_tenant, role = 'admin'
    where id = v_user;

    insert into public.memberships (user_id, tenant_id, role)
    values (v_user, v_tenant, 'admin')
    on conflict (user_id, tenant_id) do update set role = excluded.role, updated_at = now();

    insert into public.tenant_invitations (tenant_id, tenant_name, email, role, status, invited_by, accepted_by, accepted_date)
    values (v_tenant, 'Imprenta Services', 'betchay.canyas@gmail.com', 'admin', 'accepted', v_user, v_user, now())
    on conflict (tenant_id, email) do update set status = 'accepted', role = 'admin',
      accepted_by = v_user, accepted_date = now();
  else
    insert into public.tenant_invitations (tenant_id, tenant_name, email, role, status)
    values (v_tenant, 'Imprenta Services', 'betchay.canyas@gmail.com', 'admin', 'pending')
    on conflict (tenant_id, email) do nothing;
  end if;

  -- Guard: if this tenant was already seeded, stop here (settings/admin are
  -- idempotent; data seeding must not duplicate).
  if exists (select 1 from public.sales where tenant_id = v_tenant) then
    raise notice 'Imprenta Services already has sales - skipping data seeding.';
    return;
  end if;

  -- =========================================================================
  -- 2. PRODUCTS  [name, sku, category, base_unit, cost, price, qty, low, vat_exempt]
  -- =========================================================================
  for rec in select jsonb_array_elements('[
    {"name":"A4 Bond Paper 70gsm (Ream)","sku":"BND-A4-70","cat":"Bond Paper","unit":"Ream","cost":195,"price":250,"qty":0,"low":10,"vat":false},
    {"name":"Short Bond Paper 8.5x11 (Ream)","sku":"BND-SHORT","cat":"Bond Paper","unit":"Ream","cost":190,"price":240,"qty":0,"low":10,"vat":false},
    {"name":"Long Bond Paper 8.5x13 (Ream)","sku":"BND-LONG","cat":"Bond Paper","unit":"Ream","cost":210,"price":265,"qty":0,"low":10,"vat":false},
    {"name":"Binder Clips, Set of 12","sku":"FST-BNDCLP","cat":"Fasteners","unit":"Set","cost":15,"price":35,"qty":0,"low":10,"vat":false},
    {"name":"Paper Clips, Box of 100","sku":"FST-PAPCLP","cat":"Fasteners","unit":"Box","cost":10,"price":25,"qty":0,"low":10,"vat":false},
    {"name":"Staple Wire Box","sku":"FST-STAPLE","cat":"Fasteners","unit":"Box","cost":28,"price":55,"qty":0,"low":10,"vat":false},
    {"name":"Brass Fasteners, Pack of 50","sku":"FST-BRASS","cat":"Fasteners","unit":"Pack","cost":20,"price":40,"qty":0,"low":10,"vat":false},
    {"name":"Thesis Printing & Binding","sku":"SRV-THESIS","cat":"Printing Services","unit":"Copy","cost":350,"price":700,"qty":0,"low":0,"vat":false},
    {"name":"Spiral Binding","sku":"SRV-SPIRAL","cat":"Binding","unit":"Copy","cost":25,"price":60,"qty":0,"low":0,"vat":false},
    {"name":"Velo Binding","sku":"SRV-VELO","cat":"Binding","unit":"Copy","cost":35,"price":90,"qty":0,"low":0,"vat":false},
    {"name":"BIR Receipts Printing (Book of 50)","sku":"SRV-BIR","cat":"Printing Services","unit":"Book","cost":120,"price":300,"qty":0,"low":0,"vat":false},
    {"name":"Calendar Printing (per piece)","sku":"SRV-CAL","cat":"Custom Products","unit":"Copy","cost":60,"price":180,"qty":0,"low":0,"vat":false},
    {"name":"Notebook Printing (per piece)","sku":"SRV-NB","cat":"Custom Products","unit":"Copy","cost":45,"price":130,"qty":0,"low":0,"vat":false},
    {"name":"Journal Printing (per piece)","sku":"SRV-JRNL","cat":"Custom Products","unit":"Copy","cost":55,"price":160,"qty":0,"low":0,"vat":false},
    {"name":"Workbook Printing (per piece)","sku":"SRV-WBK","cat":"Custom Products","unit":"Copy","cost":40,"price":120,"qty":0,"low":0,"vat":false},
    {"name":"Black & White Print (per page)","sku":"SRV-BW","cat":"Photocopy & Copying","unit":"Page","cost":1,"price":5,"qty":0,"low":0,"vat":false},
    {"name":"Color Print (per page)","sku":"SRV-CLP","cat":"Photocopy & Copying","unit":"Page","cost":6,"price":15,"qty":0,"low":0,"vat":false},
    {"name":"Photocopy B&W (per page)","sku":"SRV-PCBW","cat":"Photocopy & Copying","unit":"Page","cost":0.5,"price":2,"qty":0,"low":0,"vat":false},
    {"name":"Photocopy Color (per page)","sku":"SRV-PCC","cat":"Photocopy & Copying","unit":"Page","cost":6,"price":15,"qty":0,"low":0,"vat":false},
    {"name":"Lamination A4 (per page)","sku":"SRV-LAM","cat":"Printing Services","unit":"Page","cost":5,"price":25,"qty":0,"low":0,"vat":false},
    {"name":"Layout & Design Service","sku":"SRV-DSGN","cat":"Custom Products","unit":"Job","cost":100,"price":350,"qty":0,"low":0,"vat":false},
    {"name":"Tarpaulin Printing (per sq ft)","sku":"SRV-TARP","cat":"Custom Products","unit":"sqft","cost":90,"price":250,"qty":0,"low":0,"vat":false}
  ]'::jsonb) loop
    if not exists (
      select 1 from public.products where tenant_id = v_tenant and lower(name) = lower(rec->>'name')
    ) then
      insert into public.products (
        tenant_id, name, sku, category, base_unit, base_price, cost_price,
        markup_percentage, has_fractions, stock_quantity, low_stock_threshold,
        vat_exempt, sc_pwd_discount_eligible
      ) values (
        v_tenant, rec->>'name', rec->>'sku', rec->>'cat', rec->>'unit',
        (rec->>'price')::numeric, (rec->>'cost')::numeric, 30, false,
        (rec->>'qty')::numeric, (rec->>'low')::numeric,
        (rec->>'vat')::boolean, true
      );
    end if;
  end loop;

  -- =========================================================================
  -- 3. SUPPLIERS
  -- =========================================================================
  for rec in select jsonb_array_elements('[
    {"name":"Paper One Trading Co.","person":"Lito Reyes","phone":"0917-555-0101","email":"sales@paperone.ph","addr":"Blk 12 Warehouse, Taytay Rizal","tin":"210-456-789-000","vat":true,"terms":"Net 15"},
    {"name":"Ink & Binding Depot Phils.","person":"Dennis Cruz","phone":"0918-555-0202","email":"orders@inkbinding.ph","addr":"#89 Kalentong, Mandaluyong","tin":"300-222-111-999","vat":true,"terms":"COD"},
    {"name":"National Office Supply Corp.","person":"Grace Tan","phone":"0919-555-0303","email":"b2b@nosc.ph","addr":"7th Floor, Sta. Mesa Blvd, Manila","tin":"000-555-444-333","vat":true,"terms":"Net 30"},
    {"name":"Divisoria Paper & Printing Wholesale","person":"Roger Lim","phone":"0920-555-0404","email":"rg@divisoriappw.ph","addr":"Stall 204, Tutuban Center, Manila","tin":"222-111-000-888","vat":false,"terms":"COD"}
  ]'::jsonb) loop
    if not exists (select 1 from public.suppliers where tenant_id = v_tenant and lower(name) = lower(rec->>'name')) then
      insert into public.suppliers (
        tenant_id, name, contact_person, phone, email, address, tin,
        is_vat_registered, payment_terms, is_active
      ) values (
        v_tenant, rec->>'name', rec->>'person', rec->>'phone', rec->>'email',
        rec->>'addr', rec->>'tin', (rec->>'vat')::boolean, rec->>'terms', true
      );
    end if;
  end loop;

  -- =========================================================================
  -- 4. CUSTOMERS
  -- =========================================================================
  for rec in select jsonb_array_elements('[
    {"name":"Rizal Technological University","nick":"RTU","phone":"0900-111-2222","addr":"Boni Ave, Mandaluyong","limit":30000},
    {"name":"Bullseye Realty & Marketing Corp","nick":"Bullseye","phone":"0900-222-3333","addr":"Ortigas Center, Pasig","limit":50000},
    {"name":"Greenacre Accounting & Tax Services","nick":"Greenacre","phone":"0900-333-4444","addr":"Chino Roces, Makati","limit":40000},
    {"name":"San Rafael Elementary School (Brgy. 6)","nick":"San Rafael ES","phone":"0900-444-5555","addr":"San Rafael, Malabon","limit":60000},
    {"name":"Cafe Lola Cafe & Bookstore","nick":"Cafe Lola","phone":"0900-555-6666","addr":"Katipunan Ave, Quezon City","limit":25000},
    {"name":"Metrowide Events & Printing Co","nick":"Metrowide","phone":"0900-666-7777","addr":"Greenhills, San Juan","limit":35000}
  ]'::jsonb) loop
    if not exists (select 1 from public.customers where tenant_id = v_tenant and lower(name) = lower(rec->>'name')) then
      insert into public.customers (
        tenant_id, name, nickname_or_alias, phone, address, credit_limit, is_active
      ) values (
        v_tenant, rec->>'name', rec->>'nick', rec->>'phone', rec->>'addr',
        (rec->>'limit')::numeric, true
      );
    end if;
  end loop;

  -- =========================================================================
  -- 5. PURCHASE ORDERS / INITIAL STOCK (restocks, VAT-aware)
  -- =========================================================================
  for rec in select jsonb_array_elements('[
    {"po":"PO-IMP-2026-001","sup":"Paper One Trading Co.","date":"2026-01-06","inv":"SI-260106-0001",
     "lines":[{"sku":"BND-A4-70","qty":200,"cost":195},{"sku":"BND-SHORT","qty":150,"cost":190},{"sku":"BND-LONG","qty":120,"cost":210}]},
    {"po":"PO-IMP-2026-002","sup":"National Office Supply Corp.","date":"2026-01-10","inv":"SI-260110-0002",
     "lines":[{"sku":"FST-BNDCLP","qty":50,"cost":15},{"sku":"FST-PAPCLP","qty":60,"cost":10},{"sku":"FST-STAPLE","qty":40,"cost":28},{"sku":"FST-BRASS","qty":30,"cost":20}]},
    {"po":"PO-IMP-2026-003","sup":"Divisoria Paper & Printing Wholesale","date":"2026-03-15","inv":"",
     "lines":[{"sku":"BND-A4-70","qty":60,"cost":190}]},
    {"po":"PO-IMP-2026-004","sup":"Paper One Trading Co.","date":"2026-05-20","inv":"SI-260520-0004",
     "lines":[{"sku":"BND-SHORT","qty":40,"cost":188}]},
    {"po":"PO-IMP-2026-005","sup":"Paper One Trading Co.","date":"2026-06-18","inv":"SI-260618-0005",
     "lines":[{"sku":"BND-A4-70","qty":80,"cost":192},{"sku":"BND-SHORT","qty":60,"cost":188}]},
    {"po":"PO-IMP-2026-006","sup":"Paper One Trading Co.","date":"2026-08-21","inv":"SI-260821-0006",
     "lines":[{"sku":"BND-SHORT","qty":50,"cost":190},{"sku":"BND-LONG","qty":40,"cost":208}]}
  ]'::jsonb) loop
    select id, name, tin, is_vat_registered
    into v_sup_id, v_sup_name, v_sup_tin, v_sup_vat
    from public.suppliers where tenant_id = v_tenant and name = rec->>'sup';

    insert into public.purchase_orders (
      tenant_id, po_number, supplier_id, supplier_name, order_date,
      expected_delivery_date, status, payment_terms, paid, notes
    ) values (
      v_tenant, rec->>'po', v_sup_id, v_sup_name, (rec->>'date')::timestamptz,
      (rec->>'date')::timestamptz + interval '5 days', 'fully_received',
      'COD', true, 'Seed stock'
    ) returning id into v_po;

    v_gross := 0; v_input_vat := 0;

    for ln in select jsonb_array_elements(rec->'lines') loop
      select id, name, cost_price, stock_quantity
      into v_pid, v_pname, v_prev_cost, v_cur_stock
      from public.products where tenant_id = v_tenant and sku = ln->>'sku';

      v_qty  := (ln->>'qty')::numeric;
      v_cost := (ln->>'cost')::numeric;
      v_new_avg := round(
        ((coalesce(v_prev_cost,0) * coalesce(v_cur_stock,0)) + (v_qty * v_cost))
        / nullif(coalesce(v_cur_stock,0) + v_qty, 0), 4);

      update public.products
      set stock_quantity = coalesce(stock_quantity,0) + v_qty, cost_price = v_new_avg
      where id = v_pid and tenant_id = v_tenant;

      insert into public.product_cost_history (
        tenant_id, product_id, product_name, date, previous_average_cost,
        new_average_cost, quantity_received, actual_unit_cost, triggering_po_id
      ) values (
        v_tenant, v_pid, v_pname, (rec->>'date')::timestamptz, v_prev_cost,
        v_new_avg, v_qty, v_cost, v_po
      );

      v_gross := v_gross + (v_qty * v_cost);
      v_input_vat := v_input_vat + case
        when v_sup_vat and btrim(coalesce(rec->>'inv','')) <> ''
        then round(v_qty * v_cost / 1.12 * 0.12, 2) else 0 end;

      insert into public.purchase_order_items (
        tenant_id, po_id, product_id, product_name, quantity_ordered,
        quantity_received, unit_of_purchase, unit_cost, line_total
      ) values (
        v_tenant, v_po, v_pid, v_pname, v_qty, v_qty, 'pc',
        v_cost, round(v_qty * v_cost, 2)
      );

      insert into public.stock_movements (
        tenant_id, product_id, product_name, quantity, direction, reason,
        reference_id, recorded_by, supplier_id, supplier_name, supplier_tin,
        po_id, paid, invoice_or_receipt_number, is_vat_registered_supplier,
        purchase_cost, input_vat, non_creditable, created_at
      ) values (
        v_tenant, v_pid, v_pname, v_qty, 'in', 'restock', v_po::text,
        'Betchay', v_sup_id, v_sup_name, v_sup_tin, v_po, true,
        coalesce(rec->>'inv',''), v_sup_vat,
        round(v_qty * v_cost, 2),
        case when v_sup_vat and btrim(coalesce(rec->>'inv','')) <> ''
             then round(v_qty * v_cost / 1.12 * 0.12, 2) else 0 end,
        not (v_sup_vat and btrim(coalesce(rec->>'inv','')) <> ''),
        (rec->>'date')::timestamptz
      );
    end loop;

    v_net := v_gross - v_input_vat;

    insert into public.journal_entries (
      tenant_id, date, reference_type, reference_id, description, party, payment_method
    ) values (
      v_tenant, (rec->>'date')::timestamptz, 'purchase', v_po::text,
      concat('PO ', rec->>'po', ' receipt - ', v_sup_name), v_sup_name, 'Cash'
    ) returning id into v_je;

    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
      (v_tenant, v_je, '1200', 'Inventory Asset', round(v_net, 2), 0);
    if v_input_vat > 0 then
      insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
        (v_tenant, v_je, '1500', 'Input VAT', round(v_input_vat, 2), 0);
    end if;
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
      (v_tenant, v_je, '1000', 'Cash', 0, round(v_gross, 2));

    insert into public.supplier_payments (
      tenant_id, supplier_id, supplier_name, po_id, payment_date, amount,
      payment_method, reference_number, journal_entry_id
    ) values (
      v_tenant, v_sup_id, v_sup_name, v_po, (rec->>'date')::timestamptz + interval '3 days',
      round(v_gross, 2), 'Cash', 'PMT-' || v_po::text, v_je
    );
  end loop;

  raise notice 'Imprenta Services tenant ready - continuing to sales seed.';
end $$;

-- ============================================================================
-- SALES SEED: Jan 2026 -> Sept 2026
-- ============================================================================
do $$
declare
  v_tenant uuid;
  v_p_a4 uuid; v_p_short uuid; v_p_long uuid; v_p_bndclp uuid; v_p_papclp uuid;
  v_p_staple uuid; v_p_brass uuid; v_p_thesis uuid; v_p_spiral uuid; v_p_velo uuid;
  v_p_bir uuid; v_p_cal uuid; v_p_nb uuid; v_p_jrnl uuid; v_p_wbk uuid;
  v_p_bw uuid; v_p_clp uuid; v_p_pcbw uuid; v_p_pcc uuid; v_p_lam uuid; v_p_dsgn uuid; v_p_tarp uuid;
  v_c_rtu uuid; v_c_bull uuid; v_c_green uuid; v_c_sre uuid; v_c_lola uuid; v_c_metro uuid;
  v_m date;
  v_d date;
  v_mi int;
  v_day int;
  v_days int[] := ARRAY[]::int[];
  v_items jsonb;
  v_cashmethod cash_method default null;
  v_je uuid;
  v_balance numeric;
begin
  select id into v_tenant from public.tenants where business_name = 'Imprenta Services';

  if exists (select 1 from public.sales where tenant_id = v_tenant) then
    raise notice 'Sales already seeded for Imprenta Services - skipping.';
    return;
  end if;

  select id into v_p_a4     from public.products where tenant_id = v_tenant and sku = 'BND-A4-70';
  select id into v_p_short  from public.products where tenant_id = v_tenant and sku = 'BND-SHORT';
  select id into v_p_long   from public.products where tenant_id = v_tenant and sku = 'BND-LONG';
  select id into v_p_bndclp from public.products where tenant_id = v_tenant and sku = 'FST-BNDCLP';
  select id into v_p_papclp from public.products where tenant_id = v_tenant and sku = 'FST-PAPCLP';
  select id into v_p_staple from public.products where tenant_id = v_tenant and sku = 'FST-STAPLE';
  select id into v_p_brass  from public.products where tenant_id = v_tenant and sku = 'FST-BRASS';
  select id into v_p_thesis from public.products where tenant_id = v_tenant and sku = 'SRV-THESIS';
  select id into v_p_spiral from public.products where tenant_id = v_tenant and sku = 'SRV-SPIRAL';
  select id into v_p_velo   from public.products where tenant_id = v_tenant and sku = 'SRV-VELO';
  select id into v_p_bir    from public.products where tenant_id = v_tenant and sku = 'SRV-BIR';
  select id into v_p_cal    from public.products where tenant_id = v_tenant and sku = 'SRV-CAL';
  select id into v_p_nb     from public.products where tenant_id = v_tenant and sku = 'SRV-NB';
  select id into v_p_jrnl   from public.products where tenant_id = v_tenant and sku = 'SRV-JRNL';
  select id into v_p_wbk    from public.products where tenant_id = v_tenant and sku = 'SRV-WBK';
  select id into v_p_bw     from public.products where tenant_id = v_tenant and sku = 'SRV-BW';
  select id into v_p_clp    from public.products where tenant_id = v_tenant and sku = 'SRV-CLP';
  select id into v_p_pcbw   from public.products where tenant_id = v_tenant and sku = 'SRV-PCBW';
  select id into v_p_pcc    from public.products where tenant_id = v_tenant and sku = 'SRV-PCC';
  select id into v_p_lam    from public.products where tenant_id = v_tenant and sku = 'SRV-LAM';
  select id into v_p_dsgn   from public.products where tenant_id = v_tenant and sku = 'SRV-DSGN';
  select id into v_p_tarp   from public.products where tenant_id = v_tenant and sku = 'SRV-TARP';
  select id into v_c_rtu   from public.customers where tenant_id = v_tenant and lower(name) like '%technological%';
  select id into v_c_bull  from public.customers where tenant_id = v_tenant and lower(name) like '%bullseye%';
  select id into v_c_green from public.customers where tenant_id = v_tenant and lower(name) like '%greenacre%';
  select id into v_c_sre   from public.customers where tenant_id = v_tenant and lower(name) like '%san rafael%';
  select id into v_c_lola  from public.customers where tenant_id = v_tenant and lower(name) like '%cafe lola%';
  select id into v_c_metro from public.customers where tenant_id = v_tenant and lower(name) like '%metrowide%';

  -- =========================================================================
  -- MONTHLY WALK-IN PHOTOCOPY / PRINT / BOND PAPER (retail customers)
  -- =========================================================================
  for v_mi in 1..9 loop
    v_m := to_timestamp(concat('2026-', lpad(v_mi::text,2,'0'), '-01'), 'YYYY-MM-DD')::date;

    v_days := ARRAY[3,7,12,17,22,26];
    foreach v_day in array v_days loop
      v_d := v_m + (v_day - 1);
      if v_d > current_date then exit; end if;

      v_items := jsonb_build_array(
        jsonb_build_object('id', v_p_pcbw, 'qty', 60 + v_mi * 15, 'price', 2),
        jsonb_build_object('id', v_p_bw,   'qty', 40 + v_mi * 8,  'price', 5),
        jsonb_build_object('id', v_p_bndclp, 'qty', 1, 'price', 35),
        jsonb_build_object('id', v_p_papclp, 'qty', 1, 'price', 25)
      );
      if v_mi % 3 = 0 then v_cashmethod := 'Gcash'; else v_cashmethod := 'Cash'; end if;
      perform public.libreta_seed_sale(v_tenant, v_d, null, '', 'Cash', v_cashmethod, 'Betchay', v_items);

      v_items := jsonb_build_array(
        jsonb_build_object('id', v_p_clp, 'qty', 5 + v_mi, 'price', 15),
        jsonb_build_object('id', v_p_lam, 'qty', 4, 'price', 25),
        jsonb_build_object('id', v_p_pcc, 'qty', 8 + v_mi, 'price', 15)
      );
      if v_mi % 3 = 1 then v_cashmethod := 'Gcash'; else v_cashmethod := 'Cash'; end if;
      perform public.libreta_seed_sale(v_tenant, v_d, null, '', 'Cash', v_cashmethod, 'Betchay', v_items);
    end loop;

    -- Bond paper + fastener retail twice a month (physical goods)
    v_days := ARRAY[9, 23];
    foreach v_day in array v_days loop
      v_d := v_m + (v_day - 1);
      if v_d > current_date then exit; end if;
      v_items := jsonb_build_array(
        jsonb_build_object('id', v_p_a4, 'qty', 4 + (v_mi % 2), 'price', 250),
        jsonb_build_object('id', v_p_short, 'qty', 2, 'price', 240),
        jsonb_build_object('id', v_p_staple, 'qty', 1, 'price', 55)
      );
      perform public.libreta_seed_sale(v_tenant, v_d, null, '', 'Cash', 'Cash', 'Betchay', v_items);
    end loop;

    -- =======================================================================
    -- THESIS SEASON SALES (Feb-Apr & Jul-Sep) - campus print contracts (RTU)
    -- =======================================================================
    if v_mi in (2,3,4,7,8,9) then
      v_days := ARRAY[9, 20, 27];
      foreach v_day in array v_days loop
        v_d := v_m + (v_day - 1);
        if v_d > current_date then exit; end if;
        v_items := jsonb_build_array(
          jsonb_build_object('id', v_p_thesis, 'qty', 3 + (v_mi % 3), 'price', 700),
          jsonb_build_object('id', v_p_spiral, 'qty', 8 + v_mi, 'price', 60),
          jsonb_build_object('id', v_p_velo,   'qty', 3, 'price', 90)
        );
        perform public.libreta_seed_sale(v_tenant, v_d, v_c_rtu, 'Rizal Technological University', 'Cash', 'Cash', 'Betchay', v_items);
      end loop;
    end if;

    -- =======================================================================
    -- BIR RECEIPTS PRINTING - corporate monthly (Bullseye, Greenacre)
    -- =======================================================================
    v_d := v_m + 5;
    if v_d <= current_date then
      v_items := jsonb_build_array(jsonb_build_object('id', v_p_bir, 'qty', 3, 'price', 300));
      perform public.libreta_seed_sale(v_tenant, v_d, v_c_bull, 'Bullseye Realty & Marketing Corp', 'Cash', 'Cash', 'Betchay', v_items);
    end if;
    v_d := v_m + 16;
    if v_d <= current_date then
      v_items := jsonb_build_array(jsonb_build_object('id', v_p_bir, 'qty', 2, 'price', 300));
      perform public.libreta_seed_sale(v_tenant, v_d, v_c_green, 'Greenacre Accounting & Tax Services', 'Cash', 'Cash', 'Betchay', v_items);
    end if;
  end loop;

  -- =========================================================================
  -- SEASONAL / CUSTOM PRINT RUNS
  -- =========================================================================
  if '2026-01-12' <= current_date then
    perform public.libreta_seed_sale(v_tenant, '2026-01-12'::timestamptz, null, '', 'Cash', 'Cash', 'Betchay',
      jsonb_build_array(jsonb_build_object('id', v_p_thesis, 'qty', 1, 'price', 700), jsonb_build_object('id', v_p_lam, 'qty', 2, 'price', 25)));
  end if;
  if '2026-01-15' <= current_date then
    perform public.libreta_seed_sale(v_tenant, '2026-01-15'::timestamptz, v_c_metro, 'Metrowide Events & Printing Co', 'Cash', 'Gcash', 'Betchay',
      jsonb_build_array(jsonb_build_object('id', v_p_cal, 'qty', 40, 'price', 180), jsonb_build_object('id', v_p_tarp, 'qty', 30, 'price', 250)));
    perform public.libreta_seed_sale(v_tenant, '2026-01-28'::timestamptz, v_c_lola, 'Cafe Lola Cafe & Bookstore', 'Cash', 'Cash', 'Betchay',
      jsonb_build_array(jsonb_build_object('id', v_p_nb, 'qty', 30, 'price', 130)));
  end if;
  if '2026-02-10' <= current_date then
    perform public.libreta_seed_sale(v_tenant, '2026-02-10'::timestamptz, v_c_lola, 'Cafe Lola Cafe & Bookstore', 'Cash', 'Gcash', 'Betchay',
      jsonb_build_array(jsonb_build_object('id', v_p_jrnl, 'qty', 20, 'price', 160)));
  end if;
  if '2026-09-20' <= current_date then
    perform public.libreta_seed_sale(v_tenant, '2026-09-20'::timestamptz, v_c_lola, 'Cafe Lola Cafe & Bookstore', 'Cash', 'Cash', 'Betchay',
      jsonb_build_array(jsonb_build_object('id', v_p_nb, 'qty', 40, 'price', 130), jsonb_build_object('id', v_p_dsgn, 'qty', 1, 'price', 350)));
  end if;

  -- =========================================================================
  -- WORKBOOK CONTRACT - San Rafael ES (on account => AR Aging shows activity)
  -- Charges Jun/Jul/Aug; partial payments in Jul & Aug; leaves an open balance.
  -- =========================================================================
  if '2026-06-12' <= current_date then
    perform public.libreta_seed_sale(v_tenant, '2026-06-12'::timestamptz, v_c_sre, 'San Rafael Elementary School (Brgy. 6)', 'Utang', null, 'Betchay',
      jsonb_build_array(jsonb_build_object('id', v_p_wbk, 'qty', 50, 'price', 120), jsonb_build_object('id', v_p_bndclp, 'qty', 5, 'price', 35)));
  end if;
  if '2026-07-10' <= current_date then
    perform public.libreta_seed_sale(v_tenant, '2026-07-10'::timestamptz, v_c_sre, 'San Rafael Elementary School (Brgy. 6)', 'Utang', null, 'Betchay',
      jsonb_build_array(jsonb_build_object('id', v_p_wbk, 'qty', 60, 'price', 120)));
  end if;
  if '2026-08-05' <= current_date then
    perform public.libreta_seed_sale(v_tenant, '2026-08-05'::timestamptz, v_c_sre, 'San Rafael Elementary School (Brgy. 6)', 'Utang', null, 'Betchay',
      jsonb_build_array(jsonb_build_object('id', v_p_wbk, 'qty', 70, 'price', 120)));
  end if;

  -- Customer payments on the open AR (Jul & Aug)
  if '2026-07-22' <= current_date then
    select coalesce(sum(case when type = 'payment' then -amount else amount end), 0)
    into v_balance from public.customer_ledger_entries where customer_id = v_c_sre and tenant_id = v_tenant;
    insert into public.customer_ledger_entries (
      tenant_id, customer_id, customer_name, date, type, amount, reference_type,
      reference_id, running_balance, recorded_by, note, created_at
    ) values (v_tenant, v_c_sre, 'San Rafael Elementary School (Brgy. 6)', '2026-07-22'::timestamptz,
      'payment', 4000, 'payment', 'PMT-SRE-0701', v_balance - 4000, 'Betchay', 'Partial payment on workbook order', '2026-07-22'::timestamptz);

    insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
    values (v_tenant, '2026-07-22'::timestamptz, 'customer_payment', 'PMT-SRE-0701', 'Customer payment - San Rafael ES', 'San Rafael Elementary School (Brgy. 6)', 'Cash')
    returning id into v_je;
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
      (v_tenant, v_je, '1000', 'Cash', 4000, 0),
      (v_tenant, v_je, '1100', 'Accounts Receivable', 0, 4000);
  end if;

  if '2026-08-19' <= current_date then
    select coalesce(sum(case when type = 'payment' then -amount else amount end), 0)
    into v_balance from public.customer_ledger_entries where customer_id = v_c_sre and tenant_id = v_tenant;
    insert into public.customer_ledger_entries (
      tenant_id, customer_id, customer_name, date, type, amount, reference_type,
      reference_id, running_balance, recorded_by, note, created_at
    ) values (v_tenant, v_c_sre, 'San Rafael Elementary School (Brgy. 6)', '2026-08-19'::timestamptz,
      'payment', 6000, 'payment', 'PMT-SRE-0801', v_balance - 6000, 'Betchay', 'Partial payment on workbook order', '2026-08-19'::timestamptz);

    insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
    values (v_tenant, '2026-08-19'::timestamptz, 'customer_payment', 'PMT-SRE-0801', 'Customer payment - San Rafael ES', 'San Rafael Elementary School (Brgy. 6)', 'Cash')
    returning id into v_je;
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
      (v_tenant, v_je, '1000', 'Cash', 6000, 0),
      (v_tenant, v_je, '1100', 'Accounts Receivable', 0, 6000);
  end if;
end $$;

-- ============================================================================
-- EXPENSES SEED (monthly operating expenses, Jan-Sep 2026)
-- ============================================================================
do $$
declare
  v_tenant uuid;
  v_m date;
  v_mi int;
  v_je uuid;
  v_gross numeric;
  v_input_vat numeric;
  v_net numeric;
  v_cat_id uuid;
begin
  select id into v_tenant from public.tenants where business_name = 'Imprenta Services';

  if exists (select 1 from public.expenses where tenant_id = v_tenant) then
    raise notice 'Expenses already seeded for Imprenta Services - skipping.';
    return;
  end if;

  select id into v_cat_id from public.expense_categories
  where tenant_id = v_tenant and name = 'Utilities (Electricity/Water/Internet)' limit 1;

  for v_mi in 1..9 loop
    v_m := to_timestamp(concat('2026-', lpad(v_mi::text,2,'0'), '-01'), 'YYYY-MM-DD')::date;

    -- Rent (non-VAT landlord)
    if v_m <= current_date then
      insert into public.expenses (tenant_id, date, category, category_id, account_code, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
      values (v_tenant, v_m, 'Rent', (select id from public.expense_categories ec where ec.tenant_id = v_tenant and ec.name = 'Rent' limit 1), '6000',
        'Store rent - Imprenta Services', 18000, 'Cash', 'L. Mendoza', 'RENT-2026-' || lpad(v_mi::text,2,'0'), false, 0, true, v_m);
      insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
      values (v_tenant, v_m, 'expense', 'RENT-2026-' || lpad(v_mi::text,2,'0'), 'Store rent', 'L. Mendoza', 'Cash')
      returning id into v_je;
      insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
        (v_tenant, v_je, '6000', 'Rent Expense', 18000, 0),
        (v_tenant, v_je, '1000', 'Cash', 0, 18000);
    end if;

    -- Electricity (MERALCO - VAT creditable)
    v_gross := 6500 + v_mi * 300; v_input_vat := round(v_gross / 1.12 * 0.12, 2); v_net := v_gross - v_input_vat;
    if v_m + 11 <= current_date then
      insert into public.expenses (tenant_id, date, category, category_id, account_code, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
      values (v_tenant, v_m + 11, 'Utilities (Electricity/Water/Internet)', v_cat_id, '6100', 'Electric bill', v_gross, 'Cash', 'MERALCO',
        'MER-2026-' || lpad(v_mi::text,2,'0'), true, v_input_vat, false, v_m + 11);
      insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
      values (v_tenant, v_m + 11, 'expense', 'MER-2026-' || lpad(v_mi::text,2,'0'), 'Electric bill - MERALCO', 'MERALCO', 'Cash')
      returning id into v_je;
      insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
        (v_tenant, v_je, '6100', 'Utilities Expense', v_net, 0),
        (v_tenant, v_je, '1500', 'Input VAT', v_input_vat, 0),
        (v_tenant, v_je, '1000', 'Cash', 0, v_gross);
    end if;

    -- Water (Manila Water - VAT creditable)
    v_gross := 1400 + v_mi * 50; v_input_vat := round(v_gross / 1.12 * 0.12, 2); v_net := v_gross - v_input_vat;
    if v_m + 14 <= current_date then
      insert into public.expenses (tenant_id, date, category, category_id, account_code, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
      values (v_tenant, v_m + 14, 'Utilities (Electricity/Water/Internet)', v_cat_id, '6100', 'Water bill', v_gross, 'Cash', 'Manila Water',
        'MW-2026-' || lpad(v_mi::text,2,'0'), true, v_input_vat, false, v_m + 14);
      insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
      values (v_tenant, v_m + 14, 'expense', 'MW-2026-' || lpad(v_mi::text,2,'0'), 'Water bill - Manila Water', 'Manila Water', 'Cash')
      returning id into v_je;
      insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
        (v_tenant, v_je, '6100', 'Utilities Expense', v_net, 0),
        (v_tenant, v_je, '1500', 'Input VAT', v_input_vat, 0),
        (v_tenant, v_je, '1000', 'Cash', 0, v_gross);
    end if;

    -- Internet (PLDT - VAT creditable)
    v_gross := 1599; v_input_vat := round(v_gross / 1.12 * 0.12, 2); v_net := v_gross - v_input_vat;
    if v_m + 19 <= current_date then
      insert into public.expenses (tenant_id, date, category, category_id, account_code, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
      values (v_tenant, v_m + 19, 'Utilities (Electricity/Water/Internet)', v_cat_id, '6100', 'Internet fiber', v_gross, 'Cash', 'PLDT',
        'PLDT-2026-' || lpad(v_mi::text,2,'0'), true, v_input_vat, false, v_m + 19);
      insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
      values (v_tenant, v_m + 19, 'expense', 'PLDT-2026-' || lpad(v_mi::text,2,'0'), 'Internet bill - PLDT', 'PLDT', 'Cash')
      returning id into v_je;
      insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
        (v_tenant, v_je, '6100', 'Utilities Expense', v_net, 0),
        (v_tenant, v_je, '1500', 'Input VAT', v_input_vat, 0),
        (v_tenant, v_je, '1000', 'Cash', 0, v_gross);
    end if;

    -- Salaries (2 cut-offs per month, non-VAT)
    if v_m + 9 <= current_date then
      insert into public.expenses (tenant_id, date, category, category_id, account_code, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
      values (v_tenant, v_m + 9, 'Salaries & Wages', (select id from public.expense_categories ec where ec.tenant_id = v_tenant and ec.name = 'Salaries & Wages' limit 1), '6200',
        'Cashier/Helper wages - 1st cut-off', 8000, 'Cash', 'Staff', 'PAY ' || lpad(v_mi::text,2,'0') || 'A', false, 0, true, v_m + 9);
      insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
      values (v_tenant, v_m + 9, 'expense', 'PAY ' || lpad(v_mi::text,2,'0') || 'A', 'Wages 1st cut-off', 'Staff', 'Cash')
      returning id into v_je;
      insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
        (v_tenant, v_je, '6200', 'Salaries & Wages Expense', 8000, 0),
        (v_tenant, v_je, '1000', 'Cash', 0, 8000);
    end if;
    if v_m + 24 <= current_date then
      insert into public.expenses (tenant_id, date, category, category_id, account_code, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
      values (v_tenant, v_m + 24, 'Salaries & Wages', (select id from public.expense_categories ec where ec.tenant_id = v_tenant and ec.name = 'Salaries & Wages' limit 1), '6200',
        'Cashier/Helper wages - 2nd cut-off', 8000, 'Cash', 'Staff', 'PAY ' || lpad(v_mi::text,2,'0') || 'B', false, 0, true, v_m + 24);
      insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
      values (v_tenant, v_m + 24, 'expense', 'PAY ' || lpad(v_mi::text,2,'0') || 'B', 'Wages 2nd cut-off', 'Staff', 'Cash')
      returning id into v_je;
      insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
        (v_tenant, v_je, '6200', 'Salaries & Wages Expense', 8000, 0),
        (v_tenant, v_je, '1000', 'Cash', 0, 8000);
    end if;
  end loop;

  -- Occasional one-offs: Toner purchase (Apr), printer repair (May), marketing (Feb)
  if '2026-04-08' <= current_date then
    v_gross := 8500; v_input_vat := round(v_gross / 1.12 * 0.12, 2); v_net := v_gross - v_input_vat;
    insert into public.expenses (tenant_id, date, category, category_id, account_code, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
    values (v_tenant, '2026-04-08'::timestamptz, 'Office Supplies', (select id from public.expense_categories ec where ec.tenant_id = v_tenant and ec.name = 'Office Supplies' limit 1), '6500',
      'Printer toner & ink', v_gross, 'Cash', 'Ink & Binding Depot Phils.', 'INV-TNR-0408', true, v_input_vat, false, '2026-04-08'::timestamptz);
    insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
    values (v_tenant, '2026-04-08'::timestamptz, 'expense', 'INV-TNR-0408', 'Printer toner & ink', 'Ink & Binding Depot Phils.', 'Cash')
    returning id into v_je;
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
      (v_tenant, v_je, '6500', 'Office Supplies Expense', v_net, 0),
      (v_tenant, v_je, '1500', 'Input VAT', v_input_vat, 0),
      (v_tenant, v_je, '1000', 'Cash', 0, v_gross);
  end if;

  if '2026-05-14' <= current_date then
    v_gross := 3500; v_input_vat := 0; v_net := v_gross;
    insert into public.expenses (tenant_id, date, category, category_id, account_code, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
    values (v_tenant, '2026-05-14'::timestamptz, 'Repairs & Maintenance', (select id from public.expense_categories ec where ec.tenant_id = v_tenant and ec.name = 'Repairs & Maintenance' limit 1), '6400',
      'Printer repair & maintenance', v_gross, 'Cash', 'Allied Copier Services', 'RPR-MAY-0514', false, 0, true, '2026-05-14'::timestamptz);
    insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
    values (v_tenant, '2026-05-14'::timestamptz, 'expense', 'RPR-MAY-0514', 'Printer repair', 'Allied Copier Services', 'Cash')
    returning id into v_je;
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
      (v_tenant, v_je, '6400', 'Repairs & Maintenance Expense', v_net, 0),
      (v_tenant, v_je, '1000', 'Cash', 0, v_gross);
  end if;

  if '2026-02-05' <= current_date then
    v_gross := 1500; v_input_vat := 0; v_net := v_gross;
    insert into public.expenses (tenant_id, date, category, category_id, account_code, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
    values (v_tenant, '2026-02-05'::timestamptz, 'Marketing/Advertising', (select id from public.expense_categories ec where ec.tenant_id = v_tenant and ec.name = 'Marketing/Advertising' limit 1), '7000',
      'Facebook / Instagram ads', v_gross, 'Gcash', 'Meta Ads', 'ADV-FEB-0205', false, 0, true, '2026-02-05'::timestamptz);
    insert into public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
    values (v_tenant, '2026-02-05'::timestamptz, 'expense', 'ADV-FEB-0205', 'Social media ads', 'Meta Ads', 'Gcash')
    returning id into v_je;
    insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) values
      (v_tenant, v_je, '7000', 'Marketing & Advertising Expense', v_net, 0),
      (v_tenant, v_je, '1000', 'Cash', 0, v_gross);
  end if;
end $$;

-- ============================================================================
-- Cleanup helper + summary
-- ============================================================================
drop function if exists public.libreta_seed_sale(uuid, timestamptz, uuid, text, payment_method, cash_method, text, jsonb);

do $$
declare
  v_tenant uuid;
  v_sales int; v_items int; v_exp int; v_po int; v_je int; v_ar numeric;
begin
  select id into v_tenant from public.tenants where business_name = 'Imprenta Services';
  select count(*) into v_sales from public.sales where tenant_id = v_tenant and status = 'Completed';
  select count(*) into v_items from public.sale_items si join public.sales s on s.id = si.sale_id where s.tenant_id = v_tenant;
  select count(*) into v_exp from public.expenses where tenant_id = v_tenant;
  select count(*) into v_po from public.purchase_orders where tenant_id = v_tenant;
  select count(*) into v_je from public.journal_entries where tenant_id = v_tenant;
  select coalesce(sum(case when type = 'payment' then -amount else amount end), 0) into v_ar
  from public.customer_ledger_entries where tenant_id = v_tenant;
  raise notice 'Imprenta Services seed complete -> sales: %, items: %, expenses: %, POs: %, journal entries: %, open AR: %',
    v_sales, v_items, v_exp, v_po, v_je, v_ar;
end $$;