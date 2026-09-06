-- ============================================================================
-- Libreta — Fix void_sale: rename record variable collision
--
-- PostgreSQL raised `record "l" is not assigned yet` when voiding a sale.
-- Root cause: the declared PL/pgSQL variable `l record` shadowed the SQL range
-- alias `l` used in the reversal INSERT ... SELECT, so `l.account` bound to the
-- unassigned record variable instead of the journal_entry_lines alias.
-- Fix: drop the unused `l record` declaration (the reversing query's alias is
-- unaffected).
-- ============================================================================

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