import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('firebaseLoader', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('./firebaseApi', () => ({ db: {} }))
  })

  it('reports not loaded until the load finishes', async () => {
    const { loadFirebase, loadedFirebase, requireFirebase } = await import('./firebaseLoader')
    expect(loadedFirebase()).toBeNull()
    expect(() => requireFirebase()).toThrow('before it loaded')
    const api = await loadFirebase()
    expect(loadedFirebase()).toBe(api)
    expect(requireFirebase()).toBe(api)
  })

  it('tries again after a failed load', async () => {
    vi.doMock('./firebaseApi', () => {
      throw new Error('chunk failed')
    })
    const { loadFirebase, loadedFirebase } = await import('./firebaseLoader')
    await expect(loadFirebase()).rejects.toThrow('Check your connection')
    expect(loadedFirebase()).toBeNull()
    vi.resetModules()
    vi.doMock('./firebaseApi', () => ({ db: {} }))
    await expect(loadFirebase()).resolves.toBeTruthy()
  })
})
