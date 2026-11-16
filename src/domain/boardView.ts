export type BoardBucket = 'upcoming' | 'past' | 'later'
export type BoardFilter = BoardBucket | 'pastIncome'

/** What the Cash flow board shows for a picked chip ('all', 'income' or a category). */
export type BoardView = {
  /** The status chip shown as selected. */
  filter: BoardFilter
  /** Which income list to show, or none. */
  income: 'current' | 'past' | null
  /** Which expense bucket to list under each category, or none. */
  bucket: BoardBucket | null
}

/**
 * Resolves the picked chip and status filter into one view that always shows something.
 * Income only has current and past lists, so Paid/Not due fall back to current there;
 * a category has no income, so Past income falls back to This month there.
 */
export function boardView(picked: string, filter: BoardFilter): BoardView {
  if (picked === 'income') {
    return { filter, income: filter === 'pastIncome' ? 'past' : 'current', bucket: null }
  }
  if (picked !== 'all') {
    const bucket = filter === 'pastIncome' ? 'upcoming' : filter
    return { filter: bucket, income: null, bucket }
  }
  if (filter === 'pastIncome') return { filter, income: 'past', bucket: null }
  return { filter, income: filter === 'upcoming' ? 'current' : null, bucket: filter }
}
