import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import {
  incomePayDatesInPeriod,
  isOffOnDate,
  occurrenceDatesInPeriod,
  periodRange,
} from './period'
import { goalContributionDatesInPeriod } from './goals'
import type {
  DateRange,
  Expense,
  Goal,
  IncomeSource,
  ViewPeriod,
  WeekStartsOn,
} from './types'

export type CalendarEventKind = 'income' | 'expense' | 'goal'

export interface CalendarEvent {
  id: string
  kind: CalendarEventKind
  name: string
  amount: number
  date: Date
  category?: string
  /** A one-time expense rather than a recurring bill. */
  oneOff?: boolean
}

export const WEEKDAY_LABELS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const WEEKDAY_LABELS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function weekdayLabels(weekStartsOn: WeekStartsOn): readonly string[] {
  return weekStartsOn === 0 ? WEEKDAY_LABELS_SUN : WEEKDAY_LABELS_MON
}

export function calendarEvents(args: {
  income: IncomeSource[]
  expenses: Expense[]
  goals?: Goal[]
  range: DateRange
}): CalendarEvent[] {
  const events: CalendarEvent[] = []

  for (const source of args.income) {
    if (!source.enabled) continue
    for (const date of incomePayDatesInPeriod(source, args.range)) {
      if (isOffOnDate(source, date)) continue
      events.push({
        id: `inc:${source.id}:${date.toISOString()}`,
        kind: 'income',
        name: source.name,
        amount: source.amount,
        date,
      })
    }
  }

  for (const expense of args.expenses) {
    if (!expense.enabled) continue
    for (const date of occurrenceDatesInPeriod(expense, args.range)) {
      if (isOffOnDate(expense, date)) continue
      events.push({
        id: `exp:${expense.id}:${date.toISOString()}`,
        kind: 'expense',
        name: expense.name,
        amount: expense.amount,
        date,
        category: expense.category,
        oneOff: expense.cadence === 'once',
      })
    }
  }

  for (const goal of args.goals ?? []) {
    for (const date of goalContributionDatesInPeriod(goal, args.range)) {
      events.push({
        id: `goal:${goal.id}:${date.toISOString()}`,
        kind: 'goal',
        name: goal.name,
        amount: goal.contributionAmount,
        date,
      })
    }
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** Grid days for the calendar: full month or the selected week. */
export function calendarGridDays(
  view: ViewPeriod,
  anchor: Date,
  weekStartsOn: WeekStartsOn = 1,
): Date[] {
  if (view === 'weekly') {
    const range = periodRange('weekly', anchor, weekStartsOn)
    return eachDayOfInterval({ start: range.start, end: range.end })
  }

  const monthStart = startOfMonth(anchor)
  const monthEnd = endOfMonth(anchor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn })
  return eachDayOfInterval({ start: gridStart, end: gridEnd })
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((event) => isSameDay(event.date, day))
}

export function dayInPeriod(day: Date, range: DateRange): boolean {
  return day.getTime() >= range.start.getTime() && day.getTime() <= range.end.getTime()
}

export function dayInFocusMonth(day: Date, anchor: Date): boolean {
  return isSameMonth(day, anchor)
}

export function netForDay(events: CalendarEvent[]): number {
  return events.reduce(
    (sum, event) => sum + (event.kind === 'income' ? event.amount : -event.amount),
    0,
  )
}

export interface DayBalanceForecast {
  /** Balance at the start of the selected day (after prior days in the period). */
  openingBalance: number
  incomeToday: number
  expensesToday: number
  netToday: number
  goalsToday: number
  /** Balance after today's income, bills, and goal contributions. */
  closingBalance: number
  /** Opening + today's income — what you can put toward bills and goals that day. */
  availableToday: number
  /** True if availableToday covers today's bills and goal contributions. */
  canCoverToday: boolean
  /** How much short of covering today's bills (0 if covered). */
  shortfallToday: number
  /** True if closing balance is negative. */
  endsNegative: boolean
  /** Lowest closing balance from period start through this day. */
  lowestBalanceThroughDay: number
}

/**
 * Project balance for a day: start from currentBalance at period start,
 * apply scheduled income, expenses, and goal contributions through the selected day.
 */
export function dayBalanceForecast(args: {
  startingBalance: number
  events: CalendarEvent[]
  range: DateRange
  day: Date
}): DayBalanceForecast | null {
  const selected = startOfDay(args.day)
  if (isBefore(selected, args.range.start) || selected.getTime() > args.range.end.getTime()) {
    return null
  }

  const days = eachDayOfInterval({ start: args.range.start, end: selected })
  let balance = args.startingBalance
  let lowest = balance
  let openingBalance = balance
  let incomeToday = 0
  let expensesToday = 0
  let goalsToday = 0

  for (const day of days) {
    const dayEvents = eventsOnDay(args.events, day)
    const income = dayEvents
      .filter((e) => e.kind === 'income')
      .reduce((sum, e) => sum + e.amount, 0)
    const expenses = dayEvents
      .filter((e) => e.kind === 'expense')
      .reduce((sum, e) => sum + e.amount, 0)
    const goals = dayEvents
      .filter((e) => e.kind === 'goal')
      .reduce((sum, e) => sum + e.amount, 0)

    if (isSameDay(day, selected)) {
      openingBalance = balance
      incomeToday = income
      expensesToday = expenses
      goalsToday = goals
    }

    balance += income - expenses - goals
    if (balance < lowest) lowest = balance
  }

  const availableToday = openingBalance + incomeToday
  const dueToday = expensesToday + goalsToday
  const shortfallToday = Math.max(0, dueToday - availableToday)

  return {
    openingBalance,
    incomeToday,
    expensesToday,
    goalsToday,
    netToday: incomeToday - dueToday,
    closingBalance: balance,
    availableToday,
    canCoverToday: shortfallToday <= 0.004,
    shortfallToday,
    endsNegative: balance < -0.004,
    lowestBalanceThroughDay: lowest,
  }
}
