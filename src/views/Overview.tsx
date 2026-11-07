import { addDays, format, formatISO, startOfDay } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BalanceChart, periodBalanceSeries } from '../components/BalanceChart'
import { CashflowCalendar } from '../components/CashflowCalendar'
import { OverviewCard, OverviewGrid } from '../components/OverviewGrid'
import { SankeyChart } from '../components/SankeyChart'
import { calendarEvents, type CalendarEvent } from '../domain/calendar'
import { goalAmountForPeriod } from '../domain/goals'
import { formatMoney } from '../domain/money'
import { AnimatedMoney } from '../components/AnimatedMoney'
import { expenseAmountForView, openingBalanceForRange, periodTotals } from '../domain/normalize'
import { periodRange, shiftAnchor } from '../domain/period'
import { sankeyLinks } from '../domain/sankey'
import { categoryColor, getSankeyTheme, readableTextOn, SANKEY_THEMES } from '../domain/sankeyThemes'
import type { Expense, ViewPeriod } from '../domain/types'
import { periodLabel } from '../lib/periodLabel'
import { Runway } from '../components/Runway'
import { PageHeader } from '../components/ui'
import { useAuthStore } from '../state/authStore'
import { useBudgetStore } from '../state/budgetStore'

type OpenTab = 'expenses' | 'goals' | 'settings'
type TxFilter = 'all' | 'income' | 'expense' | 'goal'
/** How far the Transactions card looks: the next 7 or 14 days, the rest of the period, or all of it. */
type TxWindow = '7' | '14' | 'rest' | 'all'

const TX_WINDOWS: { id: TxWindow; label: string }[] = [
  { id: '7', label: '7 days' },
  { id: '14', label: '14 days' },
  { id: 'rest', label: 'Rest of period' },
  { id: 'all', label: 'Whole period' },
]
const TX_WINDOW_KEY = 'flow.txWindow'

function readTxWindow(): TxWindow {
  try {
    const value = localStorage.getItem(TX_WINDOW_KEY)
    if (value === '7' || value === '14' || value === 'rest' || value === 'all') return value
  } catch {
    // Storage can be blocked; fall back to the default.
  }
  return 'rest'
}

