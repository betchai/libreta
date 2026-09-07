-- ============================================================================
-- Libreta by Blink — Backfill Journal Entries, Stock Movements & VAT
-- For tenants where sales were inserted directly without post_sale() RPC.
-- Targets: Blink Hardware (VAT) + Blink General Merchandise (Non-VAT) + any others.
-- ============================================================================

-- 1. Recompute VAT on sale_items for ALL tenants with completed sales
-- Uses each tenant's business_settings (vat_registered, vat_inclusive, vat_rate)
-- Products: vat_exempt flag respected
DO $$
DECLARE
    v_tenant RECORD;
    v_settings RECORD;
    v_rate NUMERIC;
    v_vat_inclusive BOOLEAN;
    v_vat_registered BOOLEAN;
    v_item RECORD;
    v_vatable NUMERIC;
    v_output_vat NUMERIC;
    v_exempt NUMERIC;
BEGIN
    FOR v_tenant IN
        SELECT DISTINCT s.tenant_id
        FROM public.sales s
        WHERE s.status = 'Completed'
    LOOP
        SELECT vat_registered, vat_inclusive, vat_rate
        INTO v_vat_registered, v_vat_inclusive, v_rate
        FROM public.business_settings
        WHERE tenant_id = v_tenant.tenant_id;

        v_vat_registered := COALESCE(v_vat_registered, true);
        v_vat_inclusive := COALESCE(v_vat_inclusive, true);
        v_rate := COALESCE(v_rate, 0.12);

        FOR v_item IN
            SELECT si.id, si.subtotal, COALESCE(p.vat_exempt, false) AS vat_exempt
            FROM public.sale_items si
            JOIN public.sales s ON s.id = si.sale_id
            LEFT JOIN public.products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
            WHERE s.tenant_id = v_tenant.tenant_id
              AND s.status = 'Completed'
              AND (si.vatable_sales = 0 AND si.output_vat = 0 AND si.vat_exempt_sales = 0)
        LOOP
            IF v_item.vat_exempt THEN
                v_vatable := 0;
                v_output_vat := 0;
                v_exempt := v_item.subtotal;
            ELSIF v_vat_registered = false THEN
                -- Non-VAT: all sales are exempt (percentage tax applies on gross)
                v_vatable := 0;
                v_output_vat := 0;
                v_exempt := v_item.subtotal;
            ELSIF v_vat_inclusive THEN
                -- VAT-inclusive: vatable = subtotal / 1.12
                v_vatable := ROUND(v_item.subtotal / (1 + v_rate), 2);
                v_output_vat := ROUND(v_item.subtotal - v_vatable, 2);
                v_exempt := 0;
            ELSE
                -- VAT-exclusive: vatable = subtotal, output_vat = subtotal * 0.12
                v_vatable := v_item.subtotal;
                v_output_vat := ROUND(v_item.subtotal * v_rate, 2);
                v_exempt := 0;
            END IF;

            UPDATE public.sale_items
            SET vatable_sales = v_vatable,
                output_vat = v_output_vat,
                vat_exempt_sales = v_exempt
            WHERE id = v_item.id;
        END LOOP;

        RAISE NOTICE 'Recomputed VAT for tenant % (vat_registered=%, vat_inclusive=%)', v_tenant.tenant_id, v_vat_registered, v_vat_inclusive;
    END LOOP;
END $$;

-- 2. Create stock_movements for sale deductions (reason='sale')
-- Only for items that have a product_id and positive quantity
INSERT INTO public.stock_movements (
    tenant_id, product_id, product_name, quantity, direction, reason,
    reference_id, recorded_by, created_at
)
SELECT
    si.tenant_id,
    si.product_id,
    si.product_name,
    si.quantity,
    'out'::movement_direction,
    'sale'::movement_reason,
    si.sale_id::text,
    s.cashier_name,
    s.created_date
FROM public.sale_items si
JOIN public.sales s ON s.id = si.sale_id
WHERE s.status = 'Completed'
  AND si.product_id IS NOT NULL
  AND si.quantity > 0
  AND NOT EXISTS (
      SELECT 1 FROM public.stock_movements sm
      WHERE sm.tenant_id = si.tenant_id
        AND sm.reason = 'sale'
        AND sm.reference_id = si.sale_id::text
        AND sm.product_id = si.product_id
  );

-- 3. Create journal entries for completed sales
-- Uses the same account mapping as post_sale():
--   Cash/Bank (1000/1300)        DR  total_amount
--   Accounts Receivable (1100)   DR  credit_amount (if credit sale)
--   Sales Revenue (4000)         CR  vatable_sales + vat_exempt_sales
--   Output VAT (2300)            CR  output_vat (VAT only)
--   SC/PWD Discount (4100)       CR  sc_pwd_discount_amount
--   Other Discount (4101)        CR  other_discount_amount
--   COGS (5000)                  DR  sum(cost_price_at_sale * quantity)
--   Inventory Asset (1200)       CR  sum(cost_price_at_sale * quantity)

