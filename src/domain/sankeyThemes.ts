import {
  DEFAULT_CATEGORIES,
  SANKEY_THEMES,
  type DefaultCategory,
  type SankeyThemeId,
} from './types'

export type { SankeyThemeId }
export { SANKEY_THEMES }

export type SankeyKind =
  | 'balance'
  | 'income'
  | 'available'
  | 'category'
  | 'expense'
  | 'leftover'
  | 'shortfall'
  | 'goal'
  | 'unallocated'

export type SankeyTheme = {
  id: SankeyThemeId
  label: string
  description: string
  kinds: Record<Exclude<SankeyKind, 'category' | 'expense'>, string>
  categories: Record<DefaultCategory, string>
  /** HSL saturation/lightness band for hashing custom category names. */
  custom: { saturation: number; lightness: number }
  /** Expense leaf relative to its category color. */
  expenseAdjust: { lightnessDelta: number }
}

export const SANKEY_THEME_PRESETS: Record<SankeyThemeId, SankeyTheme> = {
  paper: {
    id: 'paper',
    label: 'Paper',
    description: 'Muted mid-tone inks that read on light paper and in dark mode.',
    kinds: {
      balance: '#8a8f88',
      income: '#3f9a6c',
      available: '#8f8a80',
      leftover: '#3f9a6c',
      shortfall: '#c4505a',
      goal: '#8c6fc8',
      unallocated: '#4aa077',
    },
    categories: {
      Housing: '#5a7fcf',
      Utilities: '#c4a033',
      Food: '#cf7440',
      Transport: '#3a9bad',
      Subscriptions: '#8a939d',
      Entertainment: '#c1609a',
      Healthcare: '#c9687c',
      'Credit cards': '#a8586a',
      Debt: '#9a4a5a',
      Personal: '#7f9a3a',
      Other: '#8a857c',
    },
    custom: { saturation: 45, lightness: 50 },
    expenseAdjust: { lightnessDelta: -8 },
  },
  classic: {
    id: 'classic',
    label: 'Classic',
    description: 'Cool slate structure with distinct category blues and teals.',
    kinds: {
      balance: '#0e7490',
      income: '#0f766e',
      available: '#334155',
      leftover: '#15803d',
      shortfall: '#b91c1c',
      goal: '#7c3aed',
      unallocated: '#a16207',
    },
    categories: {
      Housing: '#1d4ed8',
      Utilities: '#ca8a04',
      Food: '#c2410c',
      Transport: '#0e7490',
      Subscriptions: '#7c3aed',
      Entertainment: '#db2777',
      Healthcare: '#059669',
      'Credit cards': '#be123c',
      Debt: '#9f1239',
      Personal: '#65a30d',
      Other: '#57534e',
    },
    custom: { saturation: 55, lightness: 42 },
    expenseAdjust: { lightnessDelta: -10 },
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset',
    description: 'Warm coral and amber tones across spending categories.',
    kinds: {
      balance: '#b45309',
      income: '#c2410c',
      available: '#44403c',
      leftover: '#15803d',
      shortfall: '#991b1b',
      goal: '#a21caf',
      unallocated: '#ca8a04',
    },
    categories: {
      Housing: '#ea580c',
      Utilities: '#7c3aed',
      Food: '#dc2626',
      Transport: '#d97706',
      Subscriptions: '#db2777',
      Entertainment: '#9333ea',
      Healthcare: '#0f766e',
      'Credit cards': '#e11d48',
      Debt: '#9f1239',
      Personal: '#65a30d',
      Other: '#78716c',
    },
    custom: { saturation: 62, lightness: 45 },
    expenseAdjust: { lightnessDelta: -12 },
  },
  forest: {
    id: 'forest',
    label: 'Forest',
    description: 'Earth greens and mossy browns for a calmer chart.',
    kinds: {
      balance: '#3f6212',
      income: '#166534',
      available: '#365314',
      leftover: '#15803d',
      shortfall: '#9f1239',
      goal: '#0f766e',
      unallocated: '#854d0e',
    },
    categories: {
      Housing: '#4d7c0f',
      Utilities: '#1d4ed8',
      Food: '#b45309',
      Transport: '#0f766e',
      Subscriptions: '#047857',
      Entertainment: '#7c3aed',
      Healthcare: '#be123c',
      'Credit cards': '#a16207',
      Debt: '#9a3412',
      Personal: '#0369a1',
      Other: '#57534e',
    },
    custom: { saturation: 48, lightness: 38 },
    expenseAdjust: { lightnessDelta: -8 },
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    description: 'Deep blues and aquas with cool category accents.',
    kinds: {
      balance: '#0369a1',
      income: '#0e7490',
      available: '#1e3a5f',
      leftover: '#0f766e',
      shortfall: '#b91c1c',
      goal: '#4f46e5',
      unallocated: '#b45309',
    },
    categories: {
      Housing: '#1d4ed8',
      Utilities: '#ca8a04',
      Food: '#0891b2',
      Transport: '#0284c7',
      Subscriptions: '#6366f1',
      Entertainment: '#db2777',
      Healthcare: '#059669',
      'Credit cards': '#7c3aed',
      Debt: '#be185d',
      Personal: '#c2410c',
      Other: '#64748b',
    },
    custom: { saturation: 58, lightness: 44 },
    expenseAdjust: { lightnessDelta: -10 },
  },
}

