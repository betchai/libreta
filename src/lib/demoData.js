const now = new Date().toISOString()
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString()

export const DEMO_SETTINGS = {
  id: 'demo-settings',
  business_name: 'Maria\'s Sari-Sari Store',
  business_address: '123 Rizal St., Quezon City',
  business_tin: '123-456-789-000',
  vat_registered: true,
  currency: '₱',
}

export const DEMO_PRODUCTS = [
  { id: 'p1', name: 'Coca-Cola 500ml', sku: 'CC500', base_price: 25, cost_price: 18, base_unit: 'pc', has_fractions: false, fraction_unit: null, fraction_price: null, sell_by_weight: false, stock_quantity: 120, low_stock_threshold: 20, category: 'Beverages', is_active: true, vat_exempt: false, sc_pwd_discount_eligible: true, created_date: ago(90), updated_date: ago(2) },
  { id: 'p2', name: 'Lays Classic 95g', sku: 'LC95', base_price: 55, cost_price: 42, base_unit: 'pc', has_fractions: false, fraction_unit: null, fraction_price: null, sell_by_weight: false, stock_quantity: 48, low_stock_threshold: 15, category: 'Snacks', is_active: true, vat_exempt: false, sc_pwd_discount_eligible: true, created_date: ago(90), updated_date: ago(1) },
  { id: 'p3', name: 'Jasmine Rice 5kg', sku: 'JR5K', base_price: 285, cost_price: 240, base_unit: 'sack', has_fractions: true, fraction_unit: 'kg', fraction_price: 57, sell_by_weight: true, stock_quantity: 25, low_stock_threshold: 10, category: 'Rice', is_active: true, vat_exempt: false, sc_pwd_discount_eligible: true, created_date: ago(80), updated_date: ago(3) },
  { id: 'p4', name: 'Palmolive Shampoo 170ml', sku: 'PS170', base_price: 68, cost_price: 52, base_unit: 'pc', has_fractions: false, fraction_unit: null, fraction_price: null, sell_by_weight: false, stock_quantity: 35, low_stock_threshold: 10, category: 'Personal Care', is_active: true, vat_exempt: false, sc_pwd_discount_eligible: true, created_date: ago(75), updated_date: ago(5) },
  { id: 'p5', name: 'Bear Brand Powdered Milk 300g', sku: 'BB300', base_price: 128, cost_price: 105, base_unit: 'pc', has_fractions: false, fraction_unit: null, fraction_price: null, sell_by_weight: false, stock_quantity: 30, low_stock_threshold: 10, category: 'Dairy', is_active: true, vat_exempt: false, sc_pwd_discount_eligible: true, created_date: ago(70), updated_date: ago(2) },
  { id: 'p6', name: 'Maggi Savor 200ml', sku: 'MS200', base_price: 42, cost_price: 33, base_unit: 'pc', has_fractions: false, fraction_unit: null, fraction_price: null, sell_by_weight: false, stock_quantity: 40, low_stock_threshold: 10, category: 'Condiments', is_active: true, vat_exempt: false, sc_pwd_discount_eligible: true, created_date: ago(65), updated_date: ago(4) },
  { id: 'p7', name: 'Tide Powder 800g', sku: 'TP800', base_price: 98, cost_price: 78, base_unit: 'pc', has_fractions: false, fraction_unit: null, fraction_price: null, sell_by_weight: false, stock_quantity: 22, low_stock_threshold: 8, category: 'Household', is_active: true, vat_exempt: false, sc_pwd_discount_eligible: true, created_date: ago(60), updated_date: ago(1) },
  { id: 'p8', name: 'Lucky Me Pancit Canton 60g', sku: 'LMPC', base_price: 14, cost_price: 10, base_unit: 'pc', has_fractions: false, fraction_unit: null, fraction_price: null, sell_by_weight: false, stock_quantity: 200, low_stock_threshold: 30, category: 'Instant Noodles', is_active: true, vat_exempt: false, sc_pwd_discount_eligible: true, created_date: ago(55), updated_date: ago(1) },
  { id: 'p9', name: 'Pocari Sweat 500ml', sku: 'PS500', base_price: 32, cost_price: 24, base_unit: 'pc', has_fractions: false, fraction_unit: null, fraction_price: null, sell_by_weight: false, stock_quantity: 3, low_stock_threshold: 10, category: 'Beverages', is_active: true, vat_exempt: false, sc_pwd_discount_eligible: true, created_date: ago(50), updated_date: ago(1) },
  { id: 'p10', name: 'Nestea Iced Tea 1kg', sku: 'NI1K', base_price: 185, cost_price: 155, base_unit: 'pack', has_fractions: false, fraction_unit: null, fraction_price: null, sell_by_weight: false, stock_quantity: 12, low_stock_threshold: 5, category: 'Beverages', is_active: true, vat_exempt: false, sc_pwd_discount_eligible: true, created_date: ago(45), updated_date: ago(2) },
]

