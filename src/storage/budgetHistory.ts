import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { normalizeBudgetState } from '../domain/migrate'
import { periodTotals } from '../domain/normalize'
import { periodRange } from '../domain/period'
import type { BudgetState } from '../domain/types'
import { newId } from '../lib/ids'
import { loadedFirebase, loadFirebase, requireFirebase } from '../lib/firebaseLoader'

function budgetHasContent(state: BudgetState): boolean {
  return state.income.length + state.expenses.length + state.goals.length > 0
}

export type HistoryReason =
  | 'seed'
  | 'auto'
  | 'push'
  | 'force'
  | 'checkpoint'
  | 'restore-backup'
  | 'replaced'
  | 'browser-before-sync'

export interface BudgetHistoryEntry {
  id: string
  savedAtMs: number
  reason: HistoryReason
  source: 'cloud' | 'local'
  summary: {
    income: number
    expenses: number
    goals: number
    balance: number
  }
  state: BudgetState
}

const HISTORY_LIMIT = 30
const AUTO_ARCHIVE_GAP_MS = 2 * 60 * 1000

interface HistoryDB extends DBSchema {
  history: {
    key: string
    value: {
      id: string
      savedAtMs: number
      reason: HistoryReason
      state: BudgetState
    }
    indexes: { 'by-savedAt': number }
  }
}

const LOCAL_DB = 'finance-helper-history'
let localDb: Promise<IDBPDatabase<HistoryDB>> | null = null

function localHistoryDb() {
  if (!localDb) {
    localDb = openDB<HistoryDB>(LOCAL_DB, 1, {
      upgrade(database) {
        const store = database.createObjectStore('history', { keyPath: 'id' })
        store.createIndex('by-savedAt', 'savedAtMs')
      },
    })
  }
  return localDb
}

function rangeKey(ranges: { start: string; end: string | null }[] | undefined): string {
  return (ranges ?? []).map((range) => `${range.start}..${range.end ?? 'open'}`).join(',')
}

export function budgetFingerprint(state: BudgetState): string {
  const income = state.income
    .map((item) => `${item.id}:${item.amount}:${item.name}:${item.enabled}:${rangeKey(item.offRanges)}:${rangeKey(item.removedRanges)}`)
    .join('|')
  const expenses = state.expenses
    .map((item) => `${item.id}:${item.amount}:${item.enabled}:${rangeKey(item.offRanges)}:${rangeKey(item.removedRanges)}`)
    .join('|')
  const goals = state.goals
    .map((item) => `${item.id}:${item.contributionAmount}:${item.savedAmount}`)
    .join('|')
  return `${state.meta.currentBalance}:${income}:${expenses}:${goals}`
}

async function hasRecentArchive(
  entries: { savedAtMs: number; reason: HistoryReason; state: BudgetState }[],
  state: BudgetState,
  reason: HistoryReason,
  savedAtMs: number,
): Promise<boolean> {
  const fingerprint = budgetFingerprint(state)
  return entries.some(
    (entry) =>
      entry.reason === reason &&
      Math.abs(entry.savedAtMs - savedAtMs) < AUTO_ARCHIVE_GAP_MS &&
      budgetFingerprint(entry.state) === fingerprint,
  )
}

export function summarizeBudget(state: BudgetState) {
  return {
    income: state.income.length,
    expenses: state.expenses.length,
    goals: state.goals.length,
    balance: state.meta.currentBalance,
  }
}

/** Projected balance and cash flow for the calendar month of `asOf`, using this saved budget. */
export function monthOutlook(state: BudgetState, asOf = new Date()) {
  const range = periodRange('monthly', asOf, state.meta.weekStartsOn)
  const totals = periodTotals({
    income: state.income,
    monthlyOverride: state.meta.monthlyIncomeOverride,
    expenses: state.expenses,
    goals: state.goals,
    view: 'monthly',
    range,
    anchor: asOf,
    currentBalance: state.meta.currentBalance,
  })
  return {
    projectedBalance: totals.projectedBalance,
    cashFlow: totals.leftover,
  }
}

function historyCollection(uid: string) {
  const { collection, db } = requireFirebase()
  return collection(db, 'users', uid, 'budgetHistory')
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === undefined) continue
      out[key] = stripUndefined(nested)
    }
    return out as T
  }
  return value
}

export async function archiveLocalBudget(
  state: BudgetState,
  reason: HistoryReason,
  savedAtMs = Date.now(),
): Promise<void> {
  if (!budgetHasContent(state)) return
  const database = await localHistoryDb()
  const existing = await database.getAllFromIndex('history', 'by-savedAt')
  if (await hasRecentArchive(existing, state, reason, savedAtMs)) return
  const id = newId('hist')
  await database.put('history', {
    id,
    savedAtMs,
    reason,
    state: normalizeBudgetState(state),
  })
  const all = await database.getAllFromIndex('history', 'by-savedAt')
  if (all.length > HISTORY_LIMIT) {
    const drop = all.slice(0, all.length - HISTORY_LIMIT)
    await Promise.all(drop.map((entry) => database.delete('history', entry.id)))
  }
}

export async function clearLocalHistory(): Promise<void> {
  await (await localHistoryDb()).clear('history')
}

