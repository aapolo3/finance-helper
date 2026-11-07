import { describe, expect, it } from 'vitest'
import { expenseAmountForView, openingBalanceForRange, periodTotals } from './normalize'
import { periodRange } from './period'
import type { Expense } from './types'

const rent: Expense = {
  id: 'rent',
  name: 'Rent',
  amount: 1800,
  category: 'Housing',
  cadence: 'monthly',
  startDate: '2026-10-01',
  occurrenceLimit: null,
  occurrencesPosted: 0,
  enabled: true,
}

describe('expenseAmountForView', () => {
  it('counts a monthly bill only in the week it is due', () => {
    const dueWeek = periodRange('weekly', new Date(2026, 9, 1), 1) // Sep 28–Oct 4
    const laterWeek = periodRange('weekly', new Date(2026, 9, 7), 1) // Oct 5–11
    expect(expenseAmountForView(rent, 'weekly', dueWeek)).toBe(1800)
    expect(expenseAmountForView(rent, 'weekly', laterWeek)).toBe(0)
  })

  it('uses the full monthly amount in monthly view', () => {
    const month = periodRange('monthly', new Date(2026, 9, 7))
    expect(expenseAmountForView(rent, 'monthly', month)).toBe(1800)
  })

  it('returns 0 for disabled expenses', () => {
    const month = periodRange('monthly', new Date(2026, 9, 7))
    expect(expenseAmountForView({ ...rent, enabled: false }, 'monthly', month)).toBe(0)
  })

  it('skips a month without changing other months', () => {
    const october = periodRange('monthly', new Date(2026, 9, 7))
    const november = periodRange('monthly', new Date(2026, 10, 7))
    const paused = { ...rent, offRanges: [{ start: '2026-11', end: '2026-11' }] }
    expect(expenseAmountForView(paused, 'monthly', october)).toBe(1800)
    expect(expenseAmountForView(paused, 'monthly', november)).toBe(0)
  })

  it('turns off this month and every later month without changing earlier ones', () => {
    const september = periodRange('monthly', new Date(2026, 8, 7))
    const october = periodRange('monthly', new Date(2026, 9, 7))
    const november = periodRange('monthly', new Date(2026, 10, 7))
    const paused = {
      ...rent,
      startDate: '2026-01-01',
      offRanges: [{ start: '2026-10', end: null }],
    }
    expect(expenseAmountForView(paused, 'monthly', september)).toBe(1800)
    expect(expenseAmountForView(paused, 'monthly', october)).toBe(0)
    expect(expenseAmountForView(paused, 'monthly', november)).toBe(0)
  })
})

