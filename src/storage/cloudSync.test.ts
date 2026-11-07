import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyBudget } from '../domain/demo'

const order: string[] = []
const saveCloudBudget = vi.fn(async (..._args: unknown[]) => {
  order.push('save')
})
const loadCloudBudget = vi.fn(async () => ({ state: null, updatedAtMs: 0 }))
const archiveCloudBudget = vi.fn(async (..._args: unknown[]) => {})
const seedCloudHistoryIfEmpty = vi.fn()
const watchCloudBudget = vi.fn((..._args: unknown[]) => () => {})
const applyRemote = vi.fn()

vi.mock('./firestoreBudget', () => ({
  budgetHasContent: () => false,
  loadCloudBudget,
  saveCloudBudget,
  watchCloudBudget,
}))
vi.mock('./budgetHistory', () => ({
  archiveCloudBudget,
  archiveLocalBudget: vi.fn(),
  budgetFingerprint: () => '',
  seedCloudHistoryIfEmpty,
}))
vi.mock('./indexedDb', () => ({ indexedDbStore: { save: vi.fn(async () => {}) } }))
vi.mock('../state/budgetStore', () => ({
  cancelPendingPersist: () => order.push('cancel'),
  dropQueuedCloudWrites: () => order.push('drop'),
  requeueCloudSave: vi.fn(),
  useBudgetStore: {
    getState: () => ({
      ...emptyBudget(),
      applyRemote,
      flushPersist: async () => {
        order.push('flush')
      },
    }),
    setState: () => order.push('setState'),
  },
}))

describe('saves that bypass the queue', () => {
  beforeEach(() => {
    order.length = 0
  })

  it('restoreHistoryEntry flushes first and drops queued writes before saving', async () => {
    const { restoreHistoryEntry } = await import('./cloudSync')
    await restoreHistoryEntry('a', emptyBudget())
    expect(order).toEqual(['flush', 'cancel', 'setState', 'drop', 'save'])
  })

  it('forcePushLatest drops queued writes before saving', async () => {
    const { forcePushLatest } = await import('./cloudSync')
    await forcePushLatest('a')
    expect(order).toEqual(['flush', 'setState', 'drop', 'save'])
  })

  it('syncNow push drops queued writes before saving', async () => {
    const { syncNow } = await import('./cloudSync')
    await syncNow('a')
    expect(order).toEqual(['flush', 'drop', 'save'])
  })
})

describe('pull path', () => {
  const remoteBudget = () => {
    const state = emptyBudget()
    state.meta = { ...state.meta, updatedAtMs: 9_000_000_000_000 }
    return state
  }

  beforeEach(() => {
    order.length = 0
    archiveCloudBudget.mockClear()
    seedCloudHistoryIfEmpty.mockClear()
    loadCloudBudget.mockClear()
    watchCloudBudget.mockClear()
    applyRemote.mockClear()
  })

  it('applying a remote snapshot does not archive to the cloud', async () => {
    const { startCloudSync, stopCloudSync } = await import('./cloudSync')
    startCloudSync('p', { state: null, updatedAtMs: 0 })
    const onRemote = watchCloudBudget.mock.calls[0][1] as (r: unknown) => void
    onRemote({ state: remoteBudget(), updatedAtMs: 1 })
    expect(applyRemote).toHaveBeenCalledTimes(1)
    expect(archiveCloudBudget).not.toHaveBeenCalled()
    stopCloudSync()
  })

  it('syncNow pull does not archive to the cloud or re-save IndexedDB', async () => {
    const { syncNow } = await import('./cloudSync')
    const { indexedDbStore } = await import('./indexedDb')
    loadCloudBudget.mockImplementationOnce(async () => ({ state: remoteBudget(), updatedAtMs: 1 }) as never)
    expect(await syncNow('a')).toBe('pulled')
    expect(applyRemote).toHaveBeenCalledTimes(1)
    expect(archiveCloudBudget).not.toHaveBeenCalled()
    expect(indexedDbStore.save).not.toHaveBeenCalled()
  })

  it('startCloudSync seeds from the state it is given without another read', async () => {
    const { startCloudSync, stopCloudSync } = await import('./cloudSync')
    const state = remoteBudget()
    startCloudSync('s', { state, updatedAtMs: 5 })
    expect(loadCloudBudget).not.toHaveBeenCalled()
    expect(seedCloudHistoryIfEmpty).toHaveBeenCalledWith('s', state, 5)
    stopCloudSync()
  })

  it('startCloudSync reads the cloud once when given nothing', async () => {
    const { startCloudSync, stopCloudSync } = await import('./cloudSync')
    startCloudSync('r')
    expect(loadCloudBudget).toHaveBeenCalledTimes(1)
    stopCloudSync()
  })
})
