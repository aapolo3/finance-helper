import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyBudget } from '../domain/demo'
import type { BudgetState } from '../domain/types'

const getDocs = vi.fn()
const setDoc = vi.fn(async (..._args: unknown[]) => {})
const deleteDoc = vi.fn(async (..._args: unknown[]) => {})

vi.mock('firebase/firestore', () => ({
  collection: () => 'history',
  deleteDoc,
  doc: () => 'doc',
  getDocs,
  limit: (count: number) => ({ limit: count }),
  orderBy: () => 'order',
  query: (...parts: unknown[]) => parts,
  serverTimestamp: () => 'ts',
  setDoc,
}))
vi.mock('../lib/firebase', () => ({ db: {} }))

function budget(amount: number): BudgetState {
  const state = emptyBudget()
  state.income = [{ id: '1', name: 'Job', amount, cadence: 'monthly', enabled: true }]
  return state
}

function historyDoc(state: BudgetState, reason: string, savedAtMs: number, id = 'h') {
  return { id, ref: `ref-${id}`, data: () => ({ ...state, reason, savedAtMs }) }
}

const limits = () =>
  getDocs.mock.calls.map(([parts]) => (parts as { limit?: number }[]).find((p) => p?.limit)?.limit)

describe('archiveCloudBudget', () => {
  beforeEach(() => {
    getDocs.mockReset()
    setDoc.mockClear()
    deleteDoc.mockClear()
  })

  it('skips a duplicate of the newest doc after reading one doc, without pruning', async () => {
    const { archiveCloudBudget } = await import('./budgetHistory')
    getDocs.mockResolvedValueOnce({ docs: [historyDoc(budget(5), 'auto', 1_000)] })

    await archiveCloudBudget('a', budget(5), 'auto', 1_500)

    expect(limits()).toEqual([1])
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('creates and prunes when the newest doc differs', async () => {
    const { archiveCloudBudget } = await import('./budgetHistory')
    const docs = Array.from({ length: 32 }, (_, i) => historyDoc(budget(i), 'auto', i, `h${i}`))
    getDocs
      .mockResolvedValueOnce({ docs: [historyDoc(budget(5), 'auto', 1_000)] })
      .mockResolvedValueOnce({ docs })

    await archiveCloudBudget('a', budget(6), 'auto', 1_500)

    expect(limits()).toEqual([1, 40])
    expect(setDoc).toHaveBeenCalledTimes(1)
    expect(deleteDoc.mock.calls.map((call) => call[0])).toEqual(['ref-h30', 'ref-h31'])
  })

  it('creates when history is empty', async () => {
    const { archiveCloudBudget } = await import('./budgetHistory')
    getDocs.mockResolvedValue({ docs: [] })
    await archiveCloudBudget('a', budget(6), 'auto', 1_500)
    expect(setDoc).toHaveBeenCalledTimes(1)
    expect(limits()).toEqual([1, 40])
  })

  it('does not treat a different reason or an old doc as a duplicate', async () => {
    const { archiveCloudBudget } = await import('./budgetHistory')
    getDocs.mockResolvedValue({ docs: [historyDoc(budget(6), 'replaced', 1_000)] })
    await archiveCloudBudget('a', budget(6), 'auto', 1_500)
    getDocs.mockResolvedValue({ docs: [historyDoc(budget(6), 'auto', 1_000)] })
    await archiveCloudBudget('a', budget(6), 'auto', 1_000 + 2 * 60 * 1000)
    expect(setDoc).toHaveBeenCalledTimes(2)
  })
})

describe('seedCloudHistoryIfEmpty', () => {
  beforeEach(() => {
    getDocs.mockReset()
    setDoc.mockClear()
  })

  it('checks emptiness with a single-doc read and seeds when empty', async () => {
    const { seedCloudHistoryIfEmpty } = await import('./budgetHistory')
    getDocs.mockResolvedValue({ docs: [] })
    await seedCloudHistoryIfEmpty('a', budget(5), 1_000)
    expect(limits()[0]).toBe(1)
    expect(setDoc).toHaveBeenCalledTimes(1)
  })

  it('does nothing when any history exists', async () => {
    const { seedCloudHistoryIfEmpty } = await import('./budgetHistory')
    getDocs.mockResolvedValue({ docs: [historyDoc(budget(4), 'auto', 1)] })
    await seedCloudHistoryIfEmpty('a', budget(5), 1_000)
    expect(limits()).toEqual([1])
    expect(setDoc).not.toHaveBeenCalled()
  })
})
