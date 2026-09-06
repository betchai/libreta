import Disclaimer from '@/components/bir/Disclaimer'
import ComplianceCalendar from '@/components/bir/ComplianceCalendar'
import IncomeTaxReport from '@/components/bir/IncomeTaxReport'
import PercentageTaxReport from '@/components/bir/PercentageTaxReport'
import PurchaseJournalReport from '@/components/bir/PurchaseJournalReport'
import SalesJournalReport from '@/components/bir/SalesJournalReport'
import ScPwdDiscountReport from '@/components/bir/ScPwdDiscountReport'
import VatMonthlyReport from '@/components/bir/VatMonthlyReport'
import VatSummaryReport from '@/components/bir/VatSummaryReport'
import WithholdingReport from '@/components/bir/WithholdingReport'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useSettings } from '@/hooks/useSettings'
import { Landmark, ReceiptText, Truck, TrendingUp, Percent, BadgeHelp, CalendarDays, FileSpreadsheet, CalendarClock } from 'lucide-react'
import { useState } from 'react'

const TABS = [
  { value: 'calendar', label: 'Compliance Calendar', icon: CalendarClock, color: 'text-plum', bg: 'bg-plum/10', dot: 'bg-plum', regimes: ['vat', 'non_vat'] },
  { value: 'vat', label: 'VAT Summary (2550Q)', icon: Landmark, color: 'text-purple-600', bg: 'bg-purple-50', dot: 'bg-purple-500', regimes: ['vat'] },
  { value: 'vatMonth', label: 'VAT Monthly (2550M)', icon: CalendarDays, color: 'text-violet-600', bg: 'bg-violet-50', dot: 'bg-violet-500', regimes: ['vat'] },
  { value: 'sales', label: 'Sales Journal', icon: ReceiptText, color: 'text-pink-600', bg: 'bg-pink-50', dot: 'bg-pink-500', regimes: ['vat', 'non_vat'] },
  { value: 'purchases', label: 'Purchase Journal', icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50', dot: 'bg-blue-500', regimes: ['vat', 'non_vat'] },
  { value: 'income', label: 'Income Tax (1701Q)', icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50', dot: 'bg-orange-500', regimes: ['vat', 'non_vat'] },
  { value: 'percentage', label: 'Percentage Tax (2551Q)', icon: Percent, color: 'text-cyan-700', bg: 'bg-cyan-50', dot: 'bg-cyan-500', regimes: ['non_vat'] },
  { value: 'ewt', label: 'Withholding (0619-E/1601-EQ)', icon: FileSpreadsheet, color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-500', regimes: ['vat', 'non_vat'] },
  { value: 'scpwd', label: 'SC/PWD Discounts', icon: BadgeHelp, color: 'text-lav', bg: 'bg-purple-50/50', dot: 'bg-lav', regimes: ['vat', 'non_vat'] },
]

const TAB_PANELS = {
  calendar: ComplianceCalendar,
  vat: VatSummaryReport,
  vatMonth: VatMonthlyReport,
  sales: SalesJournalReport,
  purchases: PurchaseJournalReport,
  income: IncomeTaxReport,
  percentage: PercentageTaxReport,
  ewt: WithholdingReport,
  scpwd: ScPwdDiscountReport,
}

export default function BirCompliance() {
  const { settings } = useSettings()
  const businessTax = settings?.vat_registered === false ? 'non_vat' : 'vat'
  const visibleTabs = TABS.filter((t) => t.regimes.includes(businessTax))
  const [tab, setTab] = useState('calendar')
  const effectiveTab = visibleTabs.some((t) => t.value === tab) ? tab : visibleTabs[0].value

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-plum">BIR Compliance</h1>
        <p className="text-slate-500">Filing calendar and worksheets for Philippine business taxes — VAT, percentage, income, and withholding</p>
      </div>
      <Disclaimer />
      <Tabs value={effectiveTab} onValueChange={setTab}>
        <TabsList className="bg-white border border-pink/10 p-1.5 gap-1 flex-wrap h-auto">
          {visibleTabs.map((t) => {
            const Icon = t.icon
            const isActive = effectiveTab === t.value
            return (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? `${t.bg} ${t.color} shadow-sm`
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>
        {visibleTabs.map((t) => {
          const Panel = TAB_PANELS[t.value]
          return (
            <TabsContent key={t.value} value={t.value} className="mt-4">
              <Panel />
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
