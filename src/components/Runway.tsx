import { addDays, differenceInCalendarDays, endOfMonth, format, isAfter, startOfDay } from 'date-fns'
import { useMemo } from 'react'
import { calendarEvents, dayBalanceForecast } from '../domain/calendar'
import { formatMoney } from '../domain/money'
import { openingBalanceForRange } from '../domain/normalize'
import { periodRange } from '../domain/period'
import { runwayTone, runwayUntilPayday, type Runway as RunwayData } from '../domain/runway'
import { useBudgetStore } from '../state/budgetStore'
import { Money } from './ui'

/** Days of schedule to load; comfortably past any weekly, biweekly or monthly payday. */
const LOOKAHEAD_DAYS = 45

/** The runway always starts from the real today, whatever period the rest of the app shows. */
export function useRunway(): RunwayData & { monthEndBalance: number } {
  const income = useBudgetStore((s) => s.income)
  const expenses = useBudgetStore((s) => s.expenses)
  const goals = useBudgetStore((s) => s.goals)
  const currentBalance = useBudgetStore((s) => s.meta.currentBalance)
  const balanceMonth = useBudgetStore((s) => s.meta.balanceMonth)
  const weekStartsOn = useBudgetStore((s) => s.meta.weekStartsOn)

  return useMemo(() => {
    const today = startOfDay(new Date())
    const month = periodRange('monthly', today, weekStartsOn)
    const opening = openingBalanceForRange({
      income,
      expenses,
      goals,
      currentBalance,
      balanceMonth,
      range: month,
      weekStartsOn,
    })
    const monthEvents = calendarEvents({ income, expenses, goals, range: month })
    const balanceToday =
      dayBalanceForecast({
        startingBalance: opening,
        events: monthEvents,
        range: month,
        day: today,
      })?.openingBalance ?? opening
    const events = calendarEvents({
      income,
      expenses,
      goals,
      range: { start: today, end: addDays(today, LOOKAHEAD_DAYS) },
    })
    // Where the month lands once everything from today to its last day has posted.
    const monthEnd = endOfMonth(today)
    const monthEndBalance = monthEvents
      .filter((event) => !isAfter(today, startOfDay(event.date)) && !isAfter(event.date, monthEnd))
      .reduce((sum, event) => sum + (event.kind === 'income' ? event.amount : -event.amount), balanceToday)
    return { ...runwayUntilPayday({ balanceToday, events, today }), monthEndBalance }
  }, [income, expenses, goals, currentBalance, balanceMonth, weekStartsOn])
}

const W = 600
const H = 84
const PAD_Y = 10
const START = 18