DO $$
DECLARE
    v_sale RECORD;
    v_je UUID;
    v_total_vatable NUMERIC;
    v_total_output_vat NUMERIC;
    v_total_exempt NUMERIC;
    v_total_cogs NUMERIC;
    v_total_discount NUMERIC;
    v_total_sc_pwd NUMERIC;
    v_total_other_discount NUMERIC;
    v_cash_method TEXT;
    v_ar_amount NUMERIC;
    v_cash_amount NUMERIC;
    v_payment_method TEXT;
BEGIN
    FOR v_sale IN
        SELECT id, tenant_id, total_amount, gross_amount, total_discount_amount,
               sc_pwd_discount_amount, other_discount_amount, payment_method,
               cash_method, cashier_name, customer_id, customer_name,
               credit_amount, cash_amount, created_date
        FROM public.sales
        WHERE status = 'Completed'
          AND NOT EXISTS (
              SELECT 1 FROM public.journal_entries je
              WHERE je.tenant_id = sales.tenant_id
                AND je.reference_type = 'sale'
                AND je.reference_id = sales.id::text
          )
    LOOP
        -- Aggregate sale_items for this sale
        SELECT COALESCE(SUM(vatable_sales), 0),
               COALESCE(SUM(output_vat), 0),
               COALESCE(SUM(vat_exempt_sales), 0),
               COALESCE(SUM(cost_price_at_sale * quantity), 0)
        INTO v_total_vatable, v_total_output_vat, v_total_exempt, v_total_cogs
        FROM public.sale_items
        WHERE sale_id = v_sale.id;

        v_total_discount := COALESCE(v_sale.total_discount_amount, 0);
        v_total_sc_pwd := COALESCE(v_sale.sc_pwd_discount_amount, 0);
        v_total_other_discount := COALESCE(v_sale.other_discount_amount, 0);
        v_cash_method := v_sale.cash_method;
        v_payment_method := v_sale.payment_method;
        v_ar_amount := COALESCE(v_sale.credit_amount, 0);
        v_cash_amount := COALESCE(v_sale.cash_amount, 0);

        -- If cash_amount not set, infer from payment_method
        IF v_cash_amount = 0 AND v_ar_amount = 0 THEN
            IF v_payment_method IN ('Cash', 'Card', 'Gcash') THEN
                v_cash_amount := v_sale.total_amount;
            ELSIF v_payment_method = 'Utang' THEN
                v_ar_amount := v_sale.total_amount;
            ELSIF v_payment_method = 'Split' THEN
                v_cash_amount := v_sale.total_amount; -- fallback
            END IF;
        END IF;

        -- Insert journal entry header
        INSERT INTO public.journal_entries (
            tenant_id, date, reference_type, reference_id, description, party, payment_method
        ) VALUES (
            v_sale.tenant_id,
            v_sale.created_date,
            'sale'::journal_reference_type,
            v_sale.id::text,
            'Sale ' || LEFT(v_sale.id::text, 8),
            v_sale.customer_name,
            v_payment_method
        ) RETURNING id INTO v_je;

        -- Insert journal entry lines
        -- 1. Cash / Bank (debit)
        IF v_cash_amount > 0 THEN
            IF v_cash_method = 'Card' OR v_cash_method = 'Gcash' THEN
                INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
                VALUES (v_sale.tenant_id, v_je, '1300', 'Bank', v_cash_amount, 0);
            ELSE
                INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
                VALUES (v_sale.tenant_id, v_je, '1000', 'Cash', v_cash_amount, 0);
            END IF;
        END IF;

        -- 2. Accounts Receivable (debit) - for credit/utang sales
        IF v_ar_amount > 0 THEN
            INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
            VALUES (v_sale.tenant_id, v_je, '1100', 'Accounts Receivable', v_ar_amount, 0);
        END IF;

        -- 3. Sales Revenue - Vatable (credit) - VAT registered only
        IF v_total_vatable > 0 THEN
            INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
            VALUES (v_sale.tenant_id, v_je, '4000', 'Sales Revenue', 0, v_total_vatable);
        END IF;

        -- 4. Sales Revenue - VAT Exempt / Non-VAT (credit)
        IF v_total_exempt > 0 THEN
            INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
            VALUES (v_sale.tenant_id, v_je, '4000', 'Sales Revenue', 0, v_total_exempt);
        END IF;

        -- 5. Output VAT (credit) - VAT registered only
        IF v_total_output_vat > 0 THEN
            INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
            VALUES (v_sale.tenant_id, v_je, '2300', 'Output VAT', 0, v_total_output_vat);
        END IF;

        -- 6. SC/PWD Discount (credit) - contra-revenue
        IF v_total_sc_pwd > 0 THEN
            INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
            VALUES (v_sale.tenant_id, v_je, '4100', 'Sales Discount - Senior Citizen/PWD', 0, v_total_sc_pwd);
        END IF;

        -- 7. Other Discount (credit) - contra-revenue
        IF v_total_other_discount > 0 THEN
            INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
            VALUES (v_sale.tenant_id, v_je, '4101', 'Sales Discount - Other', 0, v_total_other_discount);
        END IF;

        -- 8. COGS (debit)
        IF v_total_cogs > 0 THEN
            INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
            VALUES (v_sale.tenant_id, v_je, '5000', 'Cost of Goods Sold', v_total_cogs, 0);
        END IF;

        -- 9. Inventory Asset (credit)
        IF v_total_cogs > 0 THEN
            INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount)
            VALUES (v_sale.tenant_id, v_je, '1200', 'Inventory Asset', 0, v_total_cogs);
        END IF;

        RAISE NOTICE 'Created journal entry % for sale % (tenant %)', v_je, v_sale.id, v_sale.tenant_id;
    END LOOP;