describe('periodTotals', () => {
  it('applies a monthly income override', () => {
    const month = periodRange('monthly', new Date(2026, 9, 7))
    const totals = periodTotals({
      income: [{ id: '1', name: 'Job', amount: 5000, cadence: 'monthly', enabled: true }],
      monthlyOverride: 4100,
      expenses: [rent],
      view: 'monthly',
      range: month,
    })
    expect(totals.income).toBe(4100)
    expect(totals.spending).toBe(1800)
    expect(totals.leftover).toBe(2300)
  })

  it('counts paychecks by payday and projects balance', () => {
    const weekWithPay = periodRange('weekly', new Date(2026, 9, 7)) // Oct 5–11
    const weekWithoutPay = periodRange('weekly', new Date(2026, 9, 14)) // Oct 12–18
    const paycheck = {
      id: '1',
      name: 'Job',
      amount: 1200,
      cadence: 'biweekly' as const,
      enabled: true,
      payDate: '2026-10-09',
      payDateMode: 'known' as const,
    }

    const withPay = periodTotals({
      income: [paycheck],
      monthlyOverride: null,
      expenses: [],
      view: 'weekly',
      range: weekWithPay,
      currentBalance: 300,
    })
    expect(withPay.income).toBe(1200)
    expect(withPay.projectedBalance).toBe(1500)

    const withoutPay = periodTotals({
      income: [paycheck],
      monthlyOverride: null,
      expenses: [],
      view: 'weekly',
      range: weekWithoutPay,
      currentBalance: 300,
    })
    expect(withoutPay.income).toBe(0)
    expect(withoutPay.projectedBalance).toBe(300)
  })

  it('reserves later-month bills in weekly projected balance without counting them as this week', () => {
    const week = periodRange('weekly', new Date(2026, 9, 7), 1) // Oct 5–11
    const laterRent: Expense = { ...rent, startDate: '2026-10-28' }
    const totals = periodTotals({
      income: [],
      monthlyOverride: null,
      expenses: [laterRent],
      view: 'weekly',
      range: week,
      anchor: new Date(2026, 9, 7),
      currentBalance: 450,
    })
    expect(totals.spending).toBe(0)
    expect(totals.reservedLaterMonth).toBe(1800)
    expect(totals.projectedBalance).toBe(450 - 1800)
    expect(totals.reservedItems[0]?.name).toBe('Rent')
  })

  it('does not double-count a bill due this week as reserved', () => {
    const week = periodRange('weekly', new Date(2026, 9, 28), 1) // Oct 26–Nov 1
    const totals = periodTotals({
      income: [],
      monthlyOverride: null,
      expenses: [{ ...rent, startDate: '2026-10-28' }],
      view: 'weekly',
      range: week,
      anchor: new Date(2026, 9, 28),
      currentBalance: 2000,
    })
    expect(totals.spending).toBe(1800)
    expect(totals.reservedLaterMonth).toBe(0)
    expect(totals.projectedBalance).toBe(200)
  })

  it('leaves reserved at zero in monthly view', () => {
    const month = periodRange('monthly', new Date(2026, 9, 7))
    const totals = periodTotals({
      income: [],
      monthlyOverride: null,
      expenses: [rent],
      view: 'monthly',
      range: month,
      currentBalance: 0,
    })
    expect(totals.reservedLaterMonth).toBe(0)
    expect(totals.spending).toBe(1800)
  })

  it('starts a later month from the previous month’s projected balance', () => {
    const asOf = new Date(2026, 9, 27)
    const october = periodRange('monthly', new Date(2026, 9, 7))
    const november = periodRange('monthly', new Date(2026, 10, 7))
    const income = [
      {
        id: '1',
        name: 'Job',
        amount: 5000,
        cadence: 'monthly' as const,
        enabled: true,
        payDate: '2026-10-15',
        payDateMode: 'known' as const,
      },
    ]
    const shared = {
      income,
      expenses: [rent],
      currentBalance: 1000,
      asOf,
    }
    const octoberOpening = openingBalanceForRange({ ...shared, range: october })
    const novemberOpening = openingBalanceForRange({ ...shared, range: november })
    expect(octoberOpening).toBe(1000)
    expect(novemberOpening).toBe(4200)

    const novemberTotals = periodTotals({
      income,
      monthlyOverride: null,
      expenses: [rent],
      view: 'monthly',
      range: november,
      currentBalance: novemberOpening,
    })
    expect(novemberTotals.projectedBalance).toBe(7400)
  })

  it('carries the balance month forward even after the calendar rolls over', () => {
    const november = periodRange('monthly', new Date(2026, 10, 7))
    const opening = openingBalanceForRange({
      income: [],
      expenses: [rent],
      currentBalance: 2000,
      balanceMonth: '2026-10',
      range: november,
      asOf: new Date(2026, 10, 1),
    })
    expect(opening).toBe(200)
  })

  it('does not let a November skip change October’s carried balance', () => {
    const asOf = new Date(2026, 9, 27)
    const november = periodRange('monthly', new Date(2026, 10, 7))
    const opening = openingBalanceForRange({
      income: [],
      expenses: [{ ...rent, offRanges: [{ start: '2026-11', end: '2026-11' }] }],
      currentBalance: 2000,
      range: november,
      asOf,
    })
    expect(opening).toBe(200)
  })

  it('omits disabled income from totals', () => {
    const month = periodRange('monthly', new Date(2026, 9, 7))
    const totals = periodTotals({
      income: [
        { id: '1', name: 'Job', amount: 5000, cadence: 'monthly', enabled: false },
        { id: '2', name: 'Side', amount: 400, cadence: 'monthly', enabled: true },
      ],
      monthlyOverride: null,
      expenses: [],
      view: 'monthly',
      range: month,
    })
    expect(totals.income).toBe(400)
  })
})
