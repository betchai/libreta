// BIR compliance helpers — filing schedule, PH holidays, income-tax regimes.
// Intended as source-document assistance; confirm with a tax preparer before filing.

export const VAT_THRESHOLD = 3000000
export const EIGHT_PERCENT = 0.08
export const OSD_RATE = 0.4
export const SC_PWD_ANNUAL_EXEMPTION = 250000
export const EWT_RATES = { goods: 0.01, services: 0.02 }

export const FILING_YEARS = [2024, 2025, 2026, 2027]

// TRAIN graduated income tax table (NIRC Sec. 24(A)(2)(a)), first P250k taxed at 0%.
const GRADUATED = [
  { over: 0, upTo: 250000, base: 0, rate: 0 },
  { over: 250000, upTo: 400000, base: 0, rate: 0.15 },
  { over: 400000, upTo: 800000, base: 22500, rate: 0.2 },
  { over: 800000, upTo: 2000000, base: 130000, rate: 0.25 },
  { over: 2000000, upTo: 8000000, base: 430000, rate: 0.3 },
  { over: 8000000, upTo: Infinity, base: 2410000, rate: 0.35 },
]

export function graduatedIncomeTax(netTaxable) {
  const n = Math.max(0, Number(netTaxable) || 0)
  const b = GRADUATED.find((x) => n > x.over && n <= x.upTo) || GRADUATED[GRADUATED.length - 1]
  return b.base + (n - b.over) * b.rate
}

// Philippine holidays (principal regular + common movable). Local calendar dates.
const FIXED_HOLIDAYS = [
  [0, 1],   // New Year's Day
  [3, 9],   // Araw ng Kagitingan / Day of Valor
  [4, 1],   // Labor Day
  [5, 12],  // Independence Day
  [7, 21],  // Ninoy Aquino Day
  [10, 1],  // All Saints' Day (special holiday)
  [10, 30], // Bonifacio Day
  [11, 25], // Christmas Day
  [11, 30], // Rizal Day
]

function getEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

