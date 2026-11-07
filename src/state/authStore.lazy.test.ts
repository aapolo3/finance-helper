import { beforeEach, describe, expect, it, vi } from 'vitest'

const onAuthStateChanged = vi.fn((..._args: unknown[]) => unsubscribe)
const unsubscribe = vi.fn()
const signInWithPopup = vi.fn(async (..._args: unknown[]) => {})
const loadFirebase = vi.fn()
const loadedFirebase = vi.fn()
const api = { auth: {}, googleProvider: {}, onAuthStateChanged, signInWithPopup }

vi.mock('../lib/firebaseLoader', () => ({ loadFirebase, loadedFirebase, requireFirebase: () => api }))
vi.mock('../storage/cloudSync', () => ({
  onCloudSyncStatus: vi.fn(),
  saveCheckpoint: vi.fn(),
  stopCloudSync: vi.fn(),
  syncNow: vi.fn(),
}))
vi.mock('../storage/paletteSync', () => ({ stopPaletteSync: vi.fn() }))
vi.mock('../storage/budgetHistory', () => ({}))
vi.mock('../storage/budgetOwner', () => ({}))
vi.mock('../storage/firestoreBudget', () => ({}))
vi.mock('../storage/indexedDb', () => ({}))
vi.mock('../storage/sync', () => ({}))
vi.mock('./budgetStore', () => ({
  setCloudWriteUid: vi.fn(),
  useBudgetStore: { getState: () => ({}) },
}))

const flush = () => new Promise((resolve) => setTimeout(resolve))

function stubBrowser(hint: string | null) {
  const stored = new Map<string, string>(hint ? [['flow:signed-in', hint]] : [])
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
  return { stored, listeners }
}

describe('authStore with Firebase loaded on demand', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    onAuthStateChanged.mockClear()
    unsubscribe.mockClear()
    signInWithPopup.mockClear()
    loadFirebase.mockReset()
    loadedFirebase.mockReset()
    loadFirebase.mockResolvedValue(api)
    loadedFirebase.mockReturnValue(null)
  })

  it('does not load Firebase until init runs', async () => {
    stubBrowser(null)
    await import('./authStore')
    expect(loadFirebase).not.toHaveBeenCalled()
  })

  it('stays restoring for a returning user until auth answers', async () => {
    const { stored } = stubBrowser('1')
    const { useAuthStore } = await import('./authStore')
    expect(useAuthStore.getState().restoring).toBe(true)
    const stop = useAuthStore.getState().init()
    await flush()
    expect(useAuthStore.getState().restoring).toBe(true)
    const callback = onAuthStateChanged.mock.calls[0][1] as (user: null) => Promise<void>
    await callback(null)
    expect(useAuthStore.getState().restoring).toBe(false)
    expect(stored.has('flow:signed-in')).toBe(false)
    stop()
  })

  it('is not restoring for someone who was signed out', async () => {
    stubBrowser(null)
    const { useAuthStore } = await import('./authStore')
    expect(useAuthStore.getState().restoring).toBe(false)
  })

  it('survives a failed load and connects when back online', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { listeners } = stubBrowser('1')
    loadFirebase.mockRejectedValueOnce(new Error('offline'))
    const { useAuthStore } = await import('./authStore')
    const stop = useAuthStore.getState().init()
    await flush()
    expect(useAuthStore.getState().restoring).toBe(false)
    expect(useAuthStore.getState().sdkStatus).toBe('failed')
    expect(onAuthStateChanged).not.toHaveBeenCalled()
    listeners.get('online')?.()
    await flush()
    expect(onAuthStateChanged).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().sdkStatus).toBe('ready')
    stop()
    warn.mockRestore()
  })

  it('retries a failed load on a timer with no online event, backing off', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubBrowser(null)
    loadFirebase.mockRejectedValueOnce(new Error('500')).mockRejectedValueOnce(new Error('500'))
    const { useAuthStore } = await import('./authStore')
    const stop = useAuthStore.getState().init()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(loadFirebase).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(9_999)
    expect(onAuthStateChanged).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onAuthStateChanged).toHaveBeenCalledTimes(1)
    stop()
    warn.mockRestore()
    vi.useRealTimers()
  })

  it('clears restoring when the load hangs, and connects if it finishes later', async () => {
    vi.useFakeTimers()
    stubBrowser('1')
    let finish: (value: typeof api) => void = () => {}
    loadFirebase.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const { useAuthStore } = await import('./authStore')
    const stop = useAuthStore.getState().init()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(useAuthStore.getState().restoring).toBe(false)
    expect(useAuthStore.getState().sdkStatus).toBe('failed')
    finish(api)
    await vi.advanceTimersByTimeAsync(0)
    expect(useAuthStore.getState().sdkStatus).toBe('ready')
    expect(onAuthStateChanged).toHaveBeenCalledTimes(1)
    stop()
    vi.useRealTimers()
  })

  it('subscribes once when sign-in finds the SDK loaded after a failed load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubBrowser(null)
    loadFirebase.mockRejectedValueOnce(new Error('500'))
    const { useAuthStore } = await import('./authStore')
    const stop = useAuthStore.getState().init()
    await flush()
    // Cold click: starts the load, asks to try again, opens nothing.
    await useAuthStore.getState().signInWithGoogle()
    expect(signInWithPopup).not.toHaveBeenCalled()
    expect(useAuthStore.getState().error).toContain('try again')
    await flush()
    expect(onAuthStateChanged).toHaveBeenCalledTimes(1)
    loadedFirebase.mockReturnValue(api)
    void useAuthStore.getState().signInWithGoogle()
    expect(signInWithPopup).toHaveBeenCalledTimes(1)
    await flush()
    expect(onAuthStateChanged).toHaveBeenCalledTimes(1)
    stop()
    warn.mockRestore()
  })

  it('never opens the popup after the cold load finishes', async () => {
    stubBrowser(null)
    const { useAuthStore } = await import('./authStore')
    const stop = useAuthStore.getState().init()
    await useAuthStore.getState().signInWithGoogle()
    await flush()
    expect(useAuthStore.getState().sdkStatus).toBe('ready')
    expect(signInWithPopup).not.toHaveBeenCalled()
    stop()
  })

  it('does not sync or checkpoint while restoring', async () => {
    stubBrowser('1')
    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().syncNow()
    await useAuthStore.getState().saveCheckpoint()
    expect(useAuthStore.getState().syncNote).toBeNull()
    expect(useAuthStore.getState().lastSyncedAtMs).toBeNull()
  })

  it('does not subscribe if stopped while loading', async () => {
    stubBrowser(null)
    const { useAuthStore } = await import('./authStore')
    const stop = useAuthStore.getState().init()
    stop()
    await flush()
    expect(onAuthStateChanged).not.toHaveBeenCalled()
  })

  it('opens the sign-in popup in the same tick once Firebase has loaded', async () => {
    stubBrowser(null)
    loadedFirebase.mockReturnValue(api)
    const { useAuthStore } = await import('./authStore')
    void useAuthStore.getState().signInWithGoogle()
    expect(signInWithPopup).toHaveBeenCalledTimes(1)
  })
})