export async function archiveCloudBudget(
  uid: string,
  state: BudgetState,
  reason: HistoryReason,
  savedAtMs = Date.now(),
): Promise<void> {
  if (!budgetHasContent(state)) return
  const newest = await readCloudHistory(uid, 1)
  if (await hasRecentArchive(newest, state, reason, savedAtMs)) return
  const { doc, serverTimestamp, setDoc } = requireFirebase()
  const id = newId('hist')
  const payload = stripUndefined({
    income: state.income,
    expenses: state.expenses,
    goals: state.goals,
    activityLog: state.activityLog,
    meta: state.meta,
    reason,
    savedAtMs,
    summary: summarizeBudget(state),
    createdAt: serverTimestamp(),
  })
  await setDoc(doc(historyCollection(uid), id), payload)
  await pruneCloudHistory(uid)
}

async function pruneCloudHistory(uid: string): Promise<void> {
  const { deleteDoc, getDocs, limit, orderBy, query } = requireFirebase()
  const snap = await getDocs(
    query(historyCollection(uid), orderBy('savedAtMs', 'desc'), limit(HISTORY_LIMIT + 10)),
  )
  const extras = snap.docs.slice(HISTORY_LIMIT)
  await Promise.all(extras.map((item) => deleteDoc(item.ref)))
}

export function shouldArchivePrevious(
  previous: BudgetState,
  next: BudgetState,
  reason: HistoryReason,
  previousServerMs = 0,
): boolean {
  if (!budgetHasContent(previous)) return false
  if (reason === 'force' || reason === 'push' || reason === 'restore-backup') return true
  if (reason === 'seed' || reason === 'checkpoint') return true
  const prevRev = previous.meta.updatedAtMs || previousServerMs
  const nextRev = next.meta.updatedAtMs || Date.now()
  return Math.abs(nextRev - prevRev) >= AUTO_ARCHIVE_GAP_MS
}

export function listCloudHistory(uid: string): Promise<BudgetHistoryEntry[]> {
  return readCloudHistory(uid, HISTORY_LIMIT)
}

async function readCloudHistory(uid: string, count: number): Promise<BudgetHistoryEntry[]> {
  if (!loadedFirebase()) await loadFirebase()
  const { getDocs, limit, orderBy, query } = requireFirebase()
  const snap = await getDocs(
    query(historyCollection(uid), orderBy('savedAtMs', 'desc'), limit(count)),
  )
  return snap.docs.map((item) => {
    const data = item.data()
    const {
      reason,
      savedAtMs,
      summary,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...budget
    } = data
    const state = normalizeBudgetState(budget as unknown as BudgetState)
    return {
      id: item.id,
      savedAtMs: typeof savedAtMs === 'number' ? savedAtMs : 0,
      reason: (reason as HistoryReason) || 'auto',
      source: 'cloud' as const,
      summary:
        summary && typeof summary === 'object'
          ? (summary as BudgetHistoryEntry['summary'])
          : summarizeBudget(state),
      state,
    }
  })
}

export async function listLocalHistory(): Promise<BudgetHistoryEntry[]> {
  const database = await localHistoryDb()
  const all = await database.getAllFromIndex('history', 'by-savedAt')
  return all
    .slice()
    .reverse()
    .slice(0, HISTORY_LIMIT)
    .map((entry) => ({
      id: entry.id,
      savedAtMs: entry.savedAtMs,
      reason: entry.reason,
      source: 'local' as const,
      summary: summarizeBudget(entry.state),
      state: normalizeBudgetState(entry.state),
    }))
}

export async function listAllHistory(uid: string | null): Promise<BudgetHistoryEntry[]> {
  const local = await listLocalHistory()
  if (!uid) return local
  const cloud = await listCloudHistory(uid)
  const merged = [...cloud, ...local]
  merged.sort((a, b) => b.savedAtMs - a.savedAtMs)
  const seen = new Set<string>()
  const unique: BudgetHistoryEntry[] = []
  for (const entry of merged) {
    const key = `${entry.savedAtMs}:${entry.summary.income}:${entry.summary.expenses}:${entry.summary.goals}:${entry.summary.balance}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(entry)
    if (unique.length >= HISTORY_LIMIT) break
  }
  return unique
}

/** Keep a copy of the current cloud budget if history is empty. */
export async function seedCloudHistoryIfEmpty(
  uid: string,
  current: BudgetState | null,
  serverMs: number,
): Promise<void> {
  if (!current || !budgetHasContent(current)) return
  const existing = await readCloudHistory(uid, 1)
  if (existing.length > 0) return
  await archiveCloudBudget(
    uid,
    current,
    'seed',
    current.meta.updatedAtMs || serverMs || Date.now(),
  )
}

export function reasonLabel(reason: HistoryReason): string {
  switch (reason) {
    case 'seed':
      return 'Saved copy'
    case 'auto':
      return 'Auto save'
    case 'push':
      return 'Synced upload'
    case 'force':
      return 'Made latest'
    case 'replaced':
      return 'Previous cloud copy'
    case 'browser-before-sync':
      return 'This browser before sync'
    case 'checkpoint':
      return 'Manual checkpoint'
    case 'restore-backup':
      return 'Before restore'
  }
}
