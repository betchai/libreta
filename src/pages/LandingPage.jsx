import { useAuth } from '@/lib/AuthContext'
import {
  Sparkles, ArrowRight, ShoppingCart, Boxes, HandCoins, Truck,
  BookOpenCheck, WalletCards, Store, Wheat, CakeSlice, Shirt,
  FileCheck2, Heart, Hammer, Target, ArrowRightLeft,
} from 'lucide-react'

const FB_URL = 'https://www.facebook.com/profile.php?id=61582668640980'

function Icon({ name, className }) {
  const icons = {
    'shopping-cart': ShoppingCart,
    boxes: Boxes,
    'hand-coins': HandCoins,
    truck: Truck,
    'book-open-check': BookOpenCheck,
    'wallet-cards': WalletCards,
    store: Store,
    wheat: Wheat,
    'cake-slice': CakeSlice,
    shirt: Shirt,
    sparkles: Sparkles,
    'arrow-right': ArrowRight,
    'file-check-2': FileCheck2,
    heart: Heart,
    hammer: Hammer,
    target: Target,
    'arrow-right-left': ArrowRightLeft,
  }
  const Comp = icons[name]
  return Comp ? <Comp className={className} /> : null
}

const FEATURES = [
  { icon: 'shopping-cart', color: 'pink', bg: 'bg-pink-50', border: 'border-pink-100', iconBg: 'bg-pink-500', title: 'Sell faster at the counter.', desc: 'Cart-based POS, weight-scale checkout for per-kilo pricing, receipt printing, and payment method tracking.', tag: 'SALES & POS', tagColor: 'text-pink-600' },
  { icon: 'boxes', color: 'blue', bg: 'bg-blue-50', border: 'border-blue-100', iconBg: 'bg-blue-500', title: 'Know what is on your shelves.', desc: 'Product catalog, stock quantities, low-stock alerts, bulk CSV import, manual sales import, and stock movement history.', tag: 'INVENTORY', tagColor: 'text-blue-600' },
  { icon: 'hand-coins', color: 'orange', bg: 'bg-orange-50', border: 'border-orange-100', iconBg: 'bg-orange-400', title: 'Keep utang from becoming guesswork.', desc: 'Customer profiles, credit limits, FIFO-based aging, statements, ledger entries, payments, and collections.', tag: 'CUSTOMERS & CREDIT', tagColor: 'text-orange-600' },
  { icon: 'truck', color: 'cyan', bg: 'bg-cyan-50', border: 'border-cyan-100', iconBg: 'bg-cyan-500', title: 'Bring purchasing into the picture.', desc: 'Manage suppliers, create and receive purchase orders, track accounts payable, payments, and product cost history.', tag: 'SUPPLIERS & PURCHASES', tagColor: 'text-cyan-700' },
  { icon: 'book-open-check', color: 'purple', bg: 'bg-purple-50', border: 'border-purple-100', iconBg: 'bg-purple-500', title: 'Turn transactions into books.', desc: 'Double-entry journal entries, chart of accounts, trial balance, and general ledger views with CSV export.', tag: 'BOOKKEEPING', tagColor: 'text-purple-600' },
  { icon: 'wallet-cards', color: 'emerald', bg: 'bg-pink/10', border: 'border-pink/15', iconBg: 'bg-pink', title: 'See where the money goes.', desc: 'Log expenses, organize categories, track profit over time, and export the information you need.', tag: 'EXPENSES & PROFIT', tagColor: 'text-pink' },
]

const BUSINESS_TYPES = [
  { icon: 'store', color: 'pink', title: 'Retail Stores', desc: 'Keep sales, stock, and customer balances together.' },
  { icon: 'wheat', color: 'blue', title: 'Sari-Sari & Grocery', desc: 'Handle everyday products and quantity-based selling.' },
  { icon: 'cake-slice', color: 'orange', title: 'Bakeries & Food Shops', desc: 'Track fast-moving products, purchases, expenses, and sales.' },
  { icon: 'shirt', color: 'purple', title: 'Boutiques', desc: 'Manage products, transactions, customers, and profitability.' },
]

