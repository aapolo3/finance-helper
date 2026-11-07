import { describe, expect, it } from 'vitest'
import {
  applyMonthRemoval,
  applyMonthToggle,
  countsInMonth,
  expensePeriodDueBucket,
  expenseVisibleOnList,
  oneTimeIncomeIsPast,
  incomePayDatesInPeriod,
  nextExpenseDateOnOrAfter,
  occurrenceDatesInPeriod,
  periodRange,
  remainingOccurrences,
} from './period'
import type { Expense, IncomeSource } from './types'

function expense(partial: Partial<Expense> & Pick<Expense, 'startDate' | 'cadence'>): Expense {
  return {
    id: 'e1',
    name: 'Test',
    amount: 200,
    category: 'Other',
    occurrenceLimit: null,
    occurrencesPosted: 0,
    enabled: true,
    ...partial,
  }
}

describe('occurrenceDatesInPeriod', () => {
  it('counts a 2-charge monthly payment plan in Oct and Nov only', () => {
    const plan = expense({
      startDate: '2026-10-01',
      cadence: 'monthly',
      occurrenceLimit: 2,
      occurrencesPosted: 0,
    })

    const oct = periodRange('monthly', new Date(2026, 9, 15))
    const nov = periodRange('monthly', new Date(2026, 10, 15))
    const dec = periodRange('monthly', new Date(2026, 11, 15))

    expect(occurrenceDatesInPeriod(plan, oct)).toHaveLength(1)
    expect(occurrenceDatesInPeriod(plan, nov)).toHaveLength(1)
    expect(occurrenceDatesInPeriod(plan, dec)).toHaveLength(0)
  })

  it('includes only remaining charges after occurrencesPosted', () => {
    const plan = expense({
      startDate: '2026-10-01',
      cadence: 'monthly',
      occurrenceLimit: 2,
      occurrencesPosted: 1,
    })

    const oct = periodRange('monthly', new Date(2026, 9, 15))
    const nov = periodRange('monthly', new Date(2026, 10, 15))

    expect(occurrenceDatesInPeriod(plan, oct)).toHaveLength(0)
    expect(occurrenceDatesInPeriod(plan, nov)).toHaveLength(1)
    expect(remainingOccurrences(plan)).toBe(1)
  })

  it('places a one-time expense only on its start date', () => {
    const once = expense({
      startDate: '2026-10-20',
      cadence: 'once',
      occurrenceLimit: 1,
    })
    const oct = periodRange('monthly', new Date(2026, 9, 1))
    const weekOf13 = periodRange('weekly', new Date(2026, 9, 14))
    const weekOf20 = periodRange('weekly', new Date(2026, 9, 20))

    expect(occurrenceDatesInPeriod(once, oct)).toHaveLength(1)
    expect(occurrenceDatesInPeriod(once, weekOf13)).toHaveLength(0)
    expect(occurrenceDatesInPeriod(once, weekOf20)).toHaveLength(1)
  })

  it('counts weekly hits inside a month', () => {
    const groceries = expense({
      startDate: '2026-10-05',
      cadence: 'weekly',
    })
    const oct = periodRange('monthly', new Date(2026, 9, 1))
    expect(occurrenceDatesInPeriod(groceries, oct).length).toBeGreaterThanOrEqual(4)
  })
})

