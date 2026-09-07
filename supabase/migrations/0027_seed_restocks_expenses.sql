-- ============================================================================
-- Libreta by Blink — Seed Sample Restocks & Expenses for Testing
-- For: Blink Hardware (VAT) + Blink General Merchandise (Non-VAT)
-- Run AFTER 0026_backfill_sale_journal_stock.sql
-- ============================================================================

-- Helper: Get a VAT-registered supplier for each tenant
-- We'll create suppliers if they don't exist, then create restocks/expenses

DO $$
DECLARE
    v_tenant_hw UUID := '4d22d8a1-8c18-43ea-b08b-867f7f32fb07';  -- Blink Hardware
    v_tenant_gm UUID := '8dd01bc5-14dd-4f68-974e-6917f29f44eb';  -- Blink General Merchandise
    v_supplier_hw UUID;
    v_supplier_gm UUID;
    v_po_hw UUID;
    v_po_gm UUID;
    v_product RECORD;
    v_qty NUMERIC;
    v_cost NUMERIC;
    v_gross NUMERIC;
    v_input_vat NUMERIC;
    v_net NUMERIC;
    v_je UUID;
    v_date TIMESTAMPTZ;
    v_invoice TEXT;
BEGIN
    -- =========================================================================
    -- BLINK HARDWARE (VAT-registered)
    -- =========================================================================

    -- Create VAT-registered supplier
    INSERT INTO public.suppliers (tenant_id, name, contact_person, phone, email, address, tin, is_vat_registered, payment_terms, is_active)
    VALUES (v_tenant_hw, 'Makati Hardware Supply Co.', 'Roberto Santos', '0917-123-4567', 'sales@makatihardware.ph', '123 Makati Ave, Makati City', '123-456-789-000', true, 'Net 30', true)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_supplier_hw;

    -- If already exists, get it
    IF v_supplier_hw IS NULL THEN
        SELECT id INTO v_supplier_hw FROM public.suppliers WHERE tenant_id = v_tenant_hw AND is_vat_registered = true LIMIT 1;
    END IF;

    -- Create purchase order
    INSERT INTO public.purchase_orders (tenant_id, po_number, supplier_id, supplier_name, order_date, expected_delivery_date, status, payment_terms, notes)
    VALUES (v_tenant_hw, 'PO-HW-2026-001', v_supplier_hw, 'Makati Hardware Supply Co.', '2026-07-01', '2026-07-05', 'fully_received', 'Net 30', 'Initial stock for Q3')
    RETURNING id INTO v_po_hw;

    -- Get products to restock
    FOR v_product IN
        SELECT id, name, cost_price FROM public.products WHERE tenant_id = v_tenant_hw LIMIT 15
    LOOP
        v_qty := (10 + floor(random() * 50))::int;  -- 10-60 units
        v_cost := v_product.cost_price;
        v_gross := v_qty * v_cost;
        v_input_vat := ROUND(v_gross / 1.12 * 0.12, 2);
        v_net := v_gross - v_input_vat;
        v_date := '2026-07-05'::date + (random() * 30)::int * interval '1 day';
        v_invoice := 'SI-' || to_char(v_date, 'YYYYMMDD') || '-' || LPAD(floor(random() * 1000)::text, 4, '0');

        -- Stock movement (restock)
        INSERT INTO public.stock_movements (
            tenant_id, product_id, product_name, quantity, direction, reason,
            reference_id, recorded_by, supplier_id, supplier_name, supplier_tin,
            po_id, paid, invoice_or_receipt_number, is_vat_registered_supplier,
            purchase_cost, input_vat, non_creditable, created_at
        ) VALUES (
            v_tenant_hw, v_product.id, v_product.name, v_qty, 'in', 'restock',
            v_po_hw::text, 'Admin', v_supplier_hw, 'Makati Hardware Supply Co.', '123-456-789-000',
            v_po_hw, false, v_invoice, true,
            v_gross, v_input_vat, false, v_date
        );

        -- Update product stock
        UPDATE public.products SET stock_quantity = stock_quantity + v_qty WHERE id = v_product.id AND tenant_id = v_tenant_hw;

        -- PO item
        INSERT INTO public.purchase_order_items (tenant_id, po_id, product_id, product_name, quantity_ordered, quantity_received, unit_of_purchase, unit_cost, line_total)
        VALUES (v_tenant_hw, v_po_hw, v_product.id, v_product.name, v_qty, v_qty, 'pc', v_cost, v_gross);

        -- Cost history
        INSERT INTO public.product_cost_history (tenant_id, product_id, product_name, date, previous_average_cost, new_average_cost, quantity_received, actual_unit_cost, triggering_po_id)
        VALUES (v_tenant_hw, v_product.id, v_product.name, v_date, v_cost, v_cost, v_qty, v_cost, v_po_hw);
    END LOOP;

    -- Journal entry for purchase batch
    SELECT COALESCE(SUM(purchase_cost), 0), COALESCE(SUM(input_vat), 0), COALESCE(SUM(purchase_cost - input_vat), 0)
    INTO v_gross, v_input_vat, v_net
    FROM public.stock_movements
    WHERE tenant_id = v_tenant_hw AND reason = 'restock' AND po_id = v_po_hw;

    INSERT INTO public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
    VALUES (v_tenant_hw, '2026-07-05'::timestamptz, 'purchase', v_po_hw::text, 'PO ' || (SELECT po_number FROM public.purchase_orders WHERE id = v_po_hw) || ' receipt — Makati Hardware Supply Co.', 'Makati Hardware Supply Co.', 'On Account')
    RETURNING id INTO v_je;

    INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) VALUES
    (v_tenant_hw, v_je, '1200', 'Inventory Asset', v_net, 0),
    (v_tenant_hw, v_je, '1500', 'Input VAT', v_input_vat, 0),
    (v_tenant_hw, v_je, '2000', 'Accounts Payable', 0, v_gross);

    -- Supplier payment
    INSERT INTO public.supplier_payments (tenant_id, supplier_id, supplier_name, po_id, payment_date, amount, payment_method, reference_number, journal_entry_id)
    VALUES (v_tenant_hw, v_supplier_hw, 'Makati Hardware Supply Co.', v_po_hw, '2026-07-20', v_gross, 'Bank Transfer', 'PMT-' || v_po_hw::text, v_je);

    -- Payment journal
    INSERT INTO public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
    VALUES (v_tenant_hw, '2026-07-20'::timestamptz, 'supplier_payment', v_po_hw::text, 'Payment for PO ' || (SELECT po_number FROM public.purchase_orders WHERE id = v_po_hw), 'Makati Hardware Supply Co.', 'Bank Transfer')
    RETURNING id INTO v_je;

    INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) VALUES
    (v_tenant_hw, v_je, '2000', 'Accounts Payable', v_gross, 0),
    (v_tenant_hw, v_je, '1000', 'Cash', 0, v_gross);

    -- Update PO as paid
    UPDATE public.purchase_orders SET paid = true WHERE id = v_po_hw;

    -- Expenses for Blink Hardware
    FOR v_product IN SELECT * FROM (VALUES
        ('Rent', '6000', 25000, 'Monthly store rent - July', '2026-07-01'::timestamptz, 'INV-RENT-07', true, false),
        ('Utilities', '6100', 8500, 'Meralco - July', '2026-07-10'::timestamptz, 'INV-MER-07', true, false),
        ('Utilities', '6100', 2200, 'Manila Water - July', '2026-07-12'::timestamptz, 'INV-MW-07', true, false),
        ('Supplies', '6500', 3500, 'Office supplies', '2026-07-15'::timestamptz, 'INV-SUP-07', true, false),
        ('Transport', '6300', 1500, 'Delivery fuel', '2026-07-18'::timestamptz, 'INV-TRN-07', true, false),
        ('Salary', '6200', 18000, 'Helper wages - Jul 1-15', '2026-07-16'::timestamptz, 'INV-SAL-07A', false, true),
        ('Salary', '6200', 18000, 'Helper wages - Jul 16-31', '2026-08-01'::timestamptz, 'INV-SAL-07B', false, true),
        ('Rent', '6000', 25000, 'Monthly store rent - August', '2026-08-01'::timestamptz, 'INV-RENT-08', true, false),
        ('Utilities', '6100', 9200, 'Meralco - August', '2026-08-10'::timestamptz, 'INV-MER-08', true, false),
        ('Repairs', '6400', 5500, 'Aircon repair', '2026-08-15'::timestamptz, 'INV-REP-08', true, false)
    ) AS e(cat, acct, amt, descr, dt, inv, vat_reg, non_cred)
    LOOP
        v_gross := v_product.amt;
        v_input_vat := CASE WHEN v_product.vat_reg AND NOT v_product.non_cred THEN ROUND(v_gross / 1.12 * 0.12, 2) ELSE 0 END;
        v_net := v_gross - v_input_vat;

        INSERT INTO public.expenses (tenant_id, date, category, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
        VALUES (v_tenant_hw, v_product.dt, v_product.cat, v_product.descr, v_gross, 'Cash', 'Various', v_product.inv, v_product.vat_reg, v_input_vat, v_product.non_cred, v_product.dt);

        -- Expense journal
        INSERT INTO public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
        VALUES (v_tenant_hw, v_product.dt, 'expense', gen_random_uuid()::text, v_product.descr, 'Various', 'Cash')
        RETURNING id INTO v_je;

        INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) VALUES
        (v_tenant_hw, v_je, v_product.acct, v_product.cat || ' Expense', v_net, 0),
        (v_tenant_hw, v_je, '1500', 'Input VAT', v_input_vat, 0),
        (v_tenant_hw, v_je, '1000', 'Cash', 0, v_gross);
    END LOOP;

    -- =========================================================================
    -- BLINK GENERAL MERCHANDISE (Non-VAT / Percentage Tax)
    -- =========================================================================

    -- Create non-VAT supplier
    INSERT INTO public.suppliers (tenant_id, name, contact_person, phone, email, address, tin, is_vat_registered, payment_terms, is_active)
    VALUES (v_tenant_gm, 'Divisoria Wholesale Center', 'Maria Dela Cruz', '0918-765-4321', 'orders@divisoriawholesale.ph', '456 Divisoria St, Manila', '987-654-321-000', false, 'COD', true)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_supplier_gm;

    IF v_supplier_gm IS NULL THEN
        SELECT id INTO v_supplier_gm FROM public.suppliers WHERE tenant_id = v_tenant_gm AND is_vat_registered = false LIMIT 1;
    END IF;

    -- Create purchase order
    INSERT INTO public.purchase_orders (tenant_id, po_number, supplier_id, supplier_name, order_date, expected_delivery_date, status, payment_terms, notes)
    VALUES (v_tenant_gm, 'PO-GM-2026-001', v_supplier_gm, 'Divisoria Wholesale Center', '2026-07-01', '2026-07-03', 'fully_received', 'COD', 'Initial grocery stock')
    RETURNING id INTO v_po_gm;

    -- Restock products
    FOR v_product IN
        SELECT id, name, cost_price FROM public.products WHERE tenant_id = v_tenant_gm LIMIT 12
    LOOP
        v_qty := (20 + floor(random() * 80))::int;  -- 20-100 units
        v_cost := v_product.cost_price;
        v_gross := v_qty * v_cost;
        v_input_vat := 0;  -- Non-VAT supplier, non-VAT business = no input VAT
        v_net := v_gross;
        v_date := '2026-07-03'::date + (random() * 25)::int * interval '1 day';
        v_invoice := 'OR-' || to_char(v_date, 'YYYYMMDD') || '-' || LPAD(floor(random() * 1000)::text, 4, '0');

        -- Stock movement (restock) - non_creditable = true since supplier not VAT-registered
        INSERT INTO public.stock_movements (
            tenant_id, product_id, product_name, quantity, direction, reason,
            reference_id, recorded_by, supplier_id, supplier_name, supplier_tin,
            po_id, paid, invoice_or_receipt_number, is_vat_registered_supplier,
            purchase_cost, input_vat, non_creditable, created_at
        ) VALUES (
            v_tenant_gm, v_product.id, v_product.name, v_qty, 'in', 'restock',
            v_po_gm::text, 'Admin', v_supplier_gm, 'Divisoria Wholesale Center', '987-654-321-000',
            v_po_gm, true, v_invoice, false,
            v_gross, 0, true, v_date
        );

        -- Update product stock
        UPDATE public.products SET stock_quantity = stock_quantity + v_qty WHERE id = v_product.id AND tenant_id = v_tenant_gm;

        -- PO item
        INSERT INTO public.purchase_order_items (tenant_id, po_id, product_id, product_name, quantity_ordered, quantity_received, unit_of_purchase, unit_cost, line_total)
        VALUES (v_tenant_gm, v_po_gm, v_product.id, v_product.name, v_qty, v_qty, 'pc', v_cost, v_gross);

        -- Cost history
        INSERT INTO public.product_cost_history (tenant_id, product_id, product_name, date, previous_average_cost, new_average_cost, quantity_received, actual_unit_cost, triggering_po_id)
        VALUES (v_tenant_gm, v_product.id, v_product.name, v_date, v_cost, v_cost, v_qty, v_cost, v_po_gm);
    END LOOP;

    -- Journal entry for purchase (COD - paid immediately)
    SELECT COALESCE(SUM(purchase_cost), 0) INTO v_gross
    FROM public.stock_movements
    WHERE tenant_id = v_tenant_gm AND reason = 'restock' AND po_id = v_po_gm;

    INSERT INTO public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
    VALUES (v_tenant_gm, '2026-07-03'::timestamptz, 'purchase', v_po_gm::text, 'PO ' || (SELECT po_number FROM public.purchase_orders WHERE id = v_po_gm) || ' receipt — Divisoria Wholesale Center', 'Divisoria Wholesale Center', 'Cash')
    RETURNING id INTO v_je;

    INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) VALUES
    (v_tenant_gm, v_je, '1200', 'Inventory Asset', v_gross, 0),
    (v_tenant_gm, v_je, '1000', 'Cash', 0, v_gross);

    -- Update PO as paid
    UPDATE public.purchase_orders SET paid = true WHERE id = v_po_gm;

    -- Expenses for Blink General Merchandise (non-VAT)
    FOR v_product IN SELECT * FROM (VALUES
        ('Rent', '6000', 15000, 'Monthly stall rent - July', '2026-07-01'::timestamptz, 'OR-RENT-07', false, true),
        ('Utilities', '6100', 3500, 'Electricity - July', '2026-07-10'::timestamptz, 'OR-MER-07', false, true),
        ('Supplies', '6500', 1200, 'Packaging bags', '2026-07-12'::timestamptz, 'OR-SUP-07', false, true),
        ('Transport', '6300', 800, 'Tricycle delivery', '2026-07-15'::timestamptz, 'OR-TRN-07', false, true),
        ('Salary', '6200', 10000, 'Helper wages - Jul', '2026-07-31'::timestamptz, 'OR-SAL-07', false, true),
        ('Rent', '6000', 15000, 'Monthly stall rent - August', '2026-08-01'::timestamptz, 'OR-RENT-08', false, true),
        ('Utilities', '6100', 3800, 'Electricity - August', '2026-08-10'::timestamptz, 'OR-MER-08', false, true),
        ('Marketing', '7000', 2500, 'Flyers printing', '2026-08-15'::timestamptz, 'OR-MKT-08', false, true)
    ) AS e(cat, acct, amt, descr, dt, inv, vat_reg, non_cred)
    LOOP
        v_gross := v_product.amt;
        v_input_vat := 0;  -- Non-VAT business = no input VAT ever

        INSERT INTO public.expenses (tenant_id, date, category, description, amount, payment_method, payee, receipt_or_invoice_number, is_vat_registered_payee, input_vat, non_creditable, created_at)
        VALUES (v_tenant_gm, v_product.dt, v_product.cat, v_product.descr, v_gross, 'Cash', 'Various', v_product.inv, v_product.vat_reg, v_input_vat, v_product.non_cred, v_product.dt);

        -- Expense journal
        INSERT INTO public.journal_entries (tenant_id, date, reference_type, reference_id, description, party, payment_method)
        VALUES (v_tenant_gm, v_product.dt, 'expense', gen_random_uuid()::text, v_product.descr, 'Various', 'Cash')
        RETURNING id INTO v_je;

        INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account, account_name, debit_amount, credit_amount) VALUES
        (v_tenant_gm, v_je, v_product.acct, v_product.cat || ' Expense', v_gross, 0),
        (v_tenant_gm, v_je, '1000', 'Cash', 0, v_gross);
    END LOOP;

    RAISE NOTICE 'Seeded restocks & expenses for both tenants';
