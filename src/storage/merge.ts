import type { BudgetState } from '../domain/types'

/** Prefer an explicit client timestamp; fall back to the Firestore server time. */
export function revisionOf(updatedAtMs: number | undefined, serverMs = 0): number {
  if (typeof updatedAtMs === 'number' && Number.isFinite(updatedAtMs) && updatedAtMs > 0) {
    return updatedAtMs
  }
  return serverMs > 0 ? serverMs : 0
}

export function withRevision(state: BudgetState, revision: number): BudgetState {
  return {
    ...state,
    meta: { ...state.meta, updatedAtMs: revision },
  }
}

/**
 * Last-write-wins. Equal timestamps keep local.
 * Missing local timestamps (0) lose to a cloud doc that has a real revision.
 */
export function pickNewer(
  local: BudgetState,
  remote: { state: BudgetState; serverMs: number } | null,
): { state: BudgetState; winner: 'local' | 'remote' | 'tie' } {
  if (!remote) return { state: local, winner: 'local' }
  const localRev = revisionOf(local.meta.updatedAtMs, 0)
  const remoteRev = revisionOf(remote.state.meta.updatedAtMs, remote.serverMs)
  if (remoteRev > localRev) {
    return { state: withRevision(remote.state, remoteRev), winner: 'remote' }
  }
  if (localRev > remoteRev) return { state: local, winner: 'local' }
  return { state: local, winner: 'tie' }
}
