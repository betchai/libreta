# Libreta

One account, many stores. Libreta is a business management platform for Philippine small businesses that runs any kind of store in one app — sari-sari and tingi shops, hardware depots, ranges and rentals, groceries, boutiques. Every store keeps its own stock, customers, books, profit, and BIR worksheets, isolated from each other and switchable in one click from the same sign-in.

Everything works together: point of sale with tare-scale and per-kilo selling, ingredient-style fractional (tingi) selling, inventory, customer credit, purchases, bookkeeping, expenses, and BIR tax compliance — recorded once, connected everywhere.

## Features

### Multi-Business (one account, many stores)
- Switch stores in one click from the sidebar — same login, no re-setup
- Separate stock, sales, customers, books, and BIR records per store
- Per-business VAT and pricing settings (VAT-registered or non-VAT)
- Role-based memberships per store (admin / cashier)
- Database guard: a sale item can never be recorded under the wrong store

### Point of Sale (POS)
- Fast cart-based checkout
- Tare scale checkout for per-kilo selling: enter gross weight and tare, net is priced at the per-kilo rate
- Fractional "tingi" selling: per sachet from a box, per meter cut from a length, per liter from a gallon
- Receipt printing
- Payment method tracking (cash, GCash, bank transfer, etc.)

### Inventory Management
- Product catalog with stock quantities and low-stock alerts
- Bulk CSV import for products
- Manual sales import
- Stock movement history

### Customers & Credit
- Customer profiles with credit limits
- Credit aging analysis (FIFO-based)
- Customer statements and ledger entries
- Payment recording and collection

### Suppliers & Purchase Orders
- Supplier management with accounts payable tracking
- Purchase order creation, sending, and receiving
- Supplier payment recording
- Product cost history

### Expenses
- Expense logging with category management
- Date-range filtering and CSV export

### Bookkeeping
- Double-entry journal entries
- Chart of accounts
- Trial balance computation
- General ledger view with CSV export

### BIR Compliance
Automated quarterly worksheets for Philippine BIR filings:

| Report | Form |
|--------|------|
| VAT Summary | 2550Q / 2550M |
| Sales Journal | — |
| Purchase Journal | — |
| Income Tax | 1701Q |
| Percentage Tax | 2551Q |
| SC/PWD Discount Report | — |

### Profit & Loss
- Real-time profit tracking with preset date ranges (today, this month, this quarter, all time)
- Custom date range filtering
- CSV export

### Dashboard
- Revenue summary
- Transaction count
- Outstanding customer balances
- Low stock alerts
- Payment method breakdown chart (Recharts)
- Recent sales list

### Multi-Tenant & User Management
- One account can hold memberships in many businesses, switchable at any time
- Per-business roles (admin, cashier) tied to each membership
- Business code system for joining tenants
- Invite-only onboarding via magic link (uninvited sign-ups are rejected)
- Platform admin console for superadmins
- User invitation system

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 + Radix UI |
| State | TanStack React Query |
| Routing | React Router 6 |
| Database & Auth | Supabase (PostgreSQL + RLS) |
| Charts | Recharts |
| Icons | Lucide React |
| Date Handling | date-fns (Manila timezone) |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase URL and anon key

# Start development server
npm run dev
```

### Environment Variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Project Structure

```
src/
├── api/
│   ├── supabaseClient.js      # Supabase client config
│   └── base44Client.js        # Supabase adapter (Base44 SDK surface)
├── components/
│   ├── bir/                   # BIR report components
│   ├── bookkeeping/           # Journal and ledger views
│   ├── customers/             # Customer dialogs and statements
│   ├── expenses/              # Expense forms and categories
│   ├── inventory/             # Product forms and import
│   ├── pos/                   # Cart and product grid
│   ├── purchase/              # PO forms, receive goods, AP summary
│   ├── suppliers/             # Supplier dialogs
│   ├── ui/                    # Shared UI primitives (Radix-based)
│   ├── Layout.jsx             # Sidebar navigation shell
│   └── OfflineBanner.jsx      # Connection status indicator
├── hooks/                     # React Query hooks per domain
├── lib/
│   ├── AuthContext.jsx         # Auth provider and session management
│   ├── ConnectionContext.jsx   # Online/offline heartbeat
│   ├── ErrorBoundary.jsx       # React error boundary
│   ├── auth-roles.js           # Role helpers (isAdmin, isSuperadmin)
│   ├── bookkeeping.js          # Journal entry logic and CSV export
│   ├── customerCredit.js       # Credit balance, FIFO aging, available credit
│   ├── discounts.js            # SC/PWD discount computation
│   ├── manilaTime.js           # Manila timezone utilities
│   ├── printReceipt.js         # Thermal receipt printer
│   ├── processSale.js          # Sale transaction processing
│   ├── purchaseOrders.js       # PO and accounts payable logic
│   └── utils.js                # General utilities
├── pages/
│   ├── LandingPage.jsx         # Public landing page
│   ├── Login.jsx               # Email/password + OTP login
│   ├── Onboarding.jsx          # Business code join flow
│   ├── Dashboard.jsx           # Overview stats and charts
│   ├── POS.jsx                 # Point of sale
│   ├── Sales.jsx               # Sales history and voiding
│   ├── Inventory.jsx           # Product management
│   ├── Customers.jsx           # Customer management
│   ├── CreditSummary.jsx       # Credit aging and collection
│   ├── CustomerReports.jsx     # Customer credit reports
│   ├── Suppliers.jsx           # Supplier management
│   ├── PurchaseOrders.jsx      # PO workflow
│   ├── Expenses.jsx            # Expense tracking
│   ├── Bookkeeping.jsx         # Journal entries and ledger
│   ├── BirCompliance.jsx       # BIR tax worksheets
│   ├── Profit.jsx              # Profit and loss
│   ├── Users.jsx               # User management
│   ├── Settings.jsx            # Business settings
│   ├── ImportHistory.jsx       # Data import log
│   └── PlatformAdmin.jsx       # Superadmin tenant management
├── App.jsx                     # Root with auth routing
├── main.jsx                    # Entry point
└── index.css                   # Tailwind + CSS variables
```

## Database

The app uses Supabase (PostgreSQL) with row-level security. Key tables:

- `tenants` — Business organizations
- `profiles` — User profiles linked to tenants
- `memberships` — User-to-business roles (admin/cashier per store)
- `products` — Inventory items
- `sales` / `sale_items` — Completed transactions
- `customers` — Customer records
- `customer_ledger_entries` — Credit/debit ledger
- `suppliers` — Supplier records
- `purchase_orders` / `purchase_order_items` — POs
- `supplier_payments` — Payments to suppliers
- `stock_movements` — Inventory changes
- `expenses` / `expense_categories` — Expense tracking
- `business_settings` — Per-tenant config
- `chart_of_accounts` — Account codes
- `journal_entries` / `journal_entry_lines` — Double-entry bookkeeping
- `import_batches` / `import_change_logs` — Bulk import audit trail
- `tenant_invitations` — Pending user invites

## License

Private — All rights reserved.
