import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  OVERVIEW_CARD_SPECS,
  OVERVIEW_COLUMNS,
  defaultOverviewLayout,
  dragCard,
  growCard,
  hideCard,
  isOverviewCardId,
  readOverviewLayout,
  resizeCard,
  showCard,
  writeOverviewLayout,
  type OverviewCardId,
  type OverviewPlacement,
} from '../domain/overviewLayout'
import { GrowContext } from './cardGrowth'

const ROW_HEIGHT = 40
const GAP = 16
const WIDE_BREAKPOINT = 960
/** Card width (px) under which cards switch to their compact layout. */
const COMPACT_BELOW = 380
const MEDIUM_BREAKPOINT = 640
const REFLOW_MS = 260

type Drag = {
  id: OverviewCardId
  mode: 'move' | 'resize'
  startX: number
  startY: number
  dx: number
  dy: number
  snapshot: OverviewPlacement[]
  origin: OverviewPlacement
}

type Rect = { x: number; y: number; h: number }

function GrowProvider({
  id,
  editing,
  onGrow,
  children,
}: {
  id: OverviewCardId
  editing: boolean
  onGrow: (id: OverviewCardId, px: number) => void
  children: ReactNode
}) {
  const grow = useCallback((px: number) => onGrow(id, px), [id, onGrow])
  const value = useMemo(() => ({ grow, editing }), [grow, editing])
  return <GrowContext.Provider value={value}>{children}</GrowContext.Provider>
}

export function OverviewCard({
  children,
}: {
  id: OverviewCardId
  children: ReactNode
}) {
  return children
}

