import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from './types'
import {
  categoryColor,
  readableTextOn,
  getSankeyTheme,
  hashCategoryHue,
  normalizeSankeyTheme,
  sankeyNodeColor,
  SANKEY_THEME_PRESETS,
  SANKEY_THEMES,
} from './sankeyThemes'

describe('sankeyThemes', () => {
  it('normalizes unknown theme ids to classic', () => {
    expect(normalizeSankeyTheme(undefined)).toBe('classic')
    expect(normalizeSankeyTheme('nope')).toBe('classic')
    expect(normalizeSankeyTheme('ocean')).toBe('ocean')
  })

  it('gives each default category a distinct color within a theme', () => {
    for (const id of SANKEY_THEMES) {
      const theme = SANKEY_THEME_PRESETS[id]
      const colors = DEFAULT_CATEGORIES.map((c) => categoryColor(theme, c))
      expect(new Set(colors).size).toBe(DEFAULT_CATEGORIES.length)
    }
  })

  it('hashes custom categories stably', () => {
    const theme = getSankeyTheme('classic')
    expect(categoryColor(theme, 'Pets')).toBe(categoryColor(theme, 'Pets'))
    expect(hashCategoryHue('Pets')).toBe(hashCategoryHue('Pets'))
    expect(categoryColor(theme, 'Pets')).not.toBe(categoryColor(theme, 'Travel'))
  })

  it('darkens expense leaves relative to their category', () => {
    const theme = getSankeyTheme('classic')
    const cat = sankeyNodeColor(theme, 'category', 'Housing')
    const exp = sankeyNodeColor(theme, 'expense', 'Housing')
    expect(exp).not.toBe(cat)
    expect(exp).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('readableTextOn', () => {
  it('uses paper text on dark saturated fills', () => {
    expect(readableTextOn('#1d4ed8')).toBe('#e9ece6')
    expect(readableTextOn('#854d0e')).toBe('#e9ece6')
  })
  it('uses ink text on light fills', () => {
    expect(readableTextOn('#7fc8a0')).toBe('#0e1113')
    expect(readableTextOn('#e8d36a')).toBe('#0e1113')
  })
})
