import { format } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '../domain/money'
import { useAuthStore } from '../state/authStore'
import { useBudgetStore } from '../state/budgetStore'
import { aheadStreak, useLeftoverHistory, type LeftoverPoint } from '../state/useLeftoverHistory'
import { AnimatedMoney } from './AnimatedMoney'

/** Wait for the person to stop flipping periods before celebrating the one they land on. */
const SETTLE_MS = 380
const SHOW_MS = 6500
/** Periods looked back over for streaks and bests; the tally shows the last few. */
const LOOKBACK = 12
const TALLY = 6
const TALLY_PX = 26

type Moment = {
  key: string
  points: LeftoverPoint[]
  leftover: number
  /** Milestones get the burst; an ordinary good month just gets the slip. */
  milestone: boolean
  headline: string
  detail: string
}

/**
 * When you step into a period that ends ahead, a register slip rises with what you keep,
 * how it compares to recent periods, and what it would do for a goal.
 */
export function AheadSlip() {
  const meta = useBudgetStore((s) => s.meta)
  const goals = useBudgetStore((s) => s.goals)
  const user = useAuthStore((s) => s.user)
  const points = useLeftoverHistory(LOOKBACK)
  const [moment, setMoment] = useState<Moment | null>(null)
  const [leaving, setLeaving] = useState(false)
  const seen = useRef(new Set<string>())
  const lastKey = useRef<string | null>(null)
  const hovering = useRef(false)

  const key = `${meta.view}:${meta.anchorDate}`

  useEffect(() => {
    // The first period on load is where you already are; only travel earns the slip.
    if (lastKey.current === null) {
      lastKey.current = key
      return
    }
    if (lastKey.current === key) return
    lastKey.current = key
    setMoment(null)
    const timer = window.setTimeout(() => {
      const current = points[points.length - 1]
      if (!current || current.leftover <= 0.004 || seen.current.has(key)) return
      seen.current.add(key)
      setLeaving(false)
      setMoment(describe(points, meta.view, meta.currency, firstName(user?.displayName), goals, key))
    }, SETTLE_MS)
    return () => window.clearTimeout(timer)
    // points follow key; reading them inside the timer is the settled value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!moment) return
    const timer = window.setTimeout(function tick() {
      if (hovering.current) return void (timerRef.id = window.setTimeout(tick, 1200))
      setLeaving(true)
    }, SHOW_MS)
    const timerRef = { id: timer }
    return () => window.clearTimeout(timerRef.id)
  }, [moment])

  if (!moment) return null
  const tally = moment.points.slice(-TALLY)
  const max = Math.max(...tally.map((p) => Math.abs(p.leftover)), 1)

  return (
    <div
      role="status"
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => (hovering.current = false)}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) setMoment(null)
      }}
      className={`${leaving ? 'slip-out' : 'slip-in'} fixed inset-x-4 z-40 overflow-hidden rounded-2xl bg-ledger-3 p-4 text-paper shadow-[0_18px_40px_-12px_rgb(0_0_0/0.45)] ring-1 ring-rule-strong bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:inset-x-auto md:right-6 md:bottom-6 md:w-[22rem]`}
    >
      <div className="flex items-start gap-3.5">
        <Stamp burst={moment.milestone} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-paper-2">{moment.headline}</p>
          <p className="mt-0.5 font-display text-[28px] leading-none tracking-[-0.02em] text-cash">
            +<AnimatedMoney value={moment.leftover} currency={meta.currency} duration={900} />
          </p>
          <p className="mt-2 text-sm leading-snug text-paper-2 text-pretty">{moment.detail}</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setLeaving(true)}
          className="press -mt-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-paper-3 hover:bg-ledger-4 hover:text-paper"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {/* Last six periods as a tally: up for ahead, down for short, the current one in full colour. */}
      <div className="mt-4 flex items-end gap-1.5 border-t border-rule pt-3" aria-hidden="true">
        {tally.map((point, index) => {
          const current = index === tally.length - 1
          const ahead = point.leftover > 0.004
          const height = ahead ? Math.max(4, (point.leftover / max) * TALLY_PX) : 3
          return (
            <span
              key={point.anchor.getTime()}
              className={`tally-grow mx-auto block w-full max-w-6 rounded-[3px] ${
                ahead ? (current ? 'bg-cash' : 'bg-cash/35') : 'bg-over/60'
              }`}
              style={{ height, animationDelay: `${160 + index * 60}ms` }}
            />
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5" aria-hidden="true">
        {tally.map((point, index) => (
          <span
            key={point.anchor.getTime()}
            className={`money flex-1 text-center text-xs ${
              index === tally.length - 1 ? 'text-paper' : 'text-paper-3'
            }`}
          >
            {format(point.anchor, meta.view === 'weekly' ? 'd' : 'MMM')}
          </span>
        ))}
      </div>
    </div>
  )
}

/** A ledger check-mark stamp; milestones throw a few coins of cash and copper. */
function Stamp({ burst }: { burst: boolean }) {
  return (
    <div className="relative mt-0.5 h-11 w-11 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 44 44" className="stamp-press h-11 w-11 text-cash">
        <circle cx="22" cy="22" r="19" fill="currentColor" opacity="0.14" />
        <circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" strokeWidth="1.5" className="stamp-ring" pathLength="1" />
        <path d="M14.5 22.5l5 5 10-11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="stamp-check" pathLength="1" />
      </svg>
      {burst &&
        Array.from({ length: 10 }, (_, i) => {
          const angle = (i / 10) * Math.PI * 2 + 0.3
          const distance = 30 + (i % 3) * 8
          return (
            <span
              key={i}
              className={`coin absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full ${i % 3 === 0 ? 'bg-copper' : 'bg-cash'}`}
              style={
                {
                  '--dx': `${Math.cos(angle) * distance}px`,
                  '--dy': `${Math.sin(angle) * distance}px`,
                  animationDelay: `${260 + (i % 4) * 30}ms`,
                } as React.CSSProperties
              }
            />
          )
        })}
    </div>
  )
}

function describe(
  points: LeftoverPoint[],
  view: 'weekly' | 'monthly',
  currency: string,
  name: string | null,
  goals: { name: string; targetAmount: number; savedAmount: number }[],
  key: string,
): Moment {
  const current = points[points.length - 1]
  const word = view === 'weekly' ? 'week' : 'month'
  const label = view === 'weekly' ? `the week of ${format(current.anchor, 'MMM d')}` : format(current.anchor, 'MMMM')
  const headline = name ? `${name}, you finish ${label} ahead` : `You finish ${label} ahead`

  const streak = aheadStreak(points)
  const span = Math.min(points.length, 6)
  const earlier = points.slice(-span, -1).map((p) => p.leftover)
  const best = earlier.length > 0 && current.leftover > Math.max(...earlier) + 0.004
  const goal = goals.find((g) => g.targetAmount - g.savedAmount > 0.004)

  let detail: string
  const run = streak >= points.length ? `${streak}+` : `${streak}`
  if (best && streak >= 2) detail = `Your best ${word} of the last ${span}, and ${run} in a row in the black.`
  else if (best) detail = `Your best ${word} of the last ${span}.`
  else if (streak >= 3) detail = `${run} ${word}s in a row in the black.`
  else if (goal) {
    const remaining = goal.targetAmount - goal.savedAmount
    detail =
      current.leftover >= remaining
        ? `That's enough to finish ${goal.name} outright.`
        : `Put toward ${goal.name}, it leaves ${formatMoney(remaining - current.leftover, currency)} to go.`
  } else detail = `Every bill and goal is covered, with room to spare.`

  return { key, points, leftover: current.leftover, milestone: best || streak >= 3, headline, detail }
}

function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? first : null
}