END $$;

-- Verify
DO $$
DECLARE
    v_tenant RECORD;
    v_sm_restock INT;
    v_exp_cnt INT;
    v_je_purchase INT;
    v_je_expense INT;
    v_input_vat_total NUMERIC;
BEGIN
    FOR v_tenant IN
        SELECT id, business_name FROM public.tenants
        WHERE id IN ('4d22d8a1-8c18-43ea-b08b-867f7f32fb07', '8dd01bc5-14dd-4f68-974e-6917f29f44eb')
    LOOP
        SELECT COUNT(*) INTO v_sm_restock FROM public.stock_movements WHERE tenant_id = v_tenant.id AND reason = 'restock';
        SELECT COUNT(*) INTO v_exp_cnt FROM public.expenses WHERE tenant_id = v_tenant.id;
        SELECT COUNT(*) INTO v_je_purchase FROM public.journal_entries WHERE tenant_id = v_tenant.id AND reference_type = 'purchase';
        SELECT COUNT(*) INTO v_je_expense FROM public.journal_entries WHERE tenant_id = v_tenant.id AND reference_type = 'expense';
        SELECT COALESCE(SUM(input_vat), 0) INTO v_input_vat_total FROM public.stock_movements WHERE tenant_id = v_tenant.id AND reason = 'restock';

        RAISE NOTICE 'Tenant: % | Restocks: % | Expenses: % | Purchase JEs: % | Expense JEs: % | Total Input VAT: %',
            v_tenant.business_name, v_sm_restock, v_exp_cnt, v_je_purchase, v_je_expense, v_input_vat_total;
    END LOOP;
END $$;

-- ============================================================================
-- Expected Results:
-- Blink Hardware (VAT):
--   - ~15 restock movements with input_vat > 0, non_creditable = false
--   - ~10 expenses with input_vat > 0 (rent, utilities, supplies, transport)
--   - Purchase JEs with DR Inventory + DR Input VAT, CR Accounts Payable
--   - Expense JEs with DR Expense + DR Input VAT, CR Cash
--   - Purchase Journal shows creditable input VAT
--   - VAT Summary (2550Q) shows Output VAT vs Input VAT
--
-- Blink General Merchandise (Non-VAT):
--   - ~12 restock movements with input_vat = 0, non_creditable = true
--   - ~8 expenses with input_vat = 0
--   - Purchase JEs with DR Inventory only, CR Cash (no VAT)
--   - Expense JEs with DR Expense only, CR Cash (no VAT)
--   - Purchase Journal shows non-creditable
--   - Percentage Tax (2551Q) works on gross sales
-- ============================================================================