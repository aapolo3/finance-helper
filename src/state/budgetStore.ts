import { create } from 'zustand'
import { appendActivity } from '../domain/activity'
import { emptyBudget } from '../domain/demo'
import { applyMonthRemoval, applyMonthToggle, monthKey } from '../domain/period'
import type {
  ActivityEntry,
  BudgetMeta,
  BudgetState,
  Expense,
  Goal,
  IncomeSource,
  MonthToggleScope,
} from '../domain/types'
import { newId } from '../lib/ids'
import { indexedDbStore } from '../storage/indexedDb'
import { saveCloudBudget } from '../storage/firestoreBudget'

interface BudgetActions {
  hydrated: boolean
  hydrate: () => Promise<void>
  replace: (state: BudgetState) => void
  applyRemote: (state: BudgetState) => void
  flushPersist: () => Promise<void>
  setView: (view: BudgetMeta['view']) => void
  setAnchorDate: (iso: string) => void
  setMonthlyIncomeOverride: (value: number | null) => void
  /** First-run only: records cash on hand as the opening balance for this month. */
  setStartingBalance: (value: number) => void
  setCurrency: (currency: string) => void
  setWeekStartsOn: (value: BudgetMeta['weekStartsOn']) => void
  setExpensesLayout: (value: BudgetMeta['expensesLayout']) => void
  setSankeyTheme: (value: BudgetMeta['sankeyTheme']) => void
  addIncome: (source: IncomeSource) => void
  updateIncome: (id: string, patch: Partial<IncomeSource>) => void
  removeIncome: (id: string) => void
  removeIncomeMonths: (id: string, scope: MonthToggleScope) => void
  restoreIncome: (source: IncomeSource) => void
  toggleIncome: (id: string, scope: MonthToggleScope | 'all') => void
  addExpense: (expense: Expense) => void
  updateExpense: (id: string, patch: Partial<Expense>) => void
  toggleExpense: (id: string, scope: MonthToggleScope | 'all') => void
  removeExpense: (id: string) => void
  removeExpenseMonths: (id: string, scope: MonthToggleScope) => void
  restoreExpense: (expense: Expense) => void
  addGoal: (goal: Goal) => void
  updateGoal: (id: string, patch: Partial<Goal>) => void
  removeGoal: (id: string) => void
}

export type BudgetStoreState = BudgetState & BudgetActions

const LOCAL_SAVE_DEBOUNCE_MS = 80
const CLOUD_SAVE_DEBOUNCE_MS = 1500
// A cloud write can stay unsettled on a dead connection; callers such as sign-out must still continue.
const FLUSH_CLOUD_WAIT_MS = 5000

/** Runs tasks one at a time, so a slow save can never land after a newer one. */
function createSaveQueue() {
  let tail: Promise<void> | null = null
  return {
    add(task: () => Promise<void>) {
      const next: Promise<void> = (tail ?? Promise.resolve()).catch(() => undefined).then(task)
      tail = next
      const settle = () => {
        if (tail === next) tail = null
      }
      next.then(settle, (err: unknown) => {
        settle()
        console.warn('Could not save budget', err)
      })
    },
    settled: () => tail ?? Promise.resolve(),
  }
}

// Separate queues: a cloud write stuck on the network must not hold up the local save.
const localQueue = createSaveQueue()
// One per uid: a write stuck under a signed-out account stays unsettled and must not block the next account.
const cloudQueues = new Map<string, ReturnType<typeof createSaveQueue>>()

function cloudQueueFor(uid: string) {
  let queue = cloudQueues.get(uid)
  if (!queue) {
    queue = createSaveQueue()
    cloudQueues.set(uid, queue)
  }
  return queue
}

let localTimer: ReturnType<typeof setTimeout> | null = null
let pendingLocal: BudgetState | null = null
let cloudTimer: ReturnType<typeof setTimeout> | null = null
// The uid is fixed at edit time, so a write can only land under the account that made the edit.
let pendingCloud: { uid: string; state: BudgetState } | null = null
const newestCloudWrite = new Map<string, object>()
// Null until sign-in has merged with the cloud: an earlier upload could overwrite that account's budget.
let cloudWriteUid: string | null = null

export function setCloudWriteUid(uid: string | null) {
  if (uid === cloudWriteUid) return
  // Edits queued for the outgoing account go to that account, never the next one.
  flushCloud()
  cloudWriteUid = uid
}

function snapshot(state: BudgetStoreState): BudgetState {
  return {
    income: state.income,
    expenses: state.expenses,
    goals: state.goals,
    activityLog: state.activityLog,
    meta: state.meta,
  }
}

function flushLocal() {
  if (localTimer) clearTimeout(localTimer)
  localTimer = null
  const state = pendingLocal
  if (!state) return
  pendingLocal = null
  localQueue.add(() => indexedDbStore.save(state))
}

