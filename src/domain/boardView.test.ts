import { describe, expect, it } from 'vitest'
import { boardView } from './boardView'

describe('boardView', () => {
  it('shows current income after picking Paid, then Income (was a blank list)', () => {
    expect(boardView('income', 'past')).toEqual({ filter: 'past', income: 'current', bucket: null })
    expect(boardView('income', 'later').income).toBe('current')
  })

  it('shows past income on the Income chip when Past income is the filter', () => {
    expect(boardView('income', 'pastIncome').income).toBe('past')
  })

  it("shows the category's This month items when Past income was the filter (was a blank list)", () => {
    expect(boardView('Housing', 'pastIncome')).toEqual({
      filter: 'upcoming',
      income: null,
      bucket: 'upcoming',
    })
  })

  it('keeps the chosen bucket for a category', () => {
    expect(boardView('Housing', 'past')).toEqual({ filter: 'past', income: null, bucket: 'past' })
  })

  it('shows income only with This month or Past income on All', () => {
    expect(boardView('all', 'upcoming')).toEqual({ filter: 'upcoming', income: 'current', bucket: 'upcoming' })
    expect(boardView('all', 'past')).toEqual({ filter: 'past', income: null, bucket: 'past' })
    expect(boardView('all', 'pastIncome')).toEqual({ filter: 'pastIncome', income: 'past', bucket: null })
  })

  it('always shows income or an expense bucket', () => {
    for (const picked of ['all', 'income', 'Housing']) {
      for (const filter of ['upcoming', 'past', 'later', 'pastIncome'] as const) {
        const view = boardView(picked, filter)
        expect(view.income != null || view.bucket != null).toBe(true)
      }
    }
  })
})
