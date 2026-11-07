import {
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  isAfter,
  isBefore,
  isEqual,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type {
  DateRange,
  Expense,
  ExpenseCadence,
  IncomeCadence,
  IncomeSource,
  MonthToggleScope,
  OffRange,
  ViewPeriod,
  WeekStartsOn,
} from './types'

const RANGE_START = '0000-01'

/** `YYYY-MM` for the calendar month of a local date. */
export function monthKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

export function shiftMonthKey(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number)
  return monthKey(new Date(year, (monthIndex ?? 1) - 1 + delta, 1))
}

function rangeCovers(range: OffRange, month: string): boolean {
  if (month < range.start) return false
  if (range.end == null) return true
  return month <= range.end
}

/** Join overlapping or touching off spans into the smallest equivalent list. */
export function mergeOffRanges(ranges: OffRange[]): OffRange[] {
  const sorted = ranges
    .filter((range) => range.end == null || range.end >= range.start)
    .map((range) => ({ start: range.start, end: range.end }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  const merged: OffRange[] = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (!last) {
      merged.push(range)
      continue
    }
    if (last.end == null) continue
    if (range.start <= shiftMonthKey(last.end, 1)) {
      if (range.end == null || range.end > last.end) last.end = range.end
      continue
    }
    merged.push(range)
  }
  return merged
}

type MonthItem = { enabled: boolean; offRanges?: OffRange[]; removedRanges?: OffRange[] }

function baseRanges(item: MonthItem): OffRange[] {
  if (!item.enabled) return [{ start: RANGE_START, end: null }]
  return item.offRanges ?? []
}

/** On for this month unless the item is off for every month, this month is inside an off span, or it was removed for this month. */
export function countsInMonth(item: MonthItem, month: string): boolean {
  if (!item.enabled) return false
  if (isRemovedInMonth(item, month)) return false
  return !(item.offRanges ?? []).some((range) => rangeCovers(range, month))
}

export function isRemovedInMonth(
  item: { removedRanges?: OffRange[] },
  month: string,
): boolean {
  return (item.removedRanges ?? []).some((range) => rangeCovers(range, month))
}

/** Drop the item from the chosen months. Months outside that choice stay. */
export function applyMonthRemoval<T extends { removedRanges?: OffRange[] }>(
  item: T,
  month: string,
  scope: MonthToggleScope,
): { item: T; removedEverywhere: boolean } {
  const removedRanges = withOff(item.removedRanges ?? [], month, scope)
  const removedEverywhere = removedRanges.some(
    (range) => range.start === RANGE_START && range.end == null,
  )
  return {
    item: { ...item, removedRanges: removedEverywhere ? [] : removedRanges },
    removedEverywhere,
  }
}

export function isOffOnDate(item: MonthItem, date: Date): boolean {
  return !countsInMonth(item, monthKey(date))
}

function withOff(ranges: OffRange[], month: string, scope: MonthToggleScope): OffRange[] {
  if (scope === 'future') return mergeOffRanges([...ranges, { start: month, end: null }])
  if (scope === 'past') return mergeOffRanges([...ranges, { start: RANGE_START, end: month }])
  return mergeOffRanges([...ranges, { start: month, end: month }])
}

function withoutOff(ranges: OffRange[], month: string, scope: MonthToggleScope): OffRange[] {
  const next: OffRange[] = []
  const before = shiftMonthKey(month, -1)
  const after = shiftMonthKey(month, 1)
  for (const range of ranges) {
    if (scope === 'future') {
      if (range.start >= month) continue
      if (range.end != null && range.end < month) next.push(range)
      else next.push({ start: range.start, end: before })
      continue
    }
    if (scope === 'past') {
      if (range.end != null && range.end <= month) continue
      if (range.start > month) next.push(range)
      else next.push({ start: after, end: range.end })
      continue
    }
    if (!rangeCovers(range, month)) {
      next.push(range)
      continue
    }
    if (range.start < month) next.push({ start: range.start, end: before })
    if (range.end == null || range.end > month) next.push({ start: after, end: range.end })
  }
  return mergeOffRanges(next)
}

/**
 * Turn the viewed month on or off, and optionally every month before or after it.
 * Months on the other side of that choice stay as they were. 'all' turns the item off
 * (or back on) for every month, clearing any per-month spans.
 */
export function applyMonthToggle<T extends MonthItem>(
  item: T,
  month: string,
  scope: MonthToggleScope | 'all',
): T {
  const active = countsInMonth(item, month)
  if (scope === 'all') return { ...item, enabled: !active, offRanges: [] }
  const offRanges = active
    ? withOff(baseRanges(item), month, scope)
    : withoutOff(baseRanges(item), month, scope)
  const offEverywhere = offRanges.some((range) => range.start === RANGE_START && range.end == null)
  return {
    ...item,
    enabled: !offEverywhere,
    offRanges: offEverywhere ? [] : offRanges,
  }
}

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC off-by-one). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return startOfDay(new Date(y, (m ?? 1) - 1, d ?? 1))
}

