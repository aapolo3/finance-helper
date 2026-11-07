import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyBudget } from '../domain/demo'
import type { BudgetState } from '../domain/types'

const getDoc = vi.fn()
const setDoc = vi.fn(async (..._args: unknown[]) => {})
const unsubscribe = vi.fn()
type SnapshotHandler = (snap: unknown) => void
let onNext: SnapshotHandler = () => {}
let onFail: (err: Error) => void = () => {}
const archiveCloudBudget = vi.fn(async (..._args: unknown[]) => {})

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  getDoc,
  setDoc,
  serverTimestamp: () => 'ts',
  onSnapshot: (_ref: unknown, next: SnapshotHandler, fail: (err: Error) => void) => {
    onNext = next
    onFail = fail
    return unsubscribe
  },
}))
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('./budgetHistory', async (original) => ({
  ...(await original<typeof import('./budgetHistory')>()),
  archiveCloudBudget,
}))

function budget(updatedAtMs: number, marker = 'x'): BudgetState {
  const state = emptyBudget()
  state.income = [{ id: marker, name: marker, amount: 1, cadence: 'monthly', enabled: true }]
  state.meta.updatedAtMs = updatedAtMs
  return state
}

function snap(state: BudgetState | null, metadata: Partial<{ hasPendingWrites: boolean; fromCache: boolean }> = {}) {
  return {
    exists: () => state !== null,
    data: () => ({ ...state }),
    metadata: { hasPendingWrites: false, fromCache: false, ...metadata },
  }
}

const GAP = 2 * 60 * 1000

// Sign-in loads Firebase before any watcher starts.
async function loaded() {
  const { loadFirebase } = await import('../lib/firebaseLoader')
  await loadFirebase()
}

describe('saveCloudBudget remote state', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    getDoc.mockReset()
    getDoc.mockImplementation(async () => snap(budget(1)))
    setDoc.mockClear()
    archiveCloudBudget.mockClear()
    unsubscribe.mockClear()
  })

  async function live(uid: string, remote: BudgetState | null = budget(1_000, 'remote')) {
    await loaded()
    const mod = await import('./firestoreBudget')
    const stop = mod.watchCloudBudget(uid, () => {}, () => {})
    onNext(snap(remote))
    return { ...mod, stop }
  }

  it('does not read the doc on auto saves while the watcher is live', async () => {
    const { saveCloudBudget } = await live('a')
    await saveCloudBudget('a', budget(2_000))
    await saveCloudBudget('a', budget(3_000))
    expect(getDoc).not.toHaveBeenCalled()
    expect(setDoc).toHaveBeenCalledTimes(2)
  })

  it('reads once when nothing is known, then uses what it wrote', async () => {
    await loaded()
    const { saveCloudBudget, watchCloudBudget } = await import('./firestoreBudget')
    watchCloudBudget('a', () => {}, () => {})
    await saveCloudBudget('a', budget(2_000))
    await saveCloudBudget('a', budget(3_000))
    expect(getDoc).toHaveBeenCalledTimes(1)
  })

  it('archives the previous state it last wrote once the gap passes', async () => {
    const { saveCloudBudget } = await live('a')
    const written = budget(2_000, 'written')
    await saveCloudBudget('a', written)
    expect(archiveCloudBudget).not.toHaveBeenCalled()

    await saveCloudBudget('a', budget(2_000 + GAP, 'next'))
    expect(archiveCloudBudget).toHaveBeenCalledTimes(1)
    expect(archiveCloudBudget.mock.calls[0][0]).toBe('a')
    expect(archiveCloudBudget.mock.calls[0][1]).toBe(written)
    expect(archiveCloudBudget.mock.calls[0][2]).toBe('auto')
  })

  it('archives another device\'s write seen by the watcher, not the stale own write', async () => {
    const { saveCloudBudget } = await live('a')
    await saveCloudBudget('a', budget(2_000, 'mine'))
    onNext(snap(budget(5_000, 'other-device')))

    await saveCloudBudget('a', budget(5_000 + GAP, 'next'))
    const archived = archiveCloudBudget.mock.calls[0][1] as BudgetState
    expect(archived.income[0].id).toBe('other-device')
    expect(getDoc).not.toHaveBeenCalled()
  })

  it('ignores cache-only and pending snapshots as evidence of the remote', async () => {
    await loaded()
    const { saveCloudBudget, watchCloudBudget } = await import('./firestoreBudget')
    watchCloudBudget('a', () => {}, () => {})
    onNext(snap(null, { fromCache: true }))
    onNext(snap(budget(9, 'pending'), { hasPendingWrites: true }))
    await saveCloudBudget('a', budget(2_000))
    expect(getDoc).toHaveBeenCalledTimes(1)
  })

  it('never uses one uid\'s remote state for another uid', async () => {
    const { saveCloudBudget, stop, watchCloudBudget } = await live('a')
    stop()
    watchCloudBudget('b', () => {}, () => {})
    await saveCloudBudget('b', budget(2_000))
    expect(getDoc).toHaveBeenCalledTimes(1)
    expect(getDoc.mock.calls[0][0]).toBe('users/b/budget/current')
  })

  it('re-reads after the watcher stops or errors, since other writes go unseen', async () => {
    const stopped = await live('a')
    stopped.stop()
    await stopped.saveCloudBudget('a', budget(2_000))
    expect(getDoc).toHaveBeenCalledTimes(1)

    getDoc.mockClear()
    const failed = await live('a')
    onFail(new Error('lost'))
    await failed.saveCloudBudget('a', budget(3_000))
    expect(getDoc).toHaveBeenCalledTimes(1)
  })

  it('keeps reading on reasons other than auto', async () => {
    const { saveCloudBudget } = await live('a')
    await saveCloudBudget('a', budget(2_000), { reason: 'push' })
    expect(getDoc).toHaveBeenCalledTimes(1)
  })

  it('skips the write when superseded while archiving', async () => {
    const { saveCloudBudget } = await live('a')
    await saveCloudBudget('a', budget(1_000 + GAP), { isCurrent: () => false })
    expect(archiveCloudBudget).toHaveBeenCalledTimes(1)
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('does not remember a write that failed', async () => {
    const { saveCloudBudget } = await live('a')
    setDoc.mockRejectedValueOnce(new Error('denied'))
    await expect(saveCloudBudget('a', budget(1_000 + GAP, 'failed'))).rejects.toThrow('denied')
    archiveCloudBudget.mockClear()
    await saveCloudBudget('a', budget(1_000 + GAP, 'next'))
    expect((archiveCloudBudget.mock.calls[0][1] as BudgetState).income[0].id).toBe('remote')
  })
})
