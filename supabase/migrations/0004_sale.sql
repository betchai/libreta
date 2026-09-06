-- ============================================================================
-- Libreta by BLink — Sale & void atomic RPCs (Phase B)
-- These wrap checkout and voiding in a single DB transaction. The client still
-- computes all business math (discounts, VAT, weighted cost) and passes the
-- pre-computed values here, so this layer only guarantees atomicity.
-- ============================================================================

-- Commit a complete sale: sale + sale_items + stock deduction + stock movements
-- + journal entry + (optional) customer ledger charge, atomically.
-- p_sale:    sale columns
-- p_items:   [{ product_id, product_name, quantity, unit_sold, price_at_sale,
--               cost_price_at_sale, subtotal, discount_type, discount_value,
--               discount_amount, net_amount, discount_id_number,
--               discount_person_name, discount_reason, vatable_sales, output_vat,
--               vat_exempt_sales, deduction }]
-- p_journal: { date, reference_type, reference_id, description, party,
--              payment_method, lines:[{code, account_name, debit, credit}] }
-- p_ledger:  null or { customer_id, customer_name, amount, recorded_by, note }
create or replace function public.post_sale(
  p_tenant uuid,
  p_sale jsonb,
  p_items jsonb,
  p_journal jsonb,
  p_ledger jsonb default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_sale uuid;
  v_je uuid;
  it jsonb;
  v_balance numeric;
begin
  if p_tenant is null or p_tenant <> public.auth_tenant() then
    raise exception 'Tenant mismatch';
  end if;

  insert into public.sales (
    tenant_id, total_amount, gross_amount, total_discount_amount,
    sc_pwd_discount_amount, other_discount_amount, payment_method, cash_method,
    cashier_name, customer_id, customer_name, credit_amount, cash_amount,
    status, created_date
  )
  values (
    p_tenant,
    (p_sale->>'total_amount')::numeric,
    coalesce((p_sale->>'gross_amount')::numeric, 0),
    coalesce((p_sale->>'total_discount_amount')::numeric, 0),
    coalesce((p_sale->>'sc_pwd_discount_amount')::numeric, 0),
    coalesce((p_sale->>'other_discount_amount')::numeric, 0),
    coalesce((p_sale->>'payment_method'), 'Cash')::payment_method,
    nullif(p_sale->>'cash_method', '')::cash_method,
    p_sale->>'cashier_name',
    nullif(p_sale->>'customer_id', '')::uuid,
    p_sale->>'customer_name',
    coalesce((p_sale->>'credit_amount')::numeric, 0),
    coalesce((p_sale->>'cash_amount')::numeric, 0),
    coalesce((p_sale->>'status'), 'Completed')::sale_status,
    coalesce((p_sale->>'created_date')::timestamptz, now())
  )
  returning id into v_sale;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.sale_items (
      tenant_id, sale_id, product_id, product_name, quantity, unit_sold,
      price_at_sale, cost_price_at_sale, subtotal, discount_type, discount_value,
      discount_amount, net_amount, discount_id_number, discount_person_name,
      discount_reason, vatable_sales, output_vat, vat_exempt_sales
    )
    values (
      p_tenant, v_sale, nullif(it->>'product_id', '')::uuid, it->>'product_name',
      (it->>'quantity')::numeric, coalesce((it->>'unit_sold'), 'base')::sale_unit,
      (it->>'price_at_sale')::numeric, coalesce((it->>'cost_price_at_sale')::numeric, 0),
      (it->>'subtotal')::numeric, coalesce((it->>'discount_type'), 'none')::discount_type,
      coalesce((it->>'discount_value')::numeric, 0),
      coalesce((it->>'discount_amount')::numeric, 0),
      coalesce((it->>'net_amount')::numeric, 0),
      it->>'discount_id_number', it->>'discount_person_name', it->>'discount_reason',
      coalesce((it->>'vatable_sales')::numeric, 0),
      coalesce((it->>'output_vat')::numeric, 0),
      coalesce((it->>'vat_exempt_sales')::numeric, 0)
    );

    if (it->>'deduction')::numeric > 0 and it->>'product_id' is not null then
      update public.products
      set stock_quantity = greatest(0, stock_quantity - (it->>'deduction')::numeric)
      where id = (it->>'product_id')::uuid and tenant_id = p_tenant;

      insert into public.stock_movements (
        tenant_id, product_id, product_name, quantity, direction, reason,
        reference_id, recorded_by
      )
      values (
        p_tenant, (it->>'product_id')::uuid, it->>'product_name',
        (it->>'deduction')::numeric, 'out', 'sale', v_sale::text, p_sale->>'cashier_name'
      );
    end if;
  end loop;

  -- Journal entry (reference_id always = the sale id)
  insert into public.journal_entries (
    tenant_id, date, reference_type, reference_id, description, party, payment_method
  )
  values (
    p_tenant,
    coalesce((p_journal->>'date')::timestamptz, now()),
    (p_journal->>'reference_type')::journal_reference_type,
    v_sale::text,
    coalesce(nullif(p_journal->>'description', ''), 'Sale ' || left(v_sale::text, 8)),
    p_journal->>'party',
    p_journal->>'payment_method'
  )
  returning id into v_je;
  insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
  select p_tenant, v_je, l->>'code',
         coalesce((select coa.name from public.chart_of_accounts coa where coa.tenant_id = p_tenant and coa.code = l->>'code'), l->>'account_name', l->>'code'),
         coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0)
  from jsonb_array_elements(p_journal->'lines') l;

  -- Customer ledger charge (credit / split sales)
  if p_ledger is not null and p_ledger->>'customer_id' is not null then
    select coalesce(sum(
      case when type = 'payment' then -amount else amount end
    ), 0) into v_balance
    from public.customer_ledger_entries
    where customer_id = (p_ledger->>'customer_id')::uuid and tenant_id = p_tenant;

    insert into public.customer_ledger_entries (
      tenant_id, customer_id, customer_name, date, type, amount, reference_type,
      reference_id, running_balance, recorded_by, note
    )
    values (
      p_tenant, (p_ledger->>'customer_id')::uuid, p_ledger->>'customer_name',
      coalesce((p_ledger->>'date')::timestamptz, now()), 'charge',
      (p_ledger->>'amount')::numeric, 'sale', v_sale::text,
      v_balance + (p_ledger->>'amount')::numeric,
      p_ledger->>'recorded_by', p_ledger->>'note'
    );
  end if;

  return v_sale;
