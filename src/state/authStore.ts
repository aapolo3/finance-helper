import type { User } from 'firebase/auth'
import { create } from 'zustand'
import { loadedFirebase, loadFirebase, type FirebaseApi } from '../lib/firebaseLoader'
import {
  onCloudSyncStatus,
  restoreHistoryEntry,
  saveCheckpoint,
  startCloudSync,
  stopCloudSync,
  syncNow,
} from '../storage/cloudSync'
import {
  archiveCloudBudget,
  archiveLocalBudget,
  budgetFingerprint,
  clearLocalHistory,
  listAllHistory,
  type BudgetHistoryEntry,
} from '../storage/budgetHistory'
import { disownLocalBudget, localBudgetBelongsToOther, setLocalBudgetOwner } from '../storage/budgetOwner'
import { budgetHasContent } from '../storage/firestoreBudget'
import { clearIndexedDb } from '../storage/indexedDb'
import { startPaletteSync, stopPaletteSync } from '../storage/paletteSync'
import { mergeOnSignIn } from '../storage/sync'
import { emptyBudget } from '../domain/demo'
import {
  cancelPendingPersist,
  dropQueuedCloudWrites,
  hasPendingPersist,
  requeueCloudSave,
  setCloudWriteUid,
  useBudgetStore,
} from './budgetStore'

// Only says this browser was signed in last time, so the app can avoid offering sign-in while Firebase loads.
const SIGNED_IN_HINT_KEY = 'flow:signed-in'

function readSignedInHint(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_HINT_KEY) === '1'
  } catch {
    return false
  }
}

function writeSignedInHint(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
    else localStorage.removeItem(SIGNED_IN_HINT_KEY)
  } catch {
    // Without storage the hint is lost, and the app shows the signed-out state while loading.
  }
}

// A fetch can hang without failing. After this long the app stops waiting and offers sign-in again.
const AUTH_WAIT_TIMEOUT_MS = 10_000
const RETRY_BASE_MS = 5_000
const RETRY_MAX_MS = 5 * 60 * 1000

export type FirebaseSdkStatus = 'loading' | 'ready' | 'failed'

interface AuthState {
  /** Sign-in needs 'ready': the popup must open in the click's own tick, or browsers block it. */
  sdkStatus: FirebaseSdkStatus
  user: User | null
  ready: boolean
  /** A signed-in browser whose session is still being restored: show neither account nor sign-in prompts. */
  restoring: boolean
  busy: boolean
  error: string | null
  syncing: boolean
  lastSyncedAtMs: number | null
  syncNote: string | null
  init: () => () => void
  signInWithGoogle: () => Promise<void>
  signOutUser: () => Promise<void>
  clearError: () => void
  syncNow: () => Promise<void>
  saveCheckpoint: () => Promise<void>
  loadBudgetHistory: () => Promise<BudgetHistoryEntry[]>
  restoreBudgetHistory: (entry: BudgetHistoryEntry) => Promise<void>
}

// One connection per page, shared by init, the retries and sign-in.
let connectionActive = false
let unsubscribeAuth: (() => void) | null = null
let subscribe: (firebase: FirebaseApi) => void = () => {}
let attemptConnect: (fromClick?: boolean) => Promise<void> = async () => {}
// Each auth change or merge retry takes a new run number, which makes every earlier merge stale.
let mergeRun = 0
let mergeInFlight = false
// Set once the signed-in account has merged. Null means uploads are still closed.
let mergedUid: string | null = null

/** Subscribes to auth changes at most once, whichever path finished loading the SDK. */
function ensureConnected(firebase: FirebaseApi) {
  if (!connectionActive || unsubscribeAuth) return
  subscribe(firebase)
}

