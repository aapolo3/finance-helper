import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'flow.split.sankeyCalendar'
const DEFAULT_RATIO = 0.57
const MIN_RATIO = 0.28
const MAX_RATIO = 0.78

type SplitPaneProps = {
  left: ReactNode
  right: ReactNode
  /** Stacked below this breakpoint; side-by-side + splitter from xl up. */
  className?: string
}

function readStoredRatio(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_RATIO
    const value = Number(raw)
    if (!Number.isFinite(value)) return DEFAULT_RATIO
    return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value))
  } catch {
    return DEFAULT_RATIO
  }
}

export function SplitPane({ left, right, className = '' }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [ratio, setRatio] = useState(DEFAULT_RATIO)
  const [isDragging, setIsDragging] = useState(false)
  const [isWide, setIsWide] = useState(false)
  const labelId = useId()

  useEffect(() => {
    setRatio(readStoredRatio())
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const sync = () => setIsWide(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const persist = useCallback((next: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // ignore quota / private mode
    }
  }, [])

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0) return
      const next = Math.min(
        MAX_RATIO,
        Math.max(MIN_RATIO, (clientX - rect.left) / rect.width),
      )
      setRatio(next)
      persist(next)
    },
    [persist],
  )

  useEffect(() => {
    if (!isDragging) return

    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return
      event.preventDefault()
      updateFromClientX(event.clientX)
    }
    const onUp = () => {
      dragging.current = false
      setIsDragging(false)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [isDragging, updateFromClientX])

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isWide) return
    event.preventDefault()
    dragging.current = true
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    updateFromClientX(event.clientX)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isWide) return
    const step = event.shiftKey ? 0.08 : 0.03
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setRatio((prev) => {
        const next = Math.max(MIN_RATIO, prev - step)
        persist(next)
        return next
      })
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setRatio((prev) => {
        const next = Math.min(MAX_RATIO, prev + step)
        persist(next)
        return next
      })
    } else if (event.key === 'Home') {
      event.preventDefault()
      setRatio(DEFAULT_RATIO)
      persist(DEFAULT_RATIO)
    }
  }

  if (!isWide) {
    return (
      <div className={`grid gap-4 ${className}`}>
        <div className="order-1">{right}</div>
        <div className="order-2">{left}</div>
      </div>
    )
  }

  const leftPct = `${ratio * 100}%`
  const rightPct = `${(1 - ratio) * 100}%`

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 items-stretch ${className}`}
    >
      <div
        className="min-w-0"
        style={{ width: `calc(${leftPct} - 4px)`, flex: 'none' }}
      >
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-labelledby={labelId}
        aria-valuemin={Math.round(MIN_RATIO * 100)}
        aria-valuemax={Math.round(MAX_RATIO * 100)}
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={onKeyDown}
        className="relative z-10 flex w-2 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none focus-visible:bg-rule-strong"
      >
        <span id={labelId} className="sr-only">
          Resize Sankey and calendar panels
        </span>
        {/* Invisible grip — still captures drag / keyboard resize */}
        <span className="h-10 w-px bg-transparent" aria-hidden />
      </div>

      <div
        className="min-w-0"
        style={{ width: `calc(${rightPct} - 4px)`, flex: 'none' }}
      >
        {right}
      </div>
    </div>
  )
}
