import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BudgetState } from '../domain/types'

const saveCloudBudget = vi.fn(async (..._args: unknown[]) => {})
const loadCloudBudget = vi.fn(async () => ({ state: null as BudgetState | null, updatedAtMs: 0 }))
const archiveLocalBudget = vi.fn(async (..._args: unknown[]) => {})
const hasContent = vi.fn(() => false)
const saveLocal = vi.fn(async (..._args: unknown[]) => {})

vi.mock('./firestoreBudget', () => ({
  budgetHasContent: () => hasContent(),
  loadCloudBudget,
  saveCloudBudget,
  watchCloudBudget: vi.fn(),
}))
vi.mock('./budgetHistory', () => ({
  archiveCloudBudget: vi.fn(),
  archiveLocalBudget,
  budgetFingerprint: () => '',
  seedCloudHistoryIfEmpty: vi.fn(),
}))
vi.mock('./indexedDb', () => ({ indexedDbStore: { load: vi.fn(), save: saveLocal } }))

async function load() {
  const store = await import('../state/budgetStore')
  const sync = await import('./cloudSync')
  store.setCloudWriteUid('a')
  return { ...store, ...sync }
}

const lastCloudView = () =>
  (saveCloudBudget.mock.calls.at(-1)![1] as BudgetState).meta.view

describe('direct saves with concurrent edits (real store)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    saveCloudBudget.mockReset()
    saveCloudBudget.mockImplementation(async () => {})
    loadCloudBudget.mockReset()
    loadCloudBudget.mockImplementation(async () => ({ state: null, updatedAtMs: 0 }))
    archiveLocalBudget.mockReset()
    archiveLocalBudget.mockImplementation(async () => {})
    hasContent.mockReset()
    hasContent.mockImplementation(() => false)
    saveLocal.mockReset()
    saveLocal.mockImplementation(async () => {})
  })
  afterEach(() => vi.useRealTimers())

  it('syncNow push includes an edit made during the cloud read', async () => {
    const { syncNow, useBudgetStore } = await load()
    useBudgetStore.getState().setView('monthly')
    await useBudgetStore.getState().flushPersist()
    loadCloudBudget.mockImplementationOnce(async () => {
      useBudgetStore.getState().setView('weekly')
      await vi.advanceTimersByTimeAsync(1500)
      return { state: null, updatedAtMs: 0 }
    })

    await syncNow('a')
    await vi.advanceTimersByTimeAsync(5000)
    expect(lastCloudView()).toBe('weekly')
    expect(useBudgetStore.getState().meta.view).toBe('weekly')
  })

  it('forcePushLatest includes an edit made during the local save', async () => {
    const { forcePushLatest, useBudgetStore } = await load()
    saveLocal.mockImplementationOnce(async () => {
      useBudgetStore.getState().setView('weekly')
    })
    await forcePushLatest('a')
    expect((saveCloudBudget.mock.calls[0][2] as { reason: string }).reason).toBe('force')
    expect((saveCloudBudget.mock.calls[0][1] as BudgetState).meta.view).toBe('weekly')
  })

  it('restoreHistoryEntry includes an edit made during the local save', async () => {
    const { restoreHistoryEntry, useBudgetStore } = await load()
    const { income, expenses, goals, activityLog, meta } = useBudgetStore.getState()
    saveLocal.mockImplementationOnce(async () => {
      useBudgetStore.getState().setView('weekly')
    })
    await restoreHistoryEntry('a', {
      income,
      expenses,
      goals,
      activityLog,
      meta: { ...meta, view: 'monthly' },
    })
    expect((saveCloudBudget.mock.calls[0][1] as BudgetState).meta.view).toBe('weekly')
  })

  it('restoreHistoryEntry is not overwritten by an edit made between the flush and the restore', async () => {
    const { restoreHistoryEntry, useBudgetStore } = await load()
    const { income, expenses, goals, activityLog, meta } = useBudgetStore.getState()
    hasContent.mockImplementation(() => true)
    archiveLocalBudget.mockImplementationOnce(async () => {
      useBudgetStore.getState().setView('weekly')
    })
    await restoreHistoryEntry('a', {
      income,
      expenses,
      goals,
      activityLog,
      meta: { ...meta, view: 'monthly' },
    })
    await vi.advanceTimersByTimeAsync(5000)
    expect(useBudgetStore.getState().meta.view).toBe('monthly')
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)
    expect((saveCloudBudget.mock.calls[0][1] as BudgetState).meta.view).toBe('monthly')
    expect(saveLocal.mock.calls.at(-1)![0]).toMatchObject({ meta: { view: 'monthly' } })
  })

  it('re-queues an edit made while the direct save runs, so it lands last', async () => {
    const { forcePushLatest, useBudgetStore } = await load()
    useBudgetStore.getState().setView('monthly')
    await useBudgetStore.getState().flushPersist()
    saveCloudBudget.mockImplementationOnce(async () => {
      useBudgetStore.getState().setView('weekly')
    })
    await forcePushLatest('a')
    await vi.advanceTimersByTimeAsync(1500)
    expect(lastCloudView()).toBe('weekly')
    expect(saveCloudBudget.mock.lastCall?.[2]).not.toMatchObject({ reason: 'force' })
  })

  it('does not write again when nothing changed', async () => {
    const { forcePushLatest } = await load()
    await forcePushLatest('a')
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)
  })

  it('re-queues when the direct save throws, and still reports the failure', async () => {
    const { forcePushLatest } = await load()
    saveCloudBudget.mockRejectedValueOnce(new Error('denied'))
    await expect(forcePushLatest('a')).rejects.toThrow('denied')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveCloudBudget).toHaveBeenCalledTimes(2)
  })

  it('does not re-queue under an account that has been replaced', async () => {
    const { forcePushLatest, setCloudWriteUid } = await load()
    saveCloudBudget.mockImplementationOnce(async () => {
      setCloudWriteUid('b')
      throw new Error('denied')
    })
    await expect(forcePushLatest('a')).rejects.toThrow('denied')
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)
  })
})
