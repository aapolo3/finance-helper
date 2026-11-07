import { useSyncExternalStore } from 'react'

/** Light paper, dark, or follow the device. Stored per device, never synced. */
export type Appearance = 'light' | 'dark' | 'system'

export const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

// index.html reads the same key before first paint, so the page never flashes.
const STORAGE_KEY = 'flow:appearance'
const listeners = new Set<() => void>()
let current: Appearance = read()

function read(): Appearance {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark') return value
  } catch {
    // Storage blocked: follow the device.
  }
  return 'system'
}

function systemDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

function apply() {
  const dark = current === 'dark' || (current === 'system' && systemDark())
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function setAppearance(value: Appearance) {
  current = value
  try {
    if (value === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Still applies for this visit.
  }
  apply()
  listeners.forEach((listener) => listener())
}

/** Apply the stored choice and keep "System" in step with the device setting. */
export function startAppearance() {
  apply()
  if (typeof matchMedia !== 'function') return
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (current === 'system') apply()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current)
}
