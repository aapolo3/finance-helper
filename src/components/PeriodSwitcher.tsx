import { formatISO } from 'date-fns'
import { useMemo, useRef } from 'react'
import { periodRange, shiftAnchor } from '../domain/period'
import { periodLabel } from '../lib/periodLabel'
import { useBudgetStore } from '../state/budgetStore'

/** The pay period every page reads from. Lives in the sidebar, or atop the page on phones. */
export function PeriodSwitcher({ layout }: { layout: 'stack' | 'bar' }) {
  const meta = useBudgetStore((s) => s.meta)
  const setView = useBudgetStore((s) => s.setView)
  const setAnchorDate = useBudgetStore((s) => s.setAnchorDate)
  const range = useMemo(
    () => periodRange(meta.view, new Date(`${meta.anchorDate}T00:00:00`), meta.weekStartsOn),
    [meta.view, meta.anchorDate, meta.weekStartsOn],
  )
  const periodWord = meta.view === 'weekly' ? 'week' : 'month'
  const lastStep = useRef(1)
  const shift = (delta: number) => {
    lastStep.current = delta
    const next = shiftAnchor(meta.view, new Date(`${meta.anchorDate}T00:00:00`), delta)
    setAnchorDate(formatISO(next, { representation: 'date' }))
  }

  const stepper = (
    <div className="flex min-w-0 flex-1 items-center justify-between rounded-lg bg-ledger-2 ring-1 ring-rule">
      <button
        type="button"
        aria-label={`Previous ${periodWord}`}
        onClick={() => shift(-1)}
        className="press flex h-9 w-9 items-center justify-center rounded-lg text-paper-3 hover:text-paper"
      >
        <Chevron dir="left" />
      </button>
      <span className="min-w-0 overflow-hidden">
        <span
          key={`${meta.view}:${meta.anchorDate}`}
          className="period-step money block truncate text-sm text-paper"
          style={{ '--step': lastStep.current } as React.CSSProperties}
        >
          {periodLabel(meta.view, range)}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Next ${periodWord}`}
        onClick={() => shift(1)}
        className="press flex h-9 w-9 items-center justify-center rounded-lg text-paper-3 hover:text-paper"
      >
        <Chevron dir="right" />
      </button>
    </div>
  )

  const views = (
    <div className="flex shrink-0 rounded-lg bg-ledger-2 p-0.5 ring-1 ring-rule">
      {(['weekly', 'monthly'] as const).map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={meta.view === view}
          onClick={() => setView(view)}
          className={`min-h-8 flex-1 rounded-md px-3 text-sm ${
            meta.view === view ? 'bg-ledger-4 text-paper' : 'text-paper-3 hover:text-paper'
          }`}
        >
          {view === 'weekly' ? 'Week' : 'Month'}
        </button>
      ))}
    </div>
  )

  if (layout === 'bar') {
    return (
      <div className="flex items-center gap-2">
        {stepper}
        {views}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-paper-3">Pay period</p>
      {stepper}
      {views}
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={dir === 'left' ? 'm12 5-5 5 5 5' : 'm8 5 5 5-5 5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
