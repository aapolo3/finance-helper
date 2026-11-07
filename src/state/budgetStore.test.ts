import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const saveCloudBudget = vi.fn(async (..._args: unknown[]) => {})
const saveLocal = vi.fn(async (..._args: unknown[]) => {})
vi.mock('../storage/firestoreBudget', () => ({ saveCloudBudget }))
vi.mock('../storage/indexedDb', () => ({ indexedDbStore: { load: vi.fn(), save: saveLocal } }))

function deferred() {
  let resolve!: () => void
  let reject!: (err: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function load() {
  return import('./budgetStore')
}

const viewOf = (call: unknown[]) => (call[1] as { meta: { view: string } }).meta.view

describe('budget persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    saveCloudBudget.mockReset()
    saveCloudBudget.mockImplementation(async () => {})
    saveLocal.mockReset()
    saveLocal.mockImplementation(async () => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('saves locally only until a merge opens the gate, and again after it closes', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()

    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveLocal).toHaveBeenCalledTimes(1)
    expect(saveCloudBudget).not.toHaveBeenCalled()

    setCloudWriteUid('b')
    useBudgetStore.getState().setView('monthly')
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveCloudBudget.mock.lastCall?.[0]).toBe('b')

    saveCloudBudget.mockClear()
    setCloudWriteUid(null)
    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveLocal).toHaveBeenCalledTimes(3)
    expect(saveCloudBudget).not.toHaveBeenCalled()
  })

  it('writes IndexedDB at 80ms and the cloud at 1500ms, coalescing edits', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')

    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(79)
    expect(saveLocal).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(saveLocal).toHaveBeenCalledTimes(1)
    expect(saveCloudBudget).not.toHaveBeenCalled()

    useBudgetStore.getState().setView('monthly')
    await vi.advanceTimersByTimeAsync(1499)
    expect(saveLocal).toHaveBeenCalledTimes(2)
    expect(saveCloudBudget).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)
    expect(viewOf(saveCloudBudget.mock.calls[0])).toBe('monthly')
  })

  it('starts each cloud write only after the previous one settles', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    const first = deferred()
    saveCloudBudget.mockImplementationOnce(() => first.promise)

    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(1500)
    useBudgetStore.getState().setView('monthly')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)

    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveCloudBudget.mock.calls.map(viewOf)).toEqual(['weekly', 'monthly'])
  })

  it('keeps writing after a failed cloud write', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    saveCloudBudget.mockImplementationOnce(async () => {
      throw new Error('denied')
    })

    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(1500)
    useBudgetStore.getState().setView('monthly')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveCloudBudget.mock.calls.map(viewOf)).toEqual(['weekly', 'monthly'])
    warn.mockRestore()
  })

  it('collapses writes queued behind a stuck one to the newest', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    const first = deferred()
    saveCloudBudget.mockImplementationOnce(() => first.promise)

    for (const view of ['weekly', 'monthly', 'weekly', 'monthly'] as const) {
      useBudgetStore.getState().setView(view)
      await vi.advanceTimersByTimeAsync(1500)
    }
    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveCloudBudget).toHaveBeenCalledTimes(2)
  })

  it('does not let a stuck write from one uid block the next uid', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    saveCloudBudget.mockImplementationOnce(() => new Promise<void>(() => {}))
    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(1500)

    setCloudWriteUid(null)
    setCloudWriteUid('b')
    useBudgetStore.getState().setView('monthly')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveCloudBudget.mock.calls.map((call) => call[0])).toEqual(['a', 'b'])

    // B's flush settles with B's own write, not after the 5s cap on A's.
    let flushed = false
    void useBudgetStore.getState().flushPersist().then(() => {
      flushed = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(flushed).toBe(true)
  })

  it('keeps a queued write for the outgoing uid when the next uid writes', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    const first = deferred()
    saveCloudBudget.mockImplementationOnce(() => first.promise)
    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(1500)
    useBudgetStore.getState().setView('monthly')
    await vi.advanceTimersByTimeAsync(1500)
    setCloudWriteUid('b')
    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(1500)

    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveCloudBudget.mock.calls.map((call) => call[0])).toEqual(['a', 'b', 'a'])
  })

  it('drops a queued write after a timed-out flush and a direct save', async () => {
    const { dropQueuedCloudWrites, setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    const first = deferred()
    saveCloudBudget.mockImplementationOnce(() => first.promise)
    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(1500)
    useBudgetStore.getState().setView('monthly')
    const flushed = useBudgetStore.getState().flushPersist()
    await vi.advanceTimersByTimeAsync(5000)
    await flushed

    dropQueuedCloudWrites('a')
    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)
  })

  it('tells a running write it is superseded by a direct save', async () => {
    const { dropQueuedCloudWrites, setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(1500)
    const { isCurrent } = saveCloudBudget.mock.calls[0][2] as { isCurrent: () => boolean }
    expect(isCurrent()).toBe(true)
    dropQueuedCloudWrites('a')
    expect(isCurrent()).toBe(false)
  })

  it('applyRemote drops a write queued behind a stuck one', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    const first = deferred()
    saveCloudBudget.mockImplementationOnce(() => first.promise)
    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(1500)
    useBudgetStore.getState().setView('monthly')
    await vi.advanceTimersByTimeAsync(1500)

    const { income, expenses, goals, activityLog, meta } = useBudgetStore.getState()
    useBudgetStore.getState().applyRemote({ income, expenses, goals, activityLog, meta })
    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)
  })

  it('does not let a stuck cloud write hold up IndexedDB', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    saveCloudBudget.mockImplementation(() => new Promise<void>(() => {}))

    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(1500)
    useBudgetStore.getState().setView('monthly')
    await vi.advanceTimersByTimeAsync(80)
    expect(saveLocal).toHaveBeenCalledTimes(2)
  })

  it('flushPersist writes both immediately and waits for them', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    const cloud = deferred()
    saveCloudBudget.mockImplementationOnce(() => cloud.promise)

    useBudgetStore.getState().setView('weekly')
    let done = false
    const flushed = useBudgetStore.getState().flushPersist().then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(saveLocal).toHaveBeenCalledTimes(1)
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)
    expect(done).toBe(false)

    cloud.resolve()
    await flushed
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)
  })

  it('flushPersist gives up waiting on a cloud write that never settles', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    saveCloudBudget.mockImplementation(() => new Promise<void>(() => {}))

    useBudgetStore.getState().setView('weekly')
    const flushed = useBudgetStore.getState().flushPersist()
    await vi.advanceTimersByTimeAsync(5000)
    await expect(flushed).resolves.toBeUndefined()
  })

  it('flushPersist reports a failed cloud write', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    saveCloudBudget.mockImplementationOnce(async () => {
      throw new Error('denied')
    })

    useBudgetStore.getState().setView('weekly')
    await expect(useBudgetStore.getState().flushPersist()).rejects.toThrow('denied')
    await expect(useBudgetStore.getState().flushPersist()).resolves.toBeUndefined()
    warn.mockRestore()
  })

  it('flushes a pending cloud write to the uid that made the edit when the uid changes', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    useBudgetStore.getState().setView('weekly')

    setCloudWriteUid(null)
    setCloudWriteUid('b')
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveCloudBudget.mock.calls.map((call) => call[0])).toEqual(['a'])
    expect(viewOf(saveCloudBudget.mock.calls[0])).toBe('weekly')
  })

  it('leaves an edit made before the gate opens to the requeue that follows the merge', async () => {
    const { requeueCloudSave, setCloudWriteUid, useBudgetStore } = await load()
    useBudgetStore.getState().setView('weekly')
    setCloudWriteUid('a')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveCloudBudget).not.toHaveBeenCalled()

    requeueCloudSave('a')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveCloudBudget.mock.lastCall?.[0]).toBe('a')
    expect(viewOf(saveCloudBudget.mock.calls[0])).toBe('weekly')
  })

  it('applyRemote warns when its IndexedDB save fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { useBudgetStore } = await load()
    saveLocal.mockImplementationOnce(async () => {
      throw new Error('quota')
    })
    const { income, expenses, goals, activityLog, meta } = useBudgetStore.getState()
    useBudgetStore.getState().applyRemote({ income, expenses, goals, activityLog, meta })
    await vi.advanceTimersByTimeAsync(0)
    expect(warn).toHaveBeenCalledWith('Could not save budget', expect.any(Error))
    warn.mockRestore()
  })

  it('cancelPendingPersist drops the queued local and cloud writes', async () => {
    const { cancelPendingPersist, setCloudWriteUid, useBudgetStore } = await load()
    useBudgetStore.getState().setView('weekly')
    cancelPendingPersist()
    setCloudWriteUid('a')
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveLocal).not.toHaveBeenCalled()
    expect(saveCloudBudget).not.toHaveBeenCalled()
  })

  it('applyRemote drops a queued older edit so it cannot overwrite the newer remote', async () => {
    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    useBudgetStore.getState().setView('weekly')
    await vi.advanceTimersByTimeAsync(100)

    const { income, expenses, goals, activityLog, meta } = useBudgetStore.getState()
    useBudgetStore.getState().applyRemote({ income, expenses, goals, activityLog, meta })
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveCloudBudget).not.toHaveBeenCalled()
  })

  it.each(['pagehide', 'visibilitychange'])('flushes on %s', async (eventName) => {
    const listeners = new Map<string, () => void>()
    const target = {
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    }
    vi.stubGlobal('window', target)
    vi.stubGlobal('document', { ...target, visibilityState: 'hidden' })

    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    useBudgetStore.getState().setView('weekly')
    listeners.get(eventName)?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveLocal).toHaveBeenCalledTimes(1)
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)
  })

  it('does not flush when the page becomes visible', async () => {
    const listeners = new Map<string, () => void>()
    const target = {
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    }
    vi.stubGlobal('window', target)
    vi.stubGlobal('document', { ...target, visibilityState: 'visible' })

    const { setCloudWriteUid, useBudgetStore } = await load()
    setCloudWriteUid('a')
    useBudgetStore.getState().setView('weekly')
    listeners.get('visibilitychange')?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveCloudBudget).not.toHaveBeenCalled()
  })
})