export function Runway({ currency }: { currency: string }) {
  const runway = useRunway()
  const { payday, steps, bills, safe, perDay, days, billsTotal, end, monthEndBalance } = runway
  const today = steps[0].date
  const tone = runwayTone(safe, monthEndBalance)
  const over = tone !== 'safe'
  const toneText = tone === 'short' ? 'text-over' : 'text-due'
  const toneColor = tone === 'short' ? 'var(--color-over)' : tone === 'tight' ? 'var(--color-due)' : 'var(--color-cash)'
  const oneOffs = bills.filter((bill) => bill.oneOff).length
  const recurring = bills.length - oneOffs

  const shape = useMemo(() => {
    const balances = [...steps.map((s) => s.balance), 0]
    const max = Math.max(...balances)
    const min = Math.min(...balances)
    const span = max - min || 1
    // Bills due today still get a sliver of runway so their drop reads as a step.
    const x = (date: Date) =>
      START + (Math.min(days, Math.max(0, differenceInCalendarDays(date, today))) / days) * (W - START)
    const y = (value: number) => PAD_Y + ((max - value) / span) * (H - PAD_Y * 2)
    let d = `M0 ${y(steps[0].balance)}`
    for (const step of steps.slice(1)) {
      d += ` H${x(step.date)} V${y(step.balance)}`
    }
    d += ` H${W}`
    return {
      d,
      zeroY: y(0),
      dots: steps.slice(1).map((step) => ({
        key: step.event?.id ?? String(step.date.getTime()),
        cx: x(step.date),
        cy: y(step.balance),
        income: step.event?.kind === 'income',
      })),
    }
  }, [steps, days, today])

  const untilLabel =
    tone === 'tight'
      ? `Tight until ${payday ? `${format(payday.date, 'EEEE')}'s paycheck` : 'payday'}`
      : payday
        ? `Safe to spend until ${format(payday.date, 'EEEE')}'s paycheck`
        : `Safe to spend over the next ${days} days`
  const billWords = [
    recurring > 0 ? `${recurring} ${recurring === 1 ? 'bill' : 'bills'}` : null,
    oneOffs > 0 ? `${oneOffs} ${oneOffs === 1 ? 'one-off' : 'one-offs'}` : null,
  ]
    .filter(Boolean)
    .join(' + ')
  const whole = Math.trunc(Math.abs(safe))
  const cents = formatMoney(Math.abs(safe), currency).split('.')[1]
  const ticks = bills.slice(0, 4)
  // Re-key the drawing so the line draws in once whenever the schedule changes.
  const drawKey = `${safe.toFixed(2)}:${steps.length}:${end.getTime()}`

  return (
    <section className="rise-in mb-6" aria-label="Runway to next paycheck">
      <p className="text-sm text-paper-2">{untilLabel}</p>
      <p
        className={`mt-1 font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[52px] ${
          over ? toneText : 'text-paper'
        }`}
      >
        {over ? '−' : ''}
        {formatMoney(whole, currency).split('.')[0]}
        {cents != null && <span className="text-paper-3">.{cents}</span>}
      </p>
      <p className="mt-2 text-sm text-paper-2">
        {bills.length > 0 ? (
          <>
            after <Money value={billsTotal} currency={currency} /> in {billWords},{' '}
          </>
        ) : over ? (
          'No bills before then, but '
        ) : (
          'No bills before then, '
        )}
        {tone === 'short' ? (
          <span className="text-over">
            {bills.length > 0 ? 'short before payday' : "you're below zero"}, and the month ends below zero
          </span>
        ) : tone === 'tight' ? (
          <span className="text-due">
            {bills.length > 0 ? 'dipping below zero before payday' : "you're below zero until payday"}
          </span>
        ) : (
          <>
            <Money value={perDay} currency={currency} tone="cash" />
            <span className="text-cash"> a day</span> for {days} {days === 1 ? 'day' : 'days'}
          </>
        )}
      </p>
      {tone === 'tight' && (
        <p className="mt-1 text-sm text-cash">
          Covered by {payday ? `${format(payday.date, 'EEEE')}'s` : 'your next'} paycheck · month ends at{' '}
          <Money value={monthEndBalance} currency={currency} tone="cash" />
        </p>
      )}

      <div className="relative mt-5">
        <svg
          key={drawKey}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="runway-draw block h-[84px] w-full overflow-visible"
          role="img"
          aria-label={`Balance steps from ${formatMoney(steps[0].balance, currency)} today to ${formatMoney(safe, currency)} before ${format(end, 'MMM d')}`}
        >
          {shape.zeroY < H && shape.zeroY > 0 && (
            <line
              x1="0"
              x2={W}
              y1={shape.zeroY}
              y2={shape.zeroY}
              stroke={toneColor}
              strokeOpacity="0.35"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            d={`${shape.d} V${H} H0 Z`}
            fill={toneColor}
            opacity="0.07"
          />
          <path
            d={shape.d}
            fill="none"
            stroke={toneColor}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="0"
            x2={W}
            y1={H - 0.5}
            y2={H - 0.5}
            stroke="var(--color-rule-strong)"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Dots sit outside the stretched SVG so they stay round. */}
        {shape.dots.map((dot) => (
          <span
            key={dot.key}
            className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              dot.income ? 'bg-cash' : 'bg-due'
            }`}
            style={{ left: `${(dot.cx / W) * 100}%`, top: `${(dot.cy / H) * 100}%` }}
          />
        ))}
        {payday && (
          <span className="money absolute -top-5 right-0 text-xs text-cash">
            {format(payday.date, 'EEE')} +{formatMoney(payday.amount, currency)}
          </span>
        )}
      </div>

      <div className="money relative mt-2 h-4 text-xs text-paper-3">
        <span className="absolute left-0">Today</span>
        {ticks.map((bill, index) => {
          const pct = (differenceInCalendarDays(bill.date, today) / days) * 100
          // Keep crowded labels from overlapping: only label bills with room around them.
          const prev = index > 0 ? (differenceInCalendarDays(ticks[index - 1].date, today) / days) * 100 : 0
          if (pct < 12 || pct > 82 || pct - prev < 18) return null
          return (
            <span
              key={bill.id}
              className="absolute hidden -translate-x-1/2 whitespace-nowrap sm:inline"
              style={{ left: `${pct}%` }}
            >
              {format(bill.date, 'EEE')} {bill.name.length > 12 ? `${bill.name.slice(0, 11)}…` : bill.name}
            </span>
          )
        })}
        <span className="absolute right-0">{format(end, 'EEE MMM d')}</span>
      </div>
    </section>
  )
}
