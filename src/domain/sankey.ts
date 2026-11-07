import { goalAmountForPeriod } from './goals'
import { expenseAmountForView, periodTotals } from './normalize'
import type {
  DateRange,
  Expense,
  Goal,
  IncomeSource,
  ViewPeriod,
} from './types'

export interface SankeyNodeDef {
  id: string
  label: string
  kind:
    | 'balance'
    | 'income'
    | 'available'
    | 'category'
    | 'expense'
    | 'leftover'
    | 'shortfall'
    | 'goal'
    | 'unallocated'
  /** Expense category name; set for category and expense nodes. */
  category?: string
}

export interface SankeyLinkDef {
  source: string
  target: string
  value: number
}

export interface SankeyModel {
  nodes: SankeyNodeDef[]
  links: SankeyLinkDef[]
  totals: {
    income: number
    spending: number
    leftover: number
    available: number
    projectedBalance: number
    goalContributions: number
  }
}

export function sankeyLinks(args: {
  income: IncomeSource[]
  monthlyOverride: number | null
  expenses: Expense[]
  goals: Goal[]
  view: ViewPeriod
  range: DateRange
  anchor?: Date
  currentBalance?: number
}): SankeyModel {
  const balance = Math.max(0, args.currentBalance ?? 0)
  const totals = periodTotals({
    ...args,
    goals: args.goals,
    anchor: args.anchor,
    currentBalance: balance,
  })
  const nodes = new Map<string, SankeyNodeDef>()
  const links: SankeyLinkDef[] = []

  const addNode = (node: SankeyNodeDef) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node)
  }

  const hasSources = balance > 0.004 || totals.income > 0.004
  if (!hasSources && totals.spending <= 0.004) {
    return { nodes: [], links: [], totals }
  }

  addNode({ id: 'available', label: 'Available', kind: 'available' })

  if (balance > 0.004) {
    addNode({ id: 'balance', label: 'Balance', kind: 'balance' })
    links.push({ source: 'balance', target: 'available', value: balance })
  }
  if (totals.income > 0.004) {
    addNode({ id: 'income', label: 'Income', kind: 'income' })
    links.push({ source: 'income', target: 'available', value: totals.income })
  }

  const byCategory = new Map<string, { amount: number; items: Expense[] }>()
  for (const expense of args.expenses) {
    const amount = expenseAmountForView(expense, args.view, args.range)
    if (amount <= 0) continue
    const bucket = byCategory.get(expense.category) ?? { amount: 0, items: [] }
    bucket.amount += amount
    bucket.items.push(expense)
    byCategory.set(expense.category, bucket)
  }

  for (const [category, bucket] of byCategory) {
    const catId = `cat:${category}`
    addNode({ id: catId, label: category, kind: 'category', category })
    links.push({ source: 'available', target: catId, value: bucket.amount })
    for (const expense of bucket.items) {
      const amount = expenseAmountForView(expense, args.view, args.range)
      if (amount <= 0) continue
      const expId = `exp:${expense.id}`
      addNode({
        id: expId,
        label: expense.name,
        kind: 'expense',
        category: expense.category,
      })
      links.push({ source: catId, target: expId, value: amount })
    }
  }

  const afterSpending = totals.available - totals.spending
  if (afterSpending > 0.004) {
    addNode({ id: 'leftover', label: 'Leftover', kind: 'leftover' })
    links.push({ source: 'available', target: 'leftover', value: afterSpending })

    let allocatedToGoals = 0
    for (const goal of args.goals) {
      const contribution = goalAmountForPeriod(goal, args.range)
      if (contribution <= 0) continue
      const apply = Math.min(contribution, Math.max(0, afterSpending - allocatedToGoals))
      if (apply <= 0.004) continue
      const goalId = `goal:${goal.id}`
      addNode({ id: goalId, label: goal.name, kind: 'goal' })
      links.push({ source: 'leftover', target: goalId, value: apply })
      allocatedToGoals += apply
    }

    const unallocated = afterSpending - allocatedToGoals
    if (unallocated > 0.004) {
      addNode({ id: 'unallocated', label: 'End balance', kind: 'unallocated' })
      links.push({ source: 'leftover', target: 'unallocated', value: unallocated })
    }
  } else if (afterSpending < -0.004) {
    addNode({ id: 'shortfall', label: 'Shortfall', kind: 'shortfall' })
    links.push({
      source: 'shortfall',
      target: 'available',
      value: Math.abs(afterSpending),
    })
  }

  const used = new Set<string>()
  for (const link of links) {
    used.add(link.source)
    used.add(link.target)
  }

  return {
    nodes: [...nodes.values()].filter((node) => used.has(node.id)),
    links,
    totals,
  }
}
