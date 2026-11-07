import { format } from 'date-fns'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  MobileFormActions,
  Sheet,
  sheetBodyClass,
  sheetFooterClass,
  sheetFormClass,
} from '../components/Sheet'
import { ActionMenu, CopyIcon, EditIcon, TrashIcon } from '../components/ActionMenu'
import { Toast } from '../components/Toast'
import { Toggle } from '../components/Toggle'
import { Button, PageHeader } from '../components/ui'
import { ExpensesBoard } from './ExpensesBoard'
import { cadenceLabel, formatMoney } from '../domain/money'
import { expenseAmountForView } from '../domain/normalize'
import {
  incomePayDatesInPeriod,
  nextPayDateOnOrAfter,
  expensePeriodDueBucket,
  expenseVisibleOnList,
  incomeVisibleOnList,
  oneTimeIncomeIsPast,
  countsInMonth,
  isOffOnDate,
  nextExpenseDateOnOrAfter,
  occurrenceDatesInPeriod,
  periodRange,
  remainingOccurrences,
} from '../domain/period'
import { periodLabel } from '../lib/periodLabel'
import {
  DEFAULT_CATEGORIES,
  EXPENSE_CADENCES,
  INCOME_CADENCES,
  type DateRange,
  type Expense,
  type ExpenseCadence,
  type IncomeCadence,
  type IncomeSource,
  type MonthToggleScope,
  type PayDateMode,
  type ViewPeriod,
} from '../domain/types'
import { newId } from '../lib/ids'
import { useAuthStore } from '../state/authStore'
import { useBudgetStore } from '../state/budgetStore'

type ItemEditor<T> =
  | { mode: 'add' }
  | { mode: 'edit' | 'duplicate'; item: T }

function copyName(name: string, fallback: string): string {
  const base = name.trim() || fallback
  return `${base} copy`
}

/** Category the last logged expense used, so the next one starts there. */
const LAST_CATEGORY_KEY = 'flow:last-expense-category'