export function periodRange(
  view: ViewPeriod,
  anchor: Date,
  weekStartsOn: WeekStartsOn = 1,
): DateRange {
  const day = startOfDay(anchor)
  if (view === 'monthly') {
    return { start: startOfMonth(day), end: startOfDay(endOfMonth(day)) }
  }
  return {
    start: startOfWeek(day, { weekStartsOn }),
    end: startOfDay(endOfWeek(day, { weekStartsOn })),
  }
}

export function shiftAnchor(view: ViewPeriod, anchor: Date, delta: number): Date {
  return view === 'monthly' ? addMonths(anchor, delta) : addWeeks(anchor, delta)
}

export function daysInRange(range: DateRange): number {
  return differenceInCalendarDays(range.end, range.start) + 1
}

export function daysInMonthOf(date: Date): number {
  return differenceInCalendarDays(endOfMonth(date), startOfMonth(date)) + 1
}

function onOrAfter(a: Date, b: Date): boolean {
  return isAfter(a, b) || isEqual(a, b)
}

function onOrBefore(a: Date, b: Date): boolean {
  return isBefore(a, b) || isEqual(a, b)
}

export function nextOccurrence(date: Date, cadence: ExpenseCadence): Date {
  switch (cadence) {
    case 'once':
      return addYears(date, 200)
    case 'weekly':
      return addWeeks(date, 1)
    case 'biweekly':
      return addWeeks(date, 2)
    case 'monthly':
      return addMonths(date, 1)
    case 'yearly':
      return addYears(date, 1)
  }
}

export function nextIncomeOccurrence(date: Date, cadence: IncomeCadence): Date {
  switch (cadence) {
    case 'once':
      return addYears(date, 200)
    case 'weekly':
      return addWeeks(date, 1)
    case 'biweekly':
      return addWeeks(date, 2)
    case 'monthly':
      return addMonths(date, 1)
    case 'yearly':
      return addYears(date, 1)
  }
}

export function prevIncomeOccurrence(date: Date, cadence: IncomeCadence): Date {
  switch (cadence) {
    case 'once':
      return addYears(date, -200)
    case 'weekly':
      return addWeeks(date, -1)
    case 'biweekly':
      return addWeeks(date, -2)
    case 'monthly':
      return addMonths(date, -1)
    case 'yearly':
      return addYears(date, -1)
  }
}

function isFirstPaycheckMode(source: IncomeSource): boolean {
  return source.payDateMode === 'first'
}

/** Paycheck dates that land inside the viewed period, based on known/first payday. */
export function incomePayDatesInPeriod(
  source: IncomeSource,
  range: DateRange,
): Date[] {
  if (!source.payDate) return []

  const anchor = parseDate(source.payDate)
  if (source.cadence === 'once') {
    if (onOrAfter(anchor, range.start) && onOrBefore(anchor, range.end)) {
      return [anchor]
    }
    return []
  }

  const firstOnly = isFirstPaycheckMode(source)
  let cursor = anchor
  let safety = 0
  while (isAfter(cursor, range.start) && safety < 4000) {
    cursor = prevIncomeOccurrence(cursor, source.cadence)
    safety += 1
  }
  // First-paycheck mode: do not count paychecks before the anchor date.
  if (firstOnly && isBefore(cursor, anchor)) {
    cursor = anchor
  }
  while (isBefore(cursor, range.start) && safety < 4000) {
    cursor = nextIncomeOccurrence(cursor, source.cadence)
    safety += 1
  }

  const dates: Date[] = []
  while (onOrBefore(cursor, range.end) && safety < 4000) {
    if (!firstOnly || onOrAfter(cursor, anchor)) dates.push(cursor)
    cursor = nextIncomeOccurrence(cursor, source.cadence)
    safety += 1
  }
  return dates
}

export function nextPayDateOnOrAfter(source: IncomeSource, from: Date): Date | null {
  if (!source.payDate) return null
  const day = startOfDay(from)
  const anchor = parseDate(source.payDate)
  if (source.cadence === 'once') {
    return onOrAfter(anchor, day) ? anchor : null
  }

  if (isFirstPaycheckMode(source)) {
    let cursor = anchor
    let safety = 0
    while (isBefore(cursor, day) && safety < 4000) {
      cursor = nextIncomeOccurrence(cursor, source.cadence)
      safety += 1
    }
    return cursor
  }

  // Known payday: walk the cadence grid to the next hit on/after `from`.
  let cursor = anchor
  let safety = 0
  while (isAfter(cursor, day) && safety < 4000) {
    cursor = prevIncomeOccurrence(cursor, source.cadence)
    safety += 1
  }
  while (isBefore(cursor, day) && safety < 4000) {
    cursor = nextIncomeOccurrence(cursor, source.cadence)
    safety += 1
  }
  return cursor
}