export const DEMO_CUSTOMERS = [
  { id: 'c1', name: 'Juan Dela Cruz', phone: '0917-123-4567', credit_limit: 5000, is_active: true, created_date: ago(60) },
  { id: 'c2', name: 'Ana Santos', phone: '0918-234-5678', credit_limit: 10000, is_active: true, created_date: ago(55) },
  { id: 'c3', name: 'Pedro Reyes', phone: '0919-345-6789', credit_limit: 3000, is_active: true, created_date: ago(50) },
  { id: 'c4', name: 'Maria Garcia', phone: '0920-456-7890', credit_limit: 8000, is_active: true, created_date: ago(45) },
  { id: 'c5', name: 'Jose Mendoza', phone: '0921-567-8901', credit_limit: 0, is_active: true, created_date: ago(40) },
]

export const DEMO_SALES = [
  { id: 's1', customer_id: 'c1', customer_name: 'Juan Dela Cruz', total_amount: 1250, payment_method: 'Cash', status: 'Completed', discount_total: 0, created_date: ago(0), updated_date: ago(0) },
  { id: 's2', customer_id: 'c2', customer_name: 'Ana Santos', total_amount: 3420, payment_method: 'GCash', status: 'Completed', discount_total: 50, created_date: ago(0), updated_date: ago(0) },
  { id: 's3', customer_id: null, customer_name: 'Walk-in', total_amount: 680, payment_method: 'Cash', status: 'Completed', discount_total: 0, created_date: ago(1), updated_date: ago(1) },
  { id: 's4', customer_id: 'c3', customer_name: 'Pedro Reyes', total_amount: 5100, payment_method: 'Credit', status: 'Completed', discount_total: 100, created_date: ago(1), updated_date: ago(1) },
  { id: 's5', customer_id: null, customer_name: 'Walk-in', total_amount: 195, payment_method: 'Cash', status: 'Completed', discount_total: 0, created_date: ago(2), updated_date: ago(2) },
  { id: 's6', customer_id: 'c4', customer_name: 'Maria Garcia', total_amount: 8900, payment_method: 'Bank Transfer', status: 'Completed', discount_total: 0, created_date: ago(3), updated_date: ago(3) },
  { id: 's7', customer_id: 'c1', customer_name: 'Juan Dela Cruz', total_amount: 720, payment_method: 'Cash', status: 'Completed', discount_total: 0, created_date: ago(5), updated_date: ago(5) },
  { id: 's8', customer_id: null, customer_name: 'Walk-in', total_amount: 445, payment_method: 'GCash', status: 'Completed', discount_total: 25, created_date: ago(7), updated_date: ago(7) },
]

