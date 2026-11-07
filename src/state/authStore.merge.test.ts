import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import type { BudgetState } from '../domain/types'

const onAuthStateChanged = vi.fn((..._args: unknown[]) => () => {})
const api = {
  auth: { currentUser: null as { uid: string } | null },
  googleProvider: {},
  onAuthStateChanged,
}
const mergeOnSignIn = vi.fn()
const startCloudSync = vi.fn()
const stopCloudSync = vi.fn()
const archiveCloudBudget = vi.fn(async (..._args: unknown[]) => {})
const archiveLocalBudget = vi.fn(async (..._args: unknown[]) => {})
const saveCloudBudget = vi.fn(async (..._args: unknown[]) => {})
const saveLocal = vi.fn(async (..._args: unknown[]) => {})
const clearIndexedDb = vi.fn(async () => {})

vi.mock('../lib/firebaseLoader', () => ({
  loadFirebase: async () => api,
  loadedFirebase: () => api,
}))
vi.mock('../storage/cloudSync', () => ({
  onCloudSyncStatus: vi.fn(),
  restoreHistoryEntry: vi.fn(),
  saveCheckpoint: vi.fn(),
  startCloudSync,
  stopCloudSync,
  syncNow: vi.fn(),
}))
vi.mock('../storage/budgetHistory', () => ({
  archiveCloudBudget,
  archiveLocalBudget,
  budgetFingerprint: (state: BudgetState) => JSON.stringify(state),
  clearLocalHistory: async () => {},
  listAllHistory: async () => [],
}))
vi.mock('../storage/firestoreBudget', () => ({
  budgetHasContent: (state: BudgetState) => state.goals.length > 0 || state.meta.updatedAtMs > 0,
  saveCloudBudget,
}))
vi.mock('../storage/indexedDb', () => ({
  clearIndexedDb,
  indexedDbStore: { load: vi.fn(), save: saveLocal },
}))
vi.mock('../storage/paletteSync', () => ({ startPaletteSync: vi.fn(), stopPaletteSync: vi.fn() }))
vi.mock('../storage/sync', () => ({ mergeOnSignIn }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const user = (uid: string) => ({ uid }) as User

async function setup(storedOwner?: string) {
  const stored = new Map<string, string>(storedOwner ? [['flow:budget-owner', storedOwner]] : [])
  const listeners = new Map<string, () => void>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  })
  vi.stubGlobal('window', {
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  })
  const { useAuthStore } = await import('./authStore')
  const { useBudgetStore } = await import('./budgetStore')
  const stop = useAuthStore.getState().init()
  await vi.advanceTimersByTimeAsync(0)
  const callback = onAuthStateChanged.mock.calls[0][1] as (user: User | null) => Promise<void>
  const signIn = (uid: string | null) => {
    api.auth.currentUser = uid ? { uid } : null
    return callback(uid ? user(uid) : null)
  }
  const goOnline = async () => {
    listeners.get('online')?.()
    await vi.advanceTimersByTimeAsync(0)
  }
  return { useAuthStore, useBudgetStore, stop, signIn, goOnline, stored }
}

function budget(view: BudgetState['meta']['view'], updatedAtMs: number): BudgetState {
  return {
    income: [],
    expenses: [],
    goals: [],
    activityLog: [],
    meta: {
      view,
      anchorDate: '2026-11-06',
      monthlyIncomeOverride: null,
      currency: 'USD',
      weekStartsOn: 0,
      updatedAtMs,
    } as BudgetState['meta'],
  }
}