export function nthOccurrence(
  start: Date,
  cadence: ExpenseCadence,
  index: number,
): Date {
  let current = start
  for (let i = 0; i < index; i += 1) {
    current = nextOccurrence(current, cadence)
  }
  return current
}

export function remainingOccurrences(expense: Expense): number {
  if (expense.occurrenceLimit == null) return Number.POSITIVE_INFINITY
  return Math.max(0, expense.occurrenceLimit - expense.occurrencesPosted)
}

/** Next charge on or after `from`, skipping already-posted occurrences. */
export function nextExpenseDateOnOrAfter(expense: Expense, from: Date): Date | null {
  const remaining = remainingOccurrences(expense)
  if (remaining <= 0) return null

  const fromDay = startOfDay(from)
  let cursor = parseDate(expense.startDate)
  let skipped = 0
  let taken = 0
  let safety = 0

  while (safety < 4000) {
    safety += 1
    if (skipped < expense.occurrencesPosted) {
      skipped += 1
      if (expense.cadence === 'once') return null
      cursor = nextOccurrence(cursor, expense.cadence)
      continue
    }
    if (taken >= remaining) return null
    if (onOrAfter(cursor, fromDay)) return cursor
    taken += 1
    if (expense.cadence === 'once') return null
    cursor = nextOccurrence(cursor, expense.cadence)
  }
  return null
}

export function lastScheduledDate(expense: Expense): Date | null {
  const remaining = remainingOccurrences(expense)
  if (remaining === Number.POSITIVE_INFINITY) return null
  if (remaining === 0) {
    if (expense.occurrencesPosted <= 0) return parseDate(expense.startDate)
    return nthOccurrence(
      parseDate(expense.startDate),
      expense.cadence,
      expense.occurrencesPosted - 1,
    )
  }
  return nthOccurrence(
    parseDate(expense.startDate),
    expense.cadence,
    expense.occurrencesPosted + remaining - 1,
  )
}

export function isActiveInRange(expense: Expense, range: DateRange): boolean {
  if (remainingOccurrences(expense) <= 0) return false
  const start = parseDate(expense.startDate)
  if (isAfter(start, range.end)) return false
  const last = lastScheduledDate(expense)
  if (last && isBefore(last, range.start)) return false
  return true
}

/**
 * Whether an expense should appear on the Income & expenses list.
 * One-time charges from before the calendar month of `asOf` are hidden so
 * old receipts do not clutter the list; recurring and plan expenses stay.
 */
export function expenseVisibleOnList(expense: Expense, asOf: Date): boolean {
  if (isRemovedInMonth(expense, monthKey(asOf))) return false
  if (expense.cadence !== 'once') return true
  const start = parseDate(expense.startDate)
  return !isBefore(start, startOfMonth(startOfDay(asOf)))
}

export function incomeVisibleOnList(source: IncomeSource, asOf: Date): boolean {
  return !isRemovedInMonth(source, monthKey(asOf))
}

/**
 * One-time income that has already been received, or that landed before the
 * viewed period. Recurring income stays in the main list.
 */
export function oneTimeIncomeIsPast(
  source: IncomeSource,
  range: DateRange,
  asOf: Date,
): boolean {
  if (source.cadence !== 'once' || !source.payDate) return false
  const pay = parseDate(source.payDate)
  const day = startOfDay(asOf)
  return isBefore(pay, range.start) || !isAfter(pay, day)
}

export function occurrenceDatesInPeriod(
  expense: Expense,
  range: DateRange,
): Date[] {
  const remaining = remainingOccurrences(expense)
  if (remaining <= 0) return []

  const start = parseDate(expense.startDate)
  const dates: Date[] = []
  let cursor = start
  let skipped = 0
  let taken = 0
  let safety = 0

  while (safety < 4000) {
    safety += 1
    if (isAfter(cursor, range.end)) break

    if (skipped < expense.occurrencesPosted) {
      skipped += 1
      if (expense.cadence === 'once') break
      cursor = nextOccurrence(cursor, expense.cadence)
      continue
    }

    if (taken >= remaining) break

    if (onOrAfter(cursor, range.start) && onOrBefore(cursor, range.end)) {
      dates.push(cursor)
    }

    // Charges before the viewed period still consume the occurrence limit.
    taken += 1

    if (expense.cadence === 'once') break
    cursor = nextOccurrence(cursor, expense.cadence)
  }

  return dates
}

/**
 * Split dues in the viewed period relative to `asOf` (usually today).
 * - upcoming: at least one due strictly after asOf
 * - past: every due in the period is on or before asOf (treated as already paid)
 * - later: no dues fall in the viewed period (e.g. starts next month)
 */
export function expensePeriodDueBucket(
  expense: Expense,
  range: DateRange,
  asOf: Date,
): 'upcoming' | 'past' | 'later' {
  const dues = occurrenceDatesInPeriod(expense, range)
  if (dues.length === 0) return 'later'
  const day = startOfDay(asOf)
  return dues.some((due) => isAfter(due, day)) ? 'upcoming' : 'past'
}
