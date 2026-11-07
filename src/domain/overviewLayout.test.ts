import { describe, expect, it } from 'vitest'
import {
  defaultOverviewLayout,
  fullOverviewLayout,
  dragCard,
  growCard,
  hideCard,
  moveCard,
  normalizeOverviewLayout,
  overlaps,
  resizeCard,
  showCard,
} from './overviewLayout'

function visible(layout: ReturnType<typeof defaultOverviewLayout>) {
  return layout.filter((item) => item.visible)
}

function anyOverlap(layout: ReturnType<typeof defaultOverviewLayout>): boolean {
  const shown = visible(layout)
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      if (overlaps(shown[i], shown[j])) return true
    }
  }
  return false
}

describe('overviewLayout', () => {
  it('starts as a packed grid with the secondary cards behind Show more', () => {
    const layout = defaultOverviewLayout()
    expect(layout).toHaveLength(8)
    expect(layout.filter((item) => !item.visible).map((item) => item.id)).toEqual([
      'goals',
      'spending',
      'calendar',
    ])
    expect(anyOverlap(visible(layout))).toBe(false)
  })

  it('drops unknown cards and restores missing ones', () => {
    const layout = normalizeOverviewLayout([
      { id: 'balance', x: 1, y: 2, w: 4, h: 8, visible: true },
      { id: 'nope', x: 0, y: 0, w: 2, h: 2, visible: true },
    ])
    expect(layout.map((item) => item.id)).toContain('calendar')
    expect(layout.some((item) => item.id === ('nope' as 'balance'))).toBe(false)
    expect(layout.find((item) => item.id === 'balance')?.x).toBe(1)
    expect(anyOverlap(layout)).toBe(false)
  })

  it('pushes a card down when another card is dropped on it', () => {
    const layout = moveCard(fullOverviewLayout(), 'goals', 6, 4)
    expect(anyOverlap(layout)).toBe(false)
    const goals = layout.find((item) => item.id === 'goals')
    const spending = layout.find((item) => item.id === 'spending')
    expect(goals).toMatchObject({ x: 6, y: 4 })
    expect(spending!.y).toBe(goals!.y + goals!.h)
  })

  it('floats cards up so a move leaves no hole', () => {
    const layout = moveCard(fullOverviewLayout(), 'goals', 6, 4)
    const bills = layout.find((item) => item.id === 'bills')
    expect(bills).toMatchObject({ x: 0, y: 9 })
  })

  it('compacts the grid when a card is removed', () => {
    const layout = hideCard(fullOverviewLayout(), 'leftover')
    expect(layout.find((item) => item.id === 'spending')?.y).toBe(0)
    expect(anyOverlap(layout)).toBe(false)
  })

  it('moves a card and pushes whatever it covers downward', () => {
    const layout = moveCard(fullOverviewLayout(), 'leftover', 0, 0)
    const leftover = layout.find((item) => item.id === 'leftover')
    const balance = layout.find((item) => item.id === 'balance')
    expect(leftover).toMatchObject({ x: 0, y: 0 })
    expect(balance && leftover && overlaps(balance, leftover)).toBe(false)
    expect(balance!.y).toBeGreaterThanOrEqual(leftover!.y + leftover!.h)
    expect(anyOverlap(layout)).toBe(false)
  })

  it('keeps a resized card inside its minimum size', () => {
    const layout = resizeCard(fullOverviewLayout(), 'budget', 1, 1)
    expect(layout.find((item) => item.id === 'budget')).toMatchObject({ w: 3, h: 4 })
    expect(anyOverlap(layout)).toBe(false)
  })

  it('hides a card and can place it back on the grid', () => {
    const hidden = hideCard(fullOverviewLayout(), 'goals')
    expect(hidden.find((item) => item.id === 'goals')?.visible).toBe(false)
    const shown = showCard(hidden, 'goals')
    const goals = shown.find((item) => item.id === 'goals')
    expect(goals?.visible).toBe(true)
    expect(anyOverlap(shown)).toBe(false)
    const bottom = shown
      .filter((item) => item.visible && item.id !== 'goals')
      .reduce((max, item) => Math.max(max, item.y + item.h), 0)
    expect(goals!.y).toBeGreaterThanOrEqual(bottom)
  })

  it('only swaps a dragged card past a neighbour after crossing its middle', () => {
    const start = fullOverviewLayout()
    const nudged = dragCard(start, 'balance', 0, 1.5)
    expect(nudged.find((item) => item.id === 'balance')?.y).toBe(0)
    const swapped = dragCard(start, 'balance', 0, 3.5)
    expect(swapped.find((item) => item.id === 'goals')?.y).toBe(0)
    expect(swapped.find((item) => item.id === 'balance')?.y).toBe(6)
    expect(anyOverlap(swapped)).toBe(false)
  })

  it('drags a card into another column without overlaps', () => {
    const layout = dragCard(fullOverviewLayout(), 'goals', 6, 0)
    expect(layout.find((item) => item.id === 'goals')).toMatchObject({ x: 6, y: 0 })
    expect(anyOverlap(layout)).toBe(false)
  })

  it('grows a card, stretches its row neighbours, and pushes cards below', () => {
    const start = moveCard(fullOverviewLayout(), 'calendar', 0, 0)
    const calendar = start.find((item) => item.id === 'calendar')!
    const grown = growCard(start, 'calendar', 3)
    expect(grown.find((item) => item.id === 'calendar')?.h).toBe(calendar.h + 3)
    for (const item of start.filter((i) => i.visible && i.id !== 'calendar')) {
      expect(grown.find((g) => g.id === item.id)?.y).toBe(item.y + 3)
    }
    expect(anyOverlap(grown)).toBe(false)
  })

  it('stretches a side-by-side neighbour to the same bottom edge', () => {
    const start = fullOverviewLayout()
    const grown = growCard(start, 'bills', 2)
    const bills = grown.find((item) => item.id === 'bills')!
    const calendar = grown.find((item) => item.id === 'calendar')!
    expect(bills.h).toBe(9)
    expect(calendar.y).toBe(28)
    expect(anyOverlap(grown)).toBe(false)
  })
})