const MULTI_STORES = [
  { icon: 'store', tag: 'SARI-SARI & GROCERY', title: 'Tingi and the tare scale.', desc: 'Shampoo sachets sold from the box, vegetables weighed at the counter with tare — puhunan, utang, and profit kept per store.', color: 'pink' },
  { icon: 'hammer', tag: 'HARDWARE & DEPOT', title: 'By the kilo, by the meter.', desc: 'Nails and welding rod rung up weighed; rebar and PVC pipe cut to the meter — with contractor credit lists.', color: 'blue' },
  { icon: 'target', tag: 'RANGE & RENTALS', title: 'Rentals, packages, members.', desc: 'Range time, firearm rentals, and ammo bundles on one POS, with member credit tracked.', color: 'purple' },
]

const BIR_FORMS = [
  { code: 'Filing Calendar', label: 'Deadlines & Status' },
  { code: '2550Q / 2550M', label: 'VAT Summary' },
  { code: '1701Q', label: 'Income Tax' },
  { code: '2551Q', label: 'Percentage Tax' },
  { code: '0619-E / 1601-EQ', label: 'Withholding (EWT)' },
  { code: 'SC/PWD', label: 'Discount Report' },
]

const COLOR_MAP = {
  pink: { bg: 'bg-pink-50', border: 'border-pink-100', text: 'text-pink-500', iconBg: 'bg-pink-50' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-500', iconBg: 'bg-blue-50' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-500', iconBg: 'bg-orange-50' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-500', iconBg: 'bg-purple-50' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-100', text: 'text-cyan-500', iconBg: 'bg-cyan-50' },
  emerald: { bg: 'bg-pink/10', border: 'border-pink/15', text: 'text-pink/80', iconBg: 'bg-pink/10' },
}

