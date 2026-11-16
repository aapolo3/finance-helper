import { useMemo, useState, type ReactNode } from 'react'
import { formatMoney } from '../domain/money'
import type { Expense, IncomeSource } from '../domain/types'

type Bucket = 'upcoming' | 'past' | 'later'
type Filter = Bucket | 'pastIncome'
type Grouped = [string, Record<Bucket, Expense[]>][]

/** This month is the default, so paid, not-due and past items stay out of the way. */
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'upcoming', label: 'This month' },
  { id: 'past', label: 'Paid' },
  { id: 'later', label: 'Not due' },
  { id: 'pastIncome', label: 'Past income' },
]

/** True when any field contains the lowercase search text. */
function matchesSearch(needle: string, ...fields: string[]) {
  return fields.some((field) => field.toLowerCase().includes(needle))
}

const STATUS: Record<Bucket, string> = { upcoming: '', past: 'Paid', later: 'Not due' }

const LIST =
  'stagger card-surface divide-y divide-zinc-200 rounded-2xl bg-white ring-1 ring-zinc-200 dark:divide-rule dark:ring-0'

/** Income & expenses: category sidebar on the left, one filtered list on the right. */
export function ExpensesBoard({
  currency,
  income,
  pastIncomeIds,
  incomeRow,
  grouped,
  expenseRow,
  incomeAmount,
  expenseTotal,
  periodWord,
}: {
  currency: string
  income: IncomeSource[]
  pastIncomeIds: Set<string>
  incomeRow: (source: IncomeSource) => ReactNode
  grouped: Grouped
  expenseRow: (expense: Expense, status: string) => ReactNode
  incomeAmount: (source: IncomeSource) => number
  expenseTotal: (list: Expense[]) => number
  periodWord: string
}) {
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [picked, setPicked] = useState<string>('all')
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  // A search looks past the status filter, so a paid or not-due match is never hidden.
  const searching = needle.length > 0

  const categories = useMemo(
    () =>
      grouped.map(([name, buckets]) => ({
        name,
        items: (['upcoming', 'past', 'later'] as const).flatMap((bucket) =>
          searching
            ? buckets[bucket]
                .filter((expense) => matchesSearch(needle, expense.name, name))
                .map((expense) => ({ expense, bucket }))
            : filter === bucket
              ? buckets[bucket].map((expense) => ({ expense, bucket }))
              : [],
        ),
        total: expenseTotal([...buckets.upcoming, ...buckets.past]),
      })),
    [grouped, filter, expenseTotal, searching, needle],
  )

  const counts = useMemo(() => {
    const out: Record<Filter, number> = {
      upcoming: 0,
      past: 0,
      later: 0,
      pastIncome: pastIncomeIds.size,
    }
    for (const [, buckets] of grouped) {
      for (const bucket of ['upcoming', 'past', 'later'] as const) {
        out[bucket] += buckets[bucket].length
      }
    }
    return out
  }, [grouped, pastIncomeIds])

  const currentIncome = income.filter((source) => !pastIncomeIds.has(source.id))
  const pastIncome = income.filter((source) => pastIncomeIds.has(source.id))
  const incomeSum = currentIncome.reduce((sum, source) => sum + incomeAmount(source), 0)
  const incomeShown = searching
    ? income.filter((source) => matchesSearch(needle, source.name))
    : filter === 'pastIncome'
      ? pastIncome
      : currentIncome
  const spent = categories.reduce((sum, category) => sum + category.total, 0)

  const nav = [
    { id: 'all', label: 'All', total: spent },
    { id: 'income', label: 'Income', total: incomeSum },
    ...categories.map((category) => ({
      id: category.name,
      label: category.name,
      total: category.total,
    })),
  ]
  // A category deleted while picked falls back to All.
  const current = nav.some((item) => item.id === picked) ? picked : 'all'
  const shown =
    current === 'all'
      ? categories.filter((category) => category.items.length > 0)
      : categories.filter((category) => category.name === current)

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:sticky md:top-4 md:mx-0 md:w-56 md:shrink-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0">
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPicked(item.id)}
            aria-pressed={current === item.id}
            className={`flex min-h-9 shrink-0 items-center justify-between gap-3 rounded-full px-3 text-left text-sm md:rounded-lg ${
              current === item.id
                ? 'bg-rule-strong text-zinc-50'
                : 'text-zinc-400 hover:bg-rule hover:text-zinc-100'
            }`}
          >
            <span className="truncate">{item.label}</span>
            <span className="money hidden text-xs text-paper-3 md:inline">
              {formatMoney(item.total, currency)}
            </span>
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="relative">
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-paper-3"
          >
            <circle cx="8.5" cy="8.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12.5 12.5L16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search income and expenses"
            placeholder="Search by name or category"
            className="min-h-10 w-full rounded-xl bg-transparent pr-3 pl-9 text-sm text-paper ring-1 ring-rule-strong placeholder:text-paper-3"
          />
        </div>
        {current !== 'income' && !searching && (
          <div className="-m-1 flex gap-1.5 overflow-x-auto p-1">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
                className={`press min-h-9 shrink-0 rounded-full px-3 text-sm ring-1 ${
                  filter === option.id
                    ? 'bg-zinc-100 text-zinc-900 ring-zinc-100'
                    : 'text-zinc-400 ring-rule-strong hover:text-zinc-100'
                }`}
              >
                {option.label}{' '}
                <span className="tabular-nums opacity-60">{counts[option.id]}</span>
              </button>
            ))}
          </div>
        )}
        {(current === 'all' || current === 'income') &&
          (searching ? incomeShown.length > 0 || current === 'income' : filter === 'upcoming' || filter === 'pastIncome') && (
          <section className="space-y-2">
            <Heading title="Income" total={formatMoney(incomeSum, currency)} />
            {incomeShown.length > 0 ? (
              <ul className={LIST}>{incomeShown.map(incomeRow)}</ul>
            ) : (
              <Empty>
                {searching
                  ? `No income matches “${query.trim()}”.`
                  : filter === 'pastIncome'
                    ? 'No past income.'
                    : `No income this ${periodWord}.`}
              </Empty>
            )}
          </section>
        )}
        {current !== 'income' &&
          (searching || filter !== 'pastIncome') &&
          shown.map((category) => (
            <section key={category.name} className="space-y-2">
              <Heading title={category.name} total={formatMoney(category.total, currency)} />
              {category.items.length > 0 ? (
                <ul className={LIST}>
                  {category.items.map(({ expense, bucket }) => expenseRow(expense, STATUS[bucket]))}
                </ul>
              ) : (
                <Empty>{searching ? `Nothing matches “${query.trim()}”.` : 'Nothing here.'}</Empty>
              )}
            </section>
          ))}
        {current === 'all' &&
          shown.length === 0 &&
          (searching ? (
            incomeShown.length === 0 && <Empty>Nothing matches “{query.trim()}”.</Empty>
          ) : (
            <Empty>Nothing here this {periodWord}.</Empty>
          ))}
      </div>
    </div>
  )
}

function Heading({ title, total }: { title: string; total: string }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-sm font-medium text-paper-2">{title}</h2>
      <span className="money text-sm text-paper-3">{total}</span>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-1 text-sm text-zinc-500">{children}</p>
}
