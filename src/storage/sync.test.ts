import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BudgetState } from '../domain/types'

const loadCloudBudget = vi.fn()
const saveCloudBudget = vi.fn(async (..._args: unknown[]) => {})
const saveLocal = vi.fn(async (..._args: unknown[]) => {})
vi.mock('./firestoreBudget', () => ({ loadCloudBudget, saveCloudBudget }))
vi.mock('./indexedDb', () => ({ indexedDbStore: { save: saveLocal } }))

const budget = (updatedAtMs: number) => ({ meta: { updatedAtMs } }) as BudgetState

describe('mergeOnSignIn', () => {
  beforeEach(() => {
    loadCloudBudget.mockReset()
    saveCloudBudget.mockClear()
    saveLocal.mockClear()
  })

  it("does not write a stale account's newer cloud budget to IndexedDB", async () => {
    const { mergeOnSignIn } = await import('./sync')
    loadCloudBudget.mockResolvedValue({ state: budget(5), updatedAtMs: 5 })
    await mergeOnSignIn(budget(1), 'a', () => false)
    expect(saveLocal).not.toHaveBeenCalled()
  })

  it('does not upload once the merge has gone stale', async () => {
    const { mergeOnSignIn } = await import('./sync')
    loadCloudBudget.mockResolvedValue({ state: budget(1), updatedAtMs: 1 })
    await mergeOnSignIn(budget(5), 'a', () => false)
    expect(saveCloudBudget).not.toHaveBeenCalled()
  })

  it('writes as before while the merge is current', async () => {
    const { mergeOnSignIn } = await import('./sync')
    loadCloudBudget.mockResolvedValue({ state: budget(5), updatedAtMs: 5 })
    await mergeOnSignIn(budget(1), 'a')
    expect(saveLocal).toHaveBeenCalledTimes(1)

    loadCloudBudget.mockResolvedValue({ state: budget(1), updatedAtMs: 1 })
    await mergeOnSignIn(budget(5), 'a')
    expect(saveCloudBudget).toHaveBeenCalledTimes(1)
  })
})
