import { eachDayOfInterval, format, startOfDay } from 'date-fns'
import { useId, useState, type MouseEvent } from 'react'
import { eventsOnDay, netForDay, type CalendarEvent } from '../domain/calendar'
import { formatMoney, formatMoneyCompact } from '../domain/money'
import type { DateRange } from '../domain/types'

export interface BalancePoint {
  date: Date
  balance: number
}

/** Opening cash, then the closing balance after each day in the range. */
export function periodBalanceSeries(
  opening: number,
  events: CalendarEvent[],
  range: DateRange,
): BalancePoint[] {
  const start = startOfDay(range.start)
  const end = startOfDay(range.end)
  if (end.getTime() < start.getTime()) return [{ date: start, balance: opening }]

  const days = eachDayOfInterval({ start, end })
  let balance = opening
  const points: BalancePoint[] = [{ date: start, balance: opening }]
  for (const date of days) {
    balance += netForDay(eventsOnDay(events, date))
    points.push({ date, balance })
  }
  return points
}

const W = 640
const H = 252
const PAD = { l: 58, r: 12, t: 16, b: 32 }

function niceStep(span: number, ticks: number): number {
  const rough = span / Math.max(1, ticks - 1)
  if (!Number.isFinite(rough) || rough <= 0) return 1
  const exp = Math.floor(Math.log10(rough))
  const base = 10 ** exp
  const frac = rough / base
  const nice = frac <= 1.5 ? 1 : frac <= 3 ? 2 : frac <= 7 ? 5 : 10
  return nice * base
}

function niceDomain(values: number[], tickTarget = 4): { min: number; max: number; ticks: number[] } {
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1, ticks: [1, 0] }
  }
  if (min === max) {
    const pad = Math.abs(min) * 0.2 || 1
    min -= pad
    max += pad
  } else {
    const pad = (max - min) * 0.08
    min -= pad
    max += pad
  }
  const step = niceStep(max - min, tickTarget)
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = niceMax; value >= niceMin - step * 0.001; value -= step) {
    ticks.push(Math.abs(value) < step / 1e6 ? 0 : value)
    if (ticks.length > 6) break
  }
  return { min: niceMin, max: niceMax, ticks }
}

function labelIndexes(count: number, want: number): number[] {
  if (count <= 1) return [0]
  const n = Math.min(want, count)
  const indexes: number[] = []
  for (let i = 0; i < n; i++) indexes.push(Math.round((i * (count - 1)) / (n - 1)))
  return [...new Set(indexes)]
}

