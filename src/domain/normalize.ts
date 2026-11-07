import {
  addDays,
  addMonths,
  eachDayOfInterval,
  isAfter,
  isBefore,
  startOfDay,
  startOfMonth,
} from 'date-fns'
import { calendarEvents, netForDay } from './calendar'
import { goalAmountForPeriod, goalContributionDatesInPeriod } from './goals'
import {
  daysInMonthOf,
  daysInRange,
  incomePayDatesInPeriod,
  isActiveInRange,
  isOffOnDate,
  occurrenceDatesInPeriod,
  periodRange,
} from './period'
import type {
  DateRange,
  Expense,
  Goal,
  IncomeCadence,
  IncomeSource,
  ViewPeriod,
  WeekStartsOn,
} from './types'

export function incomeAmountForView(
  amount: number,
  cadence: IncomeCadence,
  view: ViewPeriod,
  range: DateRange,
): number {
  const periodDays = daysInRange(range)
  if (view === 'monthly') {
    switch (cadence) {
      case 'once':
        return amount
      case 'weekly':
        return amount * (periodDays / 7)
      case 'biweekly':
        return amount * (periodDays / 14)
      case 'monthly':
        return amount
      case 'yearly':
        return amount / 12
    }
  }

  switch (cadence) {
    case 'once':
      return amount
    case 'weekly':
      return amount
    case 'biweekly':
      return amount / 2
    case 'monthly':
      return amount * (periodDays / daysInMonthOf(range.start))
    case 'yearly':
      return amount * (periodDays / 365)
  }
}

function unskippedDayShare(range: DateRange, source: IncomeSource): number {
  if (!source.offRanges?.length) return 1
  const days = eachDayOfInterval({ start: range.start, end: range.end })
  if (days.length === 0) return 0
  const kept = days.filter((day) => !isOffOnDate(source, day)).length
  return kept / days.length
}

/** Period income for one source. Uses known/first paycheck hits when payDate is set. */
export function incomeAmountForSource(
  source: IncomeSource,
  view: ViewPeriod,
  range: DateRange,
): number {
  if (!source.enabled) return 0
  if (source.cadence === 'once') {
    if (!source.payDate) return 0
    const hits = incomePayDatesInPeriod(source, range).filter(
      (date) => !isOffOnDate(source, date),
    )
    return source.amount * hits.length
  }
  if (source.payDate) {
    const hits = incomePayDatesInPeriod(source, range).filter(
      (date) => !isOffOnDate(source, date),
    )
    return source.amount * hits.length
  }
  return (
    incomeAmountForView(source.amount, source.cadence, view, range) *
    unskippedDayShare(range, source)
  )
}

export function totalIncomeForPeriod(
  income: IncomeSource[],
  monthlyOverride: number | null,
  view: ViewPeriod,
  range: DateRange,
): number {
  if (monthlyOverride != null && monthlyOverride >= 0) {
    if (view === 'monthly') return monthlyOverride
    return monthlyOverride * (daysInRange(range) / daysInMonthOf(range.start))
  }
  return income.reduce(
    (sum, source) => sum + incomeAmountForSource(source, view, range),
    0,
  )
}

/** Amount from scheduled hits inside the range (no time-proration). */
export function expenseAmountForView(
  expense: Expense,
  _view: ViewPeriod,
  range: DateRange,
): number {
  if (!expense.enabled) return 0
  if (!isActiveInRange(expense, range)) return 0
  const hits = occurrenceDatesInPeriod(expense, range).filter(
    (date) => !isOffOnDate(expense, date),
  )
  return expense.amount * hits.length
}

export interface ReservedObligation {
  id: string
  name: string
  amount: number
  date: Date
  kind: 'expense' | 'goal'
}

/**
 * Bills and goal contributions after the viewed week, still inside the
 * calendar month of `anchor`. Empty for monthly view.
 */
