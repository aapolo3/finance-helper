export const OVERVIEW_COLUMNS = 12

export const OVERVIEW_CARD_IDS = [
  'balance',
  'goals',
  'bills',
  'leftover',
  'spending',
  'transactions',
  'budget',
  'calendar',
] as const

export type OverviewCardId = (typeof OVERVIEW_CARD_IDS)[number]

export interface OverviewPlacement {
  id: OverviewCardId
  x: number
  y: number
  w: number
  h: number
  visible: boolean
}

interface CardSpec {
  label: string
  minW: number
  minH: number
  maxH: number
  default: { x: number; y: number; w: number; h: number }
}

export const OVERVIEW_CARD_SPECS: Record<OverviewCardId, CardSpec> = {
  balance: {
    label: 'Balance',
    minW: 4,
    minH: 6,
    maxH: 19,
    default: { x: 0, y: 0, w: 6, h: 9 },
  },
  leftover: {
    label: 'Left over',
    minW: 3,
    minH: 3,
    maxH: 9,
    default: { x: 6, y: 0, w: 6, h: 4 },
  },
  spending: {
    label: 'Planned spending',
    minW: 4,
    minH: 6,
    maxH: 22,
    default: { x: 6, y: 4, w: 6, h: 11 },
  },
  goals: {
    label: 'Goals',
    minW: 3,
    minH: 5,
    maxH: 16,
    default: { x: 0, y: 9, w: 6, h: 6 },
  },
  bills: {
    label: 'Bills',
    minW: 3,
    minH: 5,
    maxH: 16,
    default: { x: 0, y: 15, w: 6, h: 7 },
  },
  transactions: {
    label: 'Transactions',
    minW: 3,
    minH: 5,
    maxH: 16,
    default: { x: 6, y: 15, w: 6, h: 6 },
  },
  budget: {
    label: 'Budget',
    minW: 3,
    minH: 4,
    maxH: 11,
    default: { x: 6, y: 21, w: 6, h: 5 },
  },
  calendar: {
    label: 'Calendar',
    minW: 6,
    minH: 8,
    maxH: 22,
    default: { x: 0, y: 26, w: 12, h: 13 },
  },
}

const STORAGE_KEY = 'flow.overviewLayout.v2'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function isOverviewCardId(value: unknown): value is OverviewCardId {
  return typeof value === 'string' && (OVERVIEW_CARD_IDS as readonly string[]).includes(value)
}

/** Cards that start behind "Show more", so Today opens on the runway and the essentials. */
export const OVERVIEW_DEFAULT_HIDDEN: readonly OverviewCardId[] = ['goals', 'spending', 'calendar']

/** Every card shown at its spec position; the grid the defaults are carved from. */
export function fullOverviewLayout(): OverviewPlacement[] {
  return OVERVIEW_CARD_IDS.map((id) => ({
    id,
    ...OVERVIEW_CARD_SPECS[id].default,
    visible: true,
  }))
}

export function defaultOverviewLayout(): OverviewPlacement[] {
  const all = fullOverviewLayout().map((item) => ({
    ...item,
    visible: !OVERVIEW_DEFAULT_HIDDEN.includes(item.id),
  }))
  return withHidden(
    compactLayout(all.filter((item) => item.visible)),
    all.filter((item) => !item.visible),
  )
}

