import { addMonths, addWeeks, isAfter, isBefore, startOfDay } from 'date-fns'
import { daysInMonthOf, daysInRange, parseDate } from './period'
import type { ContributionCadence, DateRange, Goal, ViewPeriod } from './types'

function nextContributionDate(date: Date, cadence: ContributionCadence): Date {
  switch (cadence) {
    case 'weekly':
      return addWeeks(date, 1)
    case 'biweekly':
      return addWeeks(date, 2)
    case 'monthly':
      return addMonths(date, 1)
  }
}

/**
 * Contribution dates inside the viewed period, starting at goal.startDate.
 * Stops once saved amount plus scheduled hits reach the target.
 */
export function goalContributionDatesInPeriod(goal: Goal, range: DateRange): Date[] {
  if (goal.contributionAmount <= 0) return []
  if (goal.savedAmount + 0.004 >= goal.targetAmount) return []
  if (!goal.startDate) return []

  const start = parseDate(goal.startDate)
  if (isAfter(start, range.end)) return []

  let funded = goal.savedAmount
  let cursor = start
  let safety = 0
  while (isBefore(cursor, range.start) && funded + 0.004 < goal.targetAmount && safety < 4000) {
    funded += goal.contributionAmount
    cursor = nextContributionDate(cursor, goal.contributionCadence)
    safety += 1
  }

  const dates: Date[] = []
  while (
    cursor.getTime() <= range.end.getTime() &&
    funded + 0.004 < goal.targetAmount &&
    safety < 4000
  ) {
    if (cursor.getTime() >= range.start.getTime()) dates.push(cursor)
    funded += goal.contributionAmount
    cursor = nextContributionDate(cursor, goal.contributionCadence)
    safety += 1
  }
  return dates
}

export function goalAmountForPeriod(goal: Goal, range: DateRange): number {
  return goal.contributionAmount * goalContributionDatesInPeriod(goal, range).length
}

export function contributionInView(
  goal: Goal,
  view: ViewPeriod,
  range: DateRange,
): number {
  const periodDays = daysInRange(range)
  if (view === 'monthly') {
    switch (goal.contributionCadence) {
      case 'weekly':
        return goal.contributionAmount * (periodDays / 7)
      case 'biweekly':
        return goal.contributionAmount * (periodDays / 14)
      case 'monthly':
        return goal.contributionAmount
    }
  }
  switch (goal.contributionCadence) {
    case 'weekly':
      return goal.contributionAmount
    case 'biweekly':
      return goal.contributionAmount / 2
    case 'monthly':
      return goal.contributionAmount * (periodDays / daysInMonthOf(range.start))
  }
}

export function addContributionPeriods(
  from: Date,
  cadence: ContributionCadence,
  count: number,
): Date {
  switch (cadence) {
    case 'weekly':
      return addWeeks(from, count)
    case 'biweekly':
      return addWeeks(from, count * 2)
    case 'monthly':
      return addMonths(from, count)
  }
}

export interface GoalProjection {
  remaining: number
  percentFunded: number
  periodsRemaining: number | null
  estimatedDate: Date | null
  funded: boolean
  beatsTargetDate: boolean | null
}

export function goalProjection(goal: Goal, asOf: Date = new Date()): GoalProjection {
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount)
  const percentFunded =
    goal.targetAmount <= 0 ? 100 : Math.min(100, (goal.savedAmount / goal.targetAmount) * 100)

  if (remaining <= 0) {
    return {
      remaining: 0,
      percentFunded: 100,
      periodsRemaining: 0,
      estimatedDate: startOfDay(asOf),
      funded: true,
      beatsTargetDate: true,
    }
  }

  if (goal.contributionAmount <= 0) {
    return {
      remaining,
      percentFunded,
      periodsRemaining: null,
      estimatedDate: null,
      funded: false,
      beatsTargetDate: goal.targetDate ? false : null,
    }
  }

  const periodsRemaining = Math.ceil(remaining / goal.contributionAmount)
  const estimatedDate = addContributionPeriods(startOfDay(asOf), goal.contributionCadence, periodsRemaining)
  let beatsTargetDate: boolean | null = null
  if (goal.targetDate) {
    const [y, m, d] = goal.targetDate.split('-').map(Number)
    const target = new Date(y, (m ?? 1) - 1, d ?? 1)
    beatsTargetDate = estimatedDate.getTime() <= target.getTime()
  }

  return {
    remaining,
    percentFunded,
    periodsRemaining,
    estimatedDate,
    funded: false,
    beatsTargetDate,
  }
}
