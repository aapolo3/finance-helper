import { beforeEach, describe, expect, it, vi } from 'vitest'

function stubStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  })
  return items
}

describe('budgetOwner', () => {
  beforeEach(() => vi.resetModules())

  it('lets the first account claim unowned local data', async () => {
    stubStorage()
    const { localBudgetBelongsToOther } = await import('./budgetOwner')
    expect(localBudgetBelongsToOther('a')).toBe(false)
  })

  it('flags a different account, including after a reload', async () => {
    stubStorage({ 'flow:budget-owner': 'a' })
    const { localBudgetBelongsToOther } = await import('./budgetOwner')
    expect(localBudgetBelongsToOther('a')).toBe(false)
    expect(localBudgetBelongsToOther('b')).toBe(true)
  })

  it('keeps flagging in a tab whose stored owner another tab changed', async () => {
    const items = stubStorage({ 'flow:budget-owner': 'a' })
    const { localBudgetBelongsToOther } = await import('./budgetOwner')
    items.set('flow:budget-owner', 'b')
    expect(localBudgetBelongsToOther('b')).toBe(true)
  })

  it('stops flagging once the new owner is set', async () => {
    stubStorage({ 'flow:budget-owner': 'a' })
    const { localBudgetBelongsToOther, setLocalBudgetOwner } = await import('./budgetOwner')
    setLocalBudgetOwner('b')
    expect(localBudgetBelongsToOther('b')).toBe(false)
    expect(localBudgetBelongsToOther('a')).toBe(true)
  })

  it('flags every account once disowned, until a merge sets the owner', async () => {
    const items = stubStorage({ 'flow:budget-owner': 'a' })
    const { disownLocalBudget, localBudgetBelongsToOther, setLocalBudgetOwner } = await import('./budgetOwner')
    disownLocalBudget()
    expect(localBudgetBelongsToOther('a')).toBe(true)
    expect(localBudgetBelongsToOther('b')).toBe(true)
    vi.resetModules()
    const reloaded = await import('./budgetOwner')
    expect(items.get('flow:budget-owner')).toBe('')
    expect(reloaded.localBudgetBelongsToOther('b')).toBe(true)
    setLocalBudgetOwner('b')
    expect(localBudgetBelongsToOther('b')).toBe(false)
  })
})
