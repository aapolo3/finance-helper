import { format } from 'date-fns'
import { useCallback, useEffect, useState } from 'react'
import { demoBudget, emptyBudget } from '../domain/demo'
import { formatMoney } from '../domain/money'
import { SANKEY_THEME_PRESETS } from '../domain/sankeyThemes'
import { SANKEY_THEMES } from '../domain/types'
import { AppearanceSwitch } from '../components/AppearanceSwitch'
import { PalettePicker } from '../components/PalettePicker'
import { useConfirmFlow } from '../components/ConfirmDialog'
import { useAuthStore } from '../state/authStore'
import { useBudgetStore } from '../state/budgetStore'
import {
  monthOutlook,
  reasonLabel,
  type BudgetHistoryEntry,
} from '../storage/budgetHistory'
import { pauseCloudSync, resumeCloudSync } from '../storage/cloudSync'

export function Settings() {
  const meta = useBudgetStore((s) => s.meta)
  const setCurrency = useBudgetStore((s) => s.setCurrency)
  const setWeekStartsOn = useBudgetStore((s) => s.setWeekStartsOn)
  const setSankeyTheme = useBudgetStore((s) => s.setSankeyTheme)
  const replace = useBudgetStore((s) => s.replace)
  const hasData =
    useBudgetStore((s) => s.income.length + s.expenses.length + s.goals.length) > 0

  const user = useAuthStore((s) => s.user)
  const restoring = useAuthStore((s) => s.restoring)
  const sdkStatus = useAuthStore((s) => s.sdkStatus)
  const busy = useAuthStore((s) => s.busy)
  const error = useAuthStore((s) => s.error)
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle)
  const signOutUser = useAuthStore((s) => s.signOutUser)
  const syncing = useAuthStore((s) => s.syncing)
  const lastSyncedAtMs = useAuthStore((s) => s.lastSyncedAtMs)
  const syncNote = useAuthStore((s) => s.syncNote)
  const syncNow = useAuthStore((s) => s.syncNow)
  const saveCheckpoint = useAuthStore((s) => s.saveCheckpoint)
  const loadBudgetHistory = useAuthStore((s) => s.loadBudgetHistory)
  const restoreBudgetHistory = useAuthStore((s) => s.restoreBudgetHistory)
  const clearError = useAuthStore((s) => s.clearError)
  const flushPersist = useBudgetStore((s) => s.flushPersist)
  const { ask, dialog } = useConfirmFlow()
  const [history, setHistory] = useState<BudgetHistoryEntry[]>([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const refreshHistory = useCallback(async () => {
    setHistoryBusy(true)
    setHistoryError(null)
    try {
      setHistory(await loadBudgetHistory())
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Could not load history')
    } finally {
      setHistoryBusy(false)
    }
  }, [loadBudgetHistory])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory, user?.uid, lastSyncedAtMs])

  return (
    <div className="stagger space-y-6">
      <header>
        <h1 className="font-display text-[28px] leading-tight tracking-[-0.02em] text-paper">Settings</h1>
        <p className="text-sm text-zinc-500">
          Local by default. Sign in with Google to sync across devices (Firebase Spark).
        </p>
      </header>

      <section className="card-surface rounded-xl p-5">
        <h2 className="font-medium">Sign in & sync</h2>
        {user ? (
          <>
            <p className="mt-1 text-sm text-zinc-500">
              Signed in as {user.email ?? user.displayName ?? 'Google account'}. Changes
              save to this browser and to your cloud budget.
            </p>
            {lastSyncedAtMs && (
              <p className="mt-1 text-xs text-zinc-500">
                Last sync {new Date(lastSyncedAtMs).toLocaleString()}
                {syncNote ? ` · ${syncNote}` : ''}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={syncing}
                onClick={() => void syncNow()}
                className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 font-medium"
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={() => {
                  void (async () => {
                    const ok = await ask([
                      {
                        title: 'Save a checkpoint?',
                        body: 'This saves the budget on this device to history and makes it the latest cloud version, overwriting whatever is in the cloud — including newer edits from your phone or another browser.',
                        confirmLabel: 'Continue',
                      },
                      {
                        title: 'Overwrite cloud with this device?',
                        body: 'The current cloud copy stays in Budget history. Other devices will receive this setup on their next sync.',
                        confirmLabel: 'Save checkpoint',
                      },
                    ])
                    if (ok) {
                      await saveCheckpoint()
                      await refreshHistory()
                    }
                  })()
                }}
                className="min-h-11 rounded-lg px-4 text-sm ring-1 ring-zinc-300 disabled:opacity-50 dark:ring-zinc-700"
              >
                Save checkpoint
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    const ok = await ask([
                      {
                        title: 'Sign out?',
                        body: 'This device keeps a local copy. Cloud sync pauses until you sign in again. Signing in with a different account replaces the local copy and any changes not yet synced.',
                        confirmLabel: 'Continue',
                      },
                      {
                        title: 'Sign out of Google?',
                        body: 'You can sign back in to resume syncing.',
                        confirmLabel: 'Sign out',
                      },
                    ])
                    if (ok) await signOutUser()
                  })()
                }}
                className="min-h-11 rounded-lg px-4 text-sm ring-1 ring-zinc-300 disabled:opacity-50 dark:ring-zinc-700"
              >
                Sign out
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Sync now keeps the newer copy. Save checkpoint stores this device in history and uploads it as the latest.
            </p>
          </>
        ) : restoring ? (
          <p className="mt-1 text-sm text-zinc-500">Checking your account…</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-zinc-500">
              Optional. Until you sign in, nothing leaves this device.
            </p>
            <button
              type="button"
              disabled={busy || sdkStatus === 'loading'}
              onClick={() => {
                clearError()
                void signInWithGoogle().catch(() => undefined)
              }}
              className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium disabled:opacity-50"
            >
              {busy ? 'Signing in…' : sdkStatus === 'loading' ? 'Loading…' : 'Sign in with Google'}
            </button>
          </>
        )}
        {error && (
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </section>

      <section className="card-surface rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">Budget history</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Auto save is the cloud budget after a sync. “This browser before sync” is the older
              copy that was only on this device. “Manual checkpoint” is a budget you saved and uploaded.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Signed out, a checkpoint is local only, so it needs no overwrite warning. */}
            {!user && !restoring && (
              <button
                type="button"
                disabled={syncing || !hasData}
                onClick={() => {
                  void (async () => {
                    await saveCheckpoint()
                    await refreshHistory()
                  })()
                }}
                className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Save checkpoint
              </button>
            )}
            <button
              type="button"
              disabled={historyBusy}
              onClick={() => void refreshHistory()}
              className="min-h-11 rounded-lg px-4 text-sm ring-1 ring-zinc-300 disabled:opacity-50 dark:ring-zinc-700"
            >
              {historyBusy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        {historyError && (
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{historyError}</p>
        )}
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            No checkpoints yet. Save one now, or sign in so the current cloud budget can be
            kept as the first history entry.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 rounded-2xl ring-1 ring-zinc-200 dark:divide-zinc-800 dark:ring-zinc-800">
            {history.map((entry) => {
              const outlook = monthOutlook(entry.state)
              return (
              <li
                key={`${entry.source}-${entry.id}`}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {format(new Date(entry.savedAtMs), 'MMM d, yyyy h:mm a')}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {reasonLabel(entry.reason)} · {entry.source} ·{' '}
                    {entry.summary.income} income · {entry.summary.expenses} expenses ·{' '}
                    {entry.summary.goals} goals · starting cash{' '}
                    {formatMoney(entry.summary.balance, meta.currency)}
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">
                    {format(new Date(), 'MMMM')} projected{' '}
                    {formatMoney(outlook.projectedBalance, meta.currency)} · cash flow{' '}
                    {formatMoney(outlook.cashFlow, meta.currency)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={syncing}
                  className="min-h-11 rounded-lg px-4 text-sm ring-1 ring-zinc-300 disabled:opacity-50 dark:ring-zinc-700"
                  onClick={() => {
                    void (async () => {
                      const ok = await ask([
                        {
                          title: 'Restore this budget?',
                          body: `Replace your current setup with the save from ${format(new Date(entry.savedAtMs), 'MMM d, yyyy h:mm a')}. Your current budget is backed up to history first.`,
                          confirmLabel: 'Continue',
                        },
                        {
                          title: 'Use this checkpoint?',
                          body: user
                            ? 'This becomes the live budget on this device and is uploaded as the latest cloud version.'
                            : 'This becomes the live budget on this device.',
                          confirmLabel: 'Restore',
                        },
                      ])
                      if (!ok) return
                      await restoreBudgetHistory(entry)
                      await refreshHistory()
                    })()
                  }}
                >
                  Restore
                </button>
              </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="card-surface rounded-xl p-5">
        <h2 className="font-medium">Currency</h2>
        <select
          value={meta.currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        >
          {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN'].map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </section>

      <section className="card-surface rounded-xl p-5">
        <h2 className="font-medium">Week starts on</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Affects weekly view and the calendar grid.
        </p>
        <div className="mt-3 inline-flex rounded-full bg-zinc-100 p-1 dark:bg-zinc-950">
          {(
            [
              { value: 1 as const, label: 'Monday' },
              { value: 0 as const, label: 'Sunday' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setWeekStartsOn(option.value)}
              className={`rounded-full px-4 py-1.5 text-sm ${
                meta.weekStartsOn === option.value
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card-surface rounded-xl p-5">
        <h2 className="font-medium">Appearance</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Light paper, dark, or follow your device. Only changes how Flow looks on this device.
        </p>
        <div className="mt-3 max-w-sm">
          <AppearanceSwitch />
        </div>
      </section>

      <section className="card-surface rounded-xl p-5">
        <h2 className="font-medium">Color palette</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Each palette has a light and a dark side. When you’re signed in, your choice is saved to
          your account and follows you to every device. Otherwise it stays on this device.
        </p>
        <div className="mt-3">
          <PalettePicker />
        </div>
      </section>

      <section className="card-surface rounded-xl p-5">
        <h2 className="font-medium">Sankey colors</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Color preset for the money-flow diagram on Overview. Each expense
          category gets its own color within a theme.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {SANKEY_THEMES.map((id) => {
            const preset = SANKEY_THEME_PRESETS[id]
            const selected = meta.sankeyTheme === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSankeyTheme(id)}
                className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition ${
                  selected
                    ? 'bg-zinc-900 text-white ring-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-100'
                    : 'bg-zinc-50 ring-zinc-200 hover:bg-zinc-100 dark:bg-zinc-950 dark:ring-zinc-700 dark:hover:bg-zinc-900'
                }`}
              >
                <span className="mt-0.5 flex shrink-0 gap-0.5" aria-hidden>
                  {Object.values(preset.categories)
                    .slice(0, 5)
                    .map((color) => (
                      <span
                        key={color}
                        className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{preset.label}</span>
                  <span
                    className={`mt-0.5 block text-xs ${
                      selected
                        ? 'text-zinc-300 dark:text-zinc-600'
                        : 'text-zinc-500'
                    }`}
                  >
                    {preset.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="card-surface rounded-xl p-5">
        <h2 className="font-medium">Sample data</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Load a demo budget so the Sankey isn’t empty, or wipe everything.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
            onClick={() => {
              void (async () => {
                if (!hasData) {
                  replace(demoBudget())
                  return
                }
                const ok = await ask([
                  {
                    title: 'Replace your data with sample?',
                    body: 'Your income, expenses, and goals will be overwritten by the demo budget.',
                    confirmLabel: 'Continue',
                  },
                  {
                    title: 'Load sample data?',
                    body: 'This does not merge. Everything you entered is replaced.',
                    confirmLabel: 'Replace with sample',
                  },
                ])
                if (ok) replace(demoBudget())
              })()
            }}
          >
            Load demo
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg px-4 text-sm ring-1 ring-zinc-300 dark:ring-zinc-700"
            onClick={() => {
              void (async () => {
                const ok = await ask([
                  {
                    title: 'Reset all data?',
                    body: 'This wipes income, expenses, goals, and history on this device and in the cloud if you are signed in.',
                    confirmLabel: 'Continue',
                  },
                  {
                    title: 'Type RESET to continue',
                    body: 'This confirms you mean to erase the budget, not load sample data.',
                    confirmLabel: 'Continue',
                    requireText: 'RESET',
                  },
                  {
                    title: 'Erase everything?',
                    body: 'This cannot be undone.',
                    confirmLabel: 'Reset all data',
                  },
                ])
                if (!ok) return
                pauseCloudSync()
                try {
                  replace(emptyBudget())
                  await flushPersist()
                } finally {
                  resumeCloudSync()
                }
              })()
            }}
          >
            Reset all data
          </button>
        </div>
        {hasData && (
          <p className="mt-2 text-xs text-zinc-500">
            You currently have saved budget data on this device.
          </p>
        )}
      </section>
      {dialog}
    </div>
  )
}
