import { differenceInCalendarDays, format, isBefore, isSameDay, startOfDay } from 'date-fns'
import { useMemo, useState } from 'react'
import type { CalendarEvent } from '../domain/calendar'
import { periodLabel } from '../lib/periodLabel'
import { usePeriod } from '../state/usePeriod'
import { Money, PageHeader, Panel, Pill } from '../components/ui'

type Show = 'upcoming' | 'all'

/** Every scheduled paycheck, bill and goal contribution in the period, in date order. */
export function Recurring() {
  const { meta, range, events } = usePeriod()
  const today = useMemo(() => startOfDay(new Date()), [])
  const [show, setShow] = useState<Show>('upcoming')

  const visible = show === 'all' ? events : events.filter((event) => !isBefore(event.date, today))
  const days = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>()
    for (const event of visible) {
      const key = startOfDay(event.date).getTime()
      map.set(key, [...(map.get(key) ?? []), event])
    }
    return [...map.entries()].sort(([a], [b]) => a - b)
  }, [visible])

  const sum = (kind: CalendarEvent['kind']) =>
    visible.filter((event) => event.kind === kind).reduce((total, event) => total + event.amount, 0)
  const pastCount = events.length - events.filter((event) => !isBefore(event.date, today)).length

  return (
    <div>
      <PageHeader
        title="Recurring"
        subtitle={periodLabel(meta.view, range)}
        actions={
          <div className="flex rounded-lg bg-ledger-2 p-0.5 ring-1 ring-rule">
            {(
              [
                ['upcoming', 'Still to come'],
                ['all', `Whole period${pastCount ? ` (${pastCount} done)` : ''}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={show === id}
                onClick={() => setShow(id)}
                className={`min-h-8 rounded-md px-3 text-sm ${
                  show === id ? 'bg-ledger-4 text-paper' : 'text-paper-3 hover:text-paper'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <dl className="mb-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-paper-3">Coming in</dt>
          <dd><Money value={sum('income')} currency={meta.currency} tone="cash" signed /></dd>
        </div>
        <div>
          <dt className="text-paper-3">Going out</dt>
          <dd><Money value={-sum('expense')} currency={meta.currency} /></dd>
        </div>
        <div>
          <dt className="text-paper-3">To goals</dt>
          <dd><Money value={-sum('goal')} currency={meta.currency} tone="copper" /></dd>
        </div>
      </dl>

      {days.length === 0 ? (
        <Panel>
          <p className="font-display text-xl">Nothing left this period</p>
          <p className="mt-1 text-sm text-paper-2">Everything scheduled has already gone through.</p>
        </Panel>
      ) : (
        <Panel className="p-0 sm:p-0">
          <ol className="stagger divide-y divide-rule">
            {days.map(([key, dayEvents]) => {
              const date = new Date(key)
              const until = differenceInCalendarDays(date, today)
              const past = until < 0
              const soon = until >= 0 && until <= 3
              return (
                <li key={key} className={`grid grid-cols-[4.5rem_1fr] gap-3 px-4 py-3 sm:px-5 ${past ? 'opacity-55' : ''}`}>
                  <div className="money pt-0.5 text-xs leading-5">
                    <span className={soon ? 'text-due' : 'text-paper-2'}>{format(date, 'EEE d')}</span>
                    <span className="block text-paper-3">
                      {isSameDay(date, today) ? 'Today' : soon ? `In ${until}d` : format(date, 'MMM')}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {dayEvents.map((event) => (
                      <li key={event.id} className="flex items-center gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {event.name}
                          {event.category && <span className="ml-2 text-xs text-paper-3">{event.category}</span>}
                        </span>
                        {soon && event.kind === 'expense' && <Pill tone="due">Due</Pill>}
                        <Money
                          value={event.kind === 'income' ? event.amount : -event.amount}
                          currency={meta.currency}
                          signed={event.kind === 'income'}
                          tone={event.kind === 'income' ? 'cash' : event.kind === 'goal' ? 'copper' : 'plain'}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>
        </Panel>
      )}
    </div>
  )
}
