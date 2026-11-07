import { beforeEach, describe, expect, it, vi } from 'vitest'

const order: string[] = []
const signOut = vi.fn(async () => {
  order.push('signOut')
})
const hasPendingPersist = vi.fn(() => false)
const flushPersist = vi.fn(async () => {
  order.push('flush')
})

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut,
}))
vi.mock('../lib/firebase', () => ({ auth: {}, googleProvider: {} }))
vi.mock('../storage/cloudSync', () => ({
  onCloudSyncStatus: vi.fn(),
  restoreHistoryEntry: vi.fn(),
  saveCheckpoint: vi.fn(),
  startCloudSync: vi.fn(),
  stopCloudSync: vi.fn(() => {
    order.push('stop')
  }),
  syncNow: vi.fn(),
}))
vi.mock('../storage/budgetHistory', () => ({}))
vi.mock('../storage/budgetOwner', () => ({}))
vi.mock('../storage/firestoreBudget', () => ({}))
vi.mock('../storage/indexedDb', () => ({}))
vi.mock('../storage/paletteSync', () => ({}))
vi.mock('../storage/sync', () => ({}))
vi.mock('./budgetStore', () => ({
  cancelPendingPersist: vi.fn(),
  dropQueuedCloudWrites: vi.fn(),
  hasPendingPersist,
  setCloudWriteUid: vi.fn(),
  useBudgetStore: { getState: () => ({ flushPersist }) },
}))

describe('signOutUser', () => {
  beforeEach(() => {
    order.length = 0
    flushPersist.mockClear()
  })

  it('flushes pending saves before signing out', async () => {
    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().signOutUser()
    expect(order).toEqual(['flush', 'stop', 'signOut'])
  })

  it('flushes again when an edit arrived during the wait', async () => {
    hasPendingPersist.mockReturnValueOnce(true)
    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().signOutUser()
    expect(order).toEqual(['flush', 'flush', 'stop', 'signOut'])
  })

  it('still signs out when the flush fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    flushPersist.mockRejectedValueOnce(new Error('offline'))
    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().signOutUser()
    expect(signOut).toHaveBeenCalled()
    expect(useAuthStore.getState().busy).toBe(false)
    warn.mockRestore()
  })
})
