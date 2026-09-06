import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSettings } from '@/hooks/useSettings'
import { buildFilingSchedule, MONTHS_FULL, FILING_YEARS } from '@/lib/bir'
import { manilaTodayLocal } from '@/lib/manilaTime'
import { format } from 'date-fns'
import { AlertTriangle, CheckCircle2, CalendarClock, Landmark, Users, BadgePercent, Info } from 'lucide-react'
import { useMemo, useState } from 'react'

const STORE_KEY = 'libreta_bir_profile'

function loadPrefs() {
  try {
    return { incomeTaxRegime: 'graduated', employer: false, ewtAgent: false, ...(JSON.parse(localStorage.getItem(STORE_KEY) || '{}')) }
  } catch {
    return { incomeTaxRegime: 'graduated', employer: false, ewtAgent: false }
  }
}

export default function ComplianceCalendar() {
  const { settings } = useSettings()
  const [year, setYear] = useState(new Date().getFullYear())
  const [prefs, setPrefs] = useState(loadPrefs)
  const businessTax = settings?.vat_registered === false ? 'non_vat' : 'vat'
  const vatRatePct = Math.round((Number(settings?.vat_rate) || 0) * 100)

  const setPref = (patch) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const events = useMemo(() =>
    buildFilingSchedule(year, { businessTax, eightPercent: prefs.incomeTaxRegime === '8', employer: prefs.employer, ewtAgent: prefs.ewtAgent }),
  [year, businessTax, prefs])

  const today = manilaTodayLocal()
  const withStatus = events.map((e) => {
    if (!e.due) return { ...e, status: 'info', diff: null }
    const diff = Math.round((e.due - today) / 86400000)
    const status = diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'upcoming'
    return { ...e, status, diff }
  })

  const nextFiling = withStatus.filter((e) => e.status === 'upcoming' && !e.optional).sort((a, b) => a.due - b.due)[0]
  const overdueCount = withStatus.filter((e) => e.status === 'overdue' && !e.optional).length

  const groups = []
  for (let m = 0; m < 12; m++) groups.push({ month: MONTHS_FULL[m], items: [] })
  withStatus.filter((e) => e.due).slice().sort((a, b) => a.due - b.due).forEach((e) => groups[e.due.getMonth()].items.push(e))
  const notes = withStatus.filter((e) => !e.due)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-pink" /> Filing Calendar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label className="text-xs">Filing Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{FILING_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Business Tax (from Settings → VAT)</Label>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-slate-50 min-w-[240px]">
                <Landmark className="w-4 h-4 text-plum" />
                <span className="text-sm font-medium">{businessTax === 'vat' ? `VAT-registered (${vatRatePct}% VAT)` : 'Non-VAT — percentage tax (3%)'}</span>
              </div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Income Tax Regime</Label>
              <Select value={prefs.incomeTaxRegime} onValueChange={(v) => setPref({ incomeTaxRegime: v })}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="graduated">Graduated (itemized / OSD)</SelectItem>
                  <SelectItem value="8">8% on gross receipts (flat)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4 pl-1">
              <div className="flex items-center gap-2"><Switch id="ewt" checked={prefs.ewtAgent} onCheckedChange={(c) => setPref({ ewtAgent: c })} /><Label htmlFor="ewt" className="text-xs flex items-center gap-1"><BadgePercent className="w-3.5 h-3.5 text-pink" /> Withholding agent (EWT)</Label></div>
              <div className="flex items-center gap-2"><Switch id="emp" checked={prefs.employer} onCheckedChange={(c) => setPref({ employer: c })} /><Label htmlFor="emp" className="text-xs flex items-center gap-1"><Users className="w-3.5 h-3.5 text-pink" /> Employer (has staff)</Label></div>
            </div>
          </div>

          {prefs.incomeTaxRegime === '8' && businessTax === 'vat' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><AlertTriangle className="w-3.5 h-3.5 inline mr-1" />The 8% income-tax option is only for non-VAT taxpayers with gross receipts ≤ ₱3,000,000. Your Settings have VAT switched ON, so use the graduated (itemized/OSD) worksheet instead.</p>
          )}
          {prefs.incomeTaxRegime === '8' && businessTax === 'non_vat' && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><Info className="w-3.5 h-3.5 inline mr-1" />8% election (ATC II015, filed yearly on the first 1701Q) replaces quarterly percentage tax for that year. Verify you're ≤ ₱3M gross and re-elect every year.</p>
          )}
        </CardContent>
      </Card>

      {nextFiling && (
        <div className={`rounded-lg border p-4 flex flex-wrap items-center justify-between gap-2 ${overdueCount ? 'border-amber-200 bg-amber-50' : 'border-pink/20 bg-pink/10'}`}>
          <div className="flex items-center gap-3">
            {overdueCount ? <AlertTriangle className="w-6 h-6 text-amber-600" /> : <CheckCircle2 className="w-6 h-6 text-pink" />}
            <div>
              <p className="font-semibold text-plum">
                {overdueCount > 0 ? `${overdueCount} overdue obligation${overdueCount > 1 ? 's' : ''}` : `Next filing: ${nextFiling.form} — due ${format(nextFiling.due, 'MMM dd, yyyy')}`}
              </p>
              <p className="text-xs text-slate-500">{overdueCount > 0 ? 'Check the calendar below for what to catch up on.' : `${nextFiling.title} · ${nextFiling.period} (${nextFiling.diff} day${nextFiling.diff === 1 ? '' : 's'} left)`}</p>
            </div>
          </div>
          {overdueCount > 0 && <span className="text-xs text-amber-700 bg-amber-100 rounded-full px-3 py-1 font-semibold">{overdueCount} overdue</span>}
        </div>
      )}

      {groups.map((g) => g.items.length > 0 && (
        <Card key={g.month}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-plum">{g.month} {year}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {g.items.map((e) => (
                <div key={e.id} className={`flex items-center justify-between gap-3 py-2.5 ${e.optional ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-bold w-16 shrink-0">{format(e.due, 'MMM dd')}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.form}{e.optional && <span className="text-xs text-slate-400 ml-1">(optional)</span>}</p>
                      <p className="text-xs text-slate-500 truncate">{e.title} · {e.period}{e.note ? ` · ${e.note}` : ''}</p>
                    </div>
                  </div>
                  {e.status === 'overdue' && <span className="shrink-0 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-full px-2.5 py-1">Overdue</span>}
                  {e.status === 'today' && <span className="shrink-0 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-1">Due today</span>}
                  {e.status === 'upcoming' && <span className="shrink-0 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">{e.diff} day{e.diff === 1 ? '' : 's'} left</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {notes.length > 0 && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          {notes.map((n) => <span key={n.id} className="block"><Info className="w-3.5 h-3.5 inline mr-1" />{n.title} — {n.note}</span>)}
        </p>
      )}

      <p className="text-xs text-slate-400">
        Deadlines are adjusted for weekends and common public holidays (movable holidays approximated). Confirm exact dates with the BIR/ORUS or your accountant.
        Monthly e-Sales/CAS data-file submission (if using computerized books/POS) is a separate monthly obligation — timing per RMC 6-2024; confirm with your accountant. No annual registration fee (Form 0605) reminders shown: the ₱500 ARF was abolished under the Ease of Paying Taxes Act (2024).
      </p>
    </div>
  )
}