END $$;

-- 4. Ensure chart of accounts has all required accounts for existing tenants
-- (idempotent - only inserts missing)
INSERT INTO public.chart_of_accounts (tenant_id, code, name, type)
SELECT t.id, a->>'code', a->>'name', (a->>'type')::account_type
FROM public.tenants t
CROSS JOIN LATERAL jsonb_array_elements(public.account_lines()) a
WHERE NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts coa
    WHERE coa.tenant_id = t.id AND coa.code = a->>'code'
);

-- 5. Ensure expense categories exist for existing tenants
INSERT INTO public.expense_categories (tenant_id, name, account_code, account_name, is_default)
SELECT t.id, c->>'name', c->>'account_code', c->>'account_name', true
FROM public.tenants t
CROSS JOIN LATERAL jsonb_array_elements(public.expense_category_lines()) c
WHERE NOT EXISTS (
    SELECT 1 FROM public.expense_categories ec
    WHERE ec.tenant_id = t.id AND ec.name = c->>'name'
);

-- 6. Verify the backfill
DO $$
DECLARE
    v_tenant RECORD;
    v_sales_cnt INT;
    v_items_cnt INT;
    v_je_cnt INT;
    v_sm_cnt INT;
    v_vat_items INT;
BEGIN
    FOR v_tenant IN
        SELECT id, business_name FROM public.tenants
        WHERE id IN ('4d22d8a1-8c18-43ea-b08b-867f7f32fb07', '8dd01bc5-14dd-4f68-974e-6917f29f44eb')
    LOOP
        SELECT COUNT(*) INTO v_sales_cnt FROM public.sales WHERE tenant_id = v_tenant.id AND status = 'Completed';
        SELECT COUNT(*) INTO v_items_cnt FROM public.sale_items si JOIN public.sales s ON s.id = si.sale_id WHERE s.tenant_id = v_tenant.id AND s.status = 'Completed';
        SELECT COUNT(*) INTO v_vat_items FROM public.sale_items si JOIN public.sales s ON s.id = si.sale_id WHERE s.tenant_id = v_tenant.id AND s.status = 'Completed' AND (si.vatable_sales > 0 OR si.output_vat > 0 OR si.vat_exempt_sales > 0);
        SELECT COUNT(*) INTO v_je_cnt FROM public.journal_entries WHERE tenant_id = v_tenant.id AND reference_type = 'sale';
        SELECT COUNT(*) INTO v_sm_cnt FROM public.stock_movements WHERE tenant_id = v_tenant.id AND reason = 'sale';

        RAISE NOTICE 'Tenant: % (%), Sales: %, Items: %, VAT Items: %, JEs: %, StockMovements: %',
            v_tenant.business_name, v_tenant.id, v_sales_cnt, v_items_cnt, v_vat_items, v_je_cnt, v_sm_cnt;
    END LOOP;
END $$;

-- ============================================================================
-- NOTES:
-- - Run this via Supabase SQL Editor or: psql -f supabase/migrations/0026_backfill_sale_journal_stock.sql
-- - Idempotent: safe to re-run (checks for existing records before inserting)
-- - Handles both VAT and Non-VAT regimes via business_settings
-- - Does NOT create customer_ledger entries (those already exist from direct inserts)
-- - Does NOT create purchase/expense journal entries (no source data)
-- ============================================================================