export function phHolidays(year) {
  const set = FIXED_HOLIDAYS.map(([m, d]) => `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  const easter = getEaster(year)
  for (const off of [-3, -2]) {
    const d = new Date(year, easter.getMonth(), easter.getDate() + off)
    set.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  // National Heroes Day: last Monday of August
  for (let day = 31; day >= 25; day--) {
    const d = new Date(year, 7, day)
    if (d.getDay() === 1) {
      set.push(`${year}-08-${String(day).padStart(2, '0')}`)
      break
    }
  }
  return new Set(set)
}

export function nextWorkingDay(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const holidays = phHolidays(d.getFullYear())
  const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  while (d.getDay() === 0 || d.getDay() === 6 || holidays.has(key(d))) {
    d.setDate(d.getDate() + 1)
  }
  return d
}

export function dueOn(year, monthIdx, day) {
  return nextWorkingDay(new Date(year, monthIdx, day))
}

// Build every filing due inside `calendarYear` for the given business profile.
// profile: { businessTax: 'vat'|'non_vat' (derive from Settings VAT toggle), eightPercent: bool,
//            employer: bool, ewtAgent: bool }
export function buildFilingSchedule(calendarYear, profile) {
  const events = []
  const push = (due, form, title, period, category, opts = {}) =>
    events.push({ id: `${form}-${period}`, due, form, title, period, category, optional: !!opts.optional, note: opts.note || '' })
  const onEightPercent = profile.businessTax === 'non_vat' && profile.eightPercent

  // Business tax — either 2550Q (VAT) or 2551Q (3% percentage tax). Due on the 25th
  // after each quarter ends. Q4 of the prior year is due Jan 25 of this year, so we
  // build prior-year Q4 (q=3) with source year = calendarYear - 1.
  const BUSINESS_QS = [
    { q: 0, sourceYear: calendarYear },
    { q: 1, sourceYear: calendarYear },
    { q: 2, sourceYear: calendarYear },
    { q: 3, sourceYear: calendarYear - 1 },
  ]
  for (const { q, sourceYear } of BUSINESS_QS) {
    const endMonth = q * 3 + 2
    const dueMonth = (endMonth + 1) % 12
    const dueYear = dueMonth === 0 ? sourceYear + 1 : sourceYear
    const due = dueOn(dueYear, dueMonth, 25)
    if (due.getFullYear() !== calendarYear) continue
    const period = `Q${q + 1} ${sourceYear}`
    if (profile.businessTax === 'vat') {
      push(due, '2550Q', 'Quarterly VAT Return', period, 'Business Tax')
    } else if (profile.businessTax === 'non_vat' && !onEightPercent) {
      push(due, '2551Q', 'Quarterly Percentage Tax (3%)', period, 'Business Tax')
    }
  }

  // Optional monthly VAT declaration (RMC 52-2023) — only informational for VAT profiles.
  if (profile.businessTax === 'vat') {
    for (let m = 0; m < 12; m++) {
      push(dueOn(calendarYear, m, 20), '2550M', 'Monthly VAT Declaration (OPTIONAL)', MONTHS_FULL[m] + ' ' + calendarYear, 'Business Tax', { optional: true, note: 'Optional since RMC 52-2023. Skipping 2550M is fine as long as 2550Q is filed.' })
    }
  }

  // 8% income-tax option replaces quarterly percentage tax, so no 2551Q events.
  if (onEightPercent) {
    events.push({ id: 'note-8pct', due: null, form: '8% option', title: 'On the 8% option — no 2551Q for this year', period: `FY ${calendarYear}`, category: 'Business Tax', optional: true, note: 'Elected 8% income tax (ATC II015) replaces the quarterly percentage tax for the taxable year; file 1701Q + annual ITR instead.' })
  }

  // Income tax — 1701Q for the first three quarters (due May 15 / Aug 15 / Nov 15).
  const ITR_DUE = [4, 7, 10] // months: May, Aug, Nov
  ITR_DUE.forEach((m, i) => {
    const due = dueOn(calendarYear, m, 15)
    const period = `Q${i + 1} ${calendarYear}`
    push(due, '1701Q', 'Quarterly Income Tax (individuals)', period, 'Income Tax')
  })

  // Annual income tax for the prior year, due April 15.
  push(dueOn(calendarYear, 3, 15), '1701 / 1701A', 'Annual Income Tax Return (prior year)', `FY ${calendarYear - 1}`, 'Income Tax')

  // Creditable (expanded) withholding tax — monthly 0619-E for months 1-2 of each quarter,
  // quarterly 1601-EQ (end of month after quarter) covering the quarter's third month.
  if (profile.ewtAgent) {
    const FIRST_TWO = [0, 1, 3, 4, 6, 7, 9, 10]
    FIRST_TWO.forEach((m) => push(dueOn(calendarYear, m, 10), '0619-E', 'Creditable WHT — monthly', MONTHS_FULL[m] + ' ' + calendarYear, 'Withholding'))
    const EQ_DUE = [
      { dueMonth: 0, dueDay: 31, period: `Q4 ${calendarYear - 1}` },
      { dueMonth: 3, dueDay: 30, period: `Q1 ${calendarYear}` },
      { dueMonth: 6, dueDay: 31, period: `Q2 ${calendarYear}` },
      { dueMonth: 9, dueDay: 31, period: `Q3 ${calendarYear}` },
    ]
    EQ_DUE.forEach((e) => push(dueOn(calendarYear, e.dueMonth, e.dueDay), '1601-EQ', 'Creditable WHT — quarterly reconciliation', e.period, 'Withholding'))
    push(dueOn(calendarYear, 2, 1), '1604-E', 'Annual Info Return — creditable WHT + alphalist', `FY ${calendarYear - 1}`, 'Withholding')
  }

  // Compensation withholding — only if the business employs staff.
  if (profile.employer) {
    for (let m = 0; m < 12; m++) {
      push(dueOn(calendarYear, m, 10), '1601-C', 'WHT on Compensation', MONTHS_FULL[m] + ' ' + calendarYear, 'Withholding')
    }
    push(dueOn(calendarYear, 0, 31), '1604-C / 2316', 'Annual Info Return — compensation + 2316 distribution', `FY ${calendarYear - 1}`, 'Withholding')
  }

  return events.sort((a, b) => {
    if (!a.due && !b.due) return 0
    if (!a.due) return 1
    if (!b.due) return -1
    return a.due - b.due
  })
}

export const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']