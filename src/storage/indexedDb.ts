import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { emptyBudget } from '../domain/demo'
import { normalizeBudgetState } from '../domain/migrate'
import type { BudgetState } from '../domain/types'
import type { BudgetStore } from './types'

interface BudgetDB extends DBSchema {
  budget: {
    key: string
    value: BudgetState
  }
}

const DB_NAME = 'finance-helper'
const STORE = 'budget'
const KEY = 'current'

let dbPromise: Promise<IDBPDatabase<BudgetDB>> | null = null

function db(): Promise<IDBPDatabase<BudgetDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BudgetDB>(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore(STORE)
      },
    })
  }
  return dbPromise
}

export const indexedDbStore: BudgetStore = {
  async load() {
    const stored = await (await db()).get(STORE, KEY)
    return normalizeBudgetState(stored ?? emptyBudget())
  },
  async save(state) {
    await (await db()).put(STORE, state, KEY)
  },
}

export async function clearIndexedDb(): Promise<void> {
  await (await db()).delete(STORE, KEY)
}
