import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '../domain/money'

/** Counts from the previous value to the new one so period changes read as motion, not a jump. */
export function AnimatedMoney({
  value,
  currency,
  duration = 450,
}: {
  value: number
  currency: string
  duration?: number
}) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    const start = from.current
    if (start === value) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      from.current = value
      setShown(value)
      return
    }
    const t0 = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = start + (value - start) * eased
      from.current = next
      setShown(next)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <>{formatMoney(shown, currency)}</>
}
