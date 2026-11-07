import { describe, expect, it } from 'vitest'
import { ACTIVITY_LIMIT, appendActivity } from './activity'
import { normalizeBudgetState } from './migrate'
import { emptyBudget } from './demo'
import type { ActivityEntry, Expense } from './types'

const expense: Expense = {
  id: 'e1',
  name: 'Rent',
  amount: 10,
  category: 'Housing',
  cadence: 'monthly',
  startDate: '2026-10-01',
  occurrenceLimit: null,
  occurrencesPosted: 0,
  enabled: true,
}

function entry(n: number): ActivityEntry {
  return {
    id: `a${n}`,
    atMs: n,
    action: 'added',
    entity: 'expense',
    snapshot: expense,
  }
}

describe('appendActivity', () => {
  it('prepends new entries and caps the log', () => {
    let log: ActivityEntry[] = []
    for (let i = 0; i < ACTIVITY_LIMIT + 5; i += 1) {
      log = appendActivity(log, entry(i))
    }
    expect(log).toHaveLength(ACTIVITY_LIMIT)
    expect(log[0]?.atMs).toBe(ACTIVITY_LIMIT + 4)
    expect(log.at(-1)?.atMs).toBe(5)
  })
})

describe('normalizeBudgetState activity', () => {
  it('defaults a missing activity log and goal start date', () => {
    const raw = emptyBudget()
    const legacy = {
      ...raw,
      activityLog: undefined,
      goals: [
        {
          id: 'g',
          name: 'Bike',
          targetAmount: 10,
          savedAmount: 0,
          contributionAmount: 1,
          contributionCadence: 'weekly' as const,
        },
      ],
    }
    const next = normalizeBudgetState(legacy as unknown as typeof raw)
    expect(next.activityLog).toEqual([])
    expect(next.goals[0]?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(next.meta.expensesLayout).toBe('auto')
    expect(next.meta.sankeyTheme).toBe('classic')
    expect(next.meta.updatedAtMs).toBe(0)
  })
})
