import { format } from 'date-fns'
import { useMemo, useState, type ReactNode } from 'react'
import {
  Sheet,
  sheetBodyClass,
  sheetFooterClass,
  sheetFormClass,
} from '../components/Sheet'
import { goalAmountForPeriod, goalProjection } from '../domain/goals'
import { cadenceLabel, formatMoney } from '../domain/money'
import { openingBalanceForRange, periodTotals } from '../domain/normalize'
import { periodRange } from '../domain/period'
import {
  CONTRIBUTION_CADENCES,
  type ContributionCadence,
  type Goal,
} from '../domain/types'
import { newId } from '../lib/ids'
import { useBudgetStore } from '../state/budgetStore'
import { useConfirmFlow } from '../components/ConfirmDialog'

export function Goals() {
  const goals = useBudgetStore((s) => s.goals)
  const income = useBudgetStore((s) => s.income)
  const expenses = useBudgetStore((s) => s.expenses)
  const meta = useBudgetStore((s) => s.meta)
  const addGoal = useBudgetStore((s) => s.addGoal)
  const updateGoal = useBudgetStore((s) => s.updateGoal)
  const removeGoal = useBudgetStore((s) => s.removeGoal)
  const { ask, dialog } = useConfirmFlow()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)

  const range = useMemo(
    () =>
      periodRange(
        meta.view,
        new Date(`${meta.anchorDate}T00:00:00`),
        meta.weekStartsOn,
      ),
    [meta.view, meta.anchorDate, meta.weekStartsOn],
  )
  const openingBalance = useMemo(
    () =>
      openingBalanceForRange({
        income,
        expenses,
        goals,
        currentBalance: meta.currentBalance,
        balanceMonth: meta.balanceMonth,
        range,
        weekStartsOn: meta.weekStartsOn,
      }),
    [income, expenses, goals, meta.currentBalance, meta.balanceMonth, meta.weekStartsOn, range],
  )
  const totals = periodTotals({
    income,
    monthlyOverride: meta.monthlyIncomeOverride,
    expenses,
    goals,
    view: meta.view,
    range,
    anchor: new Date(`${meta.anchorDate}T00:00:00`),
    currentBalance: openingBalance,
  })
  const beforeGoals = totals.available - totals.spending

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-[28px] leading-tight tracking-[-0.02em] text-paper">Goals</h1>
          <p className="text-sm text-zinc-500">
            See how long a contribution cadence takes to reach the target.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
        >
          Add goal
        </button>
      </header>

      {goals.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No goals yet. Add something you’re saving toward.
        </p>
      )}

      <div className="stagger grid gap-4 lg:grid-cols-2">
        {goals.map((goal) => {
          const projection = goalProjection(goal)
          const need = goalAmountForPeriod(goal, range)
          const onTrack = beforeGoals + 0.004 >= need
          const steps = projection.periodsRemaining ?? 0
          const maxDots = Math.min(24, Math.max(steps, 1))

          return (
            <article
              key={goal.id}
              className="card-surface rounded-xl p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{goal.name}</h2>
                  <p className="text-sm text-zinc-500">
                    {formatMoney(goal.savedAmount, meta.currency)} of{' '}
                    {formatMoney(goal.targetAmount, meta.currency)} ·{' '}
                    {formatMoney(goal.contributionAmount, meta.currency)}{' '}
                    {cadenceLabel(goal.contributionCadence).toLowerCase()}
                    {goal.startDate
                      ? ` · starts ${format(new Date(`${goal.startDate}T00:00:00`), 'MMM d, yyyy')}`
                      : ''}
                  </p>
                </div>
                <div className="-mr-2 flex">
                  <button
                    type="button"
                    className="min-h-10 rounded-md px-2 text-sm text-zinc-500 hover:text-paper"
                    onClick={() => setEditing(goal)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="min-h-10 rounded-md px-2 text-sm text-over hover:bg-over/10"
                    onClick={async () => {
                      const ok = await ask([
                        {
                          title: `Delete ${goal.name}?`,
                          body: 'Its saved progress and future contributions are removed. This can’t be undone.',
                          confirmLabel: 'Delete goal',
                        },
                      ])
                      if (ok) removeGoal(goal.id)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="bar-grow h-full rounded-full bg-violet-600 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${projection.percentFunded}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                {projection.percentFunded.toFixed(0)}% funded
              </p>

              {projection.funded ? (
                <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
                  This goal is fully funded.
                </p>
              ) : projection.periodsRemaining == null ? (
                <p className="mt-3 text-sm text-zinc-500">
                  Set a contribution amount to estimate a finish date.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm">
                    At {formatMoney(goal.contributionAmount, meta.currency)}{' '}
                    {cadenceLabel(goal.contributionCadence).toLowerCase()}, this takes{' '}
                    <strong className="font-semibold">
                      {projection.periodsRemaining}{' '}
                      {projection.periodsRemaining === 1 ? 'contribution' : 'contributions'}
                    </strong>
                    {projection.estimatedDate
                      ? ` (~ ${format(projection.estimatedDate, 'MMM d, yyyy')})`
                      : ''}
                    .
                  </p>
                  <div className="flex flex-wrap gap-1" aria-hidden>
                    {Array.from({ length: maxDots }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-2.5 w-2.5 rounded-full ${
                          i < Math.min(
                            maxDots,
                            Math.floor(
                              goal.savedAmount / Math.max(goal.contributionAmount, 1),
                            ),
                          )
                            ? 'bg-violet-600'
                            : 'bg-violet-200 dark:bg-violet-900'
                        }`}
                      />
                    ))}
                    {steps > 24 && (
                      <span className="text-xs text-zinc-500">+{steps - 24}</span>
                    )}
                  </div>
                  {goal.targetDate && (
                    <p className="text-sm text-zinc-500">
                      Target {format(new Date(`${goal.targetDate}T00:00:00`), 'MMM d, yyyy')}:{' '}
                      {projection.beatsTargetDate
                        ? 'this cadence beats that date'
                        : 'this cadence misses that date'}
                    </p>
                  )}
                  <p
                    className={`text-sm ${
                      onTrack
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-800 dark:text-amber-200'
                    }`}
                  >
                    {onTrack
                      ? `On track from cash before goals this ${meta.view === 'weekly' ? 'week' : 'month'} (${formatMoney(beforeGoals, meta.currency)} available vs ${formatMoney(need, meta.currency)} needed).`
                      : `This contribution competes with expenses: cash before goals is ${formatMoney(beforeGoals, meta.currency)}, need ${formatMoney(need, meta.currency)} this ${meta.view === 'weekly' ? 'week' : 'month'}.`}
                  </p>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {editing && (
        <GoalEditor
          initial={editing === 'new' ? null : editing}
          currency={meta.currency}
          onClose={() => setEditing(null)}
          onSave={(goal) => {
            if (editing === 'new') addGoal(goal)
            else updateGoal(goal.id, goal)
            setEditing(null)
          }}
        />
      )}
      {dialog}
    </div>
  )
}

function GoalEditor({
  initial,
  currency,
  onClose,
  onSave,
}: {
  initial: Goal | null
  currency: string
  onClose: () => void
  onSave: (goal: Goal) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [targetAmount, setTargetAmount] = useState(initial?.targetAmount?.toString() ?? '')
  const [savedAmount, setSavedAmount] = useState(initial?.savedAmount?.toString() ?? '0')
  const [contributionAmount, setContributionAmount] = useState(
    initial?.contributionAmount?.toString() ?? '',
  )
  const [cadence, setCadence] = useState<ContributionCadence>(
    initial?.contributionCadence ?? 'monthly',
  )
  const [startDate, setStartDate] = useState(
    initial?.startDate ?? new Date().toISOString().slice(0, 10),
  )
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '')

  return (
    <Sheet title={initial ? 'Edit goal' : 'Add goal'} onClose={onClose}>
      <form
        className={sheetFormClass}
        onSubmit={(e) => {
          e.preventDefault()
          onSave({
            id: initial?.id ?? newId('goal'),
            name: name.trim() || 'Goal',
            targetAmount: Number(targetAmount) || 0,
            savedAmount: Number(savedAmount) || 0,
            contributionAmount: Number(contributionAmount) || 0,
            contributionCadence: cadence,
            startDate,
            targetDate: targetDate || undefined,
          })
        }}
      >
        <div className={sheetBodyClass}>
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label={`Target (${currency})`}>
          <input
            required
            type="number"
            min={0}
            step="0.01"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={`Already saved (${currency})`}>
          <input
            type="number"
            min={0}
            step="0.01"
            value={savedAmount}
            onChange={(e) => setSavedAmount(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={`Set aside (${currency})`}>
          <input
            required
            type="number"
            min={0}
            step="0.01"
            value={contributionAmount}
            onChange={(e) => setContributionAmount(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="How often">
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as ContributionCadence)}
            className={inputClass}
          >
            {CONTRIBUTION_CADENCES.map((c) => (
              <option key={c} value={c}>
                {cadenceLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="First contribution date">
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Later contributions follow this cadence and show on the calendar.
          </span>
        </Field>
        <Field label="Optional target date">
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        </div>
        <div className={sheetFooterClass}>
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
