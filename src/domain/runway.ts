import { addDays, differenceInCalendarDays, isBefore, startOfDay } from 'date-fns'
import type { CalendarEvent } from './calendar'

/** How far ahead to look when no paycheck is scheduled. */
export const RUNWAY_FALLBACK_DAYS = 30

export interface RunwayStep {
  date: Date
  /** Balance after this step. */
  balance: number
  event: CalendarEvent | null
}

export interface Runway {
  /** The next paycheck after today, or null when none is scheduled in the window. */
  payday: CalendarEvent | null
  /** Last day the runway covers: the payday, or the fallback horizon. */
  end: Date
  /** Bills and goal contributions due from today up to (not including) the payday. */
  bills: CalendarEvent[]
  billsTotal: number
  /** Today's balance, then one step per income or outflow before the payday. */
  steps: RunwayStep[]
  /** What's left to spend before the payday once those bills are paid. */
  safe: number
  /** Whole days until the payday (at least 1). */
  days: number
  /** safe spread evenly over those days; 0 when safe is negative. */
  perDay: number
}

/**
 * The stretch from today to the next paycheck. `balanceToday` is the balance at the start of
 * today, before today's events; `events` should cover today through at least the payday.
 */
export function runwayUntilPayday(args: {
  balanceToday: number
  events: CalendarEvent[]
  today: Date
}): Runway {
  const today = startOfDay(args.today)
  const upcoming = args.events
    .filter((event) => !isBefore(startOfDay(event.date), today))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  const payday =
    upcoming.find(
      (event) => event.kind === 'income' && startOfDay(event.date).getTime() > today.getTime(),
    ) ?? null
  const end = payday ? startOfDay(payday.date) : addDays(today, RUNWAY_FALLBACK_DAYS)

  const before = upcoming.filter((event) => isBefore(startOfDay(event.date), end))
  const bills = before.filter((event) => event.kind !== 'income')

  let balance = args.balanceToday
  const steps: RunwayStep[] = [{ date: today, balance, event: null }]
  for (const event of before) {
    balance += event.kind === 'income' ? event.amount : -event.amount
    steps.push({ date: startOfDay(event.date), balance, event })
  }

  const days = Math.max(1, differenceInCalendarDays(end, today))
  return {
    payday,
    end,
    bills,
    billsTotal: bills.reduce((sum, event) => sum + event.amount, 0),
    steps,
    safe: balance,
    days,
    perDay: Math.max(0, balance) / days,
  }
}

export type RunwayTone = 'safe' | 'tight' | 'short'

/**
 * Safe when nothing goes negative before payday. Tight when it does but the month still
 * ends above zero, because a later paycheck covers it. Short only when the month ends below zero.
 */
export function runwayTone(safe: number, monthEndBalance: number): RunwayTone {
  if (safe >= -0.004) return 'safe'
  return monthEndBalance >= -0.004 ? 'tight' : 'short'
}
