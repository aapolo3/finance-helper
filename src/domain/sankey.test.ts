import { describe, expect, it } from 'vitest'
import { periodRange } from './period'
import { sankeyLinks } from './sankey'
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

const snacks: Expense = {
  id: 'snacks',
  name: 'Snacks',
  amount: 40,
  category: 'Food',
  cadence: 'weekly',
  startDate: '2026-10-01',
  occurrenceLimit: null,
  occurrencesPosted: 0,
  enabled: false,
}

describe('sankeyLinks', () => {
  it('omits disabled expenses from nodes and links', () => {
    const month = periodRange('monthly', new Date(2026, 9, 7))
    const model = sankeyLinks({
      income: [{ id: '1', name: 'Job', amount: 5000, cadence: 'monthly', enabled: true }],
      monthlyOverride: null,
      expenses: [rent, snacks],
      goals: [],
      view: 'monthly',
      range: month,
    })

    expect(model.nodes.some((n) => n.id === 'exp:snacks')).toBe(false)
    expect(model.nodes.some((n) => n.id === 'exp:rent')).toBe(true)
    expect(model.links.some((l) => l.target === 'exp:snacks')).toBe(false)
    expect(model.totals.spending).toBe(1800)

    const housing = model.nodes.find((n) => n.id === 'cat:Housing')
    const rentNode = model.nodes.find((n) => n.id === 'exp:rent')
    expect(housing?.category).toBe('Housing')
    expect(rentNode?.category).toBe('Housing')
  })
})
