// Philippine (Manila) timezone helpers (ported verbatim from Base44 app).
// Postgres timestamptz is a true instant; parseStoredDate is retained for
// safety when reading client-serialized dates that may lack a trailing "Z".

export const MANILA_TZ = 'Asia/Manila'
const OFFSET = 8

export function parseStoredDate(s) {
  if (s == null) return new Date(NaN)
  const str = String(s)
  if (!/[zZ]$/.test(str) && !/[+-]\d{2}:?\d{2}$/.test(str)) {
    return new Date(str + 'Z')
  }
  return new Date(str)
}

export function manilaParts(d = new Date()) {
  const dt = d instanceof Date ? d : parseStoredDate(d)
  const s = dt.toLocaleString('en-CA', { timeZone: MANILA_TZ, hour12: false })
  const [datePart, timePart] = s.split(',')
  const [y, m, day] = datePart.trim().split('-').map(Number)
  const [h, mi, sec] = timePart.trim().split(':').map(Number)
  return { y, m, day, h, mi, sec }
}

export function manilaNowParts() {
  return manilaParts(new Date())
}

export function toManilaDisplayDate(d) {
  const p = manilaParts(d)
  return new Date(p.y, p.m - 1, p.day, p.h, p.mi, p.sec, 0)
}

export function manilaTodayLocal() {
  const p = manilaParts(new Date())
  return new Date(p.y, p.m - 1, p.day)
}

function manilaInstant(y, monthIdx, d, h, mi, s, ms = 0) {
  return new Date(Date.UTC(y, monthIdx, d, h - OFFSET, mi, s, ms))
}

export function manilaStartOfToday() {
  const p = manilaParts(new Date())
  return manilaInstant(p.y, p.m - 1, p.day, 0, 0, 0)
}
export function manilaEndOfToday() {
  const p = manilaParts(new Date())
  return manilaInstant(p.y, p.m - 1, p.day, 23, 59, 59, 999)
}
export function manilaStartOfMonth(d = new Date()) {
  const p = manilaParts(d instanceof Date ? d : new Date(d))
  return manilaInstant(p.y, p.m - 1, 1, 0, 0, 0)
}
export function manilaStartOfQuarter(d = new Date()) {
  const p = manilaParts(d instanceof Date ? d : new Date(d))
  const qIdx = Math.floor((p.m - 1) / 3) * 3
  return manilaInstant(p.y, qIdx, 1, 0, 0, 0)
}
export function manilaYearStart(year) {
  return manilaInstant(year, 0, 1, 0, 0, 0)
}

export function manilaStartOfLocalDay(localDate) {
  return manilaInstant(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 0, 0, 0)
}
export function manilaEndOfLocalDay(localDate) {
  return manilaInstant(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 23, 59, 59, 999)
}

export function manilaStartOfDateStr(ymd) {
  const [y, m, d] = (ymd || '').split('-').map(Number)
  return manilaInstant(y, m - 1, d, 0, 0, 0)
}
export function manilaEndOfDateStr(ymd) {
  const [y, m, d] = (ymd || '').split('-').map(Number)
  return manilaInstant(y, m - 1, d, 23, 59, 59, 999)
}

export function manilaMonthRange(year, monthIdx) {
  const from = manilaInstant(year, monthIdx, 1, 0, 0, 0)
  const next = manilaInstant(year, monthIdx + 1, 1, 0, 0, 0)
  return { from, to: new Date(next.getTime() - 1) }
}

export function manilaCumulativeRange(year, throughMonthIdx) {
  const from = manilaInstant(year, 0, 1, 0, 0, 0)
  const next = manilaInstant(year, throughMonthIdx + 1, 1, 0, 0, 0)
  return { from, to: new Date(next.getTime() - 1) }
}
