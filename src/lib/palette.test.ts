import { describe, expect, it } from 'vitest'
import { parsePalette } from './palette'

describe('parsePalette', () => {
  it('accepts known palettes only', () => {
    expect(parsePalette('blue-mono')).toBe('blue-mono')
    expect(parsePalette('neon')).toBeNull()
    expect(parsePalette(undefined)).toBeNull()
  })
})