export function overlaps(
  a: Pick<OverviewPlacement, 'x' | 'y' | 'w' | 'h'>,
  b: Pick<OverviewPlacement, 'x' | 'y' | 'w' | 'h'>,
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function clampPlacement(
  item: OverviewPlacement,
  cols = OVERVIEW_COLUMNS,
): OverviewPlacement {
  const spec = OVERVIEW_CARD_SPECS[item.id]
  const w = clamp(Math.round(item.w), Math.min(spec.minW, cols), cols)
  const h = clamp(Math.round(item.h), spec.minH, spec.maxH)
  const x = clamp(Math.round(item.x), 0, Math.max(0, cols - w))
  const y = Math.max(0, Math.round(item.y))
  return { ...item, x, y, w, h, visible: item.visible !== false }
}

/**
 * Keep the priority card where it was placed and move every overlapping card down.
 */
export function resolveOverlaps(
  items: OverviewPlacement[],
  priorityId?: OverviewCardId,
  cols = OVERVIEW_COLUMNS,
): OverviewPlacement[] {
  const clamped = items.map((item) => clampPlacement(item, cols))
  const hidden = clamped.filter((item) => !item.visible)
  const sorted = clamped
    .filter((item) => item.visible)
    .sort((a, b) => {
      if (a.id === priorityId) return -1
      if (b.id === priorityId) return 1
      return a.y - b.y || a.x - b.x
    })

  const placed: OverviewPlacement[] = []
  for (const item of sorted) {
    let y = item.y
    while (placed.some((other) => overlaps({ ...item, y }, other))) y += 1
    placed.push({ ...item, y })
  }

  return withHidden(compactLayout(placed), hidden)
}

/** Float every visible card up into free space so moves and removals never leave holes. */
export function compactLayout(items: OverviewPlacement[]): OverviewPlacement[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: OverviewPlacement[] = []
  for (const item of sorted) {
    let y = item.y
    while (y > 0 && !placed.some((other) => overlaps({ ...item, y: y - 1 }, other))) y -= 1
    placed.push({ ...item, y })
  }
  return placed
}

function withHidden(
  placed: OverviewPlacement[],
  hidden: OverviewPlacement[],
): OverviewPlacement[] {
  const byId = new Map<OverviewCardId, OverviewPlacement>()
  for (const item of placed) byId.set(item.id, item)
  for (const item of hidden) byId.set(item.id, item)
  return OVERVIEW_CARD_IDS.map((id) => byId.get(id)).filter(
    (item): item is OverviewPlacement => item != null,
  )
}

export function normalizeOverviewLayout(raw: unknown, cols = OVERVIEW_COLUMNS): OverviewPlacement[] {
  const defaults = defaultOverviewLayout()
  if (!Array.isArray(raw)) return defaults

  const seen = new Set<OverviewCardId>()
  const parsed: OverviewPlacement[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const id = (entry as { id?: unknown }).id
    if (!isOverviewCardId(id) || seen.has(id)) continue
    seen.add(id)
    const fallback = OVERVIEW_CARD_SPECS[id].default
    const record = entry as Partial<OverviewPlacement>
    parsed.push({
      id,
      x: typeof record.x === 'number' ? record.x : fallback.x,
      y: typeof record.y === 'number' ? record.y : fallback.y,
      w: typeof record.w === 'number' ? record.w : fallback.w,
      h: typeof record.h === 'number' ? record.h : fallback.h,
      visible: record.visible !== false,
    })
  }

  for (const fallback of defaults) {
    if (!seen.has(fallback.id)) parsed.push(fallback)
  }
  return resolveOverlaps(parsed, undefined, cols)
}

export function moveCard(
  items: OverviewPlacement[],
  id: OverviewCardId,
  x: number,
  y: number,
  cols = OVERVIEW_COLUMNS,
): OverviewPlacement[] {
  return resolveOverlaps(
    items.map((item) => (item.id === id ? { ...item, x, y } : item)),
    id,
    cols,
  )
}

/**
 * Live drag: `y` is fractional (pointer rows). The dragged card swaps past a neighbour
 * once its leading edge crosses that neighbour's middle, so the order only flips at one
 * clear threshold instead of jittering. Everything then settles upward by gravity.
 */
export function dragCard(
  items: OverviewPlacement[],
  id: OverviewCardId,
  x: number,
  y: number,
  cols = OVERVIEW_COLUMNS,
): OverviewPlacement[] {
  const moving = items.find((item) => item.id === id)
  if (!moving) return items
  const target = clampPlacement({ ...moving, x, y: Math.max(0, y) }, cols)
  const others = items
    .filter((item) => item.visible && item.id !== id)
    .map((item) => clampPlacement(item, cols))
    .sort((a, b) => a.y - b.y || a.x - b.x)
  const hidden = items.filter((item) => !item.visible && item.id !== id)

  const before = others.filter((other) => {
    const middle = other.y + other.h / 2
    return other.y < moving.y ? y >= middle : y + target.h > middle
  }).length
  const order = [...others.slice(0, before), target, ...others.slice(before)]

  const placed: OverviewPlacement[] = []
  for (const item of order) {
    let top = 0
    while (placed.some((other) => overlaps({ ...item, y: top }, other))) top += 1
    placed.push({ ...item, y: top })
  }
  return withHidden(placed, moving.visible ? hidden : [...hidden, moving])
}

/**
 * Display-only: open `extra` rows at the bottom edge of `id`. Cards that reach that edge
 * stretch with it and cards below slide down, so neighbours stay flush.
 */
export function growCard(
  items: OverviewPlacement[],
  id: OverviewCardId,
  extra: number,
): OverviewPlacement[] {
  const card = items.find((item) => item.id === id && item.visible)
  if (!card || extra <= 0) return items
  const line = card.y + card.h
  return items.map((item) => {
    if (!item.visible) return item
    if (item.y >= line) return { ...item, y: item.y + extra }
    if (item.y + item.h >= line) return { ...item, h: item.h + extra }
    return item
  })
}

export function resizeCard(
  items: OverviewPlacement[],
  id: OverviewCardId,
  w: number,
  h: number,
  cols = OVERVIEW_COLUMNS,
): OverviewPlacement[] {
  return resolveOverlaps(
    items.map((item) => (item.id === id ? { ...item, w, h } : item)),
    id,
    cols,
  )
}

export function hideCard(items: OverviewPlacement[], id: OverviewCardId): OverviewPlacement[] {
  return resolveOverlaps(items.map((item) => (item.id === id ? { ...item, visible: false } : item)))
}

export function showCard(
  items: OverviewPlacement[],
  id: OverviewCardId,
  cols = OVERVIEW_COLUMNS,
): OverviewPlacement[] {
  const bottom = items
    .filter((item) => item.visible)
    .reduce((max, item) => Math.max(max, item.y + item.h), 0)
  const spec = OVERVIEW_CARD_SPECS[id]
  return resolveOverlaps(
    items.map((item) =>
      item.id === id
        ? {
            ...item,
            visible: true,
            x: 0,
            y: bottom,
            w: Math.min(spec.default.w, cols),
            h: item.h,
          }
        : item,
    ),
    id,
    cols,
  )
}

export function readOverviewLayout(): OverviewPlacement[] {
  if (typeof localStorage === 'undefined') return defaultOverviewLayout()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultOverviewLayout()
    return normalizeOverviewLayout(JSON.parse(raw))
  } catch {
    return defaultOverviewLayout()
  }
}

export function writeOverviewLayout(layout: OverviewPlacement[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
}
