import { describe, expect, it } from 'vitest'
import { goalContributionDatesInPeriod, goalProjection } from './goals'
import { periodRange } from './period'

describe('goalProjection', () => {
  it('computes periods remaining and an estimated date', () => {
    const projection = goalProjection(
      {
        id: 'g',
        name: 'Bike',
        targetAmount: 500,
        savedAmount: 100,
        contributionAmount: 100,
        contributionCadence: 'monthly',
        startDate: '2026-10-01',
      },
      new Date(2026, 9, 1),
    )
    expect(projection.periodsRemaining).toBe(4)
    expect(projection.estimatedDate?.getFullYear()).toBe(2027)
    expect(projection.estimatedDate?.getMonth()).toBe(1)
    expect(projection.estimatedDate?.getDate()).toBe(1)
    expect(projection.percentFunded).toBe(20)
  })

  it('marks a fully funded goal as done', () => {
    const projection = goalProjection({
      id: 'g',
      name: 'Done',
      targetAmount: 200,
      savedAmount: 200,
      contributionAmount: 20,
      contributionCadence: 'weekly',
      startDate: '2026-10-01',
    })
    expect(projection.funded).toBe(true)
    expect(projection.periodsRemaining).toBe(0)
  })
})

describe('goalContributionDatesInPeriod', () => {
  const goal = {
    id: 'g',
    name: 'Bike',
    targetAmount: 500,
    savedAmount: 0,
    contributionAmount: 50,
    contributionCadence: 'weekly' as const,
    startDate: '2026-10-16',
  }

  it('starts on the goal start date and skips earlier days', () => {
    const oct = periodRange('monthly', new Date(2026, 9, 15))
    const dates = goalContributionDatesInPeriod(goal, oct)
    expect(dates[0]?.getDate()).toBe(16)
    expect(dates.every((d) => d.getDate() >= 16)).toBe(true)
    expect(dates.length).toBeGreaterThanOrEqual(2)
  })

  it('returns nothing for a period that ends before the start date', () => {
    const earlyWeek = periodRange('weekly', new Date(2026, 9, 7), 1)
    expect(goalContributionDatesInPeriod(goal, earlyWeek)).toEqual([])
  })
})