describe('sign-in merge', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    api.auth.currentUser = null
    onAuthStateChanged.mockClear()
    for (const mock of [startCloudSync, stopCloudSync, archiveCloudBudget, archiveLocalBudget]) {
      mock.mockClear()
    }
    saveCloudBudget.mockClear()
    saveLocal.mockClear()
    clearIndexedDb.mockClear()
    mergeOnSignIn.mockReset()
    mergeOnSignIn.mockImplementation(async (local: BudgetState) => local)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("does not let a slower merge from A touch B's session", async () => {
    const { useBudgetStore, stop, signIn, stored } = await setup()
    const slowA = deferred<BudgetState>()
    mergeOnSignIn.mockReturnValueOnce(slowA.promise)

    const a = signIn('a')
    await signIn(null)
    await signIn('b')
    expect(startCloudSync.mock.calls.map((call) => call[0])).toEqual(['b'])
    const metaOfB = useBudgetStore.getState().meta

    slowA.resolve(budget('weekly', 5_000))
    await a

    expect(useBudgetStore.getState().meta).toBe(metaOfB)
    expect(stored.get('flow:budget-owner')).toBe('b')
    expect(startCloudSync.mock.calls.map((call) => call[0])).toEqual(['b'])
    expect(archiveCloudBudget).not.toHaveBeenCalled()

    useBudgetStore.getState().setView('monthly')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveCloudBudget.mock.calls.map((call) => call[0])).toEqual(['b'])
    stop()
  })

  it('does not revive the watcher when sign-out lands during the merge', async () => {
    const { useAuthStore, useBudgetStore, stop, signIn, stored } = await setup()
    const slowA = deferred<BudgetState>()
    mergeOnSignIn.mockReturnValueOnce(slowA.promise)

    const a = signIn('a')
    await signIn(null)
    slowA.resolve(budget('weekly', 5_000))
    await a

    expect(startCloudSync).not.toHaveBeenCalled()
    expect(stored.has('flow:budget-owner')).toBe(false)
    expect(useBudgetStore.getState().meta.updatedAtMs).not.toBe(5_000)
    expect(useAuthStore.getState().lastSyncedAtMs).toBeNull()
    stop()
  })

  it('stops when the account changes during the archive awaits', async () => {
    const { useBudgetStore, stop, signIn, stored } = await setup()
    const slowArchive = deferred<void>()
    archiveCloudBudget.mockReturnValueOnce(slowArchive.promise)
    mergeOnSignIn.mockResolvedValueOnce(budget('weekly', 5_000))

    const a = signIn('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(archiveCloudBudget).toHaveBeenCalledTimes(1)
    await signIn(null)
    slowArchive.resolve()
    await a

    expect(useBudgetStore.getState().meta.updatedAtMs).not.toBe(5_000)
    expect(startCloudSync).not.toHaveBeenCalled()
    expect(stored.has('flow:budget-owner')).toBe(false)
    stop()
  })

  it("keeps a stale merge's failure out of the next account's session", async () => {
    const { useAuthStore, stop, signIn } = await setup()
    const slowA = deferred<BudgetState>()
    mergeOnSignIn.mockReturnValueOnce(slowA.promise)

    const a = signIn('a')
    await signIn('b')
    slowA.reject(new Error('permission-denied'))
    await a

    expect(useAuthStore.getState().error).toBeNull()
    stop()
  })

  it('tells the merge when it has gone stale, so it can skip its own writes', async () => {
    const { stop, signIn } = await setup()
    const slowA = deferred<BudgetState>()
    mergeOnSignIn.mockReturnValueOnce(slowA.promise)

    const a = signIn('a')
    await vi.advanceTimersByTimeAsync(0)
    const isCurrent = mergeOnSignIn.mock.calls[0][2] as () => boolean
    expect(isCurrent()).toBe(true)
    await signIn('b')
    expect(isCurrent()).toBe(false)
    slowA.resolve(budget('weekly', 5_000))
    await a
    stop()
  })

  it('reruns a merge that failed offline when the connection returns', async () => {
    const { useAuthStore, useBudgetStore, stop, signIn, goOnline, stored } = await setup()
    mergeOnSignIn.mockRejectedValueOnce(new Error('client is offline'))
    await signIn('a')
    expect(useAuthStore.getState().error).toBe('client is offline')
    expect(startCloudSync).not.toHaveBeenCalled()

    await goOnline()

    expect(mergeOnSignIn).toHaveBeenCalledTimes(2)
    expect(startCloudSync.mock.calls.map((call) => call[0])).toEqual(['a'])
    expect(stored.get('flow:budget-owner')).toBe('a')
    expect(useAuthStore.getState().error).toBeNull()

    useBudgetStore.getState().setView('monthly')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveCloudBudget.mock.calls.map((call) => call[0])).toEqual(['a'])
    stop()
  })

  it('does not start a second merge while one is in flight', async () => {
    const { stop, signIn, goOnline } = await setup()
    const slow = deferred<BudgetState>()
    mergeOnSignIn.mockReturnValueOnce(slow.promise)

    const a = signIn('a')
    await goOnline()
    expect(mergeOnSignIn).toHaveBeenCalledTimes(1)

    slow.reject(new Error('client is offline'))
    await a
    await goOnline()
    expect(mergeOnSignIn).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does not merge again once the gate is open, or with nobody signed in', async () => {
    const { stop, signIn, goOnline } = await setup()
    await goOnline()
    expect(mergeOnSignIn).not.toHaveBeenCalled()
    await signIn('a')
    await goOnline()
    expect(mergeOnSignIn).toHaveBeenCalledTimes(1)
    stop()
  })

  it("keeps edits made offline when the retry follows another account's wipe", async () => {
    const { useBudgetStore, stop, signIn, goOnline, stored } = await setup('a')
    mergeOnSignIn.mockRejectedValueOnce(new Error('client is offline'))
    await signIn('b')
    expect(clearIndexedDb).toHaveBeenCalledTimes(1)
    expect(stored.get('flow:budget-owner')).toBe('b')

    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(100)
    const edited = useBudgetStore.getState().meta

    await goOnline()

    expect(clearIndexedDb).toHaveBeenCalledTimes(1)
    expect(useBudgetStore.getState().meta).toBe(edited)
    expect((mergeOnSignIn.mock.calls[1][0] as BudgetState).meta).toBe(edited)
    stop()
  })

  it('uploads an edit made during a merge longer than the local debounce', async () => {
    const { useBudgetStore, stop, signIn } = await setup()
    const slow = deferred<BudgetState>()
    mergeOnSignIn.mockReturnValueOnce(slow.promise)

    const a = signIn('a')
    await vi.advanceTimersByTimeAsync(0)
    const local = mergeOnSignIn.mock.calls[0][0] as BudgetState
    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(200)
    expect(saveLocal).toHaveBeenCalledTimes(1)

    slow.resolve(local)
    await a
    await vi.advanceTimersByTimeAsync(1500)

    expect(saveCloudBudget.mock.calls.map((call) => call[0])).toEqual(['a'])
    expect((saveCloudBudget.mock.calls[0][1] as BudgetState).meta.view).toBe('weekly')
    stop()
  })

  it('uploads nothing after a merge with no edit during it', async () => {
    const { stop, signIn } = await setup()
    await signIn('a')
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveCloudBudget).not.toHaveBeenCalled()
    stop()
  })
})
