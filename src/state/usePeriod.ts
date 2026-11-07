import { useMemo } from 'react'
import { calendarEvents } from '../domain/calendar'
import { openingBalanceForRange, periodTotals } from '../domain/normalize'
import { periodRange } from '../domain/period'
import { useBudgetStore } from './budgetStore'

/** The selected pay period and the numbers every page derives from it. */
export function usePeriod() {
  const income = useBudgetStore((s) => s.income)
  const expenses = useBudgetStore((s) => s.expenses)
  const goals = useBudgetStore((s) => s.goals)
  const meta = useBudgetStore((s) => s.meta)

  const anchor = useMemo(() => new Date(`${meta.anchorDate}T00:00:00`), [meta.anchorDate])
  const range = useMemo(
    () => periodRange(meta.view, anchor, meta.weekStartsOn),
    [meta.view, anchor, meta.weekStartsOn],
  )
  const openingBalance = useMemo(
    () =>
      openingBalanceForRange({
        income,
        expenses,
        goals,
        currentBalance: meta.currentBalance,
        balanceMonth: meta.balanceMonth,
        range,
        weekStartsOn: meta.weekStartsOn,
      }),
    [income, expenses, goals, meta.currentBalance, meta.balanceMonth, meta.weekStartsOn, range],
  )
  const totals = useMemo(
    () =>
      periodTotals({
        income,
        monthlyOverride: meta.monthlyIncomeOverride,
        expenses,
        goals,
        view: meta.view,
        range,
        anchor,
        currentBalance: openingBalance,
      }),
    [income, expenses, goals, meta.monthlyIncomeOverride, openingBalance, meta.view, range, anchor],
  )
  const events = useMemo(
    () => calendarEvents({ income, expenses, goals, range }),
    [income, expenses, goals, range],
  )

  return {
    income,
    expenses,
    goals,
    meta,
    anchor,
    range,
    openingBalance,
    totals,
    events,
    periodWord: meta.view === 'weekly' ? 'week' : 'month',
  }
}
