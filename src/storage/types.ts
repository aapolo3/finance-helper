import type { BudgetState } from '../domain/types'

export interface BudgetStore {
  load(): Promise<BudgetState>
  save(state: BudgetState): Promise<void>
}
