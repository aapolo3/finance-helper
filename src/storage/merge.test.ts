import { describe, expect, it } from 'vitest'
import { emptyBudget } from '../domain/demo'
import { pickNewer } from './merge'

function budget(updatedAtMs: number, name = 'Local') {
  const state = emptyBudget()
  state.meta.updatedAtMs = updatedAtMs
  state.income = [
    { id: '1', name, amount: 1, cadence: 'monthly', enabled: true },
  ]
  return state
}

describe('pickNewer', () => {
  it('keeps the remote budget when it is newer', () => {
    const picked = pickNewer(budget(100, 'Desktop'), {
      state: budget(200, 'Phone'),
      serverMs: 200,
    })
    expect(picked.winner).toBe('remote')
    expect(picked.state.income[0]?.name).toBe('Phone')
  })

  it('keeps the local budget when it is newer', () => {
    const picked = pickNewer(budget(300, 'Desktop'), {
      state: budget(200, 'Phone'),
      serverMs: 200,
    })
    expect(picked.winner).toBe('local')
    expect(picked.state.income[0]?.name).toBe('Desktop')
  })

  it('keeps local when timestamps are equal', () => {
    const picked = pickNewer(budget(200, 'Desktop'), {
      state: budget(200, 'Phone'),
      serverMs: 200,
    })
    expect(picked.winner).toBe('tie')
    expect(picked.state.income[0]?.name).toBe('Desktop')
  })

  it('prefers a cloud revision when local has never been stamped', () => {
    const local = budget(0, 'Desktop')
    const picked = pickNewer(local, {
      state: budget(0, 'Phone'),
      serverMs: 5000,
    })
    expect(picked.winner).toBe('remote')
    expect(picked.state.meta.updatedAtMs).toBe(5000)
    expect(picked.state.income[0]?.name).toBe('Phone')
  })
})
