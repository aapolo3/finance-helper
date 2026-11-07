import { emptyBudget } from './demo'
import { mergeOffRanges } from './period'
import { normalizeSankeyTheme } from './sankeyThemes'
import type {
  ActivityEntry,
  BudgetState,
  ExpensesLayout,
  Goal,
  IncomeSource,
  OffRange,
  WeekStartsOn,
} from './types'

function localIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Budgets saved before the first-run prompt already have a balance in use, so skip the
 * prompt and treat it as the opening cash for the month the budget was started in:
 * the earliest logged activity, else the last edit.
 */
function legacyBalanceMonth(raw: Partial<BudgetState>): string | null {
  const meta = raw.meta as Partial<BudgetState['meta']> | undefined
  const hasData =
    (raw.income?.length ?? 0) > 0 ||
    (raw.expenses?.length ?? 0) > 0 ||
    (raw.goals?.length ?? 0) > 0 ||
    (typeof meta?.currentBalance === 'number' && meta.currentBalance !== 0)
  if (!hasData) return null
  const times = (raw.activityLog ?? [])
    .map((entry) => entry?.atMs)
    .filter((ms): ms is number => typeof ms === 'number' && ms > 0)
  if (typeof meta?.updatedAtMs === 'number' && meta.updatedAtMs > 0) times.push(meta.updatedAtMs)
  const startedMs = times.length > 0 ? Math.min(...times) : Date.now()
  return localIso(new Date(startedMs)).slice(0, 7)
}

function normalizeLayout(value: unknown): ExpensesLayout {
  if (value === 'list' || value === 'columns' || value === 'auto') return value
  return 'auto'
}

function normalizeWeekStartsOn(value: unknown): WeekStartsOn {
  return value === 0 ? 0 : 1
}

function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
}

function normalizeRanges(value: unknown): OffRange[] {
  if (!Array.isArray(value)) return []
  const ranges: OffRange[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const start = (entry as { start?: unknown }).start
    const end = (entry as { end?: unknown }).end
    if (!isMonthKey(start)) continue
    if (end == null) ranges.push({ start, end: null })
    else if (isMonthKey(end) && end >= start) ranges.push({ start, end })
  }
  return mergeOffRanges(ranges)
}

function normalizeActivity(item: {
  enabled?: boolean
  skippedMonths?: unknown
  offRanges?: unknown
}): { enabled: boolean; offRanges: OffRange[] } {
  const ranges = normalizeRanges(item.offRanges)
  if (Array.isArray(item.skippedMonths)) {
    for (const month of item.skippedMonths) {
      if (isMonthKey(month)) ranges.push({ start: month, end: month })
    }
  }
  return { enabled: item.enabled !== false, offRanges: mergeOffRanges(ranges) }
}

/** Fill defaults for older saved budgets (pre-balance / pre-payDate). */
export function normalizeBudgetState(raw: BudgetState | null | undefined): BudgetState {
  const empty = emptyBudget()
  if (!raw) return empty

  return {
    income: (raw.income ?? []).map((source): IncomeSource => {
      const payDate = source.payDate || undefined
      const activity = normalizeActivity(source)
      const { skippedMonths: _skipped, ...rest } = source as IncomeSource & {
        skippedMonths?: string[]
      }
      if (!payDate || source.cadence === 'once') {
        return {
          ...rest,
          ...activity,
          removedRanges: normalizeRanges(source.removedRanges),
          payDate,
          payDateMode: undefined,
        }
      }
      return {
        ...rest,
        ...activity,
        removedRanges: normalizeRanges(source.removedRanges),
        payDate,
        // Older budgets only had a payday date — treat as known schedule.
        payDateMode: source.payDateMode === 'first' ? 'first' : 'known',
      }
    }),
    expenses: (raw.expenses ?? []).map((expense) => {
      const activity = normalizeActivity(expense)
      const { skippedMonths: _skipped, ...rest } = expense as typeof expense & {
        skippedMonths?: string[]
      }
      return {
        ...rest,
        ...activity,
        removedRanges: normalizeRanges(expense.removedRanges),
      }
    }),
    goals: (raw.goals ?? []).map(
      (goal): Goal => ({
        ...goal,
        startDate: goal.startDate || localIso(new Date()),
      }),
    ),
    activityLog: Array.isArray(raw.activityLog)
      ? raw.activityLog.filter(
          (entry): entry is ActivityEntry =>
            !!entry &&
            (entry.action === 'added' || entry.action === 'deleted') &&
            entry.entity === 'expense' &&
            typeof entry.atMs === 'number' &&
            !!entry.snapshot,
        ).slice(0, 100)
      : [],
    meta: {
      ...empty.meta,
      ...raw.meta,
      currentBalance:
        typeof raw.meta?.currentBalance === 'number' && Number.isFinite(raw.meta.currentBalance)
          ? raw.meta.currentBalance
          : 0,
      ...(isMonthKey(raw.meta?.balanceMonth) && raw.meta?.balanceMonthSource
        ? { balanceMonth: raw.meta.balanceMonth, balanceMonthSource: raw.meta.balanceMonthSource }
        : { balanceMonth: legacyBalanceMonth(raw), balanceMonthSource: 'inferred' as const }),
      monthlyIncomeOverride:
        raw.meta?.monthlyIncomeOverride === undefined
          ? null
          : raw.meta.monthlyIncomeOverride,
      weekStartsOn: normalizeWeekStartsOn(raw.meta?.weekStartsOn),
      updatedAtMs:
        typeof raw.meta?.updatedAtMs === 'number' && Number.isFinite(raw.meta.updatedAtMs)
          ? raw.meta.updatedAtMs
          : 0,
      expensesLayout: normalizeLayout(raw.meta?.expensesLayout),
      sankeyTheme: normalizeSankeyTheme(raw.meta?.sankeyTheme),
    },
  }
}