function flushCloud() {
  if (cloudTimer) clearTimeout(cloudTimer)
  cloudTimer = null
  const pending = pendingCloud
  if (!pending) return
  pendingCloud = null
  const write = {}
  newestCloudWrite.set(pending.uid, write)
  // Writes pile up behind one stuck on the network. Once it clears, only the newest is worth sending.
  const isCurrent = () => newestCloudWrite.get(pending.uid) === write
  cloudQueueFor(pending.uid).add(async () => {
    if (!isCurrent()) return
    await saveCloudBudget(pending.uid, pending.state, { isCurrent })
  })
}

function queueCloud(uid: string, state: BudgetState) {
  pendingCloud = { uid, state }
  if (cloudTimer) clearTimeout(cloudTimer)
  cloudTimer = setTimeout(flushCloud, CLOUD_SAVE_DEBOUNCE_MS)
}

function persist(state: BudgetStoreState) {
  const next = snapshot(state)
  pendingLocal = next
  if (localTimer) clearTimeout(localTimer)
  localTimer = setTimeout(flushLocal, LOCAL_SAVE_DEBOUNCE_MS)
  if (cloudWriteUid) queueCloud(cloudWriteUid, next)
}

/** Drops a queued save, which would otherwise upload the old budget to the newly signed-in account. */
export function cancelPendingPersist() {
  if (localTimer) clearTimeout(localTimer)
  localTimer = null
  pendingLocal = null
  if (cloudTimer) clearTimeout(cloudTimer)
  cloudTimer = null
  pendingCloud = null
}

/**
 * Drops auto writes already queued for this uid. Call before a save that bypasses the queue, or one
 * could land afterwards and overwrite it. A setDoc already issued is safe: Firestore keeps issue order.
 */
export function dropQueuedCloudWrites(uid: string) {
  newestCloudWrite.delete(uid)
}

/** Queues the store's current budget for this uid, unless that account has since been replaced. */
export function requeueCloudSave(uid: string) {
  if (cloudWriteUid === uid) queueCloud(uid, snapshot(useBudgetStore.getState()))
}

export function hasPendingPersist() {
  return pendingLocal !== null || pendingCloud !== null
}

async function waitForCloudQueue() {
  if (!cloudWriteUid) return
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, FLUSH_CLOUD_WAIT_MS)
  })
  try {
    await Promise.race([cloudQueueFor(cloudWriteUid).settled(), timeout])
  } finally {
    clearTimeout(timer)
  }
}

// Closing or backgrounding the tab may be the last chance to run before the debounce would fire.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const flushAll = () => {
    flushLocal()
    flushCloud()
  }
  window.addEventListener('pagehide', flushAll)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll()
  })
}

function stamp(meta: BudgetMeta): BudgetMeta {
  return { ...meta, updatedAtMs: Date.now() }
}

function logExpense(
  log: ActivityEntry[],
  action: ActivityEntry['action'],
  expense: Expense,
): ActivityEntry[] {
  return appendActivity(log, {
    id: newId('act'),
    atMs: Date.now(),
    action,
    entity: 'expense',
    snapshot: expense,
  })
}

const empty = emptyBudget()