export function Overview({
  onOpen,
  onLog,
}: {
  onOpen: (tab: OpenTab) => void
  /** Opens the add-expense sheet. */
  onLog: () => void
}) {
  const income = useBudgetStore((s) => s.income)
  const expenses = useBudgetStore((s) => s.expenses)
  const goals = useBudgetStore((s) => s.goals)
  const meta = useBudgetStore((s) => s.meta)
  const setView = useBudgetStore((s) => s.setView)
  const setAnchorDate = useBudgetStore((s) => s.setAnchorDate)
  const setMonthlyIncomeOverride = useBudgetStore((s) => s.setMonthlyIncomeOverride)
  const setSankeyTheme = useBudgetStore((s) => s.setSankeyTheme)
  const user = useAuthStore((s) => s.user)
  const restoringAuth = useAuthStore((s) => s.restoring)
  const name = user?.displayName ?? user?.email ?? null
  const syncing = useAuthStore((s) => s.syncing)
  const syncNote = useAuthStore((s) => s.syncNote)
  const lastSyncedAtMs = useAuthStore((s) => s.lastSyncedAtMs)
  const syncNow = useAuthStore((s) => s.syncNow)
  const saveCheckpoint = useAuthStore((s) => s.saveCheckpoint)
  const [txFilter, setTxFilter] = useState<TxFilter>('all')
  const [txWindow, setTxWindowState] = useState<TxWindow>(readTxWindow)
  const setTxWindow = (value: TxWindow) => {
    setTxWindowState(value)
    try {
      localStorage.setItem(TX_WINDOW_KEY, value)
    } catch {
      // Not remembered across visits; the choice still applies now.
    }
  }
  const [editingLayout, setEditingLayout] = useState(false)

  const range = useMemo(
    () =>
      periodRange(meta.view, new Date(`${meta.anchorDate}T00:00:00`), meta.weekStartsOn),
    [meta.view, meta.anchorDate, meta.weekStartsOn],
  )
  const anchor = useMemo(() => new Date(`${meta.anchorDate}T00:00:00`), [meta.anchorDate])
  const prevRange = useMemo(
    () => periodRange(meta.view, shiftAnchor(meta.view, anchor, -1), meta.weekStartsOn),
    [meta.view, anchor, meta.weekStartsOn],
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

  const totals = useMemo(
    () =>
      periodTotals({
        income,
        monthlyOverride: meta.monthlyIncomeOverride,
        expenses,
        goals,
        view: meta.view,
        range,
        anchor,
        currentBalance: openingBalance,
      }),
    [income, expenses, goals, meta.monthlyIncomeOverride, openingBalance, meta.view, range, anchor],
  )

  const model = useMemo(
    () =>
      sankeyLinks({
        income,
        monthlyOverride: meta.monthlyIncomeOverride,
        expenses,
        goals,
        view: meta.view,
        range,
        anchor,
        currentBalance: openingBalance,
      }),
    [income, expenses, goals, meta.monthlyIncomeOverride, openingBalance, meta.view, range, anchor],
  )

  const events = useMemo(
    () => calendarEvents({ income, expenses, goals, range }),
    [income, expenses, goals, range],
  )
  const series = useMemo(
    () => periodBalanceSeries(openingBalance, events, range),
    [openingBalance, events, range],
  )
  const categories = useMemo(
    () => spendByCategory(expenses, meta.view, range),
    [expenses, meta.view, range],
  )
  const previousCategories = useMemo(
    () => spendByCategory(expenses, meta.view, prevRange),
    [expenses, meta.view, prevRange],
  )

  const endingCash = series[series.length - 1]?.balance ?? openingBalance
  const cashDelta = endingCash - openingBalance
  const periodWord = meta.view === 'weekly' ? 'week' : 'month'
  const goalNeed = useMemo(
    () => goals.reduce((sum, goal) => sum + goalAmountForPeriod(goal, range), 0),
    [goals, range],
  )
  const afterBills = totals.available - totals.spending
  const theme = getSankeyTheme(meta.sankeyTheme)
  const cushion = cushionLabel(totals.leftover)
  const prevSpend = previousCategories.reduce((sum, row) => sum + row.amount, 0)
  const spendDelta = totals.spending - prevSpend
  const spendPct = prevSpend > 0.004 ? (spendDelta / prevSpend) * 100 : null

  const rankedGoals = useMemo(() => {
    return [...goals]
      .sort((a, b) => {
        const contrib = goalAmountForPeriod(b, range) - goalAmountForPeriod(a, range)
        if (Math.abs(contrib) > 0.004) return contrib
        const aPct = a.targetAmount <= 0 ? 1 : a.savedAmount / a.targetAmount
        const bPct = b.targetAmount <= 0 ? 1 : b.savedAmount / b.targetAmount
        return aPct - bPct
      })
      .slice(0, 3)
  }, [goals, range])

  const transactions = useMemo(() => {
    const today = startOfDay(new Date())
    // "From today" only makes sense while today is inside the period being viewed.
    const inPeriod = today >= range.start && today <= range.end
    const from = txWindow === 'all' || !inPeriod ? range.start : today
    const until =
      txWindow === '7' ? addDays(from, 7) : txWindow === '14' ? addDays(from, 14) : null
    return events.filter(
      (event) =>
        (txFilter === 'all' || event.kind === txFilter) &&
        event.date >= from &&
        (until == null || event.date < until),
    )
  }, [events, txFilter, txWindow, range])
  const { txIn, txOut } = useMemo(() => {
    let inflow = 0
    let outflow = 0
    for (const event of transactions) {
      if (event.kind === 'income') inflow += event.amount
      else outflow += event.amount
    }
    return { txIn: inflow, txOut: outflow }
  }, [transactions])

  const prevByCategory = useMemo(
    () => new Map(previousCategories.map((row) => [row.category, row.amount])),
    [previousCategories],
  )
  const envelope = Math.max(0, totals.income)
  // Bills plus goal contributions, so "left" is the same number as the Left over card.
  const planned = totals.spending + totals.goalContributions
  const left = totals.leftover
  const spentRatio =
    envelope > 0 ? Math.min(1, planned / envelope) : planned > 0 ? 1 : 0

  const shift = (delta: number) => {
    const next = shiftAnchor(meta.view, new Date(`${meta.anchorDate}T00:00:00`), delta)
    setAnchorDate(formatISO(next, { representation: 'date' }))
  }

  return (
    <div className="pb-2">
      <PageHeader
        title="Today"
        subtitle={`${periodLabel(meta.view, range)} at a glance`}
        actions={
          <>
          {editingLayout && (
            <button
              type="button"
              onClick={() => setEditingLayout(false)}
              className="press inline-flex h-9 items-center rounded-lg bg-paper px-3 text-sm font-medium text-ink"
            >
              Done
            </button>
          )}
          <CustomizeMenu
          onRearrange={() => setEditingLayout(true)}
          syncing={syncing}
          syncNote={syncNote}
          lastSyncedAtMs={lastSyncedAtMs}
          signedIn={Boolean(user) || restoringAuth}
          restoring={restoringAuth}
          override={meta.monthlyIncomeOverride}
          themeId={meta.sankeyTheme}
          onSync={() => void syncNow()}
          onCheckpoint={() => void saveCheckpoint()}
          onOverride={setMonthlyIncomeOverride}
          onTheme={setSankeyTheme}
          onSettings={() => onOpen('settings')}
        />
          </>
        }
      />

      <Runway currency={meta.currency} />


      {goalNeed > 0.004 && goalNeed > afterBills + 0.004 && (
        <p className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Goal contributions need {formatMoney(goalNeed, meta.currency)} this {periodWord}.
          Projected cash after bills is {formatMoney(afterBills, meta.currency)}.
        </p>
      )}

      <OverviewGrid editing={editingLayout}>
        <OverviewCard id="balance">
          <Card>
            <CardHeader title="Balance">
              <DashboardMenu
                label={meta.view === 'weekly' ? '1 week' : '1 month'}
                menuLabel={`Showing ${periodLabel(meta.view, range)}`}
              >
                {(close) => (
                  <>
                    <p className="px-3 py-2 text-xs text-zinc-500">
                      {periodLabel(meta.view, range)}
                    </p>
                    <MenuChoice
                      active={meta.view === 'weekly'}
                      onClick={() => {
                        setView('weekly')
                        close()
                      }}
                    >
                      1 week
                    </MenuChoice>
                    <MenuChoice
                      active={meta.view === 'monthly'}
                      onClick={() => {
                        setView('monthly')
                        close()
                      }}
                    >
                      1 month
                    </MenuChoice>
                    <div className="my-1 h-px bg-rule-strong" />
                    <MenuChoice
                      onClick={() => {
                        shift(-1)
                        close()
                      }}
                    >
                      Previous
                    </MenuChoice>
                    <MenuChoice
                      onClick={() => {
                        shift(1)
                        close()
                      }}
                    >
                      Next
                    </MenuChoice>
                  </>
                )}
              </DashboardMenu>
            </CardHeader>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <p className={METRIC}>
                <AnimatedMoney value={endingCash} currency={meta.currency} />
              </p>
              <p
                className={`text-sm font-medium tabular-nums ${
                  Math.abs(cashDelta) < 0.005
                    ? 'text-zinc-500'
                    : cashDelta > 0
                      ? 'text-cash'
                      : 'text-rose-400'
                }`}
              >
                {cashDelta < -0.005 ? '↓' : '↑'} {formatMoney(Math.abs(cashDelta), meta.currency)}
              </p>
            </div>
            {meta.view === 'weekly' && totals.reservedLaterMonth > 0.004 && (
              <p className="mt-2 text-xs text-zinc-500">
                Held for later this month {formatMoney(totals.reservedLaterMonth, meta.currency)}.
                Projected {formatMoney(totals.projectedBalance, meta.currency)}.
              </p>
            )}
            {meta.monthlyIncomeOverride != null && (
              <p className="mt-2 text-xs text-zinc-500">
                Income override {formatMoney(meta.monthlyIncomeOverride, meta.currency)} is applied
                to the totals.
              </p>
            )}
            <div className="mt-2">
              <BalanceChart points={series} events={events} currency={meta.currency} />
            </div>
          </Card>
        </OverviewCard>

        <OverviewCard id="goals">
          <Card>
            <CardHeader title="Goals" subtitle="Top priorities">
              {goals.length > 3 && <CardLink onClick={() => onOpen('goals')}>See all</CardLink>}
            </CardHeader>
            {rankedGoals.length === 0 ? (
              <EmptyState message="No goals yet." action="Add a goal" onAction={() => onOpen('goals')} />
            ) : (
              <ul className="mt-1 space-y-1">
                {rankedGoals.map((goal, index) => {
                  const pct =
                    goal.targetAmount <= 0
                      ? 100
                      : Math.min(100, (goal.savedAmount / goal.targetAmount) * 100)
                  const contribution = goalAmountForPeriod(goal, range)
                  return (
                    <li key={goal.id}>
                      <button
                        type="button"
                        onClick={() => onOpen('goals')}
                        className={`${ROW} items-start py-2.5`}
                      >
                        <span className="compact:hidden">
                          <GoalMark index={index} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-paper-2">
                                {goal.name}
                              </p>
                              <p className="mt-0.5 text-lg font-semibold text-zinc-50 tabular-nums compact:text-base">
                                {formatMoney(goal.savedAmount, meta.currency)}
                                <span className="ml-1.5 hidden text-xs font-normal text-zinc-500 compact:inline">
                                  {pct.toFixed(0)}%
                                </span>
                              </p>
                            </div>
                            {contribution > 0.004 && (
                              <p className="shrink-0 text-right text-sm font-medium text-cash tabular-nums compact:hidden">
                                +{formatMoney(contribution, meta.currency)}
                                <span className="mt-0.5 block text-xs font-normal">
                                  this {periodWord}
                                </span>
                              </p>
                            )}
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule-strong">
                            <div
                              className="h-full rounded-full bg-cash transition-[width] duration-500 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </OverviewCard>

        <OverviewCard id="bills">
          <Card>
            <CardHeader
              title="Bills & one-offs"
              subtitle={prevSpend > 0.004 ? `Planned · vs last ${periodWord}` : `Planned this ${periodWord}`}
            />
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <p className={METRIC}>
                <AnimatedMoney value={totals.spending} currency={meta.currency} />
              </p>
              {spendPct != null && Math.abs(spendDelta) >= 0.005 && (
                <p
                  className={`text-sm font-medium tabular-nums ${
                    spendDelta > 0 ? 'text-rose-400' : 'text-cash'
                  }`}
                >
                  {spendDelta > 0 ? '↑' : '↓'} {Math.abs(spendPct).toFixed(0)}%
                </p>
              )}
            </div>
            {categories.length === 0 ? (
              <EmptyState message="No bills this period." action="Add an expense" onAction={onLog} />
            ) : (
              <>
              {/* Narrow cards trade the detail lines for one stacked share bar. */}
              <div className="mt-3 hidden h-1.5 gap-0.5 overflow-hidden rounded-full compact:flex">
                {categories.map((row) => (
                  <span
                    key={row.category}
                    className="h-full"
                    style={{ flex: row.amount, background: categoryColor(theme, row.category) }}
                  />
                ))}
              </div>
              <ul className="mt-3 divide-y divide-rule compact:mt-1">
                {categories.slice(0, 4).map((row, index) => {
                  const change =
                    prevSpend > 0.004
                      ? spendChange(row.amount, prevByCategory.get(row.category) ?? 0)
                      : null
                  return (
                    <li
                      key={row.category}
                      className={`flex items-center gap-3 py-2.5 compact:py-2 ${index === 3 ? 'compact:hidden' : ''}`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: categoryColor(theme, row.category) }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-100">{row.category}</p>
                        <p className="truncate text-xs text-zinc-500 compact:hidden">{row.topName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-zinc-100 tabular-nums">
                          {formatMoney(row.amount, meta.currency)}
                        </p>
                        {change && (
                          <p className={`text-xs tabular-nums compact:hidden ${changeClass(change.tone)}`}>
                            {change.arrow ? `${change.tone === 'up' ? '↑' : '↓'} ` : ''}
                            {change.label}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              </>
            )}
          </Card>
        </OverviewCard>

        <OverviewCard id="leftover">
          <Card>
            <CardHeader
              title="Left over"
              subtitle={periodLabel(meta.view, range)}
              hint="Income minus bills and goal contributions for this period."
            >
              <span className="compact:hidden">
                <AccountPhoto user={user} name={name} />
              </span>
            </CardHeader>
            {/* The figure leads; the ledger beside it shows how it was reached. */}
            <div className="grid flex-1 content-center gap-x-8 gap-y-4 @md:grid-cols-[auto_minmax(0,1fr)] @md:items-center">
              <div>
                <p className={`${METRIC} whitespace-nowrap ${totals.leftover < -0.004 ? 'text-rose-300' : ''}`}>
                  <AnimatedMoney value={totals.leftover} currency={meta.currency} />
                </p>
                <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${cushion.className}`}>
                  {cushion.label}
                </span>
              </div>
              <div className="min-w-0 compact:hidden">
                <LeftoverBar
                  income={totals.income}
                  bills={totals.spending}
                  goals={totals.goalContributions}
                />
                <dl className="mt-3 space-y-1.5 text-sm">
                  <LedgerLine label="Income" value={totals.income} currency={meta.currency} tone="text-cash" sign="+" />
                  <LedgerLine label="Bills" value={totals.spending} currency={meta.currency} tone="text-paper" sign="−" />
                  {totals.goalContributions > 0.004 && (
                    <LedgerLine
                      label="Goals"
                      value={totals.goalContributions}
                      currency={meta.currency}
                      tone="text-copper"
                      sign="−"
                    />
                  )}
                </dl>
              </div>
            </div>
          </Card>
        </OverviewCard>

        <OverviewCard id="spending">
          <Card>
            <CardHeader title="Planned spending" subtitle={`Where this ${periodWord}'s money goes`}>
              <span className="text-sm font-medium text-zinc-100 tabular-nums">
                <AnimatedMoney value={totals.spending} currency={meta.currency} />
              </span>
            </CardHeader>
            <div className="min-h-64 flex-1">
              <SankeyChart
                model={model}
                currency={meta.currency}
                themeId={meta.sankeyTheme}
                surface="dark"
              />
            </div>
          </Card>
        </OverviewCard>

        <OverviewCard id="transactions">
          <Card>
            <CardHeader title="Transactions" subtitle={`This ${periodWord}`}>
              <DashboardMenu
                label={
                  txFilter === 'all'
                    ? 'All transactions'
                    : txFilter === 'income'
                      ? 'Income'
                      : txFilter === 'goal'
                        ? 'Goals'
                        : 'Expenses'
                }
              >
                {(close) =>
                  (
                    [
                      ['all', 'All transactions'],
                      ['expense', 'Expenses'],
                      ['income', 'Income'],
                      ['goal', 'Goals'],
                    ] as const
                  ).map(([id, label]) => (
                    <MenuChoice
                      key={id}
                      active={txFilter === id}
                      onClick={() => {
                        setTxFilter(id)
                        close()
                      }}
                    >
                      {label}
                    </MenuChoice>
                  ))
                }
              </DashboardMenu>
            </CardHeader>
            <div className="-mt-1 mb-3 flex flex-wrap items-center gap-1.5">
              {TX_WINDOWS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={txWindow === option.id}
                  onClick={() => setTxWindow(option.id)}
                  className={`min-h-7 rounded-md px-2.5 text-xs ${
                    txWindow === option.id
                      ? 'bg-ledger-4 text-paper ring-1 ring-rule-strong'
                      : 'text-paper-3 hover:bg-ledger-3 hover:text-paper'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              {transactions.length > 0 && (
                <span className="money ml-auto text-xs text-paper-3 compact:hidden">
                  {transactions.length} · <span className="text-cash">+{formatMoney(txIn, meta.currency)}</span>{' '}
                  −{formatMoney(txOut, meta.currency)}
                </span>
              )}
            </div>
            {transactions.length === 0 ? (
              <EmptyState
                message={
                  txWindow === '7' || txWindow === '14'
                    ? `Nothing scheduled in the next ${txWindow} days.`
                    : txWindow === 'rest'
                      ? 'Nothing left this period.'
                      : 'Nothing scheduled this period.'
                }
              />
            ) : (
              <ul className="space-y-0.5">
                {transactions.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(event.kind === 'goal' ? 'goals' : 'expenses')}
                      className={`${ROW} items-center py-2.5`}
                    >
                      <EventMark event={event} color={eventColor(event, theme)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">{event.name}</p>
                        <p className="truncate text-xs text-zinc-500 @sm:hidden">
                          {event.category ?? kindLabel(event.kind)} · {format(event.date, 'MMM d')}
                        </p>
                      </div>
                      <p className="hidden min-w-0 flex-1 items-center gap-2 text-sm text-zinc-400 @sm:flex">
                        <EventGlyph kind={event.kind} />
                        <span className="truncate">
                          {event.category ?? kindLabel(event.kind)}
                        </span>
                        <span className="money ml-auto shrink-0 pr-2 text-xs text-paper-3">
                          {format(event.date, 'EEE MMM d')}
                        </span>
                      </p>
                      <p
                        className={`shrink-0 text-sm tabular-nums ${
                          event.kind === 'income' ? 'text-cash' : 'text-zinc-100'
                        }`}
                      >
                        {event.kind === 'income' ? '+' : ''}
                        {formatMoney(event.amount, meta.currency)}
                      </p>
                      <span className="compact:hidden">
                        <ChevronRight />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </OverviewCard>

        <OverviewCard id="budget">
          <Card>
            <CardHeader title="Budget" subtitle={periodLabel(meta.view, range)} />
            {/* Narrow cards lead with what's left; wide ones keep the budget line. */}
            <p
              className={`${METRIC} hidden compact:block ${left < -0.004 ? 'text-rose-300' : 'text-cash'}`}
            >
              {left < -0.004
                ? `${formatMoney(Math.abs(left), meta.currency)} over`
                : `${formatMoney(left, meta.currency)} left`}
            </p>
            <div className="flex items-start justify-between gap-3 compact:hidden">
              <p className="text-sm text-zinc-200">Expenses</p>
              <p className="text-right text-sm text-zinc-400 tabular-nums">
                {formatMoney(envelope, meta.currency)} budget
              </p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rule-strong">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${left < -0.004 ? 'bg-rose-400' : 'bg-zinc-200'}`}
                style={{ width: `${spentRatio * 100}%` }}
              />
            </div>
            <p className="mt-2 hidden truncate text-sm text-zinc-400 tabular-nums compact:block">
              {formatMoney(planned, meta.currency)} of {formatMoney(envelope, meta.currency)}
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-3 text-sm compact:hidden">
              <p className="text-zinc-400 tabular-nums">
                {formatMoney(planned, meta.currency)} planned
              </p>
              <p
                className={`tabular-nums ${left < -0.004 ? 'text-rose-300' : 'text-cash'}`}
              >
                {left < -0.004
                  ? `${formatMoney(Math.abs(left), meta.currency)} over`
                  : `${formatMoney(left, meta.currency)} left`}
              </p>
            </div>
            {totals.goalContributions > 0.004 && (
              <p className="mt-2 text-xs text-zinc-500">
                {formatMoney(totals.goalContributions, meta.currency)} going to goals
              </p>
            )}
          </Card>
        </OverviewCard>

        <OverviewCard id="calendar">
      <Card>
        <div className="min-h-0 flex-1">
          <CashflowCalendar
            income={income}
            expenses={expenses}
            goals={goals}
            view={meta.view}
            range={range}
            anchorDate={meta.anchorDate}
            currency={meta.currency}
            weekStartsOn={meta.weekStartsOn}
            currentBalance={openingBalance}
            reservedNote={
              meta.view === 'weekly' && totals.reservedItems.length > 0
                ? `Not shown this week: ${totals.reservedItems
                    .slice(0, 3)
                    .map((item) => `${item.name} ${format(item.date, 'MMM d')}`)
                    .join(', ')}`
                : undefined
            }
          />
        </div>
      </Card>
        </OverviewCard>
      </OverviewGrid>
    </div>
  )
}

function AccountPhoto({
  user,
  name,
}: {
  user: {
    photoURL: string | null
    reload: () => Promise<void>
    providerData: ReadonlyArray<{ providerId: string; photoURL: string | null }>
  } | null
  name: string | null
}) {
  const [src, setSrc] = useState<string | null>(() => accountPhotoUrl(user))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setSrc(accountPhotoUrl(user))
    if (!user) return
    void user
      .reload()
      .then(() => {
        if (cancelled) return
        setSrc(accountPhotoUrl(user))
        setFailed(false)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user])

  if (!src || failed) {
    return (
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full bg-rule-strong text-zinc-200"
        role="img"
        aria-label={name ?? 'Your account'}
      >
        {name ? (
          <span className="text-sm font-medium">{name.slice(0, 1).toUpperCase()}</span>
        ) : (
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <circle cx="8" cy="5.5" r="2.8" />
            <path d="M2.5 14c.8-3 3-4.4 5.5-4.4s4.7 1.4 5.5 4.4" />
          </svg>
        )}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-10 w-10 rounded-full object-cover"
    />
  )
}

function accountPhotoUrl(
  user: {
    photoURL: string | null
    providerData: ReadonlyArray<{ providerId: string; photoURL: string | null }>
  } | null,
): string | null {
  if (!user) return null
  const google = user.providerData.find((entry) => entry.providerId === 'google.com')?.photoURL
  return normalizeGooglePhoto(google || user.photoURL)
}

function normalizeGooglePhoto(url: string | null | undefined): string | null {
  if (!url) return null
  if (!url.includes('googleusercontent.com')) return url
  if (/=s\d+(-c)?/.test(url)) return url.replace(/=s\d+(-c)?/, '=s128-c')
  return url
}

const METRIC =
  'money text-[1.75rem] compact:text-xl leading-none font-medium tracking-[-0.03em] text-paper'

/** Shared list row: full-bleed hover that lines up with the card padding. */
const ROW =
  'flex gap-3 rounded-xl -mx-2 w-[calc(100%+1rem)] px-2 text-left hover:bg-rule'

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="card-surface @container flex h-full min-h-0 flex-col overflow-hidden rounded-[20px]">
      <div className="card-scroll flex min-h-0 flex-1 flex-col overflow-auto p-5">{children}</div>
    </section>
  )
}

function CardHeader({
  title,
  subtitle,
  hint,
  children,
}: {
  title: string
  subtitle?: string
  hint?: string
  children?: ReactNode
}) {
  return (
    <header className="mb-3 flex min-h-8 shrink-0 items-center gap-2">
      <h2 className="text-sm font-medium text-zinc-300">{title}</h2>
      {hint && (
        <span className="text-zinc-500" title={hint} aria-label={hint} role="img">
          <InfoIcon />
        </span>
      )}
      {subtitle && <span className="truncate text-xs text-zinc-500">{subtitle}</span>}
      {children && <div className="ml-auto flex shrink-0 items-center">{children}</div>}
    </header>
  )
}

function CardLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/link inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-zinc-400 hover:bg-rule hover:text-zinc-100"
    >
      {children}
      <span className="transition-transform duration-200 group-hover/link:translate-x-0.5">→</span>
    </button>
  )
}

function EmptyState({
  message,
  action,
  onAction,
}: {
  message: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-rule px-4 py-6 text-center">
      <p className="text-sm text-zinc-400">{message}</p>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 rounded-full px-3 py-1 text-sm font-medium text-cash hover:bg-cash/10"
        >
          {action}
        </button>
      )}
    </div>
  )
}

function DashboardMenu({
  label,
  menuLabel,
  children,
}: {
  label: string
  menuLabel?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={menuLabel ?? label}
        onClick={() => setOpen((value) => !value)}
        className="press inline-flex h-8 max-w-[11rem] items-center gap-1.5 rounded-lg bg-ledger-4 px-2.5 text-sm text-zinc-200 ring-1 ring-rule-strong"
      >
        <span className="truncate compact:hidden">{label}</span>
        <span className="hidden compact:inline">
          <FilterIcon />
        </span>
        <span className="compact:hidden">
          <ChevronDown />
        </span>
      </button>
      {open && (
        <div className="pop-in absolute right-0 z-20 mt-2 w-52 rounded-xl bg-ledger-4 p-1 shadow-2xl ring-1 ring-rule-strong">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuChoice({
  children,
  onClick,
  active = false,
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-rule"
    >
      {children}
      {active && <span aria-hidden="true">✓</span>}
    </button>
  )
}

function CustomizeMenu({
  onRearrange,
  syncing,
  syncNote,
  lastSyncedAtMs,
  signedIn,
  restoring,
  override,
  themeId,
  onSync,
  onCheckpoint,
  onOverride,
  onTheme,
  onSettings,
}: {
  onRearrange: () => void
  syncing: boolean
  syncNote: string | null
  lastSyncedAtMs: number | null
  signedIn: boolean
  restoring: boolean
  override: number | null
  themeId: (typeof SANKEY_THEMES)[number]
  onSync: () => void
  onCheckpoint: () => void
  onOverride: (value: number | null) => void
  onTheme: (id: (typeof SANKEY_THEMES)[number]) => void
  onSettings: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="press inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-zinc-200 ring-1 ring-rule-strong hover:bg-rule"
      >
        <SlidersIcon />
        Customize
      </button>
      {open && (
        <div className="pop-in absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-ledger-4 p-3 shadow-2xl ring-1 ring-rule-strong">
          <button
            type="button"
            onClick={() => {
              onRearrange()
              setOpen(false)
            }}
            className="press mb-3 h-9 w-full rounded-lg bg-ledger-3 text-sm text-paper ring-1 ring-rule"
          >
            Rearrange or add cards
          </button>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing || restoring}
            className="press h-9 w-full rounded-lg bg-ledger-3 text-sm text-paper ring-1 ring-rule disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            type="button"
            onClick={onCheckpoint}
            disabled={syncing || restoring}
            className="press mt-2 h-9 w-full rounded-lg bg-ledger-3 text-sm text-paper ring-1 ring-rule disabled:opacity-50"
          >
            Save checkpoint
          </button>
          <p className="mt-2 text-xs text-zinc-500">
            {syncNote ?? (lastSyncedAtMs ? 'Last sync' : 'Not synced yet')}
            {lastSyncedAtMs ? ` ${new Date(lastSyncedAtMs).toLocaleString()}` : ''}
            {!signedIn && ' Sign in to sync devices.'}
          </p>
          {!signedIn && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onSettings()
              }}
              className="mt-1 text-xs text-zinc-300 underline-offset-2 hover:underline"
            >
              Open settings
            </button>
          )}
          <p className="mt-4 text-xs font-medium text-paper-3">
            Chart colors
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {SANKEY_THEMES.map((id) => {
              const active = themeId === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTheme(id)}
                  className={`rounded-lg px-2 py-1.5 text-left text-xs ${
                    active ? 'bg-paper text-ink' : 'text-zinc-300 hover:bg-rule'
                  }`}
                >
                  {getSankeyTheme(id).label}
                </button>
              )
            })}
          </div>
          <label className="mt-4 block text-xs font-medium text-paper-3">
            This month’s income
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="Use recurring income"
              value={override ?? ''}
              onChange={(event) => {
                const raw = event.target.value
                onOverride(raw === '' ? null : Number(raw))
              }}
              className="mt-2 h-10 w-full rounded-xl border border-rule bg-ledger px-3 text-sm font-normal tracking-normal text-zinc-100 normal-case tabular-nums"
            />
          </label>
          <p className="mt-1 text-xs text-zinc-500">
            Optional override. Clear it to use recurring income and payday dates.
          </p>
          {override != null && (
            <button
              type="button"
              onClick={() => onOverride(null)}
              className="mt-2 text-xs text-zinc-300 underline-offset-2 hover:underline"
            >
              Clear override
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Income as one bar: bills, then goals, then what's left (or the shortfall past the end). */
function LeftoverBar({ income, bills, goals }: { income: number; bills: number; goals: number }) {
  const total = Math.max(income, bills + goals, 1)
  const pct = (value: number) => `${(Math.max(0, value) / total) * 100}%`
  const over = bills + goals - income
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-ledger-3" aria-hidden="true">
      <span className="h-full bg-paper-2" style={{ width: pct(Math.min(bills, income)) }} />
      <span className="h-full bg-copper" style={{ width: pct(Math.min(goals, Math.max(0, income - bills))) }} />
      {over > 0.004 ? (
        <span className="h-full bg-over" style={{ width: pct(over) }} />
      ) : (
        <span className="h-full bg-cash" style={{ width: pct(income - bills - goals) }} />
      )}
    </div>
  )
}

function LedgerLine({
  label,
  value,
  currency,
  tone,
  sign,
}: {
  label: string
  value: number
  currency: string
  tone: string
  sign: '+' | '−'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-paper-3">{label}</dt>
      <dd className={`money ${tone}`}>
        {sign}
        {formatMoney(value, currency)}
      </dd>
    </div>
  )
}

function cushionLabel(leftover: number): { label: string; className: string } {
  if (leftover < -0.004) {
    return { label: 'Net negative', className: 'bg-rose-500/15 text-rose-300' }
  }
  return { label: 'Net positive', className: 'bg-cash/15 text-cash' }
}

interface CategorySpend {
  category: string
  amount: number
  topName: string
  topAmount: number
}

function spendByCategory(
  expenses: Expense[],
  view: ViewPeriod,
  range: { start: Date; end: Date },
): CategorySpend[] {
  const totals = new Map<string, CategorySpend>()
  for (const expense of expenses) {
    const amount = expenseAmountForView(expense, view, range)
    if (amount <= 0.004) continue
    const current = totals.get(expense.category)
    if (!current) {
      totals.set(expense.category, {
        category: expense.category,
        amount,
        topName: expense.name,
        topAmount: amount,
      })
      continue
    }
    current.amount += amount
    if (amount > current.topAmount) {
      current.topAmount = amount
      current.topName = expense.name
    }
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount)
}

function spendChange(
  current: number,
  previous: number,
): { label: string; tone: 'up' | 'down' | 'flat'; arrow: boolean } {
  if (previous <= 0.004) return { label: 'New', tone: 'up', arrow: false }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.5) return { label: '0%', tone: 'flat', arrow: false }
  return {
    label: `${Math.abs(pct).toFixed(0)}%`,
    tone: pct > 0 ? 'up' : 'down',
    arrow: true,
  }
}

function changeClass(tone: 'up' | 'down' | 'flat'): string {
  if (tone === 'up') return 'text-rose-400'
  if (tone === 'down') return 'text-cash'
  return 'text-zinc-500'
}

function eventColor(
  event: CalendarEvent,
  theme: ReturnType<typeof getSankeyTheme>,
): string {
  if (event.kind === 'income') return 'var(--color-cash)'
  if (event.kind === 'goal') return 'var(--color-copper)'
  return categoryColor(theme, event.category ?? 'Other')
}

function kindLabel(kind: CalendarEvent['kind']): string {
  if (kind === 'income') return 'Income'
  if (kind === 'goal') return 'Goal'
  return 'Expense'
}

function GoalMark({ index }: { index: number }) {
  const tones = [
    'bg-emerald-500/15 text-emerald-300',
    'bg-sky-500/15 text-sky-300',
    'bg-amber-500/15 text-amber-200',
  ]
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[index % tones.length]}`}
    >
      {index % 3 === 0 ? <ShieldIcon /> : index % 3 === 1 ? <FlagIcon /> : <StarIcon />}
    </div>
  )
}

function EventMark({ event, color }: { event: CalendarEvent; color: string }) {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{ background: color, color: color.startsWith('var(') ? 'var(--color-ink)' : readableTextOn(color) }}
    >
      {event.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function EventGlyph({ kind }: { kind: CalendarEvent['kind'] }) {
  const glyph = kind === 'income' ? '↓' : kind === 'goal' ? '★' : '•'
  return <span aria-hidden="true">{glyph}</span>
}

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function ShieldIcon() {
  return (
    <IconFrame>
      <path d="M12 3 5 6v6c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6l-7-3z" />
    </IconFrame>
  )
}

function FlagIcon() {
  return (
    <IconFrame>
      <path d="M6 21V4" />
      <path d="M6 5h11l-2 4 2 4H6" />
    </IconFrame>
  )
}

function StarIcon() {
  return (
    <IconFrame>
      <path d="m12 3 2.4 5.4L20 9.2l-4 3.9.9 5.7L12 16.2 7.1 18.8 8 13.1 4 9.2l5.6-.8L12 3z" />
    </IconFrame>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 5h12M6.5 10h7M9 15h2" strokeLinecap="round" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="m8 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v5" strokeLinecap="round" />
      <path d="M10 6.5h.01" strokeLinecap="round" />
    </svg>
  )
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 6h12M4 14h12" strokeLinecap="round" />
      <circle cx="8" cy="6" r="1.6" fill="var(--color-ledger-4)" />
      <circle cx="13" cy="14" r="1.6" fill="var(--color-ledger-4)" />
    </svg>
  )
}