function smoothLine(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    const mx = (p0.x + p1.x) / 2
    d += ` C ${mx.toFixed(2)} ${p0.y.toFixed(2)}, ${mx.toFixed(2)} ${p1.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
  }
  return d
}

export function BalanceChart({
  points,
  events,
  currency,
}: {
  points: BalancePoint[]
  events: CalendarEvent[]
  currency: string
}) {
  const rawId = useId().replace(/:/g, '')
  const [hover, setHover] = useState<{ index: number; left: number; top: number } | null>(null)
  const gradId = `balance-fill-${rawId}`
  const values = points.map((point) => point.balance)
  const { min, max, ticks: yTicks } = niceDomain(values.length > 0 ? values : [0])
  const span = max - min || 1
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const coords = (points.length > 0 ? points : [{ date: new Date(), balance: 0 }]).map(
    (point, index, all) => {
      const x = PAD.l + (index / Math.max(1, all.length - 1)) * plotW
      const y = PAD.t + (1 - (point.balance - min) / span) * plotH
      return { x, y, date: point.date }
    },
  )
  const line = smoothLine(coords)
  const bottom = H - PAD.b
  const area =
    coords.length > 0
      ? `${line} L ${coords[coords.length - 1].x.toFixed(2)} ${bottom} L ${coords[0].x.toFixed(2)} ${bottom} Z`
      : ''
  const xLabels = labelIndexes(coords.length, coords.length > 10 ? 5 : Math.min(4, coords.length))
  const first = points[0]?.balance ?? 0
  const last = points[points.length - 1]?.balance ?? 0
  const hoverPoint = hover ? coords[hover.index] : null
  const hoverDay =
    hoverPoint && hover && hover.index > 0
      ? eventsOnDay(events, hoverPoint.date)
      : []
  const hoverIncome = hoverDay
    .filter((event) => event.kind === 'income')
    .reduce((sum, event) => sum + event.amount, 0)
  const hoverBills = hoverDay
    .filter((event) => event.kind === 'expense')
    .reduce((sum, event) => sum + event.amount, 0)
  const hoverGoals = hoverDay
    .filter((event) => event.kind === 'goal')
    .reduce((sum, event) => sum + event.amount, 0)

  const move = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || coords.length < 2) return
    const x = ((event.clientX - rect.left) / rect.width) * W
    let index = 1
    let best = Infinity
    for (let i = 1; i < coords.length; i++) {
      const distance = Math.abs(coords[i].x - x)
      if (distance < best) {
        best = distance
        index = i
      }
    }
    const wrap = event.currentTarget.parentElement?.getBoundingClientRect()
    setHover({
      index,
      left: event.clientX - (wrap?.left ?? rect.left),
      top: event.clientY - (wrap?.top ?? rect.top),
    })
  }

  return (
    <div
      className="relative"
      onMouseLeave={() => setHover(null)}
    >
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Balance from ${formatMoney(first, currency)} to ${formatMoney(last, currency)}`}
      onMouseMove={move}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-cash)" stopOpacity="0.38" />
          <stop offset="72%" stopColor="var(--color-cash)" stopOpacity="0.05" />
          <stop offset="100%" stopColor="var(--color-cash)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((tick, index) => {
        const y = PAD.t + (1 - (tick - min) / span) * plotH
        return (
          <g key={`${tick}-${index}`}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y}
              y2={y}
              stroke="var(--color-rule)"
            />
            <text
              x={PAD.l - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--color-paper-3)"
              fontSize="12"
            >
              {Math.abs(tick) < 0.005
                ? formatMoney(0, currency).replace(/\.00$/, '')
                : formatMoneyCompact(tick, currency)}
            </text>
          </g>
        )
      })}
      {area && <path d={area} fill={`url(#${gradId})`} />}
      {line && (
        <path
          d={line}
          fill="none"
          stroke="var(--color-cash)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {xLabels.map((index, labelIndex) => {
        const point = coords[index]
        if (!point) return null
        const anchor =
          labelIndex === 0 ? 'start' : labelIndex === xLabels.length - 1 ? 'end' : 'middle'
        return (
          <text
            key={`${point.date.toISOString()}-${index}`}
            x={point.x}
            y={H - 8}
            textAnchor={anchor}
            fill="var(--color-paper-3)"
            fontSize="12"
          >
            {format(point.date, 'MMM d')}
          </text>
        )
      })}
      {hoverPoint && (
        <g>
          <line
            x1={hoverPoint.x}
            x2={hoverPoint.x}
            y1={PAD.t}
            y2={bottom}
            stroke="var(--color-rule-strong)"
            strokeDasharray="3 3"
          />
          <circle cx={hoverPoint.x} cy={hoverPoint.y} r="4.5" fill="var(--color-cash)" />
        </g>
      )}
    </svg>
    {hover && hoverPoint && (
      <div
        className="pointer-events-none absolute z-10 w-44 rounded-xl bg-ledger-4 px-3 py-2 text-xs shadow-lg ring-1 ring-rule-strong"
        style={{
          left: hover.left,
          top: hover.top,
          transform: hover.left > 180 ? 'translate(-100%, -110%)' : 'translate(12px, -110%)',
        }}
      >
        <p className="font-medium text-zinc-100">{format(hoverPoint.date, 'EEE, MMM d')}</p>
        <dl className="mt-1.5 space-y-1">
          <HoverRow label="Income" value={formatMoney(hoverIncome, currency)} tone="good" />
          <HoverRow label="Bills" value={formatMoney(hoverBills, currency)} tone={hoverBills > 0 ? 'bad' : 'neutral'} />
          {hoverGoals > 0.004 && (
            <HoverRow label="Goals" value={formatMoney(hoverGoals, currency)} tone="bad" />
          )}
          <HoverRow
            label="End of day"
            value={formatMoney(points[hover.index]?.balance ?? 0, currency)}
            tone={(points[hover.index]?.balance ?? 0) < -0.004 ? 'bad' : 'neutral'}
          />
        </dl>
      </div>
    )}
    </div>
  )
}

function HoverRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'good' | 'bad' | 'neutral'
}) {
  const color =
    tone === 'good' ? 'text-cash' : tone === 'bad' ? 'text-rose-300' : 'text-zinc-100'
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`tabular-nums ${color}`}>{value}</dd>
    </div>
  )
}