describe('incomePayDatesInPeriod', () => {
  it('finds weekly paydays that land in a month', () => {
    const source = {
      id: '1',
      name: 'Job',
      amount: 1000,
      cadence: 'weekly' as const,
      enabled: true,
      payDate: '2026-10-02',
      payDateMode: 'known' as const,
    }
    const oct = periodRange('monthly', new Date(2026, 9, 15))
    const dates = incomePayDatesInPeriod(source, oct)
    expect(dates.length).toBeGreaterThanOrEqual(4)
    expect(dates[0]?.getDate()).toBe(2)
  })

  it('known payday includes hits before the anchor date', () => {
    const source = {
      id: '1',
      name: 'Job',
      amount: 1000,
      cadence: 'weekly' as const,
      enabled: true,
      payDate: '2026-10-16',
      payDateMode: 'known' as const,
    }
    const earlyWeek = periodRange('weekly', new Date(2026, 9, 7)) // Oct 5–11
    const dates = incomePayDatesInPeriod(source, earlyWeek)
    expect(dates.map((d) => d.getDate())).toEqual([9])
  })

  it('first paycheck excludes hits before the anchor date', () => {
    const source = {
      id: '1',
      name: 'Job',
      amount: 1000,
      cadence: 'weekly' as const,
      enabled: true,
      payDate: '2026-10-16',
      payDateMode: 'first' as const,
    }
    const earlyWeek = periodRange('weekly', new Date(2026, 9, 7)) // Oct 5–11
    expect(incomePayDatesInPeriod(source, earlyWeek)).toEqual([])
  })
})

describe('nextExpenseDateOnOrAfter', () => {
  it('returns the next charge on or after today and skips posted ones', () => {
    const plan = expense({
      startDate: '2026-10-01',
      cadence: 'monthly',
      occurrenceLimit: 3,
      occurrencesPosted: 1,
    })
    const next = nextExpenseDateOnOrAfter(plan, new Date(2026, 9, 15))
    expect(next?.getMonth()).toBe(10)
    expect(next?.getDate()).toBe(1)
  })
})

describe('expenseVisibleOnList', () => {
  const october = new Date(2026, 9, 15)

  it('hides one-time expenses from a previous month', () => {
    expect(
      expenseVisibleOnList(
        expense({ startDate: '2026-09-20', cadence: 'once' }),
        october,
      ),
    ).toBe(false)
  })

  it('keeps one-time expenses in the current month and later', () => {
    expect(
      expenseVisibleOnList(
        expense({ startDate: '2026-10-01', cadence: 'once' }),
        october,
      ),
    ).toBe(true)
    expect(
      expenseVisibleOnList(
        expense({ startDate: '2026-11-02', cadence: 'once' }),
        october,
      ),
    ).toBe(true)
  })

  it('keeps recurring expenses regardless of start date', () => {
    expect(
      expenseVisibleOnList(
        expense({ startDate: '2025-01-01', cadence: 'monthly' }),
        october,
      ),
    ).toBe(true)
  })
})

describe('oneTimeIncomeIsPast', () => {
  const october = periodRange('monthly', new Date(2026, 9, 15))
  const today = new Date(2026, 9, 27)

  function source(
    partial: Partial<IncomeSource> & Pick<IncomeSource, 'cadence' | 'payDate'>,
  ): IncomeSource {
    return {
      id: 'i1',
      name: 'Bonus',
      amount: 500,
      enabled: true,
      ...partial,
    }
  }

  it('parks a one-time paycheck on or before today', () => {
    expect(
      oneTimeIncomeIsPast(source({ cadence: 'once', payDate: '2026-10-01' }), october, today),
    ).toBe(true)
    expect(
      oneTimeIncomeIsPast(source({ cadence: 'once', payDate: '2026-10-27' }), october, today),
    ).toBe(true)
  })

  it('keeps a later one-time paycheck in the main list', () => {
    expect(
      oneTimeIncomeIsPast(source({ cadence: 'once', payDate: '2026-10-31' }), october, today),
    ).toBe(false)
  })

  it('parks one-time income from before the viewed period', () => {
    const november = periodRange('monthly', new Date(2026, 10, 7))
    expect(
      oneTimeIncomeIsPast(source({ cadence: 'once', payDate: '2026-10-15' }), november, today),
    ).toBe(true)
  })

  it('keeps recurring income in the main list', () => {
    expect(
      oneTimeIncomeIsPast(source({ cadence: 'weekly', payDate: '2026-10-01' }), october, today),
    ).toBe(false)
  })
})