function readLastCategory(): string {
  try {
    return window.localStorage.getItem(LAST_CATEGORY_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberCategory(category: string) {
  try {
    window.localStorage.setItem(LAST_CATEGORY_KEY, category)
  } catch {
    // Private windows can refuse storage; the form just starts unpicked next time.
  }
}

export function Expenses({
  logRequest = false,
  onLogHandled,
}: {
  /** Set by the phone nav's log button: open the add-expense sheet once on arrival. */
  logRequest?: boolean
  onLogHandled?: () => void
} = {}) {
  const income = useBudgetStore((s) => s.income)
  const expenses = useBudgetStore((s) => s.expenses)
  const meta = useBudgetStore((s) => s.meta)
  const toggleExpense = useBudgetStore((s) => s.toggleExpense)
  const removeExpense = useBudgetStore((s) => s.removeExpense)
  const removeExpenseMonths = useBudgetStore((s) => s.removeExpenseMonths)
  const restoreExpense = useBudgetStore((s) => s.restoreExpense)
  const addExpense = useBudgetStore((s) => s.addExpense)
  const updateExpense = useBudgetStore((s) => s.updateExpense)
  const addIncome = useBudgetStore((s) => s.addIncome)
  const updateIncome = useBudgetStore((s) => s.updateIncome)
  const removeIncome = useBudgetStore((s) => s.removeIncome)
  const removeIncomeMonths = useBudgetStore((s) => s.removeIncomeMonths)
  const restoreIncome = useBudgetStore((s) => s.restoreIncome)
  const toggleIncome = useBudgetStore((s) => s.toggleIncome)
  const syncing = useAuthStore((s) => s.syncing)
  const syncNow = useAuthStore((s) => s.syncNow)
  const activityLog = useBudgetStore((s) => s.activityLog)

  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null)
  const [viewingIncome, setViewingIncome] = useState<IncomeSource | null>(null)
  // The page remounts on every visit, so a log request from the phone nav opens the sheet on arrival.
  const [editingExpense, setEditingExpense] = useState<ItemEditor<Expense> | null>(
    logRequest ? { mode: 'add' } : null,
  )
  const [editingIncome, setEditingIncome] = useState<ItemEditor<IncomeSource> | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [monthChoice, setMonthChoice] = useState<{
    kind: 'income' | 'expense'
    action: 'toggle' | 'delete'
    id: string
    name: string
    month: string
    turningOn: boolean
  } | null>(null)

  useEffect(() => {
    setMonthChoice(null)
  }, [meta.anchorDate])
  const [undo, setUndo] = useState<
    | { kind: 'income'; item: IncomeSource; label: string }
    | { kind: 'expense'; item: Expense; label: string }
    | { kind: 'logged'; id: string; label: string }
    | null
  >(null)
  const clearUndo = useCallback(() => setUndo(null), [])

  useEffect(() => {
    if (logRequest) onLogHandled?.()
  }, [logRequest, onLogHandled])

  const range = useMemo(
    () =>
      periodRange(
        meta.view,
        new Date(`${meta.anchorDate}T00:00:00`),
        meta.weekStartsOn,
      ),
    [meta.view, meta.anchorDate, meta.weekStartsOn],
  )

  const listAsOf = useMemo(
    () => new Date(`${meta.anchorDate}T00:00:00`),
    [meta.anchorDate],
  )

  const today = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }, [meta.anchorDate, meta.view])

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { upcoming: Expense[]; past: Expense[]; later: Expense[] }
    >()
    for (const expense of expenses) {
      if (!expenseVisibleOnList(expense, listAsOf)) continue
      const bucket = expensePeriodDueBucket(expense, range, today)
      const entry = map.get(expense.category) ?? {
        upcoming: [],
        past: [],
        later: [],
      }
      entry[bucket].push(expense)
      map.set(expense.category, entry)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [expenses, listAsOf, range, today])

  const viewedMonth = meta.anchorDate.slice(0, 7)
  const periodWord = meta.view === 'weekly' ? 'week' : 'month'
  const { currentIncome, pastIncome } = useMemo(() => {
    const current: IncomeSource[] = []
    const past: IncomeSource[] = []
    for (const source of income) {
      if (!incomeVisibleOnList(source, listAsOf)) continue
      if (oneTimeIncomeIsPast(source, range, today)) past.push(source)
      else current.push(source)
    }
    return { currentIncome: current, pastIncome: past }
  }, [income, listAsOf, range, today])

  const expenseTotal = (list: Expense[]) =>
    list
      .filter((expense) => countsInMonth(expense, viewedMonth))
      .reduce(
        (sum, expense) => sum + expenseAmountForView({ ...expense, enabled: true }, meta.view, range),
        0,
      )

  const expenseRowProps = (expense: Expense, muted: boolean) => ({
    expense,
    currency: meta.currency,
    view: meta.view,
    range,
    month: viewedMonth,
    muted,
    onView: () => setViewingExpense(expense),
    onEdit: () => setEditingExpense({ mode: 'edit', item: expense }),
    onDuplicate: () => setEditingExpense({ mode: 'duplicate', item: expense }),
    onToggle: () => {
      if (expense.cadence === 'once') {
        toggleExpense(expense.id, 'future')
        return
      }
      setMonthChoice({
        kind: 'expense',
        action: 'toggle',
        id: expense.id,
        name: expense.name,
        month: viewedMonth,
        turningOn: !countsInMonth(expense, viewedMonth),
      })
    },
    onDelete: () => {
      setUndo(null)
      setMonthChoice({
        kind: 'expense',
        action: 'delete',
        id: expense.id,
        name: expense.name,
        month: viewedMonth,
        turningOn: false,
      })
    },
  })



  const incomeRowProps = (source: IncomeSource, muted: boolean) => ({
    source,
    currency: meta.currency,
    view: meta.view,
    range,
    month: viewedMonth,
    muted,
    onView: () => setViewingIncome(source),
    onEdit: () => setEditingIncome({ mode: 'edit', item: source }),
    onDuplicate: () => setEditingIncome({ mode: 'duplicate', item: source }),
    onToggle: () => {
      if (source.cadence === 'once') {
        toggleIncome(source.id, 'future')
        return
      }
      setMonthChoice({
        kind: 'income' as const,
        action: 'toggle',
        id: source.id,
        name: source.name,
        month: viewedMonth,
        turningOn: !countsInMonth(source, viewedMonth),
      })
    },
    onDelete: () => {
      setUndo(null)
      setMonthChoice({
        kind: 'income',
        action: 'delete',
        id: source.id,
        name: source.name,
        month: viewedMonth,
        turningOn: false,
      })
    },
  })

  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <PageHeader
        title="Cash flow"
        subtitle={`Toggle items off to see how ${periodLabel(meta.view, range)} changes`}
        actions={
          <>
            <Button className="hidden sm:inline-flex" onClick={() => setEditingIncome({ mode: 'add' })}>
              Add income
            </Button>
            <Button
              variant="primary"
              className="hidden sm:inline-flex"
              onClick={() => setEditingExpense({ mode: 'add' })}
            >
              Add expense
            </Button>
            <ActionMenu
              label="More options"
              actions={[
                {
                  label: syncing ? 'Syncing…' : 'Sync now',
                  onSelect: () => void syncNow(),
                },
              ]}
            />
          </>
        }
      />

      <ExpensesBoard
        currency={meta.currency}
        income={[...currentIncome, ...pastIncome]}
        pastIncomeIds={new Set(pastIncome.map((source) => source.id))}
        incomeRow={(source) => (
          <IncomeRow key={source.id} {...incomeRowProps(source, pastIncome.includes(source))} />
        )}
        grouped={grouped}
        expenseRow={(expense, status) => (
          <ExpenseRow key={expense.id} {...expenseRowProps(expense, false)} status={status} />
        )}
        incomeAmount={(source) => incomePeriodAmount(source, range)}
        expenseTotal={expenseTotal}
        periodWord={periodWord}
      />

      <section className="space-y-2">
        <SectionHeading
          title="History"
          collapsible
          open={historyOpen}
          onToggle={() => setHistoryOpen((open) => !open)}
        />
        {historyOpen && (
          activityLog.length === 0 ? (
            <p className="text-sm text-zinc-500">No added or deleted expenses yet.</p>
          ) : (
            <ul className={LIST}>
              {activityLog.map((entry) => (
                <li key={entry.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">
                    {entry.action === 'added' ? 'Added' : 'Deleted'} {entry.snapshot.name}
                  </p>
                  <p className="text-zinc-500">
                    {format(new Date(entry.atMs), 'MMM d, yyyy h:mm a')} ·{' '}
                    {formatMoney(entry.snapshot.amount, meta.currency)} · {entry.snapshot.category}
                  </p>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      {undo && (
        <Toast
          key={undo.kind === 'logged' ? undo.id : undo.item.id}
          actionLabel="Undo"
          onDone={clearUndo}
          onAction={() => {
            if (undo.kind === 'income') restoreIncome(undo.item)
            else if (undo.kind === 'expense') restoreExpense(undo.item)
            else removeExpense(undo.id)
            setUndo(null)
          }}
        >
          {undo.kind === 'logged' ? 'Logged' : 'Deleted'} {undo.label}
        </Toast>
      )}

      {monthChoice && (
        <MonthToggleDialog
          name={monthChoice.name}
          month={monthChoice.month}
          turningOn={monthChoice.turningOn}
          action={monthChoice.action}
          onClose={() => setMonthChoice(null)}
          onPick={(scope) => {
            if (monthChoice.action === 'delete') {
              if (monthChoice.kind === 'income') {
                const current = income.find((item) => item.id === monthChoice.id)
                if (current) setUndo({ kind: 'income', item: current, label: monthChoice.name })
                if (scope === 'all') removeIncome(monthChoice.id)
                else removeIncomeMonths(monthChoice.id, scope)
              } else {
                const current = expenses.find((item) => item.id === monthChoice.id)
                if (current) setUndo({ kind: 'expense', item: current, label: monthChoice.name })
                if (scope === 'all') removeExpense(monthChoice.id)
                else removeExpenseMonths(monthChoice.id, scope)
              }
            } else {
              if (monthChoice.kind === 'income') toggleIncome(monthChoice.id, scope)
              else toggleExpense(monthChoice.id, scope)
            }
            setMonthChoice(null)
          }}
        />
      )}

      {!viewingExpense && !viewingIncome && !editingExpense && !editingIncome && (
        <div className="fixed inset-x-0 z-10 flex gap-2 border-t border-zinc-200 bg-white px-4 py-2 md:hidden dark:border-zinc-800 dark:bg-zinc-950 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={() => setEditingIncome({ mode: 'add' })}
            className="press min-h-11 flex-1 rounded-full bg-white text-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700"
          >
            Add income
          </button>
          <button
            type="button"
            onClick={() => setEditingExpense({ mode: 'add' })}
            className="press min-h-11 flex-1 rounded-lg bg-zinc-900 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
          >
            Add expense
          </button>
        </div>
      )}

      {viewingExpense && (
        <ExpenseOverview
          expense={viewingExpense}
          currency={meta.currency}
          onClose={() => setViewingExpense(null)}
          onEdit={() => {
            setEditingExpense({ mode: 'edit', item: viewingExpense })
            setViewingExpense(null)
          }}
          onDuplicate={() => {
            setEditingExpense({ mode: 'duplicate', item: viewingExpense })
            setViewingExpense(null)
          }}
          onDelete={() => {
            const expense = viewingExpense
            setViewingExpense(null)
            setUndo(null)
            setMonthChoice({
              kind: 'expense',
              action: 'delete',
              id: expense.id,
              name: expense.name,
              month: viewedMonth,
              turningOn: false,
            })
          }}
        />
      )}

      {viewingIncome && (
        <IncomeOverview
          source={viewingIncome}
          currency={meta.currency}
          range={range}
          onClose={() => setViewingIncome(null)}
          onEdit={() => {
            setEditingIncome({ mode: 'edit', item: viewingIncome })
            setViewingIncome(null)
          }}
          onDuplicate={() => {
            setEditingIncome({ mode: 'duplicate', item: viewingIncome })
            setViewingIncome(null)
          }}
          onDelete={() => {
            const source = viewingIncome
            setViewingIncome(null)
            setUndo(null)
            setMonthChoice({
              kind: 'income',
              action: 'delete',
              id: source.id,
              name: source.name,
              month: viewedMonth,
              turningOn: false,
            })
          }}
        />
      )}

      {editingExpense && (
        <ExpenseEditor
          mode={editingExpense.mode}
          initial={editingExpense.mode === 'add' ? null : editingExpense.item}
          currency={meta.currency}
          onClose={() => setEditingExpense(null)}
          onSave={(value) => {
            if (editingExpense.mode === 'edit') {
              updateExpense(value.id, value)
            } else {
              addExpense(value)
              rememberCategory(value.category)
              setUndo({
                kind: 'logged',
                id: value.id,
                label: `${formatMoney(value.amount, meta.currency)} · ${value.name}`,
              })
            }
            setEditingExpense(null)
          }}
        />
      )}

      {editingIncome && (
        <IncomeEditor
          mode={editingIncome.mode}
          initial={editingIncome.mode === 'add' ? null : editingIncome.item}
          currency={meta.currency}
          onClose={() => setEditingIncome(null)}
          onSave={(value) => {
            if (editingIncome.mode === 'edit') updateIncome(value.id, value)
            else addIncome(value)
            setEditingIncome(null)
          }}
        />
      )}
    </div>
  )
}

/** Shared income and expense list styling. */
const LIST =
  'stagger card-surface divide-y divide-zinc-200 rounded-2xl bg-white ring-1 ring-zinc-200 dark:divide-rule dark:ring-0'

/** "Nov 4" or "Nov 4 +3" when a long list of dates would wrap. */
function datesSummary(dates: Date[]): string {
  if (dates.length === 0) return ''
  const first = format(dates[0], 'MMM d')
  return dates.length === 1 ? first : `${first} +${dates.length - 1}`
}

function incomePeriodAmount(source: IncomeSource, range: DateRange): number {
  if (!source.payDate) return source.amount
  return (
    source.amount *
    incomePayDatesInPeriod(source, range).filter((date) => !isOffOnDate(source, date)).length
  )
}

function ItemRow({
  name,
  meta,
  amount,
  off,
  toggleLabel,
  checked,
  onView,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  name: string
  meta: string
  amount: string
  off: boolean
  toggleLabel: string
  checked: boolean
  onView: () => void
  onToggle: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <li
      className={`flex items-center gap-1 py-1 pr-1 pl-4 transition-opacity first:rounded-t-2xl last:rounded-b-2xl hover:bg-black/[0.02] dark:hover:bg-rule ${
        off ? 'opacity-50' : ''
      }`}
    >
      <button type="button" className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left" onClick={onView}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-zinc-900 dark:text-zinc-50">{name}</span>
          <span className="block truncate text-xs text-zinc-500">{meta}</span>
        </span>
        <span className="money shrink-0 font-medium text-paper">
          {amount}
        </span>
      </button>
      <Toggle size="sm" checked={checked} label={toggleLabel} onChange={onToggle} />
      <ActionMenu
        label={`Actions for ${name}`}
        actions={[
          { label: 'Edit', onSelect: onEdit, icon: <EditIcon /> },
          { label: 'Duplicate', onSelect: onDuplicate, icon: <CopyIcon /> },
          { label: 'Delete', onSelect: onDelete, danger: true, icon: <TrashIcon /> },
        ]}
      />
    </li>
  )
}

function IncomeRow({
  source,
  currency,
  view,
  range,
  month,
  muted,
  onView,
  onEdit,
  onDuplicate,
  onToggle,
  onDelete,
}: {
  source: IncomeSource
  currency: string
  view: ViewPeriod
  range: DateRange
  month: string
  muted: boolean
  onView: () => void
  onEdit: () => void
  onDuplicate: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const pays = source.payDate
    ? incomePayDatesInPeriod(source, range).filter((date) => !isOffOnDate(source, date))
    : []
  const nextPay = source.payDate ? nextPayDateOnOrAfter(source, range.start) : null
  const when = !source.payDate
    ? 'Spread across the period'
    : source.cadence === 'once'
      ? `On ${format(new Date(`${source.payDate}T00:00:00`), 'MMM d')}`
      : pays.length > 1
        ? `${pays.length} paydays · ${datesSummary(pays)}`
        : pays.length === 1
          ? `Paid ${datesSummary(pays)}`
          : nextPay
            ? `Next ${format(nextPay, 'MMM d')}`
            : ''
  const included = countsInMonth(source, month)

  return (
    <ItemRow
      name={source.name}
      meta={[cadenceLabel(source.cadence), when].filter(Boolean).join(' · ')}
      amount={formatMoney(incomePeriodAmount(source, range), currency)}
      off={muted || !included}
      checked={included}
      toggleLabel={`Include ${source.name} in ${periodLabel(view, range)}`}
      onView={onView}
      onToggle={onToggle}
      onEdit={onEdit}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />
  )
}

function ExpenseRow({
  expense,
  currency,
  view,
  range,
  month,
  muted,
  onView,
  onEdit,
  onDuplicate,
  onToggle,
  onDelete,
  status,
}: {
  status?: string
  expense: Expense
  currency: string
  view: ViewPeriod
  range: DateRange
  month: string
  muted: boolean
  onView: () => void
  onEdit: () => void
  onDuplicate: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const amount = expenseAmountForView({ ...expense, enabled: true }, view, range)
  const dues = occurrenceDatesInPeriod(expense, range)
  const remaining = remainingOccurrences(expense)
  const left =
    expense.occurrenceLimit != null && remaining !== Number.POSITIVE_INFINITY
      ? `${remaining} left`
      : ''
  const included = countsInMonth(expense, month)

  return (
    <ItemRow
      name={expense.name}
      meta={[status ?? '', cadenceLabel(expense.cadence), left, dues.length > 0 ? `Due ${datesSummary(dues)}` : '']
        .filter(Boolean)
        .join(' · ')}
      amount={formatMoney(amount, currency)}
      off={muted || !included}
      checked={included}
      toggleLabel={`Include ${expense.name} this month`}
      onView={onView}
      onToggle={onToggle}
      onEdit={onEdit}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />
  )
}

function SectionHeading({
  title,
  collapsible,
  open,
  onToggle,
  total,
}: {
  title: string
  collapsible: boolean
  open: boolean
  onToggle: () => void
  total?: string
}) {
  const totalLabel = total ? (
    <span className="text-sm tabular-nums text-zinc-500 normal-case">{total}</span>
  ) : null
  if (!collapsible) {
    return (
      <div className="flex min-h-9 items-center justify-between px-1">
        <h2 className="text-sm font-medium text-paper-2">{title}</h2>
        {totalLabel}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex min-h-11 w-full items-center justify-between gap-3 px-1 text-left"
      aria-expanded={open}
    >
      <span className="text-sm font-medium text-paper-2">{title}</span>
      <span className="flex items-center gap-2">
        {totalLabel}
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  )

}

function copiedOffRanges(ranges: IncomeSource['offRanges']): IncomeSource['offRanges'] {
  return (ranges ?? []).map((range) => ({ ...range }))
}

function IncomeEditor({
  initial,
  mode,
  currency,
  onClose,
  onSave,
}: {
  initial: IncomeSource | null
  mode: ItemEditor<IncomeSource>['mode']
  currency: string
  onClose: () => void
  onSave: (source: IncomeSource) => void
}) {
  const [name, setName] = useState(
    mode === 'duplicate' ? copyName(initial?.name ?? '', 'Income') : (initial?.name ?? ''),
  )
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '')
  const [cadence, setCadence] = useState<IncomeCadence>(initial?.cadence ?? 'once')
  const [payDate, setPayDate] = useState(() => {
    if (initial?.payDate) return initial.payDate
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })
  const [payDateMode, setPayDateMode] = useState<PayDateMode | null>(() => {
    if (initial?.cadence === 'once') return null
    if (!initial?.payDate) return null
    return initial.payDateMode === 'first' ? 'first' : 'known'
  })

  const needsPayDate = cadence === 'once' || payDateMode != null

  return (
    <Sheet
      title={
        mode === 'duplicate' ? 'Duplicate income' : mode === 'edit' ? 'Edit income' : 'Add income'
      }
      onClose={onClose}
      mobileActions={<MobileFormActions formId="income-editor" onClose={onClose} />}
    >
      <form
        id="income-editor"
        className={sheetFormClass}
        onSubmit={(e) => {
          e.preventDefault()
          onSave({
            id: mode === 'edit' && initial ? initial.id : newId('inc'),
            name: name.trim() || 'Income',
            amount: Number(amount) || 0,
            cadence,
            enabled: initial?.enabled ?? true,
            offRanges: copiedOffRanges(initial?.offRanges),
            removedRanges: mode === 'duplicate' ? [] : copiedOffRanges(initial?.removedRanges),
            payDate: needsPayDate && payDate ? payDate : undefined,
            payDateMode:
              cadence !== 'once' && needsPayDate && payDateMode
                ? payDateMode
                : undefined,
          })
        }}
      >
        <div className={sheetBodyClass}>
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field
          label={
            cadence === 'once'
              ? `Amount (${currency})`
              : `Amount per paycheck (${currency})`
          }
        >
          <input
            required
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="How often">
          <select
            value={cadence}
            onChange={(e) => {
              const next = e.target.value as IncomeCadence
              setCadence(next)
              if (next === 'once') setPayDateMode(null)
            }}
            className={inputClass}
          >
            {INCOME_CADENCES.map((c) => (
              <option key={c} value={c}>
                {cadenceLabel(c)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-zinc-500">
            Use One-time for a single check (bonus, first deposit, tax refund).
          </span>
        </Field>
        {cadence !== 'once' && (
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={payDateMode === 'known'}
                onChange={(e) =>
                  setPayDateMode(e.target.checked ? 'known' : null)
                }
              />
              <span>I know when this check hits</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={payDateMode === 'first'}
                onChange={(e) =>
                  setPayDateMode(e.target.checked ? 'first' : null)
                }
              />
              <span>I know the first time I&apos;ll receive this check</span>
            </label>
          </div>
        )}
        {needsPayDate && (
          <Field
            label={
              cadence === 'once'
                ? 'Date you receive the check'
                : payDateMode === 'first'
                  ? 'First paycheck date'
                  : 'Payday'
            }
          >
            <input
              type="date"
              required={needsPayDate}
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-zinc-500">
              {cadence === 'once'
                ? 'Only this date counts toward your budget.'
                : payDateMode === 'first'
                  ? 'The first time this income hits. Later checks follow your schedule from this date — nothing before it counts.'
                  : 'Any payday on your schedule. Checks before and after this date still count when they land in the period.'}
            </span>
          </Field>
        )}
        </div>
        <div className={`${sheetFooterClass} hidden md:flex`}>
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
          >
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}

function ExpenseOverview({
  expense,
  currency,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  expense: Expense
  currency: string
  onClose: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const nextDue = nextExpenseDateOnOrAfter(expense, new Date())
  const remaining = remainingOccurrences(expense)
  const dueLabel = nextDue
    ? format(nextDue, 'EEE, MMM d, yyyy')
    : remaining <= 0
      ? 'No charges left'
      : 'No upcoming date'
  const planTotal =
    expense.occurrenceLimit != null ? expense.amount * expense.occurrenceLimit : null
  const remainingTotal =
    planTotal != null && remaining !== Number.POSITIVE_INFINITY
      ? expense.amount * remaining
      : null
  return (
    <Sheet title={expense.name} onClose={onClose}>
      <div className={sheetFormClass}>
        <div className={sheetBodyClass}>
          <OverviewRow label="Cost" value={`${formatMoney(expense.amount, currency)} · ${cadenceLabel(expense.cadence)}`} />
          {planTotal != null && (
            <OverviewRow
              label="Total"
              value={`${formatMoney(planTotal, currency)} over ${expense.occurrenceLimit} charges${
                remainingTotal != null && expense.occurrencesPosted > 0
                  ? ` · ${formatMoney(remainingTotal, currency)} left (${remaining} of ${expense.occurrenceLimit})`
                  : ''
              }`}
            />
          )}
          <OverviewRow label="Due" value={dueLabel} />
          <OverviewRow label="Notes" value={expense.notes?.trim() || 'No notes'} />
        </div>
        <div className={sheetFooterClass}>
<SheetActions onClose={onClose} onDuplicate={onDuplicate} onDelete={onDelete} />
          <button
            type="button"
            onClick={onEdit}
            className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
          >
            Edit
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function SheetActions({
  onClose,
  onDuplicate,
  onDelete,
}: {
  onClose: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={onDelete}
        className="mr-auto min-h-11 rounded-lg px-4 py-2 text-sm text-rose-600 dark:text-rose-400"
      >
        Delete
      </button>
      <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 py-2 text-sm">
        Close
      </button>
      <button type="button" onClick={onDuplicate} className="min-h-11 rounded-lg px-4 py-2 text-sm">
        Duplicate
      </button>
    </>
  )
}

function IncomeOverview({
  source,
  currency,
  range,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  source: IncomeSource
  currency: string
  range: DateRange
  onClose: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const pays = source.payDate
    ? incomePayDatesInPeriod(source, range).filter((date) => !isOffOnDate(source, date))
    : []
  const nextPay = source.payDate ? nextPayDateOnOrAfter(source, new Date()) : null
  return (
    <Sheet title={source.name} onClose={onClose}>
      <div className={sheetFormClass}>
        <div className={sheetBodyClass}>
          <OverviewRow
            label="Amount"
            value={`${formatMoney(source.amount, currency)} · ${cadenceLabel(source.cadence)}`}
          />
          <OverviewRow
            label="This period"
            value={formatMoney(incomePeriodAmount(source, range), currency)}
          />
          <OverviewRow
            label="Paydays"
            value={
              !source.payDate
                ? 'No payday set. The amount is spread evenly across the period.'
                : pays.length > 0
                  ? pays.map((date) => format(date, 'EEE, MMM d')).join(', ')
                  : 'None this period'
            }
          />
          {nextPay && <OverviewRow label="Next check" value={format(nextPay, 'EEE, MMM d, yyyy')} />}
        </div>
        <div className={sheetFooterClass}>
          <SheetActions onClose={onClose} onDuplicate={onDuplicate} onDelete={onDelete} />
          <button
            type="button"
            onClick={onEdit}
            className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
          >
            Edit
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  )
}

function ExpenseEditor({
  initial,
  mode,
  currency,
  onClose,
  onSave,
}: {
  initial: Expense | null
  mode: ItemEditor<Expense>['mode']
  currency: string
  onClose: () => void
  onSave: (expense: Expense) => void
}) {
  const [name, setName] = useState(
    mode === 'duplicate' ? copyName(initial?.name ?? '', 'Expense') : (initial?.name ?? ''),
  )
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '')
  const [category, setCategory] = useState(() => initial?.category ?? readLastCategory())
  const [customCategory, setCustomCategory] = useState(
    (DEFAULT_CATEGORIES as readonly string[]).includes(initial?.category ?? '')
      ? ''
      : (initial?.category ?? ''),
  )
  const [cadence, setCadence] = useState<ExpenseCadence>(initial?.cadence ?? 'once')
  const [startDate, setStartDate] = useState(() => {
    if (initial?.startDate) return initial.startDate
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })
  const [limited, setLimited] = useState(initial?.occurrenceLimit != null)
  const [occurrenceLimit, setOccurrenceLimit] = useState(
    initial?.occurrenceLimit?.toString() ?? '2',
  )
  const [occurrencesPosted, setOccurrencesPosted] = useState(
    initial?.occurrencesPosted?.toString() ?? '0',
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const isDefault = (DEFAULT_CATEGORIES as readonly string[]).includes(category)
  const usingCustom = category === '__custom__' || (!isDefault && customCategory.length > 0)

  return (
    <Sheet
      title={
        mode === 'duplicate'
          ? 'Duplicate expense'
          : mode === 'edit'
            ? 'Edit expense'
            : 'Add expense'
      }
      onClose={onClose}
      mobileActions={<MobileFormActions formId="expense-editor" onClose={onClose} />}
    >
      <form
        id="expense-editor"
        className={sheetFormClass}
        onSubmit={(e) => {
          e.preventDefault()
          const resolvedCategory = usingCustom ? customCategory.trim() : category
          if (!resolvedCategory || resolvedCategory === '__custom__') return
          onSave({
            id: mode === 'edit' && initial ? initial.id : newId('exp'),
            name: name.trim() || resolvedCategory,
            amount: Number(amount) || 0,
            category: resolvedCategory,
            cadence,
            startDate,
            occurrenceLimit:
              cadence === 'once' || !limited
                ? null
                : Math.max(1, Number(occurrenceLimit) || 1),
            occurrencesPosted: Math.max(0, Number(occurrencesPosted) || 0),
            enabled: initial?.enabled ?? true,
            offRanges: copiedOffRanges(initial?.offRanges),
            removedRanges: mode === 'duplicate' ? [] : copiedOffRanges(initial?.removedRanges),
            notes: notes.trim() || undefined,
          })
        }}
      >
        <div className={sheetBodyClass}>
        <Field label={`Amount (${currency})`}>
          <input
            required
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            autoFocus={mode !== 'edit'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} money text-lg`}
          />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm text-paper-2">Category</legend>
          <div className="flex flex-wrap gap-2">
            {[...DEFAULT_CATEGORIES, '__custom__'].map((c) => {
              const selected = c === '__custom__' ? usingCustom : category === c
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setCategory(c)
                    if (c !== '__custom__') setCustomCategory('')
                  }}
                  className={`press min-h-10 rounded-full px-3.5 text-sm ${
                    selected
                      ? 'bg-paper text-ink'
                      : 'text-paper ring-1 ring-rule-strong hover:bg-ledger-3'
                  }`}
                >
                  {c === '__custom__' ? 'Custom…' : c}
                </button>
              )
            })}
          </div>
          {!category && (
            <p className="mt-2 text-xs text-paper-3">Pick a category so the budget can place this.</p>
          )}
        </fieldset>
        {(category === '__custom__' || usingCustom) && (
          <Field label="Custom category">
            <input
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Name (optional)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Coffee"
            className={inputClass}
          />
        </Field>
        <Field label="How often">
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as ExpenseCadence)}
            className={inputClass}
          >
            {EXPENSE_CADENCES.map((c) => (
              <option key={c} value={c}>
                {cadenceLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={
            category === 'Credit cards' ? 'Minimum payment due date' : 'Starts / due date'
          }
        >
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
          {category === 'Credit cards' && (
            <span className="mt-1 block text-xs text-zinc-500">
              Pick any month’s due date (e.g. the 15th). Monthly cadence repeats that day.
            </span>
          )}
        </Field>
        {cadence !== 'once' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={limited}
            onChange={(e) => setLimited(e.target.checked)}
          />
          Ends after a set number of times (payment plan)
        </label>
        )}
        {cadence !== 'once' && limited && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total charges">
              <input
                type="number"
                min={1}
                value={occurrenceLimit}
                onChange={(e) => setOccurrenceLimit(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Already posted">
              <input
                type="number"
                min={0}
                value={occurrencesPosted}
                onChange={(e) => setOccurrencesPosted(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        )}
        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>
        </div>
        <div className={`${sheetFooterClass} hidden md:flex`}>
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
          >
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}

const inputClass =
  'mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-500">{label}</span>
      {children}
    </label>
  )
}

function MonthToggleDialog({
  name,
  month,
  turningOn,
  action,
  onPick,
  onClose,
}: {
  name: string
  month: string
  turningOn: boolean
  action: 'toggle' | 'delete'
  onPick: (scope: MonthToggleScope | 'all') => void
  onClose: () => void
}) {
  const [year, monthIndex] = month.split('-').map(Number)
  const monthName = format(new Date(year, (monthIndex ?? 1) - 1, 1), 'MMMM yyyy')
  const deleteOptions: { scope: MonthToggleScope | 'all'; title: string; detail: string }[] = [
    {
      scope: 'future',
      title: `${monthName} and later`,
      detail: 'Removes it from this month forward. Earlier months still show it, including amounts already counted.',
    },
    {
      scope: 'month',
      title: `Only ${monthName}`,
      detail: 'Removes it from this month only. Every other month still shows it.',
    },
    {
      scope: 'past',
      title: `${monthName} and earlier`,
      detail: 'Removes it through this month. Later months still show it.',
    },
    {
      scope: 'all',
      title: 'Every month',
      detail: 'Removes it from the whole budget, including past months.',
    },
  ]
  const options: { scope: MonthToggleScope | 'all'; title: string; detail: string }[] = action === 'delete'
    ? deleteOptions
    : turningOn
    ? [
        {
          scope: 'month',
          title: `Only ${monthName}`,
          detail: 'Turns it back on for this month. Every other month stays as it is.',
        },
        {
          scope: 'future',
          title: `${monthName} and later`,
          detail: 'Turns it back on from this month forward. Earlier months stay as they are.',
        },
        {
          scope: 'past',
          title: `${monthName} and earlier`,
          detail: 'Turns it back on through this month. Later months stay as they are.',
        },
        {
          scope: 'all',
          title: 'Every month',
          detail: 'Turns it back on everywhere and clears any months it was off.',
        },
      ]
    : [
        {
          scope: 'future',
          title: `${monthName} and later`,
          detail: 'Turns it off from this month forward. Earlier months stay on.',
        },
        {
          scope: 'month',
          title: `Only ${monthName}`,
          detail: 'Turns it off for this month only. Every other month stays on.',
        },
        {
          scope: 'past',
          title: `${monthName} and earlier`,
          detail: 'Turns it off through this month, including earlier months. Later months stay on.',
        },
        {
          scope: 'all',
          title: 'Turn off completely',
          detail: 'Turns it off for every month, past and future. You can turn it back on anytime.',
        },
      ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Cancel" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="month-toggle-title"
        className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl dark:bg-zinc-900 sm:rounded-2xl"
      >
        <h2 id="month-toggle-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {action === 'delete'
            ? `Delete ${name}`
            : turningOn
              ? `Turn ${name} back on`
              : `Turn off ${name}`}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {action === 'delete'
            ? `Choose which months lose ${name}. You can undo this for a few seconds.`
            : `Choose how far this change reaches from ${monthName}.`}
        </p>
        <div className="mt-4 space-y-2">
          {options.map((option) => (
            <button
              key={option.scope}
              type="button"
              onClick={() => onPick(option.scope)}
              className="block w-full rounded-2xl px-4 py-3 text-left ring-1 ring-zinc-200 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800"
            >
              <span className="block text-sm font-medium">{option.title}</span>
              <span className="mt-0.5 block text-xs text-zinc-500">{option.detail}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-3 min-h-11 w-full rounded-full text-sm">
          Cancel
        </button>
      </div>
    </div>
  )
}

