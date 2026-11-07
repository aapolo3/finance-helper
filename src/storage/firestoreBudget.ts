import type { Unsubscribe } from 'firebase/firestore'
import { normalizeBudgetState } from '../domain/migrate'
import type { BudgetState } from '../domain/types'
import { loadedFirebase, loadFirebase, requireFirebase } from '../lib/firebaseLoader'
import {
  archiveCloudBudget,
  type HistoryReason,
  shouldArchivePrevious,
} from './budgetHistory'

type RemoteBudget = { state: BudgetState | null; updatedAtMs: number }

// Last-known remote doc, so auto saves can skip a read. Trusted only while the watcher for that
// uid runs: without it, another device's write would go unseen and miss being archived.
let watchedUid: string | null = null
let knownRemote: RemoteBudget | null = null

function forgetRemote(uid: string) {
  if (watchedUid !== uid) return
  watchedUid = null
  knownRemote = null
}

function budgetRef(uid: string) {
  const { doc, db } = requireFirebase()
  return doc(db, 'users', uid, 'budget', 'current')
}

export function watchCloudBudget(
  uid: string,
  onChange: (result: { state: BudgetState; updatedAtMs: number }) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  watchedUid = uid
  knownRemote = null
  const stop = requireFirebase().onSnapshot(
    budgetRef(uid),
    (snap) => {
      // Echo of this device's own unacknowledged save: skip the full normalize.
      if (snap.metadata.hasPendingWrites) return
      // A cache-only answer says nothing about the server, and can falsely report no doc.
      if (!snap.exists()) {
        if (!snap.metadata.fromCache && watchedUid === uid) {
          knownRemote = { state: null, updatedAtMs: 0 }
        }
        return
      }
      const parsed = parseBudgetSnap(snap.data())
      if (!snap.metadata.fromCache && watchedUid === uid) knownRemote = parsed
      if (parsed.state) onChange(parsed as { state: BudgetState; updatedAtMs: number })
    },
    (err) => {
      forgetRemote(uid)
      onError(err)
    },
  )
  return () => {
    forgetRemote(uid)
    stop()
  }
}

/** Firestore rejects `undefined`; drop those keys recursively. */
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

export async function loadCloudBudget(uid: string): Promise<{
  state: BudgetState | null
  updatedAtMs: number
}> {
  if (!loadedFirebase()) await loadFirebase()
  const snap = await requireFirebase().getDoc(budgetRef(uid))
  const result: RemoteBudget = snap.exists()
    ? parseBudgetSnap(snap.data())
    : { state: null, updatedAtMs: 0 }
  // Fills a gap only: the watcher may have seen something newer while this read was running.
  if (watchedUid === uid && !knownRemote) knownRemote = result
  return result
}

function parseBudgetSnap(data: Record<string, unknown>): {
  state: BudgetState | null
  updatedAtMs: number
} {
  const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined
  const { updatedAt: _updatedAt, ...budget } = data
  const updatedAtMs = typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : 0
  return {
    state: normalizeBudgetState(budget as unknown as BudgetState),
    updatedAtMs,
  }
}

export async function saveCloudBudget(
  uid: string,
  state: BudgetState,
  /**
   * archiveAs: how a forced upload is labeled in history (defaults to the reason).
   * isCurrent: checked before the write, since archiving first can take long enough to be superseded.
   */
  options?: { reason?: HistoryReason; archiveAs?: HistoryReason; isCurrent?: () => boolean },
): Promise<void> {
  // Loaded up front: the isCurrent check below must stay in the same tick as setDoc.
  if (!loadedFirebase()) await loadFirebase()
  const { serverTimestamp, setDoc } = requireFirebase()
  const reason = options?.reason ?? 'auto'
  const previous =
    reason === 'auto' && watchedUid === uid && knownRemote
      ? knownRemote
      : await loadCloudBudget(uid)
  if (
    previous.state &&
    shouldArchivePrevious(previous.state, state, reason, previous.updatedAtMs)
  ) {
    await archiveCloudBudget(
      uid,
      previous.state,
      reason === 'force' || reason === 'push' ? 'replaced' : reason,
      previous.state.meta.updatedAtMs || previous.updatedAtMs || Date.now(),
    )
  }

  if (options?.isCurrent && !options.isCurrent()) return

  const payload = stripUndefined({
    income: state.income,
    expenses: state.expenses,
    goals: state.goals,
    activityLog: state.activityLog,
    meta: state.meta,
  })
  await setDoc(budgetRef(uid), {
    ...payload,
    updatedAt: serverTimestamp(),
  })
  if (watchedUid === uid) {
    knownRemote = { state, updatedAtMs: state.meta.updatedAtMs || Date.now() }
  }
  if (reason === 'force') {
    await archiveCloudBudget(
      uid,
      state,
      options?.archiveAs ?? 'force',
      state.meta.updatedAtMs || Date.now(),
    )
  }
}

export function budgetHasContent(state: BudgetState): boolean {
  return state.income.length + state.expenses.length + state.goals.length > 0
}
