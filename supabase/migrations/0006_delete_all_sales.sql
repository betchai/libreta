-- ============================================================================
-- Libreta by BLink — Delete All Sales (Phase F). ADMIN ONLY.
-- Permanently removes ALL sales transactions for the business, atomically:
--   * sale_items + sales
--   * stock_movements with reason 'sale' or 'void'
--   * journal_entries (and their lines) with reference_type 'sale' or 'void'
--   * customer_ledger_entries with reference_type 'sale' or 'void'
-- It does NOT affect inventory stock levels, expenses, purchases, or payments.
-- ============================================================================

create or replace function public.delete_all_sales(p_tenant uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  if not public.auth_is_admin() then
    raise exception 'Admin access required to delete all sales';
  end if;

  -- Journal entry lines for sale/void entries
  delete from public.journal_entry_lines
  where tenant_id = p_tenant
    and journal_entry_id in (
      select id from public.journal_entries
      where tenant_id = p_tenant and reference_type in ('sale', 'void')
    );

  -- Sale/void journal entries
  delete from public.journal_entries
  where tenant_id = p_tenant and reference_type in ('sale', 'void');

  -- Sale/void stock movements
  delete from public.stock_movements
  where tenant_id = p_tenant and reason in ('sale', 'void');

  -- Credit charges + their void reversals
  delete from public.customer_ledger_entries
  where tenant_id = p_tenant and reference_type in ('sale', 'void');

  -- Sale items (cascade removes with sales, but explicit for clarity)
  delete from public.sale_items
  where tenant_id = p_tenant and sale_id in (select id from public.sales where tenant_id = p_tenant);

  get diagnostics v_count = row_count;

  -- Sales
  delete from public.sales where tenant_id = p_tenant;

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;
