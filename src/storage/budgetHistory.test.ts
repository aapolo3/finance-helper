import { describe, expect, it } from 'vitest'
import { emptyBudget } from '../domain/demo'
import { reasonLabel, monthOutlook, shouldArchivePrevious, summarizeBudget } from './budgetHistory'

describe('budget history helpers', () => {
  it('summarizes counts and balance', () => {
    const state = emptyBudget()
    state.income = [{ id: '1', name: 'Job', amount: 1, cadence: 'monthly', enabled: true }]
    state.meta.currentBalance = 40
    expect(summarizeBudget(state)).toEqual({
      income: 1,
      expenses: 0,
      goals: 0,
      balance: 40,
    })
  })

  it('always archives for force/push and for large auto gaps', () => {
    const previous = emptyBudget()
    previous.income = [{ id: '1', name: 'Job', amount: 1, cadence: 'monthly', enabled: true }]
    previous.meta.updatedAtMs = 1_000
    const next = emptyBudget()
    next.meta.updatedAtMs = 1_000 + 3 * 60 * 1000

    expect(shouldArchivePrevious(previous, next, 'force')).toBe(true)
    expect(shouldArchivePrevious(previous, next, 'push')).toBe(true)
    expect(shouldArchivePrevious(previous, next, 'auto')).toBe(true)
    next.meta.updatedAtMs = 1_500
    expect(shouldArchivePrevious(previous, next, 'auto')).toBe(false)
  })

  it('labels reasons for the UI', () => {
    expect(reasonLabel('force')).toBe('Made latest')
    expect(reasonLabel('browser-before-sync')).toBe('This browser before sync')
  })

  it('projects the current month balance and cash flow from a saved budget', () => {
    const state = emptyBudget()
    state.meta.currentBalance = 500
    state.income = [{ id: '1', name: 'Job', amount: 2000, cadence: 'monthly', enabled: true }]
    state.expenses = [
      {
        id: 'rent',
        name: 'Rent',
        amount: 800,
        category: 'Housing',
        cadence: 'monthly',
        startDate: '2026-10-01',
        occurrenceLimit: null,
        occurrencesPosted: 0,
        enabled: true,
      },
    ]
    const outlook = monthOutlook(state, new Date(2026, 9, 15))
    expect(outlook.cashFlow).toBe(1200)
    expect(outlook.projectedBalance).toBe(1700)
  })
})