export const useAuthStore = create<AuthState>((set, get) => ({
  sdkStatus: 'loading',
  user: null,
  ready: false,
  restoring: readSignedInHint(),
  busy: false,
  error: null,
  syncing: false,
  lastSyncedAtMs: null,
  syncNote: null,
  clearError: () => set({ error: null }),
  init: () => {
    onCloudSyncStatus((status) => {
      set({
        lastSyncedAtMs: status.lastSyncedAtMs ?? get().lastSyncedAtMs,
        error: status.error ?? get().error,
        syncNote: status.error ? null : 'Updated from your other device',
      })
    })
    const onAuthChange = (firebase: FirebaseApi) => async (user: User | null) => {
      mergeRun += 1
      mergeInFlight = false
      mergedUid = null
      setCloudWriteUid(null)
      writeSignedInHint(user !== null)
      set({ user, ready: true, restoring: false })
      if (!user) {
        stopCloudSync()
        stopPaletteSync()
        return
      }
      startPaletteSync(user.uid, (message) => set({ error: message }))
      await mergeWithCloud(firebase, user)
    }
    const mergeWithCloud = async (firebase: FirebaseApi, user: User) => {
      mergeRun += 1
      const run = mergeRun
      mergeInFlight = true
      // A stale merge belongs to a session that has ended, so it must change nothing in the current one.
      const isCurrent = () => run === mergeRun && firebase.auth.currentUser?.uid === user.uid
      try {
        if (localBudgetBelongsToOther(user.uid)) {
          disownLocalBudget()
          cancelPendingPersist()
          useBudgetStore.getState().applyRemote(emptyBudget())
          await clearIndexedDb()
          await clearLocalHistory()
          if (!isCurrent()) return
          // The wipe finished, so what is left is this account's. A retried merge must not wipe its offline edits.
          setLocalBudgetOwner(user.uid)
        } else {
          // Writes stuck from this account's last session: the merge below already covers the local budget.
          dropQueuedCloudWrites(user.uid)
        }
        const budget = useBudgetStore.getState()
        const local = {
          income: budget.income,
          expenses: budget.expenses,
          goals: budget.goals,
          activityLog: budget.activityLog,
          meta: budget.meta,
        }
        const merged = await mergeOnSignIn(local, user.uid, isCurrent)
        if (!isCurrent()) return
        const localRev = local.meta.updatedAtMs
        if (merged.meta.updatedAtMs !== localRev) {
          if (budgetHasContent(local) && budgetFingerprint(local) !== budgetFingerprint(merged)) {
            await archiveLocalBudget(local, 'browser-before-sync')
          }
          await archiveCloudBudget(
            user.uid,
            merged,
            'auto',
            merged.meta.updatedAtMs || Date.now(),
          )
          if (!isCurrent()) return
          // An edit made during the merge is replaced here, so its queued save must not outlive it.
          cancelPendingPersist()
          useBudgetStore.getState().applyRemote(merged)
        }
        setLocalBudgetOwner(user.uid)
        setCloudWriteUid(user.uid)
        mergedUid = user.uid
        // An edit made during the merge saved locally with the gate closed, so nothing has uploaded it.
        if (useBudgetStore.getState().meta !== merged.meta) requeueCloudSave(user.uid)
        startCloudSync(user.uid, { state: merged, updatedAtMs: 0 })
        set({ error: null, lastSyncedAtMs: Date.now(), syncNote: null })
      } catch (err) {
        if (!isCurrent()) return
        set({
          error:
            err instanceof Error
              ? err.message
              : 'Could not sync budget with the cloud',
        })
      } finally {
        if (run === mergeRun) mergeInFlight = false
      }
    }
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let waitTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelay = RETRY_BASE_MS
    const clearRetry = () => {
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = null
    }
    const clearWait = () => {
      if (waitTimer) clearTimeout(waitTimer)
      waitTimer = null
    }
    const startWait = () => {
      clearWait()
      waitTimer = setTimeout(() => {
        waitTimer = null
        set({ restoring: false, sdkStatus: loadedFirebase() ? 'ready' : 'failed' })
      }, AUTH_WAIT_TIMEOUT_MS)
    }
    subscribe = (firebase) => {
      clearRetry()
      const handle = onAuthChange(firebase)
      unsubscribeAuth = firebase.onAuthStateChanged(firebase.auth, (user) => {
        clearWait()
        return handle(user)
      })
      set({ sdkStatus: 'ready' })
    }
    attemptConnect = async (fromClick = false) => {
      if (!connectionActive || unsubscribeAuth) return
      clearRetry()
      if (fromClick) {
        set({ sdkStatus: 'loading' })
        startWait()
      }
      try {
        ensureConnected(await loadFirebase())
      } catch (err) {
        // Local use carries on. Edits stay in IndexedDB and the merge at sign-in uploads them.
        console.warn('Could not load Firebase', err)
        if (!connectionActive || unsubscribeAuth) return
        clearWait()
        set({ restoring: false, sdkStatus: 'failed' })
        clearRetry()
        retryTimer = setTimeout(() => void attemptConnect(), retryDelay)
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
      }
    }
    const onOnline = () => {
      // Auth can restore a user offline, where the merge fails and the subscription leaves nothing to retry it.
      const firebase = loadedFirebase()
      const user = get().user
      if (firebase && user && mergedUid === null && !mergeInFlight) void mergeWithCloud(firebase, user)
      void attemptConnect()
    }
    connectionActive = true
    window.addEventListener('online', onOnline)
    startWait()
    void attemptConnect()
    return () => {
      connectionActive = false
      window.removeEventListener('online', onOnline)
      clearRetry()
      clearWait()
      unsubscribeAuth?.()
      unsubscribeAuth = null
    }
  },
  signInWithGoogle: async () => {
    // Never open the popup after an await: browsers block popups that open too long after the click.
    const firebase = loadedFirebase()
    if (!firebase) {
      set({ error: 'Sign-in could not load. Please try again in a moment.' })
      void attemptConnect(true)
      return
    }
    ensureConnected(firebase)
    set({ busy: true, error: null })
    try {
      await firebase.signInWithPopup(firebase.auth, firebase.googleProvider)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Google sign-in failed'
      set({ error: message })
      throw err
    } finally {
      set({ busy: false })
    }
  },
  signOutUser: async () => {
    set({ busy: true, error: null })
    try {
      // Once signed out, security rules reject this account's queued save.
      try {
        // An edit made during the wait gets a fresh timer, which would fire after sign-out.
        do {
          await useBudgetStore.getState().flushPersist()
        } while (hasPendingPersist())
      } catch (err) {
        console.warn('Could not save budget before signing out', err)
      }
      stopCloudSync()
      const firebase = await loadFirebase()
      await firebase.signOut(firebase.auth)
      set({ syncNote: null })
    } finally {
      set({ busy: false })
    }
  },
  syncNow: async () => {
    if (get().restoring) return
    const user = get().user
    if (!user) {
      set({ syncNote: 'Sign in to sync across devices' })
      return
    }
    set({ syncing: true, error: null, syncNote: null })
    try {
      const result = await syncNow(user.uid)
      const note =
        result === 'pulled'
          ? 'Loaded newer data from the cloud'
          : result === 'pushed'
            ? 'Saved this device to the cloud'
            : 'Already up to date'
      set({ lastSyncedAtMs: Date.now(), syncNote: note })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Sync failed',
      })
    } finally {
      set({ syncing: false })
    }
  },
  saveCheckpoint: async () => {
    // A session still being restored looks signed out, and the checkpoint would skip the upload.
    if (get().restoring) return
    const user = get().user
    set({ syncing: true, error: null, syncNote: null })
    try {
      await saveCheckpoint(user?.uid ?? null)
      set({
        lastSyncedAtMs: Date.now(),
        syncNote: user
          ? 'Checkpoint saved. This device is now the latest cloud version'
          : 'Checkpoint saved on this device',
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Could not save checkpoint',
      })
    } finally {
      set({ syncing: false })
    }
  },
  loadBudgetHistory: async () => {
    const user = get().user
    return listAllHistory(user?.uid ?? null)
  },
  restoreBudgetHistory: async (entry) => {
    const user = get().user
    set({ syncing: true, error: null, syncNote: null })
    try {
      await restoreHistoryEntry(user?.uid ?? null, entry.state)
      set({
        lastSyncedAtMs: Date.now(),
        syncNote: 'Restored budget from history',
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Could not restore budget',
      })
    } finally {
      set({ syncing: false })
    }
  },
}))
