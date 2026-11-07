import type { ActivityEntry } from './types'

export const ACTIVITY_LIMIT = 100

export function appendActivity(
  log: ActivityEntry[],
  entry: ActivityEntry,
): ActivityEntry[] {
  return [entry, ...log].slice(0, ACTIVITY_LIMIT)
}