export const useBudgetStore = create<BudgetStoreState>((set, get) => ({
  ...empty,
  hydrated: false,
  hydrate: async () => {
    const loaded = await indexedDbStore.load()
    set({ ...loaded, hydrated: true })
  },
  replace: (state) => {
    set({
      ...state,
      activityLog: state.activityLog ?? [],
      meta: stamp(state.meta),
    })
    persist(get())
  },
  applyRemote: (state) => {
    // Remote only wins when newer, so a queued older edit must not overwrite it.
    cancelPendingPersist()
    if (cloudWriteUid) dropQueuedCloudWrites(cloudWriteUid)
    set({
      income: state.income,
      expenses: state.expenses,
      goals: state.goals,
      activityLog: state.activityLog ?? [],
      meta: state.meta,
    })
    indexedDbStore.save(snapshot(get())).catch((err: unknown) => {
      console.warn('Could not save budget', err)
    })
  },
  flushPersist: async () => {
    flushLocal()
    flushCloud()
    await localQueue.settled()
    await waitForCloudQueue()
  },
  setView: (view) => {
    set((s) => ({ meta: stamp({ ...s.meta, view }) }))
    persist(get())
  },
  setAnchorDate: (iso) => {
    set((s) => ({ meta: stamp({ ...s.meta, anchorDate: iso }) }))
    persist(get())
  },
  setMonthlyIncomeOverride: (value) => {
    set((s) => ({ meta: stamp({ ...s.meta, monthlyIncomeOverride: value }) }))
    persist(get())
  },
  setStartingBalance: (value) => {
    set((s) => ({
      meta: stamp({
        ...s.meta,
        currentBalance: Number.isFinite(value) ? value : 0,
        balanceMonth: monthKey(new Date()),
        balanceMonthSource: 'prompt',
      }),
    }))
    persist(get())
  },
  setCurrency: (currency) => {
    set((s) => ({ meta: stamp({ ...s.meta, currency }) }))
    persist(get())
  },
  setWeekStartsOn: (value) => {
    set((s) => ({ meta: stamp({ ...s.meta, weekStartsOn: value }) }))
    persist(get())
  },
  setExpensesLayout: (value) => {
    set((s) => ({ meta: stamp({ ...s.meta, expensesLayout: value }) }))
    persist(get())
  },
  setSankeyTheme: (value) => {
    set((s) => ({ meta: stamp({ ...s.meta, sankeyTheme: value }) }))
    persist(get())
  },
  addIncome: (source) => {
    set((s) => ({ income: [...s.income, source], meta: stamp(s.meta) }))
    persist(get())
  },
  updateIncome: (id, patch) => {
    set((s) => ({
      income: s.income.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      meta: stamp(s.meta),
    }))
    persist(get())
  },
  removeIncome: (id) => {
    set((s) => ({
      income: s.income.filter((item) => item.id !== id),
      meta: stamp(s.meta),
    }))
    persist(get())
  },
  removeIncomeMonths: (id, scope) => {
    const month = monthKey(new Date(`${get().meta.anchorDate}T00:00:00`))
    set((s) => {
      const source = s.income.find((item) => item.id === id)
      if (!source) return s
      const next = applyMonthRemoval(source, month, scope)
      return {
        income: next.removedEverywhere
          ? s.income.filter((item) => item.id !== id)
          : s.income.map((item) => (item.id === id ? next.item : item)),
        meta: stamp(s.meta),
      }
    })
    persist(get())
  },
  restoreIncome: (source) => {
    set((s) => ({
      income: s.income.some((item) => item.id === source.id)
        ? s.income.map((item) => (item.id === source.id ? source : item))
        : [...s.income, source],
      meta: stamp(s.meta),
    }))
    persist(get())
  },
  toggleIncome: (id, scope) => {
    const month = monthKey(new Date(`${get().meta.anchorDate}T00:00:00`))
    set((s) => ({
      income: s.income.map((item) =>
        item.id === id ? applyMonthToggle(item, month, scope) : item,
      ),
      meta: stamp(s.meta),
    }))
    persist(get())
  },
  addExpense: (expense) => {
    set((s) => ({
      expenses: [...s.expenses, expense],
      activityLog: logExpense(s.activityLog, 'added', expense),
      meta: stamp(s.meta),
    }))
    persist(get())
  },
  updateExpense: (id, patch) => {
    set((s) => ({
      expenses: s.expenses.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
      meta: stamp(s.meta),
    }))
    persist(get())
  },
  toggleExpense: (id, scope) => {
    const month = monthKey(new Date(`${get().meta.anchorDate}T00:00:00`))
    set((s) => ({
      expenses: s.expenses.map((item) =>
        item.id === id ? applyMonthToggle(item, month, scope) : item,
      ),
      meta: stamp(s.meta),
    }))
    persist(get())
  },
  removeExpense: (id) => {
    set((s) => {
      const expense = s.expenses.find((item) => item.id === id)
      return {
        expenses: s.expenses.filter((item) => item.id !== id),
        activityLog: expense
          ? logExpense(s.activityLog, 'deleted', expense)
          : s.activityLog,
        meta: stamp(s.meta),
      }
    })
    persist(get())
  },
  removeExpenseMonths: (id, scope) => {
    const month = monthKey(new Date(`${get().meta.anchorDate}T00:00:00`))
    set((s) => {
      const expense = s.expenses.find((item) => item.id === id)
      if (!expense) return s
      const next = applyMonthRemoval(expense, month, scope)
      if (next.removedEverywhere) {
        return {
          expenses: s.expenses.filter((item) => item.id !== id),
          activityLog: logExpense(s.activityLog, 'deleted', expense),
          meta: stamp(s.meta),
        }
      }
      return {
        expenses: s.expenses.map((item) => (item.id === id ? next.item : item)),
        meta: stamp(s.meta),
      }
    })
    persist(get())
  },
  restoreExpense: (expense) => {
    set((s) => {
      const exists = s.expenses.some((item) => item.id === expense.id)
      return {
        expenses: exists
          ? s.expenses.map((item) => (item.id === expense.id ? expense : item))
          : [...s.expenses, expense],
        activityLog: exists ? s.activityLog : logExpense(s.activityLog, 'added', expense),
        meta: stamp(s.meta),
      }
    })
    persist(get())
  },
  addGoal: (goal) => {
    set((s) => ({ goals: [...s.goals, goal], meta: stamp(s.meta) }))
    persist(get())
  },
  updateGoal: (id, patch) => {
    set((s) => ({
      goals: s.goals.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      meta: stamp(s.meta),
    }))
    persist(get())
  },
  removeGoal: (id) => {
    set((s) => ({
      goals: s.goals.filter((item) => item.id !== id),
      meta: stamp(s.meta),
    }))
    persist(get())
  },
}))