export const DEMO_SALE_ITEMS = [
  { id: 'si1', sale_id: 's1', product_id: 'p1', product_name: 'Coca-Cola 500ml', quantity: 20, unit_price: 25, price_at_sale: 25, cost_price: 18, line_total: 500, base_unit: 'pc' },
  { id: 'si2', sale_id: 's1', product_id: 'p3', product_name: 'Jasmine Rice 5kg', quantity: 2, unit_price: 285, price_at_sale: 285, cost_price: 240, line_total: 570, base_unit: 'sack' },
  { id: 'si3', sale_id: 's1', product_id: 'p2', product_name: 'Lays Classic 95g', quantity: 3, unit_price: 55, price_at_sale: 55, cost_price: 42, line_total: 165, base_unit: 'pc' },
  { id: 'si4', sale_id: 's2', product_id: 'p5', product_name: 'Bear Brand Powdered Milk 300g', quantity: 10, unit_price: 128, price_at_sale: 128, cost_price: 105, line_total: 1280, base_unit: 'pc' },
  { id: 'si5', sale_id: 's2', product_id: 'p7', product_name: 'Tide Powder 800g', quantity: 8, unit_price: 98, price_at_sale: 98, cost_price: 78, line_total: 784, base_unit: 'pc' },
  { id: 'si6', sale_id: 's2', product_id: 'p10', product_name: 'Nestea Iced Tea 1kg', quantity: 5, unit_price: 185, price_at_sale: 185, cost_price: 155, line_total: 925, base_unit: 'pack' },
]

export const DEMO_LEDGER_ENTRIES = [
  { id: 'le1', customer_id: 'c1', type: 'sale', amount: 1250, date: ago(0), description: 'POS Sale s1' },
  { id: 'le2', customer_id: 'c1', type: 'payment', amount: -1000, date: ago(2), description: 'Payment received' },
  { id: 'le3', customer_id: 'c2', type: 'sale', amount: 3420, date: ago(0), description: 'POS Sale s2' },
  { id: 'le4', customer_id: 'c2', type: 'payment', amount: -2000, date: ago(3), description: 'GCash payment' },
  { id: 'le5', customer_id: 'c3', type: 'sale', amount: 5100, date: ago(1), description: 'POS Sale s4' },
  { id: 'le6', customer_id: 'c3', type: 'payment', amount: -2000, date: ago(5), description: 'Cash payment' },
  { id: 'le7', customer_id: 'c4', type: 'sale', amount: 8900, date: ago(3), description: 'POS Sale s6' },
]

export const DEMO_SUPPLIERS = [
  { id: 'sp1', name: 'Coca-Cola Philippines', contact_person: 'Ricardo Lim', phone: '0917-000-1111', address: 'Makati City', created_date: ago(90) },
  { id: 'sp2', name: 'Lopez Food Distributors', contact_person: 'Sofia Lopez', phone: '0918-000-2222', address: 'Pasig City', created_date: ago(80) },
  { id: 'sp3', name: 'RFM Corporation', contact_person: 'Antonio Cruz', phone: '0919-000-3333', address: 'Quezon City', created_date: ago(70) },
]

export const DEMO_PURCHASE_ORDERS = [
  { id: 'po1', supplier_id: 'sp1', supplier_name: 'Coca-Cola Philippines', status: 'fully_received', total_amount: 12000, created_date: ago(15), updated_date: ago(10) },
  { id: 'po2', supplier_id: 'sp2', supplier_name: 'Lopez Food Distributors', status: 'sent', total_amount: 8500, created_date: ago(5), updated_date: ago(5) },
  { id: 'po3', supplier_id: 'sp3', supplier_name: 'RFM Corporation', status: 'draft', total_amount: 25000, created_date: ago(2), updated_date: ago(2) },
]

export const DEMO_EXPENSES = [
  { id: 'e1', category: 'Rent', amount: 15000, description: 'Monthly store rent', date: ago(5), created_date: ago(5) },
  { id: 'e2', category: 'Utilities', amount: 2800, description: 'Meralco electric bill', date: ago(8), created_date: ago(8) },
  { id: 'e3', category: 'Utilities', amount: 850, description: 'Manila Water bill', date: ago(8), created_date: ago(8) },
  { id: 'e4', category: 'Supplies', amount: 1200, description: 'Packaging bags and receipts', date: ago(12), created_date: ago(12) },
  { id: 'e5', category: 'Transport', amount: 500, description: 'Delivery tricycle fare', date: ago(15), created_date: ago(15) },
  { id: 'e6', category: 'Salary', amount: 8000, description: 'Part-time helper (2 weeks)', date: ago(14), created_date: ago(14) },
]