export default function LandingPage() {
  const { isLoadingAuth } = useAuth()

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--paper)' }}>
        <div className="w-8 h-8 border-4 border-pink-100 border-t-pink rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)', color: '#4A1D3F' }}>

      <nav className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-pink-100">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 min-h-[72px] flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 no-underline">
            <img src="/libreta.ico" alt="Libreta" className="w-11 h-11 rounded-2xl" />
            <div>
              <div className="text-2xl font-extrabold tracking-tight" style={{ color: '#4A1D3F' }}>Libreta</div>
              <div className="text-[10px] uppercase tracking-[.2em] text-slate-400 font-bold">One clear record</div>
            </div>
          </a>
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#how" className="hover:text-pink-600 transition-colors">How It Works</a>
            <a href="#features" className="hover:text-pink-600 transition-colors">Features</a>
            <a href="#multi" className="hover:text-pink-600 transition-colors">Multi-Business</a>
            <a href="#bir" className="hover:text-purple-600 transition-colors">BIR Compliance</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="hidden sm:inline text-sm font-bold text-slate-600 hover:text-pink-600 transition-colors">Sign In</a>
            <a href="/demo" className="hidden sm:inline text-sm font-bold text-pink-600 hover:text-pink-700 transition-colors">Try Demo</a>
            <a href={FB_URL} target="_blank" rel="noopener noreferrer" className="rounded-full text-white px-5 py-2.5 text-sm font-bold hover:-translate-y-0.5 transition shadow-lg bg-pink hover:bg-pink-500">Get Started</a>
          </div>
        </div>
      </nav>

      <section className="grain relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-pink-300 watercolor" />
        <div className="absolute top-12 right-[-70px] w-96 h-96 bg-sky-200 watercolor" />
        <div className="absolute bottom-[-130px] left-[35%] w-96 h-96 bg-purple-200 watercolor" />

        <div className="max-w-7xl mx-auto px-5 lg:px-8 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-pink-200 px-4 py-2 text-xs font-extrabold text-pink-700 shadow-sm mb-7">
              <Sparkles className="w-4 h-4" />
              Built for Philippine small businesses
            </div>

            <h1 className="display text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05]">
              Ditch the boring notebook.<br />
              Run your shop in <span className="gradient-text">full color.</span>
            </h1>

            <p className="mt-7 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Libreta brings your sales, inventory, customer credit, purchases, expenses,
              bookkeeping, profit, and BIR worksheets together in one clear record.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row justify-center gap-4">
              <a href={FB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex justify-center items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white px-7 py-4 font-extrabold shadow-pink hover:-translate-y-1 transition">
                Run My Business with Libreta
                <ArrowRight className="w-5 h-5" />
              </a>
              <a href="#features" className="inline-flex justify-center items-center rounded-full bg-white border-2 border-slate-200 px-7 py-4 font-extrabold text-slate-700 hover:border-pink-300 hover:text-pink-600 transition">
                Explore Libreta
              </a>
            </div>

            <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-bold text-slate-500">
              <span>✓ POS</span><span>✓ Inventory</span><span>✓ Credit</span>
              <span>✓ Bookkeeping</span><span>✓ BIR Worksheets</span>
            </div>
          </div>

          <div className="mt-16 max-w-6xl mx-auto relative">
            <div className="absolute -inset-5 bg-gradient-to-r from-pink-200/50 via-purple-200/40 to-blue-200/50 blur-2xl rounded-[3rem]" />
            <div className="relative bg-white rounded-[2rem] paper-card overflow-hidden">
              <div className="h-12 bg-slate-50 border-b border-slate-100 flex items-center px-5 gap-2">
                <span className="w-2 h-2 rounded-full bg-pink-300" />
                <span className="w-2 h-2 rounded-full bg-yellow-300" />
                <span className="w-2 h-2 rounded-full bg-mint" />
                <div className="mx-auto text-[11px] font-bold text-slate-400">libreta.app / dashboard</div>
              </div>
              <div className="p-5 md:p-8 grid lg:grid-cols-[1.1fr_2fr] gap-7">
                <div className="rounded-3xl bg-gradient-to-br from-pink-50 to-purple-50 p-6">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-pink-600">Today</div>
                  <div className="text-4xl font-extrabold mt-2">₱48,260</div>
                  <div className="text-sm text-slate-500 mt-1">Sales revenue</div>
                  <div className="mt-7 grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-2xl p-4">
                      <div className="text-xs text-slate-400">Transactions</div>
                      <div className="text-xl font-extrabold mt-1">126</div>
                    </div>
                    <div className="bg-white rounded-2xl p-4">
                      <div className="text-xs text-slate-400">Outstanding</div>
                      <div className="text-xl font-extrabold mt-1">₱18.4K</div>
                    </div>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-3xl bg-blue-50 p-5 border border-blue-100">
                    <Boxes className="w-7 h-7 text-blue-500" />
                    <div className="font-extrabold mt-4">Inventory</div>
                    <div className="text-sm text-slate-500 mt-1">14 items need attention</div>
                    <div className="mt-4 h-2 rounded-full bg-blue-100"><div className="h-2 rounded-full bg-blue-500 w-[72%]" /></div>
                  </div>
                  <div className="rounded-3xl bg-orange-50 p-5 border border-orange-100">
                    <HandCoins className="w-7 h-7 text-orange-500" />
                    <div className="font-extrabold mt-4">Customer Credit</div>
                    <div className="text-sm text-slate-500 mt-1">Aging at a glance</div>
                    <div className="mt-4 flex gap-1"><span className="h-2 rounded-full bg-orange-300 w-1/2" /><span className="h-2 rounded-full bg-orange-200 w-1/4" /><span className="h-2 rounded-full bg-slate-200 w-1/4" /></div>
                  </div>
                  <div className="rounded-3xl bg-purple-50 p-5 border border-purple-100">
                    <BookOpenCheck className="w-7 h-7 text-purple-500" />
                    <div className="font-extrabold mt-4">Books</div>
                    <div className="text-sm text-slate-500 mt-1">Ledger & trial balance</div>
                  </div>
                  <div className="rounded-3xl bg-pink/10 p-5 border border-pink/15">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pink/80"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                    <div className="font-extrabold mt-4">Profit</div>
                    <div className="text-sm text-slate-500 mt-1">Know what you really earned</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 text-white relative overflow-hidden" style={{ background: '#4A1D3F' }}>
        <div className="absolute -top-32 right-[-40px] w-96 h-96 bg-pink-500/25 rounded-full blur-3xl" />
        <div className="absolute bottom-[-160px] left-[-40px] w-96 h-96 bg-blue-400/20 rounded-full blur-3xl" />
        <div className="max-w-5xl mx-auto px-5 text-center relative z-10">
          <div className="text-sm uppercase tracking-[.25em] font-extrabold text-pink-300">From fragmented to connected</div>
          <h2 className="display text-3xl sm:text-5xl font-extrabold mt-4">Your business has many moving parts.<br />Libreta keeps the picture whole.</h2>
          <p className="mt-6 text-purple-100 text-lg leading-relaxed max-w-3xl mx-auto">
            Stop keeping one record for sales, another for stock, another for utang, and another for accounting.
            Record the transaction once and let your business records stay connected.
          </p>
        </div>
      </section>

      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="max-w-2xl mb-14">
            <div className="text-sm uppercase tracking-[.2em] font-extrabold text-pink-600">The full picture</div>
            <h2 className="display text-4xl sm:text-5xl font-extrabold mt-3">One business.<br /><span className="gradient-text">Every important record.</span></h2>
            <p className="mt-5 text-slate-600 text-lg">Not just a cash register. Libreta connects the operational and financial side of your shop.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => {
              const c = COLOR_MAP[f.color]
              return (
                <article key={f.title} className={`rounded-[2rem] p-7 ${c.bg} ${c.border} border hover:-translate-y-1 transition`}>
                  <div className={`w-14 h-14 rounded-2xl ${f.iconBg} text-white flex items-center justify-center shadow-lg`}>
                    <Icon name={f.icon} className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-extrabold mt-6">{f.title}</h3>
                  <p className="mt-3 text-slate-600 leading-relaxed">{f.desc}</p>
                  <div className={`mt-5 text-xs font-extrabold ${f.tagColor}`}>{f.tag}</div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="how" className="py-24 bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="text-sm uppercase tracking-[.2em] font-extrabold text-purple-600">How it comes together</div>
            <h2 className="display text-4xl sm:text-5xl font-extrabold mt-3">Record once.<br />See the whole business.</h2>
            <p className="mt-5 text-slate-600 text-lg">The value is not in having more screens. It is in having one connected record behind them.</p>
          </div>

          <div className="mt-14 grid md:grid-cols-3 gap-7">
            <div className="paper-card bg-white rounded-[2rem] p-7 tilt-a">
              <div className="text-5xl font-extrabold text-pink-300">01</div>
              <h3 className="text-2xl font-extrabold mt-5">Make the sale</h3>
              <p className="mt-3 text-slate-600 leading-relaxed">Sell products, weigh goods when needed, record the payment, and print the receipt.</p>
            </div>
            <div className="paper-card bg-white rounded-[2rem] p-7 tilt-b">
              <div className="text-5xl font-extrabold text-blue-300">02</div>
              <h3 className="text-2xl font-extrabold mt-5">Keep records connected</h3>
              <p className="mt-3 text-slate-600 leading-relaxed">Sales affect inventory, customer balances, and the financial records that support your business.</p>
            </div>
            <div className="paper-card bg-white rounded-[2rem] p-7 tilt-a">
              <div className="text-5xl font-extrabold text-purple-300">03</div>
              <h3 className="text-2xl font-extrabold mt-5">Understand the business</h3>
              <p className="mt-3 text-slate-600 leading-relaxed">Use dashboards, reports, profit tracking, ledgers, and BIR worksheets to see what is happening.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="bir" className="py-24 text-white overflow-hidden relative" style={{ background: '#4A1D3F' }}>
        <div className="absolute top-[-100px] left-[15%] w-80 h-80 bg-purple-500/25 blur-3xl rounded-full" />
        <div className="absolute bottom-[-120px] right-[5%] w-96 h-96 bg-pink-500/25 blur-3xl rounded-full" />
        <div className="max-w-7xl mx-auto px-5 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-2 text-xs font-extrabold text-pink-200">
                <FileCheck2 className="w-4 h-4" />
                Philippine BIR compliance
              </div>
              <h2 className="display text-4xl sm:text-5xl font-extrabold mt-6">Your business records should be ready when tax time comes.</h2>
              <p className="mt-5 text-purple-100 text-lg leading-relaxed">
                Libreta organizes the information used for quarterly BIR worksheets so your sales, purchases, expenses, and books are not scattered when you need them.
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-3 text-sm">
                {BIR_FORMS.map((f) => (
                  <div key={f.code} className="bg-white/10 rounded-2xl p-4 border border-white/10">
                    <b>{f.code}</b>
                    <span className="block text-purple-200 mt-1">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white text-slate-800 rounded-[2rem] p-7 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <div className="text-[10px] uppercase tracking-[.2em] font-extrabold text-purple-500">Quarterly worksheet</div>
                  <div className="font-extrabold mt-1">Business Tax Summary</div>
                </div>
                <div className="rounded-full bg-pink-50 text-pink-600 px-3 py-1 text-xs font-extrabold">Q3</div>
              </div>
              <div className="mt-5 space-y-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Sales revenue</span><b>₱1,482,900</b></div>
                <div className="flex justify-between"><span className="text-slate-500">SC/PWD discounts</span><b className="text-orange-500">(₱48,200)</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Net taxable revenue</span><b>₱1,434,700</b></div>
                <div className="rounded-2xl bg-blue-50 p-4 flex justify-between text-blue-700"><span className="font-bold">Input VAT creditable</span><b>₱64,120.50</b></div>
                <div className="pt-3 border-t border-slate-100 text-xs text-slate-400">Organized records for review and filing preparation.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-5 text-center">
          <div className="text-sm uppercase tracking-[.2em] font-extrabold text-pink-600">Made for real shops</div>
          <h2 className="display text-4xl font-extrabold mt-3">From the neighborhood store to the growing retailer.</h2>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5 text-left">
            {BUSINESS_TYPES.map((b) => {
              const c = COLOR_MAP[b.color]
              return (
                <div key={b.title} className={`rounded-3xl ${c.bg} p-6 ${c.border} border`}>
                  <Icon name={b.icon} className={`w-5 h-5 ${c.text}`} />
                  <h3 className="font-extrabold mt-5">{b.title}</h3>
                  <p className="text-sm text-slate-500 mt-2">{b.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section id="multi" className="py-24 bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-sm uppercase tracking-[.2em] font-extrabold text-purple-600">Multi-business</div>
            <h2 className="display text-4xl sm:text-5xl font-extrabold mt-3">One account. Many stores.<br /><span className="gradient-text">One click between them.</span></h2>
            <p className="mt-5 text-slate-600 text-lg">Libreta is not built for one template of shop. Change the business — the selling style bends with it.</p>
          </div>

          <div className="mt-14 grid md:grid-cols-3 gap-7">
            {MULTI_STORES.map((s) => {
              const c = COLOR_MAP[s.color]
              return (
                <article key={s.title} className={`paper-card bg-white rounded-[2rem] p-7 ${c.border} border hover:-translate-y-1 transition`}>
                  <div className={`w-14 h-14 rounded-2xl ${c.bg} ${c.text} flex items-center justify-center`}>
                    <Icon name={s.icon} className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-extrabold mt-6">{s.title}</h3>
                  <p className="mt-3 text-slate-600 leading-relaxed">{s.desc}</p>
                  <div className={`mt-5 text-xs font-extrabold ${c.text}`}>{s.tag}</div>
                </article>
              )
            })}
          </div>

        </div>
      </section>

      <section id="start" className="grain relative overflow-hidden py-24 bg-gradient-to-br from-pink-200 via-purple-100 to-blue-200">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-pink-400/35 watercolor" />
        <div className="absolute bottom-[-100px] left-[-50px] w-80 h-80 bg-blue-300/40 watercolor" />
        <div className="max-w-4xl mx-auto px-5 text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/75 rounded-full px-4 py-2 text-xs font-extrabold text-purple-700 border border-white mb-6">
            <Heart className="w-4 h-4" />
            Less clutter. More clarity.
          </div>
          <h2 className="display text-4xl sm:text-6xl font-extrabold leading-tight">Your shop already has enough to keep track of.</h2>
          <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto">Give all those moving parts one home.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4 justify-center">
            <a href={FB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full text-white px-8 py-4 font-extrabold shadow-xl hover:-translate-y-1 transition bg-pink hover:bg-pink-500">
              Get Started with Libreta <ArrowRight className="w-5 h-5" />
            </a>
            <a href="/demo" className="inline-flex items-center gap-2 rounded-full border-2 border-pink-300 text-pink-600 px-8 py-4 font-extrabold hover:bg-pink-50 transition">
              Try the Demo
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-white border-t border-slate-100 py-8">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 flex flex-col md:flex-row gap-3 items-center justify-between text-xs font-semibold text-slate-400">
          <div><span className="text-pink-600 font-extrabold text-sm">Libreta</span> © {new Date().getFullYear()} All rights reserved.</div>
          <div>Business management for Philippine small businesses.</div>
        </div>
      </footer>

    </div>
  )
}