describe('expensePeriodDueBucket', () => {
  const month = periodRange('monthly', new Date(2026, 9, 15))

  it('marks fully past dues as past', () => {
    expect(
      expensePeriodDueBucket(
        expense({ startDate: '2026-10-05', cadence: 'once' }),
        month,
        new Date(2026, 9, 15),
      ),
    ).toBe('past')
  })

  it('marks dues after asOf as upcoming', () => {
    expect(
      expensePeriodDueBucket(
        expense({ startDate: '2026-10-20', cadence: 'once' }),
        month,
        new Date(2026, 9, 15),
      ),
    ).toBe('upcoming')
  })

  it('marks dues on asOf as past (already paid)', () => {
    expect(
      expensePeriodDueBucket(
        expense({ startDate: '2026-10-15', cadence: 'once' }),
        month,
        new Date(2026, 9, 15),
      ),
    ).toBe('past')
  })

  it('keeps biweekly with a later hit in upcoming', () => {
    expect(
      expensePeriodDueBucket(
        expense({ startDate: '2026-10-01', cadence: 'biweekly' }),
        month,
        new Date(2026, 9, 10),
      ),
    ).toBe('upcoming')
  })

  it('lets a toggle reach only this month, the future, or the past', () => {
    const rent = expense({ startDate: '2026-01-01', cadence: 'monthly' })
    const onlyNovember = applyMonthToggle(rent, '2026-11', 'month')
    expect(countsInMonth(onlyNovember, '2026-10')).toBe(true)
    expect(countsInMonth(onlyNovember, '2026-11')).toBe(false)
    expect(countsInMonth(onlyNovember, '2026-12')).toBe(true)

    const octoberOnward = applyMonthToggle(rent, '2026-10', 'future')
    expect(countsInMonth(octoberOnward, '2026-09')).toBe(true)
    expect(countsInMonth(octoberOnward, '2026-10')).toBe(false)
    expect(countsInMonth(octoberOnward, '2027-03')).toBe(false)

    const backOnLater = applyMonthToggle(octoberOnward, '2026-12', 'future')
    expect(countsInMonth(backOnLater, '2026-10')).toBe(false)
    expect(countsInMonth(backOnLater, '2026-11')).toBe(false)
    expect(countsInMonth(backOnLater, '2026-12')).toBe(true)

    const throughOctober = applyMonthToggle(rent, '2026-10', 'past')
    expect(countsInMonth(throughOctober, '2026-01')).toBe(false)
    expect(countsInMonth(throughOctober, '2026-10')).toBe(false)
    expect(countsInMonth(throughOctober, '2026-11')).toBe(true)
  })

  it('removes an expense from later months without dropping earlier ones', () => {
    const rent = expense({ startDate: '2026-01-01', cadence: 'monthly' })
    const canceled = applyMonthRemoval(rent, '2026-11', 'future').item
    expect(countsInMonth(canceled, '2026-10')).toBe(true)
    expect(countsInMonth(canceled, '2026-11')).toBe(false)
    expect(countsInMonth(canceled, '2026-12')).toBe(false)
    expect(expenseVisibleOnList(canceled, new Date(2026, 9, 15))).toBe(true)
    expect(expenseVisibleOnList(canceled, new Date(2026, 10, 15))).toBe(false)
    expect(applyMonthRemoval(canceled, '2026-10', 'past').removedEverywhere).toBe(true)
  })

  it('parks expenses with no dues in the period as later', () => {
    expect(
      expensePeriodDueBucket(
        expense({ startDate: '2026-11-01', cadence: 'monthly' }),
        month,
        new Date(2026, 9, 15),
      ),
    ).toBe('later')
  })
})

describe('applyMonthToggle all', () => {
  it('turns an item off for every month and back on, clearing spans', () => {
    const item = {
      enabled: true,
      offRanges: [{ start: '2026-03', end: '2026-04' }],
    }
    const off = applyMonthToggle(item, '2026-11', 'all')
    expect(off.enabled).toBe(false)
    expect(off.offRanges).toEqual([])
    expect(countsInMonth(off, '2026-01')).toBe(false)
    expect(countsInMonth(off, '2027-06')).toBe(false)

    const on = applyMonthToggle(off, '2026-11', 'all')
    expect(on.enabled).toBe(true)
    expect(countsInMonth(on, '2026-03')).toBe(true)
  })
})
