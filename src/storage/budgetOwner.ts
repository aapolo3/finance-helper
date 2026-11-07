const OWNER_KEY = 'flow:budget-owner'

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

// Kept in memory per tab: another tab can change the stored owner while this tab still holds the old budget.
let owner = readOwner()

/** Unowned data was made before any sign-in, so the first account to sign in may claim it. */
export function localBudgetBelongsToOther(uid: string): boolean {
  return owner !== null && owner !== uid
}

/** Before wiping: until a merge succeeds, what is left here belongs to nobody, so every account wipes it again. */
export function disownLocalBudget(): void {
  setLocalBudgetOwner('')
}

export function setLocalBudgetOwner(uid: string): void {
  owner = uid
  localStorage.setItem(OWNER_KEY, uid)
}
