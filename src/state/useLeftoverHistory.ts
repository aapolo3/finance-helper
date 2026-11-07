import { useMemo } from 'react'
import { openingBalanceForRange, periodTotals } from '../domain/normalize'
import { periodRange, shiftAnchor } from '../domain/period'
import { useBudgetStore } from './budgetStore'

export interface LeftoverPoint {
  anchor: Date
  leftover: number
}

/**
 * Left over for the selected period and the `count - 1` periods before it, oldest first.
 * Same math as the Left over card, so the numbers always agree.
 */
export function useLeftoverHistory(count = 6): LeftoverPoint[] {
  const income = useBudgetStore((s) => s.income)
  const expenses = useBudgetStore((s) => s.expenses)
  const goals = useBudgetStore((s) => s.goals)
  const meta = useBudgetStore((s) => s.meta)

  return useMemo(() => {
    const selected = new Date(`${meta.anchorDate}T00:00:00`)
    const points: LeftoverPoint[] = []
    for (let back = count - 1; back >= 0; back--) {
      const anchor = shiftAnchor(meta.view, selected, -back)
      const range = periodRange(meta.view, anchor, meta.weekStartsOn)
      const opening = openingBalanceForRange({
        income,
        expenses,
        goals,
        currentBalance: meta.currentBalance,
        balanceMonth: meta.balanceMonth,
        range,
        weekStartsOn: meta.weekStartsOn,
      })
      const totals = periodTotals({
        income,
        monthlyOverride: meta.monthlyIncomeOverride,
        expenses,
        goals,
        view: meta.view,
        range,
        anchor,
        currentBalance: opening,
      })
      points.push({ anchor, leftover: totals.leftover })
    }
    return points
  }, [income, expenses, goals, meta, count])
}

/** Periods in a row, ending with the selected one, that finished ahead. */
export function aheadStreak(points: LeftoverPoint[]): number {
  let streak = 0
  for (let i = points.length - 1; i >= 0 && points[i].leftover > 0.004; i--) streak++
  return streak
}
