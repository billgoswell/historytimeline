/**
 * Astronomical year numbering: year 0 = 1 BCE, year -1 = 2 BCE.
 * Display years never include a year 0.
 */

export type YearEra = 'BCE' | 'CE'

export function astroFromBce(bceYear: number): number {
  return 1 - bceYear
}

export function astroFromCe(ceYear: number): number {
  return ceYear
}

/** Parse authoring strings such as "44 BCE", "1776", "1776 CE". */
export function parseDisplayYear(input: string): number {
  const s = input.trim()
  if (!s) throw new Error('Empty year')
  const m = s.match(/^(-?\d+)\s*(BCE|CE|BC|AD)?$/i)
  if (!m) throw new Error(`Cannot parse year: ${input}`)
  const n = Number(m[1])
  const eraRaw = (m[2] ?? '').toUpperCase()
  const era: YearEra | '' = eraRaw === 'BC' ? 'BCE' : eraRaw === 'AD' ? 'CE' : (eraRaw as YearEra | '')
  if (era === 'BCE') {
    if (n <= 0) throw new Error(`Invalid BCE year: ${input}`)
    return astroFromBce(n)
  }
  if (n === 0) {
    // Tolerant: never a real year 0. Treat bare 0 as 1 BCE.
    return 0
  }
  if (n < 0) {
    // URL convention: negative display year means BCE (y=-44 → 44 BCE).
    return fromDisplayYearNumber(n)
  }
  return astroFromCe(n)
}

export function toDisplayYear(n: number): string {
  if (n > 0) return `${n} CE`
  return `${1 - n} BCE`
}

/** Axis labels: BCE always marked; CE marked below 1000. */
export function toAxisLabel(n: number): string {
  if (n > 0) return n >= 1000 ? String(n) : `${n} CE`
  return `${1 - n} BCE`
}

/**
 * URL `y` param: CE as positive, BCE as negative display year.
 * Astronomical 0 (1 BCE) → -1. Never serializes 0.
 */
export function toDisplayYearNumber(n: number): number {
  if (n > 0) return n
  return n - 1
}

export function fromDisplayYearNumber(n: number): number {
  if (n > 0) return n
  if (n === 0) return 1
  return n + 1
}

const MONTH_CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

export function dayOfYear(month: number, day: number): number {
  const m = Math.min(12, Math.max(1, Math.round(month)))
  const d = Math.min(31, Math.max(1, Math.round(day)))
  return MONTH_CUM[m - 1] + d
}

/** Sub-year position for ordering (needed for 1914–1945). */
export function eventPosition(
  startYear: number,
  startMonth?: number,
  startDay?: number,
): number {
  if (startMonth == null) return startYear
  const d = startDay ?? 15
  return startYear + dayOfYear(startMonth, d) / 365.25
}

export function yearBucket(year: number): number {
  return Math.floor(year / 100) * 100
}

export function formatEventDate(e: {
  startYear: number
  startMonth?: number
  startDay?: number
  endYear?: number | null
  precision: string
}): string {
  const start = formatOne(e.startYear, e.startMonth, e.startDay, e.precision)
  if (e.endYear == null || e.endYear === e.startYear) return start
  return `${start} – ${formatOne(e.endYear, undefined, undefined, e.precision)}`
}

function formatOne(
  year: number,
  month: number | undefined,
  day: number | undefined,
  precision: string,
): string {
  const label = toDisplayYear(year)
  if (precision === 'century' || precision === 'decade' || precision === 'circa') {
    return precision === 'circa' ? `c. ${label}` : label
  }
  if (month && (precision === 'month' || precision === 'day')) {
    const names = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]
    const m = names[Math.min(11, Math.max(0, month - 1))]
    if (day && precision === 'day') return `${dord(day)} ${m} ${label}`
    return `${m} ${label}`
  }
  return label
}

function dord(d: number): string {
  const v = d % 100
  if (v >= 11 && v <= 13) return `${d}th`
  switch (d % 10) {
    case 1:
      return `${d}st`
    case 2:
      return `${d}nd`
    case 3:
      return `${d}rd`
    default:
      return `${d}th`
  }
}
