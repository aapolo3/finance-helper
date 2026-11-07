import type { BudgetState } from './types'

function localIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function emptyBudget(): BudgetState {
  return {
    income: [],
    expenses: [],
    goals: [],
    activityLog: [],
    meta: {
      view: 'monthly',
      anchorDate: localIso(new Date()),
      monthlyIncomeOverride: null,
      currentBalance: 0,
      balanceMonth: null,
      currency: 'USD',
      weekStartsOn: 1,
      updatedAtMs: 0,
      expensesLayout: 'auto',
      sankeyTheme: 'classic',
    },
  }
}

export function demoBudget(): BudgetState {
  const today = new Date()
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  // A recent Friday-style payday for weekly paycheck demos
  const weeklyPay = new Date(today)
  weeklyPay.setDate(today.getDate() - ((today.getDay() + 2) % 7)) // last Friday-ish

  return {
    income: [
      {
        id: 'inc-salary',
        name: 'Paycheck',
        amount: 1200,
        cadence: 'weekly',
        enabled: true,
        payDate: localIso(weeklyPay),
        payDateMode: 'known',
      },
    ],
    expenses: [
      {
        id: 'exp-rent',
        name: 'Rent',
        amount: 1800,
        category: 'Housing',
        cadence: 'monthly',
        startDate: monthStart,
        occurrenceLimit: null,
        occurrencesPosted: 0,
        enabled: true,
      },
      {
        id: 'exp-groceries',
        name: 'Groceries',
        amount: 140,
        category: 'Food',
        cadence: 'weekly',
        startDate: monthStart,
        occurrenceLimit: null,
        occurrencesPosted: 0,
        enabled: true,
      },
      {
        id: 'exp-netflix',
        name: 'Netflix',
        amount: 15.99,
        category: 'Subscriptions',
        cadence: 'monthly',
        startDate: monthStart,
        occurrenceLimit: null,
        occurrencesPosted: 0,
        enabled: true,
      },
      {
        id: 'exp-phone',
        name: 'Phone',
        amount: 80,
        category: 'Subscriptions',
        cadence: 'monthly',
        startDate: monthStart,
        occurrenceLimit: null,
        occurrencesPosted: 0,
        enabled: true,
      },
      {
        id: 'exp-transit',
        name: 'Transit pass',
        amount: 98,
        category: 'Transport',
        cadence: 'monthly',
        startDate: monthStart,
        occurrenceLimit: null,
        occurrencesPosted: 0,
        enabled: true,
      },
      {
        id: 'exp-ikea',
        name: 'Furniture payment plan',
        amount: 200,
        category: 'Other',
        cadence: 'monthly',
        startDate: monthStart,
        occurrenceLimit: 2,
        occurrencesPosted: 0,
        enabled: true,
        notes: 'Completed in 2 monthly charges',
      },
      {
        id: 'exp-cc-visa',
        name: 'Visa minimum',
        amount: 45,
        category: 'Credit cards',
        cadence: 'monthly',
        startDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`,
        occurrenceLimit: null,
        occurrencesPosted: 0,
        enabled: true,
        notes: 'Minimum payment due on the 15th',
      },
    ],
    goals: [
      {
        id: 'goal-emergency',
        name: 'Emergency fund',
        targetAmount: 5000,
        savedAmount: 800,
        contributionAmount: 100,
        contributionCadence: 'weekly',
        startDate: localIso(today),
      },
    ],
    activityLog: [],
    meta: {
      view: 'monthly',
      anchorDate: monthStart,
      monthlyIncomeOverride: null,
      currentBalance: 450,
      balanceMonth: monthStart.slice(0, 7),
      balanceMonthSource: 'prompt',
      currency: 'USD',
      weekStartsOn: 1,
      updatedAtMs: 0,
      expensesLayout: 'auto',
      sankeyTheme: 'classic',
    },
  }
}