end;
$$;

-- Void a sale atomically: restore stock (from its 'sale' movements), flip status,
-- post a reversal journal, and reverse the customer-ledger charge.
create or replace function public.void_sale(
  p_tenant uuid,
  p_sale_id uuid,
  p_voided_by text,
  p_reason text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_mov record;
  v_charge record;
  v_je uuid;
  v_balance numeric;
begin
  if not public.auth_is_admin() then
    raise exception 'Admin access required to void sales';
  end if;

  select * into v_sale from public.sales where id = p_sale_id and tenant_id = p_tenant;
  if not found then raise exception 'Sale not found'; end if;
  if v_sale.status = 'Voided' then raise exception 'Sale is already voided'; end if;

  -- Restore stock + log counter movements
  for v_mov in
    select * from public.stock_movements
    where tenant_id = p_tenant and reason = 'sale' and reference_id = p_sale_id::text
  loop
    update public.products
    set stock_quantity = stock_quantity + v_mov.quantity
    where id = v_mov.product_id and tenant_id = p_tenant;

    insert into public.stock_movements (
      tenant_id, product_id, product_name, quantity, direction, reason,
      reference_id, recorded_by
    )
    values (
      p_tenant, v_mov.product_id, v_mov.product_name, v_mov.quantity,
      'in', 'void', p_sale_id::text, p_voided_by
    );
  end loop;

  -- Reverse journal entry (swap debits/credits)
  insert into public.journal_entries (
    tenant_id, date, reference_type, reference_id, description, party, payment_method
  )
  select p_tenant, now(), 'void', p_sale_id::text,
         'Void / reversal of sale ' || left(p_sale_id::text, 8),
         je.party, je.payment_method
  from public.journal_entries je
  where je.tenant_id = p_tenant and je.reference_type = 'sale' and je.reference_id = p_sale_id::text
  returning id into v_je;

  insert into public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
  select p_tenant, v_je, l.account, l.account_name, l.credit_amount, l.debit_amount
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  where je.tenant_id = p_tenant and je.reference_type = 'sale' and je.reference_id = p_sale_id::text;

  -- Reverse customer-ledger charge
  for v_charge in
    select * from public.customer_ledger_entries
    where tenant_id = p_tenant and reference_type = 'sale' and reference_id = p_sale_id::text and type = 'charge'
  loop
    select coalesce(sum(case when type = 'payment' then -amount else amount end), 0)
    into v_balance
    from public.customer_ledger_entries
    where customer_id = v_charge.customer_id and tenant_id = p_tenant;

    insert into public.customer_ledger_entries (
      tenant_id, customer_id, customer_name, date, type, amount, reference_type,
      reference_id, running_balance, recorded_by, note
    )
    values (
      p_tenant, v_charge.customer_id, v_charge.customer_name, now(), 'adjustment',
      -v_charge.amount, 'void', p_sale_id::text,
      v_balance - v_charge.amount, p_voided_by,
      'Reversal of voided sale ' || left(p_sale_id::text, 8)
    );
  end loop;

  update public.sales
  set status = 'Voided', voided_at = now(), voided_by = p_voided_by, void_reason = p_reason
  where id = p_sale_id and tenant_id = p_tenant;
end;
$$;
