import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AheadSlip } from './components/AheadSlip'
import { usePeriodSlide } from './lib/usePeriodSlide'
import { AppearanceSwitch } from './components/AppearanceSwitch'
import { PeriodSwitcher } from './components/PeriodSwitcher'
import { demoBudget } from './domain/demo'
import { useAuthStore } from './state/authStore'
import { useBudgetStore } from './state/budgetStore'

// Each page is its own chunk, so the first paint only waits for the shell and Today.
const loadOverview = () => import('./views/Overview')
const loadExpenses = () => import('./views/Expenses')
const loadBudget = () => import('./views/Budget')
const loadRecurring = () => import('./views/Recurring')
const loadGoals = () => import('./views/Goals')
const loadCalendar = () => import('./views/Calendar')
const loadSettings = () => import('./views/Settings')
// Today is always the landing page: fetch it now rather than after hydration.
void loadOverview()
const Overview = lazy(() => loadOverview().then((m) => ({ default: m.Overview })))
const Expenses = lazy(() => loadExpenses().then((m) => ({ default: m.Expenses })))
const Budget = lazy(() => loadBudget().then((m) => ({ default: m.Budget })))
const Recurring = lazy(() => loadRecurring().then((m) => ({ default: m.Recurring })))
const Goals = lazy(() => loadGoals().then((m) => ({ default: m.Goals })))
const Calendar = lazy(() => loadCalendar().then((m) => ({ default: m.Calendar })))
const Settings = lazy(() => loadSettings().then((m) => ({ default: m.Settings })))

/** Warm the other pages once the browser is idle, so switching never shows a blank frame. */
function prefetchPages() {
  const run = () => {
    for (const load of [loadExpenses, loadBudget, loadCalendar, loadGoals, loadRecurring, loadSettings]) {
      void load()
    }
  }
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1500)
}

const PAGES = [
  { id: 'today', label: 'Today', icon: 'M4 10.5 10 5l6 5.5V16H4z' },
  { id: 'cashflow', label: 'Cash flow', icon: 'M3 7h11m0 0-3-3m3 3-3 3M17 13H6m0 0 3-3m-3 3 3 3' },
  { id: 'budget', label: 'Budget', icon: 'M4 5h12v10H4zM4 9h12M8 9v6' },
  { id: 'recurring', label: 'Recurring', icon: 'M15 8a5 5 0 0 0-9-2M5 12a5 5 0 0 0 9 2M6 3v3h3M14 17v-3h-3' },
  { id: 'goals', label: 'Goals', icon: 'M10 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { id: 'calendar', label: 'Calendar', icon: 'M4 6h12v10H4zM4 9h12M7 4v3M13 4v3' },
  { id: 'settings', label: 'Settings', icon: 'M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.4 1.4M13.6 13.6 15 15M5 15l1.4-1.4M13.6 6.4 15 5' },
] as const

type PageId = (typeof PAGES)[number]['id']

/** Phones keep three pages and the log button one tap away; the rest live under More. */
const PHONE_TABS: PageId[] = ['today', 'cashflow', 'budget']

export default function App() {
  const hydrate = useBudgetStore((s) => s.hydrate)
  const hydrated = useBudgetStore((s) => s.hydrated)
  const income = useBudgetStore((s) => s.income)
  const expenses = useBudgetStore((s) => s.expenses)
  const goals = useBudgetStore((s) => s.goals)
  const replace = useBudgetStore((s) => s.replace)
  const balanceMonth = useBudgetStore((s) => s.meta.balanceMonth)
  const currency = useBudgetStore((s) => s.meta.currency)
  const setStartingBalance = useBudgetStore((s) => s.setStartingBalance)
  const initAuth = useAuthStore((s) => s.init)
  const authUser = useAuthStore((s) => s.user)
  const [page, setPageState] = useState<PageId>('today')
  const [pageDir, setPageDir] = useState(1)
  const setPage = useCallback((next: PageId) => {
    setPageState((prev) => {
      const from = PAGES.findIndex((item) => item.id === prev)
      const to = PAGES.findIndex((item) => item.id === next)
      setPageDir(to >= from ? 1 : -1)
      return next
    })
  }, [])
  const mainRef = usePeriodSlide()
  const [dismissedEmpty, setDismissedEmpty] = useState(false)
  const [logRequest, setLogRequest] = useState(false)
  const clearLogRequest = useCallback(() => setLogRequest(false), [])
  const startLog = useCallback(() => {
    setPage('cashflow')
    setLogRequest(true)
  }, [])

  useEffect(() => {
    let unsub = () => {}
    void (async () => {
      await hydrate()
      unsub = initAuth()
    })()
    return () => unsub()
  }, [hydrate, initAuth])

  useEffect(() => {
    if (hydrated) prefetchPages()
  }, [hydrated])

  if (!hydrated) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-zinc-500">
        Loading…
      </div>
    )
  }

  const empty = income.length === 0 && expenses.length === 0 && goals.length === 0
  const showEmpty = empty && !dismissedEmpty

  return (
    <div className="flow-app dark min-h-svh bg-ink text-paper">
      <Sidebar page={page} onSelect={setPage} email={authUser?.email} />
      <div className="md:pl-[232px]">
        <div className="px-4 pt-4 pb-28 sm:px-6 md:pt-8 md:pb-10 lg:px-10 2xl:px-12">
          <div className="mb-4 md:hidden">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-xl">Flow</span>
              {authUser?.email && <span className="truncate text-xs text-paper-3">{authUser.email}</span>}
            </div>
            <PeriodSwitcher layout="bar" />
          </div>
          {balanceMonth == null && (
            <StartingBalancePrompt currency={currency} onSave={setStartingBalance} />
          )}
          {showEmpty && (
            <EmptyStart
              onDemo={() => replace(demoBudget())}
              onOwn={() => {
                setDismissedEmpty(true)
                setPage('cashflow')
              }}
            />
          )}
          <main
            key={page}
            ref={mainRef}
            className="page-in"
            style={{ '--dir': pageDir } as React.CSSProperties}
          >
            <Suspense fallback={<p className="py-10 text-sm text-paper-3">Loading…</p>}>
            {page === 'today' && (
              <Overview onOpen={(tab) => setPage(tab === 'expenses' ? 'cashflow' : tab)} onLog={startLog} />
            )}
            {page === 'cashflow' && <Expenses logRequest={logRequest} onLogHandled={clearLogRequest} />}
            {page === 'budget' && <Budget onAdd={startLog} />}
            {page === 'recurring' && <Recurring />}
            {page === 'goals' && <Goals />}
            {page === 'calendar' && <Calendar />}
            {page === 'settings' && <Settings />}
            </Suspense>
          </main>
        </div>
      </div>
      <PhoneNav page={page} onSelect={setPage} onLog={startLog} />
      <AheadSlip />
    </div>
  )
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-cash" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  )
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 14V2.5M3.5 3h8l-1.6 2.8 1.6 2.7h-8" />
    </svg>
  )
}

