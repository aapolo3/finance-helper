import { useSyncExternalStore } from 'react'

/** Page, text and money-in colors, shown as the swatches in Settings. */
type Swatch = [ground: string, text: string, cash: string]

// Token values live in src/index.css under :root[data-palette='<id>'].
export const PALETTES = [
  { id: 'paper', label: 'Paper', light: ['#f3f0e8', '#1b1d1b', '#1f6b46'], dark: ['#161513', '#ece8de', '#76c79a'] },
  { id: 'linen', label: 'Linen', light: ['#f7f5f0', '#161816', '#17694a'], dark: ['#232220', '#f1eee7', '#84d4a8'] },
  { id: 'fog', label: 'Fog', light: ['#eef0ee', '#14181a', '#0f6b57'], dark: ['#0e1211', '#e8ecea', '#6ccb9c'] },
  { id: 'harbor', label: 'Harbor', light: ['#e8edf4', '#101a2b', '#0f6a4a'], dark: ['#0d1522', '#e6edf7', '#62cfa5'] },
  { id: 'plum', label: 'Plum', light: ['#f3eef6', '#1e1424', '#0f6a4a'], dark: ['#1a1220', '#f0e9f5', '#62cfa5'] },
  { id: 'moss', label: 'Moss', light: ['#e5eee0', '#0f1f14', '#0f6748'], dark: ['#0c1a12', '#e7f2ea', '#62cfa5'] },
  { id: 'mono', label: 'Mono', light: ['#fafafa', '#0a0a0a', '#0f6a4a'], dark: ['#000000', '#fafafa', '#62cfa5'] },
  { id: 'blue-mono', label: 'Blue mono', light: ['#f8f9fb', '#0a0c10', '#0f6a4a'], dark: ['#05070b', '#f9fafc', '#62cfa5'] },
] as const satisfies readonly { id: string; label: string; light: Swatch; dark: Swatch }[]

export type PaletteId = (typeof PALETTES)[number]['id']

export const DEFAULT_PALETTE: PaletteId = 'paper'

/** A stored or synced value, or null when it isn't a palette this version knows. */
export function parsePalette(value: unknown): PaletteId | null {
  return PALETTES.find((palette) => palette.id === value)?.id ?? null
}

// index.html reads the same key before first paint, so the page never flashes.
const STORAGE_KEY = 'flow:palette'
const listeners = new Set<() => void>()
let current: PaletteId = read()

function read(): PaletteId {
  try {
    return parsePalette(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_PALETTE
  } catch {
    return DEFAULT_PALETTE
  }
}

export function getPalette(): PaletteId {
  return current
}

/** Apply a palette on this device. paletteSync.ts handles the cloud copy. */
export function applyPalette(value: PaletteId) {
  current = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Still applies for this visit.
  }
  document.documentElement.dataset.palette = value
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePalette(): PaletteId {
  return useSyncExternalStore(subscribe, () => current)
}
