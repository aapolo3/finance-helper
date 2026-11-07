import {
  format,
  isSameDay,
  isToday,
} from 'date-fns'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  calendarEvents,
  calendarGridDays,
  dayBalanceForecast,
  dayInFocusMonth,
  dayInPeriod,
  eventsOnDay,
  netForDay,
  weekdayLabels,
  type CalendarEvent,
  type DayBalanceForecast,
} from '../domain/calendar'
import { formatMoney, formatMoneyCompact } from '../domain/money'
import { AnimatedMoney } from './AnimatedMoney'
import { useCardGrowth } from './cardGrowth'
import type {
  DateRange,
  Expense,
  Goal,
  IncomeSource,
  ViewPeriod,
  WeekStartsOn,
} from '../domain/types'

/** Matches the `gap-4` between the month grid and the day panel. */
const GAP_PX = 16

type CashflowCalendarProps = {
  income: IncomeSource[]
  expenses: Expense[]
  goals: Goal[]
  view: ViewPeriod
  range: DateRange
  anchorDate: string
  currency: string
  weekStartsOn: WeekStartsOn
  currentBalance: number
  reservedNote?: string
  /** Pages that already title themselves hide the card's own heading. */
  hideTitle?: boolean
}

export function CashflowCalendar({
  income,
  expenses,
  goals,
  view,
  range,
  anchorDate,
  currency,
  weekStartsOn,
  currentBalance,
  reservedNote,
  hideTitle = false,
}: CashflowCalendarProps) {
  const anchor = useMemo(
    () => new Date(`${anchorDate}T00:00:00`),
    [anchorDate],
  )

  const events = useMemo(
    () => calendarEvents({ income, expenses, goals, range }),
    [income, expenses, goals, range],
  )

  const days = useMemo(
    () => calendarGridDays(view, anchor, weekStartsOn),
    [view, anchor, weekStartsOn],
  )

  const labels = weekdayLabels(weekStartsOn)

  const [selected, setSelectedState] = useState<Date | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const unlockTimer = useRef<number | null>(null)
  // While the day panel opens or closes, the month grid holds its height so the card
  // growing around it never squeezes or stretches the days.
  const [lockedHeight, setLockedHeight] = useState<number | null>(null)
  const { grow, editing } = useCardGrowth()

  const setSelected = (next: Date | null | ((current: Date | null) => Date | null)) => {
    if (unlockTimer.current != null) window.clearTimeout(unlockTimer.current)
    const grid = gridRef.current
    if (grid && lockedHeight == null) setLockedHeight(grid.offsetHeight)
    setSelectedState((current) => {
      const value = typeof next === 'function' ? next(current) : next
      if (value == null) {
        // Release once the card has finished shrinking back (grid reflow is 260ms).
        unlockTimer.current = window.setTimeout(() => setLockedHeight(null), 320)
      }
      return value
    })
  }

  useEffect(
    () => () => {
      if (unlockTimer.current != null) window.clearTimeout(unlockTimer.current)
    },
    [],
  )

  // Layout editing keeps cards at their saved size, so fold the day panel away.
  useEffect(() => {
    if (editing) setSelectedState(null)
  }, [editing])

  // Ask the overview grid for room before paint, so the panel never flashes in squeezed.
  useLayoutEffect(() => {
    const node = detailRef.current
    if (!selected || !node) {
      grow(0)
      return
    }
    const report = () => grow(node.offsetHeight > 0 ? node.offsetHeight + GAP_PX : 0)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(node)
    return () => observer.disconnect()
  }, [selected, grow])

  useEffect(() => () => grow(0), [grow])
  const selectedEvents = selected ? eventsOnDay(events, selected) : []

  // One highlight that glides between days instead of borders snapping on and off.
  const [ring, setRing] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const ringFrom = useRef<'fresh' | 'moving'>('fresh')
  useLayoutEffect(() => {
    const grid = gridRef.current
    const node = selected
      ? grid?.querySelector<HTMLElement>(`[data-day="${selected.toDateString()}"]`)
      : null
    if (!node) {
      ringFrom.current = 'fresh'
      setRing(null)
      return
    }
    const measure = () =>
      setRing({ x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
      ringFrom.current = 'moving'
    }
  }, [selected, days])

  // Which way the day panel's contents travel: later days arrive from the right.
  const previousDay = useRef<Date | null>(null)
  const dayStep = selected && previousDay.current ? Math.sign(selected.getTime() - previousDay.current.getTime()) : 0
  useEffect(() => {
    previousDay.current = selected
  }, [selected])
  const weekRows = Math.max(1, Math.ceil(days.length / 7))

  useEffect(() => {
    setSelectedState(null)
    setLockedHeight(null)
  }, [anchorDate, view])

  const forecast = useMemo(() => {
    if (!selected) return null
    return dayBalanceForecast({
      startingBalance: currentBalance,
      events,
      range,
      day: selected,
    })
  }, [selected, currentBalance, events, range])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div>
          {!hideTitle && <h2 className="text-sm font-medium text-paper">Calendar</h2>}
          <p className="text-sm text-zinc-500">
            Paydays and bills in this {view === 'weekly' ? 'week' : 'month'}. Tap a day
            for predicted balance.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
          <LegendDot className="bg-emerald-600" label="Income" />
          <LegendDot className="bg-rose-600" label="Expense" />
          <LegendDot className="bg-violet-600" label="Goal" />
        </div>
      </div>

      <div
        ref={gridRef}
        key={`${view}:${anchorDate}`}
        className={`relative grid min-h-0 grid-cols-7 gap-1 xl:min-h-0 ${
          lockedHeight == null ? 'flex-1' : 'flex-none'
        }`}
        style={{
          gridTemplateRows: `auto repeat(${weekRows}, minmax(0, 1fr))`,
          height: lockedHeight ?? undefined,
        }}
      >
        {ring && (
          <span
            aria-hidden="true"
            className={`cal-ring pointer-events-none absolute top-0 left-0 z-10 rounded-xl ring-[1.5px] ring-cash/80 ${
              ringFrom.current === 'fresh' ? 'cal-ring-fresh' : ''
            }`}
            style={{ translate: `${ring.x}px ${ring.y}px`, width: ring.w, height: ring.h }}
          />
        )}
        {labels.map((label) => (
          <div
            key={label}
            className="px-1 pb-1 text-center money text-xs text-paper-3"
          >
            {label}
          </div>
        ))}

        {days.map((day, index) => {
          const dayEvents = eventsOnDay(events, day)
          const inPeriod = dayInPeriod(day, range)
          const inMonth = view === 'weekly' || dayInFocusMonth(day, anchor)
          const active = selected && isSameDay(day, selected)
          const net = netForDay(dayEvents)
          const incomeCount = dayEvents.filter((e) => e.kind === 'income').length
          const expenseCount = dayEvents.filter((e) => e.kind === 'expense').length

          return (
            <button
              key={day.toISOString()}
              data-day={day.toDateString()}
              type="button"
              aria-pressed={!!active}
              onClick={() =>
                setSelected((current) =>
                  current && isSameDay(current, day) ? null : day,
                )
              }
              style={{ '--i': Math.floor(index / 7) + (index % 7) } as React.CSSProperties}
              className={`cal-day flex h-full min-h-[3.75rem] flex-col rounded-xl border border-transparent p-1 text-left xl:min-h-0 xl:p-1.5 ${
                active
                  ? 'bg-cash/12'
                  : 'bg-ledger-2 hover:border-rule-strong hover:bg-ledger-3'
              } ${!inMonth || !inPeriod ? 'cal-day-dim' : ''}`}
            >
              <div className="flex flex-col items-start xl:hidden">
                <DayNumber day={day} />
                {dayEvents.length > 0 && (
                  <span
                    className={`mt-0.5 w-full truncate text-xs leading-tight tabular ${netTone(net)}`}
                  >
                    {net > 0 ? '+' : ''}
                    {formatMoneyCompact(net, currency)}
                  </span>
                )}
              </div>
              <div className="hidden items-center justify-between gap-1 xl:flex">
                <DayNumber day={day} />
                {dayEvents.length > 0 && (
                  <span className={`text-xs tabular ${netTone(net)}`}>
                    {net > 0 ? '+' : ''}
                    {formatMoney(net, currency)}
                  </span>
                )}
              </div>
              <div className="cal-dots mt-1 flex flex-wrap gap-0.5">
                {incomeCount > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" title="Income" />
                )}
                {expenseCount > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-600" title="Expense" />
                )}
                {dayEvents.some((event) => event.kind === 'goal') && (
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-600" title="Goal" />
                )}
              </div>
              <ul className="mt-1 hidden min-h-0 flex-1 space-y-0.5 overflow-hidden xl:block">
                {dayEvents.slice(0, 2).map((event) => (
                  <li
                    key={event.id}
                    className={`truncate text-xs leading-tight ${
                      event.kind === 'income'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : event.kind === 'goal'
                          ? 'text-violet-700 dark:text-violet-300'
                          : 'text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {event.name}
                  </li>
                ))}
                {dayEvents.length > 2 && (
                  <li className="text-xs text-zinc-400">+{dayEvents.length - 2}</li>
                )}
              </ul>
            </button>
          )
        })}
      </div>

      {selected && (
        <>
          <div className="xl:hidden">
            <DaySheet
              day={selected}
              step={dayStep}
              events={selectedEvents}
              forecast={forecast}
              inPeriod={dayInPeriod(selected, range)}
              currency={currency}
              reservedNote={reservedNote}
              onClose={() => setSelected(null)}
            />
          </div>
          <div ref={detailRef} className="hidden xl:block">
            <DayDetail
              day={selected}
              step={dayStep}
              events={selectedEvents}
              forecast={forecast}
              inPeriod={dayInPeriod(selected, range)}
              currency={currency}
              reservedNote={reservedNote}
            />
          </div>
        </>
      )}
    </div>
  )
}

function DaySheet({
  day,
  step,
  onClose,
  ...detail
}: {
  day: Date
  step: number
  events: CalendarEvent[]
  forecast: DayBalanceForecast | null
  inPeriod: boolean
  currency: string
  reservedNote?: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fade-in fixed inset-0 z-30 flex items-end justify-center bg-black/40">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="sheet-in relative z-10 max-h-[90svh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-xl dark:bg-zinc-900">
        <div className="mb-3 flex items-start justify-between gap-3">
          <p
            key={day.toDateString()}
            className="day-swap text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            style={{ '--step': step } as React.CSSProperties}
          >
            {format(day, 'EEEE, MMM d')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 rounded-full px-3 text-sm text-zinc-600 dark:text-zinc-300"
          >
            Close
          </button>
        </div>
        <DayDetail {...detail} day={day} step={step} embedded />
      </div>
    </div>
  )
}

function DayDetail({
  day,
  step,
  events,
  forecast,
  inPeriod,
  currency,
  reservedNote,
  embedded = false,
}: {
  day: Date
  step: number
  events: CalendarEvent[]
  forecast: DayBalanceForecast | null
  inPeriod: boolean
  currency: string
  reservedNote?: string
  embedded?: boolean
}) {
  const swap = { '--step': step } as React.CSSProperties
  return (
    <div
      className={
        embedded
          ? 'space-y-3'
          : 'day-open shrink-0 space-y-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950/50'
      }
    >
      {!embedded && (
        <p key={`title:${day.toDateString()}`} className="day-swap text-sm font-medium text-zinc-900 dark:text-zinc-50" style={swap}>
          {format(day, 'EEEE, MMM d')}
        </p>
      )}

      {!inPeriod || !forecast ? (
        <p className="text-sm text-zinc-500">
          Outside the current period — pick a day in this week/month for a balance
          forecast.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <MiniStat
              label="Start of day"
              value={forecast.openingBalance}
              currency={currency}
            />
            <MiniStat
              label="End of day"
              value={forecast.closingBalance}
              currency={currency}
              tone={
                forecast.endsNegative
                  ? 'bad'
                  : forecast.closingBalance >= forecast.openingBalance
                    ? 'good'
                    : 'neutral'
              }
            />
            <MiniStat
              label="Income today"
              value={forecast.incomeToday}
              currency={currency}
              tone="good"
            />
            <MiniStat
              label="Bills today"
              value={forecast.expensesToday}
              currency={currency}
              tone={forecast.expensesToday > 0 ? 'bad' : 'neutral'}
            />
            <MiniStat
              label="Goals today"
              value={forecast.goalsToday}
              currency={currency}
              tone={forecast.goalsToday > 0 ? 'bad' : 'neutral'}
            />
          </div>

          {forecast.expensesToday + forecast.goalsToday > 0.004 ? (
            forecast.canCoverToday ? (
              <p className="rounded-lg bg-emerald-50 px-2.5 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                You should have enough for this day —{' '}
                {formatMoney(forecast.availableToday, currency)} available vs{' '}
                {formatMoney(forecast.expensesToday + forecast.goalsToday, currency)} in
                bills and goals
                {forecast.availableToday - forecast.expensesToday - forecast.goalsToday > 0.004
                  ? ` (${formatMoney(forecast.availableToday - forecast.expensesToday - forecast.goalsToday, currency)} left after).`
                  : '.'}
              </p>
            ) : (
              <p className="rounded-lg bg-rose-50 px-2.5 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                Short {formatMoney(forecast.shortfallToday, currency)} for this day —
                bills and goals are{' '}
                {formatMoney(forecast.expensesToday + forecast.goalsToday, currency)} but only{' '}
                {formatMoney(forecast.availableToday, currency)} is available (start of
                day + today’s income).
              </p>
            )
          ) : (
            <p className="text-sm text-zinc-500">
              No bills due this day
              {forecast.incomeToday > 0.004
                ? ` — predicted balance ends at ${formatMoney(forecast.closingBalance, currency)}.`
                : ` — predicted balance stays ${formatMoney(forecast.closingBalance, currency)}.`}
            </p>
          )}

          {forecast.endsNegative && (
            <p className="text-xs text-rose-700 dark:text-rose-300">
              Running balance goes negative by end of day (
              {formatMoney(forecast.closingBalance, currency)}).
            </p>
          )}
          {forecast.lowestBalanceThroughDay < -0.004 &&
            forecast.lowestBalanceThroughDay < forecast.closingBalance - 0.004 && (
              <p className="text-xs text-zinc-500">
                Lowest point so far this period:{' '}
                {formatMoney(forecast.lowestBalanceThroughDay, currency)}.
              </p>
            )}
        </>
      )}

      {reservedNote && (
        <p className="text-xs text-zinc-500">{reservedNote}</p>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing scheduled.</p>
      ) : (
        <ul key={`events:${day.toDateString()}`} className="stagger space-y-1.5 border-t border-zinc-200 pt-2 dark:border-zinc-800">
          {events.map((event) => (
            <EventRow key={event.id} event={event} currency={currency} />
          ))}
        </ul>
      )}
    </div>
  )
}

function MiniStat({
  label,
  value,
  currency,
  tone = 'neutral',
}: {
  label: string
  value: number
  currency: string
  tone?: 'good' | 'bad' | 'neutral'
}) {
  const color =
    tone === 'good'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-rose-700 dark:text-rose-400'
        : 'text-zinc-900 dark:text-zinc-50'
  return (
    <div className="rounded-lg bg-white/80 px-2 py-1.5 dark:bg-zinc-900/80">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-sm font-semibold tabular transition-colors duration-300 ${color}`}>
        <AnimatedMoney value={value} currency={currency} />
      </p>
    </div>
  )
}

function EventRow({ event, currency }: { event: CalendarEvent; currency: string }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            event.kind === 'income'
              ? 'bg-emerald-600'
              : event.kind === 'goal'
                ? 'bg-violet-600'
                : 'bg-rose-600'
          }`}
        />
        <span className="truncate">
          {event.name}
          {event.category ? (
            <span className="text-zinc-500"> · {event.category}</span>
          ) : null}
        </span>
      </span>
      <span
        className={`shrink-0 tabular ${
          event.kind === 'income'
            ? 'text-emerald-700 dark:text-emerald-400'
            : event.kind === 'goal'
              ? 'text-violet-700 dark:text-violet-300'
              : 'text-zinc-800 dark:text-zinc-100'
        }`}
      >
        {event.kind === 'income' ? '+' : '−'}
        {formatMoney(event.amount, currency)}
      </span>
    </li>
  )
}

function DayNumber({ day }: { day: Date }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs tabular ${
        isToday(day)
          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
          : 'text-zinc-700 dark:text-zinc-200'
      }`}
    >
      {format(day, 'd')}
    </span>
  )
}

function netTone(net: number) {
  return net >= 0
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-rose-700 dark:text-rose-400'
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  )
}