/** Same canvas as the page, divided by a rule: navigation serves the content. */
function Sidebar({
  page,
  onSelect,
  email,
}: {
  page: PageId
  onSelect: (id: PageId) => void
  email?: string | null
}) {
  const syncing = useAuthStore((s) => s.syncing)
  const restoring = useAuthStore((s) => s.restoring)
  const syncNow = useAuthStore((s) => s.syncNow)
  const saveCheckpoint = useAuthStore((s) => s.saveCheckpoint)
  const lastSyncedAtMs = useAuthStore((s) => s.lastSyncedAtMs)
  const navRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState({ top: 0, height: 0 })
  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`)
    if (active) setIndicator({ top: active.offsetTop, height: active.offsetHeight })
  }, [page])
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[232px] flex-col overflow-y-auto card-scroll border-r border-rule bg-ink px-3.5 py-6 md:flex">
      <div className="px-2.5">
        <p className="font-display text-[28px] leading-none">Flow</p>
        <p className="mt-1.5 text-sm text-paper-3">A budget you type in yourself</p>
      </div>
      <nav aria-label="Primary" ref={navRef} className="relative mt-7 flex flex-col gap-0.5">
        <span
          aria-hidden="true"
          className="nav-indicator pointer-events-none absolute inset-x-0 top-0 rounded-lg bg-ledger-4"
          style={{ translate: `0 ${indicator.top}px`, height: indicator.height, opacity: indicator.height ? 1 : 0 }}
        />
        {PAGES.map((item) => (
          <button
            key={item.id}
            data-page={item.id}
            type="button"
            aria-current={page === item.id ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
            className={`relative flex min-h-9 items-center gap-3 rounded-lg px-3 text-left text-sm ${
              page === item.id ? 'font-medium text-paper' : 'text-paper-2 hover:bg-ledger-3/70 hover:text-paper'
            }`}
          >
            <NavIcon d={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto space-y-3 pt-6">
        <PeriodSwitcher layout="stack" />
        <div className="space-y-2 rounded-xl bg-ledger-2 p-3.5 ring-1 ring-rule">
          <p className="flex items-center gap-2 text-sm font-medium">
            <LockIcon />
            {email ? 'Synced to your Google account' : restoring ? 'Checking your account…' : 'On this device only'}
          </p>
          {email ? (
            <>
              <p className="truncate text-sm text-paper-3">{email}</p>
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={syncing}
                className="press -mx-1 rounded-md px-1 text-left text-sm text-cash hover:underline disabled:opacity-60"
              >
                {syncing
                  ? 'Syncing…'
                  : lastSyncedAtMs
                    ? `Synced ${new Date(lastSyncedAtMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · Sync now`
                    : 'Sync now'}
              </button>
            </>
          ) : restoring ? null : (
            <>
              <p className="text-sm text-paper-3">
                Not synced. Nothing leaves this browser until you sign in.
              </p>
              <button
                type="button"
                onClick={() => onSelect('settings')}
                className="press -mx-1 min-h-8 rounded-md px-1 text-left text-sm text-cash hover:underline"
              >
                Sign in to sync ›
              </button>
            </>
          )}
        </div>
        <div className="space-y-1.5 px-1">
          <p className="text-xs font-medium text-paper-3">Appearance</p>
          <AppearanceSwitch size="sm" />
        </div>
        <button
          type="button"
          onClick={() => void saveCheckpoint()}
          disabled={syncing || restoring}
          className="press flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-paper-2 hover:bg-ledger-2 hover:text-paper disabled:opacity-60"
        >
          <FlagIcon />
          Save checkpoint
        </button>
      </div>
    </aside>
  )
}

function PhoneNav({
  page,
  onSelect,
  onLog,
}: {
  page: PageId
  onSelect: (id: PageId) => void
  onLog: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inMore = !PHONE_TABS.includes(page)

  useEffect(() => {
    if (!moreOpen) return
    const close = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return
      setMoreOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [moreOpen])

  const tab = (id: PageId | 'more', label: string, icon: string, active: boolean, onClick: () => void) => (
    <button
      key={id}
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`press flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-xs ${
        active ? 'text-paper' : 'text-paper-3'
      }`}
    >
      <NavIcon d={icon} />
      {label}
    </button>
  )

  return (
    <div ref={ref} className="md:hidden">
      {moreOpen && (
        <div className="pop-in fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 w-48 rounded-xl bg-ledger-4 p-1 shadow-2xl ring-1 ring-rule-strong">
          {PAGES.filter((item) => !PHONE_TABS.includes(item.id)).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id)
                setMoreOpen(false)
              }}
              className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm ${
                page === item.id ? 'text-paper' : 'text-paper-2'
              } hover:bg-ledger-3`}
            >
              <NavIcon d={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
      )}
      <nav
        aria-label="Primary"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-rule bg-ink px-1 pt-1"
      >
        {PAGES.filter((item) => PHONE_TABS.includes(item.id))
          .slice(0, 2)
          .map((item) => tab(item.id, item.label, item.icon, page === item.id, () => onSelect(item.id)))}
        <div className="flex items-center justify-center">
          <button
            type="button"
            aria-label="Log an expense"
            onClick={onLog}
            className="press flex h-12 w-12 items-center justify-center rounded-full bg-paper text-ink"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M10 4v12M4 10h12" />
            </svg>
          </button>
        </div>
        {PAGES.filter((item) => PHONE_TABS.includes(item.id))
          .slice(2)
          .map((item) => tab(item.id, item.label, item.icon, page === item.id, () => onSelect(item.id)))}
        {tab('more', 'More', 'M5 10h.01M10 10h.01M15 10h.01', inMore || moreOpen, () =>
          setMoreOpen((open) => !open),
        )}
      </nav>
    </div>
  )
}

