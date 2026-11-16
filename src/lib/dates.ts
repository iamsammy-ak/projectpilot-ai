import type { ISODate } from '../types'

/**
 * Calendar arithmetic on ISO dates, done in whole UTC days so time zones and DST never shift a bar.
 *
 * Two integer scales are used:
 *  - "day":  days since 1970-01-01 (every calendar day)
 *  - "wIdx": working-day index (Mon–Fri only). Consecutive working days differ by exactly 1,
 *            so a task of N working days starting at wIdx s ends at s + N - 1.
 */

const MS_PER_DAY = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')

export function toDay(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY)
}

export function fromDay(day: number): ISODate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

export function todayISO(): ISODate {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 0 = Monday … 6 = Sunday. (1970-01-01 was a Thursday.) */
export function weekday(day: number): number {
  return (((day + 3) % 7) + 7) % 7
}

export const isWeekend = (day: number) => weekday(day) >= 5

/** Working-day index of a date. Weekend dates map to the following Monday. */
export function wIdx(iso: ISODate): number {
  const d = toDay(iso) + 3
  return Math.floor(d / 7) * 5 + Math.min(d % 7, 5)
}

/** Working-day index of a date. Weekend dates map to the preceding Friday (for deadlines). */
export function wIdxFloor(iso: ISODate): number {
  const d = toDay(iso) + 3
  return Math.floor(d / 7) * 5 + Math.min(d % 7, 4)
}

export function dayOfWIdx(i: number): number {
  return Math.floor(i / 5) * 7 + (((i % 5) + 5) % 5) - 3
}

export const fromWIdx = (i: number): ISODate => fromDay(dayOfWIdx(i))

/** Snap a date to a working day (weekends move to Monday). */
export const snapToWorkday = (iso: ISODate): ISODate => fromWIdx(wIdx(iso))

export const addDays = (iso: ISODate, n: number): ISODate => fromDay(toDay(iso) + n)
export const addWorkdays = (iso: ISODate, n: number): ISODate => fromWIdx(wIdx(iso) + n)

/** Monday of the week containing the date. */
export function mondayOf(iso: ISODate): ISODate {
  const d = toDay(iso)
  return fromDay(d - weekday(d))
}

const dateOf = (iso: ISODate) => new Date(toDay(iso) * MS_PER_DAY)
const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts })
const F_SHORT = fmt({ month: 'short', day: 'numeric' })
const F_LONG = fmt({ month: 'short', day: 'numeric', year: 'numeric' })
const F_WEEKDAY = fmt({ weekday: 'short', month: 'short', day: 'numeric' })
const F_MONTH = fmt({ month: 'long', year: 'numeric' })
const F_MONTH_SHORT = fmt({ month: 'short' })

/** "Nov 16" */
export const fmtShort = (iso: ISODate) => F_SHORT.format(dateOf(iso))
/** "Nov 16, 2026" */
export const fmtLong = (iso: ISODate) => F_LONG.format(dateOf(iso))
/** "Mon, Nov 16" */
export const fmtWeekday = (iso: ISODate) => F_WEEKDAY.format(dateOf(iso))
/** "November 2026" */
export const fmtMonth = (iso: ISODate) => F_MONTH.format(dateOf(iso))
export const fmtMonthShort = (iso: ISODate) => F_MONTH_SHORT.format(dateOf(iso))

/** "today", "tomorrow", "in 4 days", "3 days ago" — calendar days relative to today. */
export function relativeDay(iso: ISODate, today: ISODate = todayISO()): string {
  const n = toDay(iso) - toDay(today)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 14) return `${d} d ago`
  return F_SHORT.format(new Date(ts))
}

/** "3 days", "2 weeks", "1 day" for a working-day count. */
export function fmtDuration(workdays: number): string {
  if (workdays === 0) return 'Milestone'
  return `${workdays} ${workdays === 1 ? 'day' : 'days'}`
}