export const DEMO_EXPENSE_CATEGORIES = [
  { id: 'ec1', name: 'Rent' },
  { id: 'ec2', name: 'Utilities' },
  { id: 'ec3', name: 'Supplies' },
  { id: 'ec4', name: 'Transport' },
  { id: 'ec5', name: 'Salary' },
  { id: 'ec6', name: 'Miscellaneous' },
]

export const DEMO_STOCK_MOVEMENTS = [
  { id: 'sm1', product_id: 'p1', product_name: 'Coca-Cola 500ml', type: 'in', quantity: 100, date: ago(15), reference: 'PO po1' },
  { id: 'sm2', product_id: 'p2', product_name: 'Lays Classic 95g', type: 'in', quantity: 50, date: ago(15), reference: 'PO po1' },
  { id: 'sm3', product_id: 'p1', product_name: 'Coca-Cola 500ml', type: 'out', quantity: 20, date: ago(0), reference: 'Sale s1' },
  { id: 'sm4', product_id: 'p3', product_name: 'Jasmine Rice 5kg', type: 'out', quantity: 2, date: ago(0), reference: 'Sale s1' },
]

export const DEMO_SUPPLIER_PAYMENTS = [
  { id: 'spay1', supplier_id: 'sp1', amount: 12000, date: ago(10), reference: 'PO po1 payment' },
]

export const DEMO_CHART_OF_ACCOUNTS = [
  { id: 'coa1', code: '1000', name: 'Cash', type: 'Asset' },
  { id: 'coa2', code: '1100', name: 'Accounts Receivable', type: 'Asset' },
  { id: 'coa3', code: '1200', name: 'Inventory', type: 'Asset' },
  { id: 'coa4', code: '2000', name: 'Accounts Payable', type: 'Liability' },
  { id: 'coa11', code: '2300', name: 'Output VAT', type: 'Liability' },
  { id: 'coa5', code: '3000', name: 'Owner\'s Equity', type: 'Equity' },
  { id: 'coa6', code: '4000', name: 'Sales Revenue', type: 'Revenue' },
  { id: 'coa7', code: '5000', name: 'Cost of Goods Sold', type: 'Expense' },
  { id: 'coa8', code: '5100', name: 'Rent Expense', type: 'Expense' },
  { id: 'coa9', code: '5200', name: 'Utilities Expense', type: 'Expense' },
  { id: 'coa10', code: '5300', name: 'Supplies Expense', type: 'Expense' },
]

export const DEMO_JOURNAL_ENTRIES = [
  {
    id: 'je1', date: ago(0), description: 'Daily sales - cash',
    lines: [
      { account: '1000', account_name: 'Cash', debit: 48260, credit: 0 },
      { account: '4000', account_name: 'Sales Revenue', debit: 0, credit: 48260 },
    ],
  },
  {
    id: 'je2', date: ago(5), description: 'Monthly rent payment',
    lines: [
      { account: '5100', account_name: 'Rent Expense', debit: 15000, credit: 0 },
      { account: '1000', account_name: 'Cash', debit: 0, credit: 15000 },
    ],
  },
  {
    id: 'je3', date: ago(8), description: 'Utility bills payment',
    lines: [
      { account: '5200', account_name: 'Utilities Expense', debit: 3650, credit: 0 },
      { account: '1000', account_name: 'Cash', debit: 0, credit: 3650 },
    ],
  },
]

export const DEMO_USER = {
  id: 'demo-user-id',
  email: 'demo@libreta.app',
  full_name: 'Demo User',
  role: 'admin',
  platform_role: null,
  tenant_id: 'demo-tenant-id',
}

export const DEMO_PROFILE = {
  id: 'demo-user-id',
  full_name: 'Demo User',
  role: 'admin',
  platform_role: null,
  tenant_id: 'demo-tenant-id',
  email: 'demo@libreta.app',
}

export const DEMO_TENANT = {
  id: 'demo-tenant-id',
  name: "Maria's Sari-Sari Store",
}