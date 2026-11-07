import { format, isBefore, startOfDay } from 'date-fns'
import { useMemo, useState } from 'react'
import { formatMoney } from '../domain/money'
import { categoryColor, getSankeyTheme } from '../domain/sankeyThemes'
import type { CalendarEvent } from '../domain/calendar'
import { periodLabel } from '../lib/periodLabel'
import { usePeriod } from '../state/usePeriod'
import { Button, Label, Money, PageHeader, Panel, Pill } from '../components/ui'

type Envelope = {
  category: string
  planned: number
  paid: number
  items: CalendarEvent[]
}

/** Each category is an envelope: what's planned this period and how much has gone out. */
export function Budget({ onAdd }: { onAdd?: () => void } = {}) {
  const { meta, range, totals, events, periodWord } = usePeriod()
  const theme = getSankeyTheme(meta.sankeyTheme)
  const today = useMemo(() => startOfDay(new Date()), [])
  const [open, setOpen] = useState<string | null>(null)

  const envelopes = useMemo(() => {
    const map = new Map<string, Envelope>()
    for (const event of events) {
      if (event.kind !== 'expense') continue
      const category = event.category ?? 'Other'
      const entry = map.get(category) ?? { category, planned: 0, paid: 0, items: [] }
      entry.planned += event.amount
      if (isBefore(event.date, today)) entry.paid += event.amount
      entry.items.push(event)
      map.set(category, entry)
    }
    return [...map.values()].sort((a, b) => b.planned - a.planned)
  }, [events, today])

  const income = Math.max(0, totals.income)
  const planned = totals.spending
  const goals = totals.goalContributions
  const left = income - planned - goals
  const paid = envelopes.reduce((sum, envelope) => sum + envelope.paid, 0)
  const share = (value: number) => (income > 0 ? Math.min(100, (value / income) * 100) : 0)

  return (
    <div>
      <PageHeader title="Budget" subtitle={`Where ${periodLabel(meta.view, range)}'s income is going`} />

      <Panel className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Label>{left < -0.004 ? 'Over plan this ' + periodWord : 'Unplanned this ' + periodWord}</Label>
            <p
              className={`mt-1 font-display text-[44px] leading-none tracking-[-0.02em] ${
                left < -0.004 ? 'text-over' : 'text-paper'
              }`}
            >
              {formatMoney(Math.abs(left), meta.currency)}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <dt className="text-paper-3">Income</dt>
              <dd className="mt-0.5"><Money value={income} currency={meta.currency} tone="cash" /></dd>
            </div>
            <div>
              <dt className="text-paper-3">Bills</dt>
              <dd className="mt-0.5"><Money value={planned} currency={meta.currency} /></dd>
            </div>
            <div>
              <dt className="text-paper-3">Goals</dt>
              <dd className="mt-0.5"><Money value={goals} currency={meta.currency} tone="copper" /></dd>
            </div>
          </dl>
        </div>
        {/* One bar for the whole paycheck: bills, then goals, then what's free. */}
        <div className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ledger-3">
          {envelopes.map((envelope) => (
            <span
              key={envelope.category}
              title={envelope.category}
              className="bar-grow h-full"
              style={{ width: `${share(envelope.planned)}%`, background: categoryColor(theme, envelope.category) }}
            />
          ))}
          {goals > 0.004 && <span className="bar-grow h-full bg-copper" style={{ width: `${share(goals)}%` }} />}
        </div>
        <p className="mt-2 text-xs text-paper-3">
          <Money value={paid} currency={meta.currency} className="text-paper-2" /> paid so far ·{' '}
          <Money value={planned} currency={meta.currency} className="text-paper-2" /> in bills planned this {periodWord}.
        </p>
      </Panel>

      {envelopes.length === 0 ? (
        <Panel>
          <p className="font-display text-xl">No bills this {periodWord}</p>
          <p className="mt-1 text-sm text-paper-2">Expenses you add show up here by category.</p>
          {onAdd && (
            <Button variant="primary" className="mt-3" onClick={onAdd}>
              Add an expense
            </Button>
          )}
        </Panel>
      ) : (
        <Panel className="p-0 sm:p-0">
          <ul className="stagger divide-y divide-rule">
            {envelopes.map((envelope) => {
              const pct = envelope.planned > 0 ? (envelope.paid / envelope.planned) * 100 : 0
              const done = pct >= 99.9
              const due = envelope.planned - envelope.paid
              const next = envelope.items.find((item) => !isBefore(item.date, today))
              const expanded = open === envelope.category
              return (
                <li key={envelope.category}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : envelope.category)}
                    className="w-full px-4 py-3.5 text-left hover:bg-ledger-2 sm:px-5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: categoryColor(theme, envelope.category) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{envelope.category}</span>
                      {done ? <Pill tone="cash">Paid</Pill> : null}
                      <span className="text-right text-sm text-paper-3">
                        <Money value={envelope.paid} currency={meta.currency} className="text-paper" /> paid
                        {due > 0.004 && (
                          <>
                            {' · '}
                            <Money value={due} currency={meta.currency} className="text-paper-2" /> due{' '}
                            {next ? format(next.date, 'MMM d') : 'later'}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="mt-2.5 ml-5.5 h-1.5 overflow-hidden rounded-full bg-ledger-3">
                      <div
                        className="bar-grow h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{ width: `${pct}%`, background: done ? 'var(--color-cash)' : 'var(--color-paper-2)' }}
                      />
                    </div>
                  </button>
                  {expanded && (
                    <ul className="fade-in border-t border-rule bg-ledger-2/60 px-4 py-2 sm:px-5">
                      {envelope.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 py-1.5 pl-5.5 text-sm">
                          <span className="money w-14 shrink-0 text-xs text-paper-3">{format(item.date, 'MMM d')}</span>
                          <span className={`min-w-0 flex-1 truncate ${isBefore(item.date, today) ? 'text-paper-3' : ''}`}>
                            {item.name}
                          </span>
                          <Money value={item.amount} currency={meta.currency} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}