export function reservedLaterInMonth(args: {
  expenses: Expense[]
  goals?: Goal[]
  view: ViewPeriod
  week: DateRange
  anchor: Date
}): { total: number; items: ReservedObligation[] } {
  if (args.view !== 'weekly') return { total: 0, items: [] }

  const month = periodRange('monthly', args.anchor)
  const laterStart = startOfDay(addDays(args.week.end, 1))
  if (isAfter(laterStart, month.end)) return { total: 0, items: [] }
  const later: DateRange = { start: laterStart, end: month.end }

  const items: ReservedObligation[] = []
  for (const expense of args.expenses) {
    if (!expense.enabled) continue
    for (const date of occurrenceDatesInPeriod(expense, later)) {
      if (isOffOnDate(expense, date)) continue
      items.push({
        id: `exp:${expense.id}:${date.toISOString()}`,
        name: expense.name,
        amount: expense.amount,
        date,
        kind: 'expense',
      })
    }
  }
  for (const goal of args.goals ?? []) {
    for (const date of goalContributionDatesInPeriod(goal, later)) {
      items.push({
        id: `goal:${goal.id}:${date.toISOString()}`,
        name: goal.name,
        amount: goal.contributionAmount,
        date,
        kind: 'goal',
      })
    }
  }
  items.sort((a, b) => a.date.getTime() - b.date.getTime())
  const total = items.reduce((sum, item) => sum + item.amount, 0)
  return { total, items }
}

/**
 * Cash a viewed period starts with. `currentBalance` is the opening cash for
 * `balanceMonth` (or the month that contains `asOf` when that is unset). A later
 * month opens at the projected balance on the last day of the month before it.
 * The baseline month and anything earlier keep `currentBalance`.
 */
export function openingBalanceForRange(args: {
  income: IncomeSource[]
  expenses: Expense[]
  goals?: Goal[]
  currentBalance: number
  range: DateRange
  balanceMonth?: string | null
  asOf?: Date
  weekStartsOn?: WeekStartsOn
}): number {
  const baselineStart = args.balanceMonth
    ? new Date(`${args.balanceMonth}-01T00:00:00`)
    : startOfMonth(startOfDay(args.asOf ?? new Date()))
  const rangeMonthStart = startOfMonth(args.range.start)
  if (!isAfter(rangeMonthStart, baselineStart)) return args.currentBalance

  let balance = args.currentBalance
  let cursor = baselineStart
  while (isBefore(cursor, rangeMonthStart)) {
    const month = periodRange('monthly', cursor, args.weekStartsOn)
    const events = calendarEvents({
      income: args.income,
      expenses: args.expenses,
      goals: args.goals,
      range: month,
    })
    balance += netForDay(events)
    cursor = addMonths(cursor, 1)
  }
  return balance
}

export function periodTotals(args: {
  income: IncomeSource[]
  monthlyOverride: number | null
  expenses: Expense[]
  goals?: Goal[]
  view: ViewPeriod
  range: DateRange
  /** Month used for “reserved later” when view is weekly. Defaults to range.start. */
  anchor?: Date
  currentBalance?: number
}): {
  income: number
  spending: number
  goalContributions: number
  leftover: number
  available: number
  reservedLaterMonth: number
  reservedItems: ReservedObligation[]
  projectedBalance: number
} {
  const income = totalIncomeForPeriod(
    args.income,
    args.monthlyOverride,
    args.view,
    args.range,
  )
  const spending = args.expenses.reduce(
    (sum, expense) => sum + expenseAmountForView(expense, args.view, args.range),
    0,
  )
  const goalContributions = (args.goals ?? []).reduce(
    (sum, goal) => sum + goalAmountForPeriod(goal, args.range),
    0,
  )
  const reserved = reservedLaterInMonth({
    expenses: args.expenses,
    goals: args.goals,
    view: args.view,
    week: args.range,
    anchor: args.anchor ?? args.range.start,
  })
  const currentBalance = args.currentBalance ?? 0
  const available = currentBalance + income
  const weekNet = income - spending - goalContributions
  return {
    income,
    spending,
    goalContributions,
    leftover: weekNet,
    available,
    reservedLaterMonth: reserved.total,
    reservedItems: reserved.items,
    projectedBalance: available - spending - goalContributions - reserved.total,
  }
}
