import { pickNewer, revisionOf } from './merge'
import {
  archiveCloudBudget,
  archiveLocalBudget,
  budgetFingerprint,
  seedCloudHistoryIfEmpty,
  type HistoryReason,
} from './budgetHistory'
import { budgetHasContent, loadCloudBudget, saveCloudBudget, watchCloudBudget } from './firestoreBudget'
import { indexedDbStore } from './indexedDb'
import {
  cancelPendingPersist,
  dropQueuedCloudWrites,
  requeueCloudSave,
  useBudgetStore,
} from '../state/budgetStore'
import type { BudgetState } from '../domain/types'

type StatusListener = (status: { lastSyncedAtMs: number | null; error: string | null }) => void

let unsubscribe: (() => void) | null = null
let paused = 0
let statusListener: StatusListener | null = null
let activeUid: string | null = null

export function onCloudSyncStatus(listener: StatusListener) {
  statusListener = listener
}

export function pauseCloudSync() {
  paused += 1
}

export function resumeCloudSync() {
  paused = Math.max(0, paused - 1)
}

function snapshot(): BudgetState {
  const state = useBudgetStore.getState()
  return {
    income: state.income,
    expenses: state.expenses,
    goals: state.goals,
    activityLog: state.activityLog,
    meta: state.meta,
  }
}

/**
 * Saves the store's latest budget outside the save queue. Snapshot and drop run with no await
 * between them, so every dropped write is contained in what gets saved.
 */
async function saveLatestDirect(
  uid: string,
  options: { reason: HistoryReason; archiveAs?: HistoryReason },
): Promise<void> {
  const state = snapshot()
  dropQueuedCloudWrites(uid)
  try {
    await saveCloudBudget(uid, state, options)
  } catch (err) {
    requeueCloudSave(uid)
    throw err
  }
  // An edit during the save may have reached the cloud first, and this save overwrote it.
  if (useBudgetStore.getState().meta !== state.meta) requeueCloudSave(uid)
}

export function stopCloudSync() {
  unsubscribe?.()
  unsubscribe = null
  activeUid = null
}

/**
 * known: the cloud budget as sign-in just left it (merged), so no second read is needed. Without
 * it, the cloud copy is read once to seed history.
 */
export function startCloudSync(
  uid: string,
  known?: { state: BudgetState | null; updatedAtMs: number },
) {
  if (activeUid === uid && unsubscribe) return
  stopCloudSync()
  activeUid = uid
  const seed = (remote: { state: BudgetState | null; updatedAtMs: number }) => {
    if (remote.state) void seedCloudHistoryIfEmpty(uid, remote.state, remote.updatedAtMs)
  }
  if (known) seed(known)
  else void loadCloudBudget(uid).then(seed)
  unsubscribe = watchCloudBudget(
    uid,
    (remote) => {
      if (paused > 0) return
      const local = snapshot()
      const picked = pickNewer(local, { state: remote.state, serverMs: remote.updatedAtMs })
      if (picked.winner !== 'remote') return
      if (budgetHasContent(local) && budgetFingerprint(local) !== budgetFingerprint(picked.state)) {
        void archiveLocalBudget(local, 'browser-before-sync')
      }
      // No cloud archive here: the device that saved this budget already archived what it replaced.
      useBudgetStore.getState().applyRemote(picked.state)
      statusListener?.({ lastSyncedAtMs: Date.now(), error: null })
    },
    (error) => {
      statusListener?.({ lastSyncedAtMs: null, error: error.message })
    },
  )
}

export async function syncNow(uid: string): Promise<'pulled' | 'pushed' | 'current'> {
  await useBudgetStore.getState().flushPersist()
  const local = snapshot()
  const remote = await loadCloudBudget(uid)
  const picked = pickNewer(
    local,
    remote.state ? { state: remote.state, serverMs: remote.updatedAtMs } : null,
  )
  if (picked.winner === 'remote') {
    if (
      budgetHasContent(local) &&
      budgetFingerprint(local) !== budgetFingerprint(picked.state)
    ) {
      await archiveLocalBudget(local, 'browser-before-sync')
    }
    // applyRemote already writes the store to IndexedDB, and the saving device archived the cloud side.
    useBudgetStore.getState().applyRemote(picked.state)
    return 'pulled'
  }
  const localRev = revisionOf(local.meta.updatedAtMs, 0)
  const remoteRev = remote.state
    ? revisionOf(remote.state.meta.updatedAtMs, remote.updatedAtMs)
    : 0
  if (localRev > remoteRev || !remote.state) {
    await saveLatestDirect(uid, { reason: 'push' })
    return 'pushed'
  }
  return 'current'
}

/**
 * Force this device’s budget to become the cloud source of truth,
 * even if another device has a newer revision.
 */
export async function forcePushLatest(
  uid: string,
  archiveAs: HistoryReason = 'force',
): Promise<void> {
  pauseCloudSync()
  try {
    await useBudgetStore.getState().flushPersist()
    const now = Date.now()
    const current = snapshot()
    const payload: BudgetState = {
      ...current,
      meta: { ...current.meta, updatedAtMs: now },
    }
    useBudgetStore.setState({
      income: payload.income,
      expenses: payload.expenses,
      goals: payload.goals,
      activityLog: payload.activityLog,
      meta: payload.meta,
    })
    await indexedDbStore.save(payload)
    await saveLatestDirect(uid, { reason: 'force', archiveAs })
  } finally {
    resumeCloudSync()
  }
}

/**
 * Save a checkpoint of this device's budget. Signed in, it also becomes the latest cloud
 * version (overwriting the cloud copy, which is kept in history as "Previous cloud copy").
 */
export async function saveCheckpoint(uid: string | null): Promise<void> {
  await useBudgetStore.getState().flushPersist()
  await archiveLocalBudget(snapshot(), 'checkpoint')
  if (uid) await forcePushLatest(uid, 'checkpoint')
}

/** Restore a history entry as the live budget and push it as latest when signed in. */
export async function restoreHistoryEntry(
  uid: string | null,
  state: BudgetState,
): Promise<void> {
  pauseCloudSync()
  try {
    // A save still queued from before the restore would otherwise overwrite it.
    await useBudgetStore.getState().flushPersist()
    const before = snapshot()
    if (budgetHasContent(before)) {
      await archiveLocalBudget(before, 'restore-backup')
      if (uid) {
        const remote = await loadCloudBudget(uid)
        if (remote.state) {
          await archiveCloudBudget(
            uid,
            remote.state,
            'restore-backup',
            remote.state.meta.updatedAtMs || remote.updatedAtMs || Date.now(),
          )
        }
      }
    }
    const now = Date.now()
    const payload: BudgetState = {
      ...state,
      meta: { ...state.meta, updatedAtMs: now },
    }
    // An edit made since the flush has queued writes that would overwrite the restore.
    cancelPendingPersist()
    useBudgetStore.setState({
      income: payload.income,
      expenses: payload.expenses,
      goals: payload.goals,
      activityLog: payload.activityLog ?? [],
      meta: payload.meta,
    })
    await indexedDbStore.save(payload)
    if (uid) {
      await saveLatestDirect(uid, { reason: 'force' })
    }
  } finally {
    resumeCloudSync()
  }
}