export const DEFAULT_SANKEY_THEME: SankeyThemeId = 'classic'

export function normalizeSankeyTheme(value: unknown): SankeyThemeId {
  if (typeof value === 'string' && (SANKEY_THEMES as readonly string[]).includes(value)) {
    return value as SankeyThemeId
  }
  return DEFAULT_SANKEY_THEME
}

export function getSankeyTheme(id: SankeyThemeId | string | undefined): SankeyTheme {
  return SANKEY_THEME_PRESETS[normalizeSankeyTheme(id)]
}

/** Stable 0–359 hue from a category name. */
export function hashCategoryHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return hash % 360
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = clamp(s, 0, 100) / 100
  const ln = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let rn = 0
  let gn = 0
  let bn = 0
  if (hp < 1) [rn, gn, bn] = [c, x, 0]
  else if (hp < 2) [rn, gn, bn] = [x, c, 0]
  else if (hp < 3) [rn, gn, bn] = [0, c, x]
  else if (hp < 4) [rn, gn, bn] = [0, x, c]
  else if (hp < 5) [rn, gn, bn] = [x, 0, c]
  else [rn, gn, bn] = [c, 0, x]
  const m = ln - c / 2
  const toHex = (v: number) =>
    Math.round(clamp((v + m) * 255, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(rn)}${toHex(gn)}${toHex(bn)}`
}

function adjustLightness(hex: string, delta: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
  return hslToHex(hsl.h, hsl.s, hsl.l + delta)
}

export function categoryColor(theme: SankeyTheme, category: string): string {
  if ((DEFAULT_CATEGORIES as readonly string[]).includes(category)) {
    return theme.categories[category as DefaultCategory]
  }
  const hue = hashCategoryHue(category)
  return hslToHex(hue, theme.custom.saturation, theme.custom.lightness)
}

export function sankeyNodeColor(
  theme: SankeyTheme,
  kind: SankeyKind,
  category?: string,
): string {
  if (kind === 'category') {
    return category ? categoryColor(theme, category) : theme.kinds.available
  }
  if (kind === 'expense') {
    const base = category ? categoryColor(theme, category) : '#57534e'
    return adjustLightness(base, theme.expenseAdjust.lightnessDelta)
  }
  return theme.kinds[kind]
}

/** Ink or paper, whichever reads better on a filled swatch of `hex`. */
export function readableTextOn(hex: string): string {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  // Contrast against ink (#0e1113, L≈0.0056) vs paper (#e9ece6, L≈0.83).
  return (lum + 0.05) / 0.0556 >= 0.88 / (lum + 0.05) ? '#0e1113' : '#e9ece6'
}