export function OverviewGrid({
  editing,
  children,
}: {
  editing: boolean
  children: ReactNode
}) {
  const [layout, setLayout] = useState<OverviewPlacement[]>(readOverviewLayout)
  const [width, setWidth] = useState(WIDE_BREAKPOINT)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [growth, setGrowth] = useState<Partial<Record<OverviewCardId, number>>>({})
  const gridRef = useRef<HTMLDivElement>(null)
  const cellsRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<OverviewCardId, HTMLDivElement>())
  const lastRects = useRef(new Map<OverviewCardId, Rect>())
  const lastShown = useRef<OverviewPlacement[] | null>(null)
  const lastDragId = useRef<OverviewCardId | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const frame = useRef(0)
  const skipSave = useRef(true)
  dragRef.current = drag

  useEffect(() => {
    const node = gridRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    if (!drag) writeOverviewLayout(layout)
  }, [layout, drag])

  const mode = width >= WIDE_BREAKPOINT ? 'wide' : width >= MEDIUM_BREAKPOINT ? 'medium' : 'narrow'
  const wide = mode === 'wide'
  const columnWidth = (width - GAP * (OVERVIEW_COLUMNS - 1)) / OVERVIEW_COLUMNS
  const stepX = columnWidth + GAP
  const stepY = ROW_HEIGHT + GAP

  const onGrow = useCallback((id: OverviewCardId, px: number) => {
    setGrowth((current) => (current[id] === px ? current : { ...current, [id]: px }))
  }, [])

  // What is drawn: the saved layout plus any rows cards asked for. Growth is off while
  // editing so drag math always works on the saved cells.
  let shown = layout
  if (wide && !editing) {
    const growing = layout
      .filter((item) => item.visible && (growth[item.id] ?? 0) > 0)
      .sort((a, b) => b.y + b.h - (a.y + a.h))
    for (const item of growing) {
      const extra = Math.ceil((growth[item.id] ?? 0) / stepY)
      shown = growCard(shown, item.id, extra)
    }
  }

  // FLIP: cards that changed cell glide from where they are on screen right now, so a
  // new move that interrupts a running one continues smoothly instead of jumping.
  useLayoutEffect(() => {
    const changed =
      lastShown.current !== null &&
      (!sameLayout(lastShown.current, shown) || lastDragId.current !== (drag?.id ?? null))
    lastShown.current = shown
    lastDragId.current = drag?.id ?? null
    const reduce = !changed || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const origin = cellsRef.current?.getBoundingClientRect()
    const next = new Map<OverviewCardId, Rect>()
    for (const [id, el] of cardRefs.current) {
      const rect = { x: el.offsetLeft, y: el.offsetTop, h: el.offsetHeight }
      next.set(id, rect)
      const prev = lastRects.current.get(id)
      if (!prev || reduce || !origin || id === drag?.id) continue
      // Whatever translate a running animation still applies, measured on screen.
      const box = el.getBoundingClientRect()
      const runningX = box.left - origin.left - rect.x
      const runningY = box.top - origin.top - rect.y
      const running = el.getAnimations().filter((a) => a.id === 'reflow')
      const carry = running.length > 0
      const dx = prev.x - rect.x + (carry ? runningX : 0)
      const dy = prev.y - rect.y + (carry ? runningY : 0)
      const dh = prev.h - rect.h
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(dh) < 1) continue
      for (const animation of running) animation.cancel()
      const animation = el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)`, height: `${prev.h}px` },
          { transform: 'translate(0, 0)', height: `${rect.h}px` },
        ],
        { duration: REFLOW_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
      animation.id = 'reflow'
    }
    lastRects.current = next
  })

  useEffect(() => {
    if (!drag) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setLayout(drag.snapshot)
      setDrag(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drag])

  const slots = new Map<OverviewCardId, ReactNode>()
  Children.forEach(children, (child) => {
    // Match on the id prop, not component identity, which hot reload swaps out.
    if (!isValidElement(child)) return
    const props = child.props as { id?: unknown; children?: ReactNode }
    if (isOverviewCardId(props.id)) slots.set(props.id, props.children)
  })

  // DOM order stays fixed (moving a node mid-drag drops its pointer capture); reading
  // order comes from the CSS `order` property instead.
  const visible = shown.filter((item) => item.visible && slots.has(item.id))
  const readingOrder = new Map(
    [...visible]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((item, index) => [item.id, index] as const),
  )
  const hidden = layout.filter((item) => !item.visible && slots.has(item.id))

  const startDrag = (
    id: OverviewCardId,
    dragMode: Drag['mode'],
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!wide) return
    const origin = layout.find((item) => item.id === id)
    if (!origin) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      id,
      mode: dragMode,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      snapshot: layout.map((item) => ({ ...item })),
      origin: { ...origin },
    })
  }

  const onDragMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (!current) return
    const { clientX, clientY } = event
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const dx = clientX - current.startX
      const dy = clientY - current.startY
      const cols = Math.round(dx / stepX)
      const { origin, snapshot, id } = current
      setDrag({ ...current, dx, dy })
      const next =
        current.mode === 'move'
          ? dragCard(snapshot, id, origin.x + cols, origin.y + dy / stepY)
          : resizeCard(snapshot, id, origin.w + cols, origin.h + Math.round(dy / stepY))
      // Skip renders (and restarted animations) while the pointer stays in the same cell.
      setLayout((prev) => (sameLayout(prev, next) ? prev : next))
    })
  }

  const endDrag = () => {
    cancelAnimationFrame(frame.current)
    const current = dragRef.current
    if (!current) return
    dragRef.current = null
    const from = current && lastRects.current.get(current.id)
    // Glide the released card from where the pointer left it into its snapped cell.
    if (current?.mode === 'move' && from) {
      lastRects.current.set(current.id, { ...from, x: from.x + current.dx, y: from.y + current.dy })
    }
    setDrag(null)
  }

  const gridBackdrop =
    editing && wide
      ? {
          backgroundImage: `linear-gradient(to bottom, transparent ${ROW_HEIGHT}px, var(--color-ink) ${ROW_HEIGHT}px), linear-gradient(to right, var(--color-rule) ${columnWidth}px, transparent ${columnWidth}px)`,
          backgroundSize: `100% ${stepY}px, ${stepX}px 100%`,
        }
      : undefined

  const layoutStyle =
    mode === 'wide'
      ? {
          display: 'grid',
          gridTemplateColumns: `repeat(${OVERVIEW_COLUMNS}, minmax(0, 1fr))`,
          gridAutoRows: `${ROW_HEIGHT}px`,
          gap: GAP,
          ...gridBackdrop,
        }
      : mode === 'medium'
        ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: GAP }
        : { display: 'flex', flexDirection: 'column' as const, gap: GAP }

  const placeholder = drag && layout.find((item) => item.id === drag.id)

  return (
    <div ref={gridRef}>
      {editing && (
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-ledger p-3 ring-1 ring-rule">
          <p className="mr-auto px-1 text-sm text-zinc-400">
            {wide
              ? 'Drag a card by its handle. Pull the corner to resize. Esc cancels.'
              : 'Add or remove cards. Move and resize them from a wider window.'}
          </p>
          {hidden.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setLayout((current) => showCard(current, item.id))}
              className="press inline-flex h-8 items-center gap-1 rounded-full bg-rule pr-3 pl-2 text-sm text-zinc-100 hover:bg-rule-strong"
            >
              <PlusIcon />
              {OVERVIEW_CARD_SPECS[item.id].label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLayout(defaultOverviewLayout())}
            className="h-8 rounded-full px-3 text-sm text-zinc-400 hover:text-zinc-100"
          >
            Reset
          </button>
        </div>
      )}

      <div
        ref={cellsRef}
        className={`relative ${drag ? 'select-none' : ''}`}
        style={layoutStyle}
      >
        {wide && placeholder && (
          <div
            aria-hidden="true"
            className="rounded-[20px] border border-dashed border-rule-strong bg-ledger-2"
            style={{
              gridColumn: `${placeholder.x + 1} / span ${placeholder.w}`,
              gridRow: `${placeholder.y + 1} / span ${placeholder.h}`,
            }}
          />
        )}
        {visible.map((item) => {
          const index = readingOrder.get(item.id) ?? 0
          const content = slots.get(item.id)
          if (!content) return null
          const label = OVERVIEW_CARD_SPECS[item.id].label
          const dragging = drag?.id === item.id
          // The dragged card stays anchored to where it started and follows the pointer.
          const anchor = dragging ? drag.origin : item
          const style =
            mode === 'wide'
              ? {
                  gridColumn: `${anchor.x + 1} / span ${anchor.w}`,
                  gridRow: `${anchor.y + 1} / span ${anchor.h}`,
                  ...(dragging && drag.mode === 'move'
                    ? { translate: `${drag.dx}px ${drag.dy}px`, scale: '1.02' }
                    : {}),
                  ...(dragging && drag.mode === 'resize'
                    ? {
                        width: `calc(100% + ${drag.dx}px)`,
                        height: `calc(100% + ${drag.dy}px)`,
                      }
                    : {}),
                }
              : mode === 'medium'
                ? // The Sankey needs width for its labels, so it always spans both columns.
                  { gridColumn: item.w >= 8 || item.id === 'spending' ? 'span 2' : undefined }
                : undefined
          return (
            <div
              key={item.id}
              // Cards narrower than COMPACT_BELOW px get their compact layout. Measured in px, not
              // columns, so a 4-column card on a wide monitor keeps its full layout.
              data-compact={
                mode === 'wide' && anchor.w * stepX - GAP < COMPACT_BELOW ? '' : undefined
              }
              ref={(el) => {
                if (el) cardRefs.current.set(item.id, el)
                else cardRefs.current.delete(item.id)
              }}
              className={`rise-in group relative min-h-0 min-w-0 ${
                dragging ? 'z-20 shadow-2xl shadow-black/60' : 'z-0'
              } ${wide ? '' : 'min-h-40'}`}
              style={{ ...style, order: index, animationDelay: `${Math.min(index, 6) * 35}ms` }}
            >
              <div
                className={`h-full min-h-0 rounded-[20px] transition-[box-shadow,opacity] duration-200 ${
                  editing ? 'ring-2 ring-rule-strong' : ''
                } ${editing && !dragging ? 'opacity-90' : ''}`}
              >
                <div className={`h-full min-h-0 ${editing ? 'pointer-events-none' : ''}`}>
                  <GrowProvider id={item.id} editing={editing} onGrow={onGrow}>
                    {content}
                  </GrowProvider>
                </div>
              </div>
              {editing && (
                <div className="absolute top-3 right-3 flex items-center gap-0.5 rounded-full bg-ledger-4/95 p-1 shadow-lg ring-1 ring-rule-strong backdrop-blur">
                  {wide && (
                    <button
                      type="button"
                      aria-label={`Move ${label}`}
                      onPointerDown={(event) => startDrag(item.id, 'move', event)}
                      onPointerMove={onDragMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                  onLostPointerCapture={endDrag}
                      className="inline-flex h-7 cursor-grab touch-none items-center gap-1.5 rounded-full pr-2.5 pl-2 text-xs text-zinc-200 hover:bg-rule-strong active:cursor-grabbing"
                    >
                      <GripIcon />
                      {label}
                    </button>
                  )}
                  {!wide && <span className="px-2 text-xs text-zinc-300">{label}</span>}
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() => setLayout((current) => hideCard(current, item.id))}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-rose-500/15 hover:text-rose-300"
                  >
                    <CloseIcon />
                  </button>
                </div>
              )}
              {editing && wide && (
                <button
                  type="button"
                  aria-label={`Resize ${label}`}
                  onPointerDown={(event) => startDrag(item.id, 'resize', event)}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onLostPointerCapture={endDrag}
                  className={`absolute right-1 bottom-1 flex h-7 w-7 cursor-nwse-resize touch-none items-center justify-center rounded-full text-zinc-300 transition-opacity hover:bg-rule-strong ${
                    dragging ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'
                  }`}
                >
                  <ResizeIcon />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {!editing && hidden.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-rule px-3 py-2.5">
          <span className="mr-1 text-sm text-paper-3">Show more</span>
          {hidden.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setLayout((current) => showCard(current, item.id))}
              className="press inline-flex min-h-9 items-center gap-1 rounded-full pr-3 pl-2 text-sm text-cash hover:bg-cash/10"
            >
              <PlusIcon />
              {OVERVIEW_CARD_SPECS[item.id].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function sameLayout(a: OverviewPlacement[], b: OverviewPlacement[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((item, i) => {
    const other = b[i]
    return (
      item.id === other.id &&
      item.x === other.x &&
      item.y === other.y &&
      item.w === other.w &&
      item.h === other.h &&
      item.visible === other.visible
    )
  })
}

function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="4" r="1.1" />
      <circle cx="11" cy="4" r="1.1" />
      <circle cx="5" cy="8" r="1.1" />
      <circle cx="11" cy="8" r="1.1" />
      <circle cx="5" cy="12" r="1.1" />
      <circle cx="11" cy="12" r="1.1" />
    </svg>
  )
}

function ResizeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M14 7v7H7M14 14 9 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" strokeLinecap="round" />
    </svg>
  )
}
