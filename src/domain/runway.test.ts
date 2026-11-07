import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './calendar'
import { RUNWAY_FALLBACK_DAYS, runwayTone, runwayUntilPayday } from './runway'

const day = (iso: string) => new Date(`${iso}T00:00:00`)

function ev(
  kind: CalendarEvent['kind'],
  iso: string,
  amount: number,
  name: string = kind,
): CalendarEvent {
  return { id: `${kind}:${iso}:${name}`, kind, name, amount, date: day(iso) }
}

describe('runwayUntilPayday', () => {
  it('subtracts bills due before the next paycheck', () => {
    const runway = runwayUntilPayday({
      balanceToday: 500,
      today: day('2026-11-02'),
      events: [
        ev('expense', '2026-11-03', 35, 'Visa'),
        ev('goal', '2026-11-04', 40, 'Car'),
        ev('income', '2026-11-06', 375, 'Paycheck'),
        ev('expense', '2026-11-08', 100, 'After payday'),
      ],
    })
    expect(runway.payday?.name).toBe('Paycheck')
    expect(runway.bills.map((b) => b.name)).toEqual(['Visa', 'Car'])
    expect(runway.billsTotal).toBe(75)
    expect(runway.safe).toBe(425)
    expect(runway.days).toBe(4)
    expect(runway.perDay).toBeCloseTo(106.25)
    expect(runway.steps.map((s) => s.balance)).toEqual([500, 465, 425])
  })

  it('leaves a bill on payday itself to the new paycheck', () => {
    const runway = runwayUntilPayday({
      balanceToday: 200,
      today: day('2026-11-02'),
      events: [ev('income', '2026-11-06', 375), ev('expense', '2026-11-06', 50)],
    })
    expect(runway.bills).toHaveLength(0)
    expect(runway.safe).toBe(200)
  })

  it("counts income and bills on today's date", () => {
    const runway = runwayUntilPayday({
      balanceToday: 10,
      today: day('2026-11-02'),
      events: [
        ev('income', '2026-11-02', 100, 'Today pay'),
        ev('expense', '2026-11-02', 30),
        ev('income', '2026-11-09', 100, 'Next pay'),
      ],
    })
    expect(runway.payday?.name).toBe('Next pay')
    expect(runway.safe).toBe(80)
  })

  it('looks a fixed window ahead when no paycheck is scheduled', () => {
    const runway = runwayUntilPayday({
      balanceToday: 300,
      today: day('2026-11-02'),
      events: [ev('expense', '2026-11-20', 120), ev('expense', '2026-12-30', 999)],
    })
    expect(runway.payday).toBeNull()
    expect(runway.days).toBe(RUNWAY_FALLBACK_DAYS)
    expect(runway.safe).toBe(180)
  })

  it('reports an overspent stretch without a negative daily allowance', () => {
    const runway = runwayUntilPayday({
      balanceToday: 20,
      today: day('2026-11-02'),
      events: [ev('expense', '2026-11-03', 60), ev('income', '2026-11-05', 375)],
    })
    expect(runway.safe).toBe(-40)
    expect(runway.perDay).toBe(0)
  })
})

describe('runwayTone', () => {
  it('is safe when the balance stays above zero before payday', () => {
    expect(runwayTone(120, 900)).toBe('safe')
  })
  it('is tight when a later paycheck covers the shortfall', () => {
    expect(runwayTone(-622.98, 1361.01)).toBe('tight')
  })
  it('is short when the month itself ends below zero', () => {
    expect(runwayTone(-622.98, -40)).toBe('short')
  })
})
