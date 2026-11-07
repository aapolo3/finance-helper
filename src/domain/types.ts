export const INCOME_CADENCES = [
  'once',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
] as const
export const EXPENSE_CADENCES = [
  'once',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
] as const
export const CONTRIBUTION_CADENCES = ['weekly', 'biweekly', 'monthly'] as const
export const VIEW_PERIODS = ['weekly', 'monthly'] as const
/** date-fns: 0 = Sunday, 1 = Monday */
export const WEEK_STARTS = [1, 0] as const

export type IncomeCadence = (typeof INCOME_CADENCES)[number]
export type ExpenseCadence = (typeof EXPENSE_CADENCES)[number]
export type ContributionCadence = (typeof CONTRIBUTION_CADENCES)[number]
export type ViewPeriod = (typeof VIEW_PERIODS)[number]
export type WeekStartsOn = (typeof WEEK_STARTS)[number]
/** `auto` uses columns on wide screens and a stacked list on narrow ones. */
export type ExpensesLayout = 'auto' | 'list' | 'columns'

export const SANKEY_THEMES = ['paper', 'classic', 'sunset', 'forest', 'ocean'] as const
export type SankeyThemeId = (typeof SANKEY_THEMES)[number]

export const DEFAULT_CATEGORIES = [
  'Housing',
  'Utilities',
  'Food',
  'Transport',
  'Subscriptions',
  'Entertainment',
  'Healthcare',
  'Credit cards',
  'Debt',
  'Personal',
  'Other',
] as const

export type DefaultCategory = (typeof DEFAULT_CATEGORIES)[number]

/** How payDate should be interpreted for recurring income. */
export type PayDateMode = 'known' | 'first'

/** Inclusive month span where an income source or expense is turned off. */
export interface OffRange {
  /** First month off, `YYYY-MM`. */
  start: string
  /** Last month off, `YYYY-MM`. Null means every month from `start` onward. */
  end: string | null
}

/** How far a month toggle reaches from the month on screen. */
export type MonthToggleScope = 'month' | 'future' | 'past'

export interface IncomeSource {
  id: string
  name: string
  amount: number
  cadence: IncomeCadence
  /** When false, omitted from every month. */
  enabled: boolean
  /** Months this source is off, without changing the months outside those spans. */
  offRanges?: OffRange[]
  /** Months removed from the list and the budget. Other months still show it. */
  removedRanges?: OffRange[]
  /**
   * Paycheck date (YYYY-MM-DD). When set, income counts by paychecks that
   * land in the viewed period (or once only for cadence `once`).
   */
  payDate?: string
  /**
   * `known` — any payday on the schedule (walks before/after this date).
   * `first` — first paycheck; nothing before this date counts.
   * Required when payDate is set on recurring income; ignored for `once`.
   */
  payDateMode?: PayDateMode
}

export interface Expense {
  id: string
  name: string
  amount: number
  category: string
  cadence: ExpenseCadence
  startDate: string
  occurrenceLimit: number | null
  occurrencesPosted: number
  enabled: boolean
  /** Months this expense is off, without changing the months outside those spans. */
  offRanges?: OffRange[]
  /** Months removed from the list and the budget. Other months still show it. */
  removedRanges?: OffRange[]
  notes?: string
}

export interface Goal {
  id: string
  name: string
  targetAmount: number
  savedAmount: number
  contributionAmount: number
  contributionCadence: ContributionCadence
  /** First contribution date (YYYY-MM-DD). Later hits follow the cadence. */
  startDate: string
  targetDate?: string
}

export interface ActivityEntry {
  id: string
  atMs: number
  action: 'added' | 'deleted'
  entity: 'expense'
  snapshot: Expense
}

export interface BudgetMeta {
  view: ViewPeriod
  anchorDate: string
  monthlyIncomeOverride: number | null
  /** Cash on hand at the start of the current month. Later months open from the previous month’s projected balance. */
  currentBalance: number
  /** Month (YYYY-MM) that `currentBalance` opens. Null until the first-run balance prompt is answered. */
  balanceMonth: string | null
  /** How balanceMonth was set. Missing means an older guess that should be redone. */
  balanceMonthSource?: 'prompt' | 'inferred'
  currency: string
  /** First day of the week: 0 = Sunday, 1 = Monday. */
  weekStartsOn: WeekStartsOn
  /** Client timestamp of the last local edit. Used for cross-device last-write-wins. */
  updatedAtMs: number
  expensesLayout: ExpensesLayout
  /** Color preset for the Overview Sankey diagram. */
  sankeyTheme: SankeyThemeId
}

export interface BudgetState {
  income: IncomeSource[]
  expenses: Expense[]
  goals: Goal[]
  activityLog: ActivityEntry[]
  meta: BudgetMeta
}

export interface DateRange {
  start: Date
  end: Date
}