/** Asked once, on first run: cash on hand becomes this month's opening balance. */
function StartingBalancePrompt({
  currency,
  onSave,
}: {
  currency: string
  onSave: (value: number) => void
}) {
  const [raw, setRaw] = useState('')
  const value = Number(raw)
  const valid = raw.trim() !== '' && Number.isFinite(value)
  return (
    <form
      className="card-surface rise-in mb-4 rounded-xl p-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSave(value)
      }}
    >
      <p className="font-display text-xl">What is your current balance?</p>
      <p className="mt-1 text-sm text-zinc-400">
        This month starts from this amount. Each later month starts from the end-of-day
        balance on the last day of the month before.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          autoFocus
          aria-label={`Current balance (${currency})`}
          placeholder={`Amount (${currency})`}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="money min-h-10 w-48 rounded-lg bg-ink px-3 py-2 ring-1 ring-rule-strong"
        />
        <button
          type="submit"
          disabled={!valid}
          className="press min-h-10 rounded-lg bg-paper px-4 text-sm font-medium text-ink disabled:opacity-50"
        >
          Save balance
        </button>
      </div>
    </form>
  )
}

function EmptyStart({
  onDemo,
  onOwn,
}: {
  onDemo: () => void
  onOwn: () => void
}) {
  return (
    <div className="card-surface rise-in mb-4 rounded-xl p-5">
      <p className="font-display text-xl">Start from a blank page or try a demo</p>
      <p className="mt-1 text-sm text-zinc-400">
        Everything is stored in this browser. No accounts are linked.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="press min-h-10 rounded-lg bg-paper px-4 text-sm font-medium text-ink"
          onClick={onDemo}
        >
          Load demo budget
        </button>
        <button
          type="button"
          className="press min-h-10 rounded-lg px-4 text-sm text-paper ring-1 ring-rule-strong hover:bg-ledger-3"
          onClick={onOwn}
        >
          Enter my own
        </button>
      </div>
    </div>
  )
}
