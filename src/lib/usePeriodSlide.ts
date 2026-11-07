import { useEffect, useRef } from 'react'
import { useBudgetStore } from '../state/budgetStore'

/**
 * Nudges the page sideways in the direction you stepped when the period changes, without
 * remounting it, so open filters and scroll position survive. Returns the ref for <main>.
 */
export function usePeriodSlide() {
  const ref = useRef<HTMLElement>(null)
  const anchorDate = useBudgetStore((s) => s.meta.anchorDate)
  const view = useBudgetStore((s) => s.meta.view)
  const prev = useRef({ anchorDate, view })

  useEffect(() => {
    const before = prev.current
    prev.current = { anchorDate, view }
    if (before.anchorDate === anchorDate && before.view === view) return
    const node = ref.current
    if (!node || typeof node.animate !== 'function') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const step = anchorDate >= before.anchorDate ? 1 : -1
    node.animate(
      reduce
        ? [{ opacity: 0.6 }, { opacity: 1 }]
        : [
            { opacity: 0.4, transform: `translateX(${step * 22}px)` },
            { opacity: 1, transform: 'none' },
          ],
      // No fill: a transform left behind would capture position: fixed sheets inside the page.
      { duration: reduce ? 160 : 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
  }, [anchorDate, view])

  return ref
}
