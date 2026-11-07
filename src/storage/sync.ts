import type { BudgetState } from '../domain/types'
import { pickNewer } from './merge'
import { loadCloudBudget, saveCloudBudget } from './firestoreBudget'
import { indexedDbStore } from './indexedDb'

/**
 * On Google sign-in: keep the newer of local vs cloud (by updatedAtMs).
 * Uploads local only when it is strictly newer or the cloud doc is missing.
 * isCurrent: false once this sign-in has been replaced, and then the merge writes nothing.
 */
export async function mergeOnSignIn(
  local: BudgetState,
  uid: string,
  isCurrent: () => boolean = () => true,
): Promise<BudgetState> {
  const { state: remote, updatedAtMs } = await loadCloudBudget(uid)
  const picked = pickNewer(
    local,
    remote ? { state: remote, serverMs: updatedAtMs } : null,
  )
  if (!isCurrent()) return picked.state

  if (picked.winner === 'remote') {
    await indexedDbStore.save(picked.state)
    return picked.state
  }

  if (picked.winner === 'local') {
    await saveCloudBudget(uid, local, { reason: 'push' })
  }
  return local
}
