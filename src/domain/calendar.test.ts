import { describe, expect, it } from 'vitest'
import { dayBalanceForecast, type CalendarEvent } from './calendar'
import { periodRange } from './period'

describe('dayBalanceForecast', () => {
  it('projects opening and closing balance through the selected day', () => {
    const range = periodRange('weekly', new Date(2026, 9, 7), 1) // Oct 5–11
    const events: CalendarEvent[] = [
      {
        id: '1',
        kind: 'income',
        name: 'Pay',
        amount: 1000,
        date: new Date(2026, 9, 9),
      },
      {
        id: '2',
        kind: 'expense',
        name: 'Rent piece',
        amount: 400,
        date: new Date(2026, 9, 9),
      },
      {
        id: '3',
        kind: 'expense',
        name: 'Food',
        amount: 50,
        date: new Date(2026, 9, 10),
      },
    ]

    const fri = dayBalanceForecast({
      startingBalance: 200,
      events,
      range,
      day: new Date(2026, 9, 9),
    })
    expect(fri?.openingBalance).toBe(200)
    expect(fri?.incomeToday).toBe(1000)
    expect(fri?.expensesToday).toBe(400)
    expect(fri?.closingBalance).toBe(800)
    expect(fri?.canCoverToday).toBe(true)

    const sat = dayBalanceForecast({
      startingBalance: 200,
      events,
      range,
      day: new Date(2026, 9, 10),
    })
    expect(sat?.openingBalance).toBe(800)
    expect(sat?.closingBalance).toBe(750)
  })

  it('flags when bills exceed available cash that day', () => {
    const range = periodRange('weekly', new Date(2026, 9, 7), 1)
    const events: CalendarEvent[] = [
      {
        id: '1',
        kind: 'expense',
        name: 'Big bill',
        amount: 500,
        date: new Date(2026, 9, 6),
      },
    ]
    const forecast = dayBalanceForecast({
      startingBalance: 100,
      events,
      range,
      day: new Date(2026, 9, 6),
    })
    expect(forecast?.canCoverToday).toBe(false)
    expect(forecast?.shortfallToday).toBe(400)
    expect(forecast?.endsNegative).toBe(true)
  })

  it('subtracts goal contributions from the predicted balance', () => {
    const range = periodRange('weekly', new Date(2026, 9, 7), 1)
    const events: CalendarEvent[] = [
      {
        id: 'g',
        kind: 'goal',
        name: 'Emergency',
        amount: 100,
        date: new Date(2026, 9, 6),
      },
    ]
    const forecast = dayBalanceForecast({
      startingBalance: 40,
      events,
      range,
      day: new Date(2026, 9, 6),
    })
    expect(forecast?.goalsToday).toBe(100)
    expect(forecast?.closingBalance).toBe(-60)
    expect(forecast?.canCoverToday).toBe(false)
    expect(forecast?.shortfallToday).toBe(60)
  })
})
